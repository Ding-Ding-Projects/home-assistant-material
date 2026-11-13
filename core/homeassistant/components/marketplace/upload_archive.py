"""Look inside an uploaded ZIP archive and unpack the part that is wanted.

Nothing here needs Home Assistant, only the standard library, so the rules can
be tested alone. The panel reads archives the same way before sending them
(frontend/src/data/marketplace/archive-detect.ts), and the two lists of rules
have to stay equal: what the panel announces is what the server installs.

An archive does not have to carry the history folder of the repository. What
it holds is recognised by the files that Home Assistant and the Marketplace
look for, in the shallowest place they are found, because archives often have
one wrapping folder and the content can sit a folder or two deeper.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
import json
from pathlib import Path, PurePosixPath
import re
import stat
from typing import IO
import zipfile

# What an upload may hold. The panel applies the same numbers.
MAX_UPLOAD_SIZE = 50 * 1024 * 1024
MAX_ENTRIES = 20_000
MAX_UNPACKED = 100 * 1024 * 1024
MAX_PATH_LENGTH = 512
MAX_PATH_DEPTH = 32
# A file that only tells what the content is, anything larger is not one
MAX_MARKER_BYTES = 256 * 1024
MAX_MARKER_FILES = 400
# Past this size the ratio of unpacked to packed is checked, small files
# compress to nothing
RATIO_FLOOR = 1024 * 1024
MAX_RATIO = 200

MAX_ROOT_DEPTH = 3
MAX_APP_DEPTH = 4

COPY_CHUNK = 64 * 1024

# Never part of what is installed
SKIPPED_DIRECTORIES = {".git", "__macosx", "__pycache__"}

# Folders that hold content or noise, a repository does not start in them
_NOT_A_ROOT = {
    "custom_components",
    "themes",
    "blueprints",
    "www",
    "dist",
    "node_modules",
    "tests",
    "test",
    "docs",
    "doc",
    "examples",
    "example",
    "rootfs",
    "__macosx",
}
_NOT_AN_APP = {
    "rootfs",
    "node_modules",
    "tests",
    "test",
    "custom_components",
    "themes",
    "blueprints",
    "www",
    "dist",
    "docs",
    "doc",
    "__macosx",
}

VALID_DOMAIN = re.compile(r"^[a-z0-9_-]+$")
BLUEPRINT_DOMAINS = ("automation", "script", "template")
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")
# Names that lie about themselves: C1 controls, zero-width and direction marks
_DECEIVING = re.compile("[\u0080-\u009f​-‏‪-‮⁠⁦-⁩﻿]")
_WINDOWS_DRIVE = re.compile(r"^[A-Za-z]:")
_FOLDER_SUFFIX = re.compile(
    r"^(.*?)-(?:main|master|develop|dev|trunk|head"
    r"|v?\d+(?:\.\d+)*(?:[-+.][\w.]+)?)$",
    re.IGNORECASE,
)

KIND_ORDER = (
    "integration",
    "plugin",
    "theme",
    "template",
    "blueprint",
    "app_repository",
    "app",
)
# What a file can install, apps and their repositories belong to the Supervisor
INSTALLABLE_KINDS = ("integration", "plugin", "theme", "template", "blueprint")


class UploadError(Exception):
    """An upload that is refused, the key names the message that explains it."""

    def __init__(self, key: str, **placeholders: str) -> None:
        """Initialize the error."""
        super().__init__(key)
        self.key = key
        self.placeholders = placeholders


@dataclass
class Item:
    """Something found in an archive."""

    kind: str
    name: str
    source: str
    marker: str
    rule: str
    version: str | None = None
    domain: str | None = None
    file: str | None = None
    themes: list[str] = field(default_factory=list)
    problems: list[str] = field(default_factory=list)

    @property
    def installable(self) -> bool:
        """Return if the archive can be installed as this item."""
        return self.kind in INSTALLABLE_KINDS and not self.problems


def check_entry_name(name: str) -> None:
    """Refuse a name that could leave the folder it is unpacked into."""
    if (
        not name
        or len(name) > MAX_PATH_LENGTH
        or name.startswith("/")
        or "\\" in name
        or _WINDOWS_DRIVE.match(name)
        or _CONTROL.search(name)
        or _DECEIVING.search(name)
    ):
        raise UploadError("upload_unsafe_path", path=name[:120])

    parts = name.rstrip("/").split("/")
    if any(part in ("", ".", "..") for part in parts):
        raise UploadError("upload_unsafe_path", path=name[:120])

    if len(parts) > MAX_PATH_DEPTH:
        raise UploadError("upload_path_too_deep", path=name[:120])


def validate_archive(infos: list[zipfile.ZipInfo]) -> None:
    """Refuse an archive that is too big, hides something, or is not plain files."""
    if len(infos) > MAX_ENTRIES:
        raise UploadError(
            "upload_too_many_entries", count=str(len(infos)), limit=str(MAX_ENTRIES)
        )

    total = 0
    for info in infos:
        check_entry_name(info.filename)

        if info.flag_bits & 0x1:
            raise UploadError("upload_encrypted", path=info.filename[:120])

        if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
            raise UploadError("upload_unsupported_method", path=info.filename[:120])

        # Only archives made on Unix say what an entry is
        if info.create_system == 3:
            mode = info.external_attr >> 16
            kind = stat.S_IFMT(mode)
            if kind not in (0, stat.S_IFREG, stat.S_IFDIR):
                raise UploadError("upload_link_entry", path=info.filename[:120])

        if info.file_size > RATIO_FLOOR and (
            info.file_size > max(info.compress_size, 1) * MAX_RATIO
        ):
            raise UploadError("upload_ratio", path=info.filename[:120])

        total += info.file_size
        if total > MAX_UNPACKED:
            raise UploadError("upload_too_large_unpacked", limit=str(MAX_UNPACKED))


def read_marker(archive: zipfile.ZipFile, info: zipfile.ZipInfo) -> str | None:
    """Return what a small file says, None when it is too big or not text."""
    if info.is_dir() or info.file_size > MAX_MARKER_BYTES:
        return None

    with archive.open(info) as handle:
        data = handle.read(MAX_MARKER_BYTES + 1)

    if len(data) > MAX_MARKER_BYTES:
        return None
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return None


def parse_json_object(text: str | None) -> dict | None:
    """Return a JSON object, None when the text is anything else."""
    if text is None:
        return None
    try:
        value = json.loads(text)
    except ValueError:
        return None
    return value if isinstance(value, dict) else None


def _clean_scalar(value: str) -> str:
    """Return a YAML scalar without its comment and quotes."""
    value = value.strip()
    if value[:1] in ("'", '"'):
        quote = value[0]
        end = value.find(quote, 1)
        return value[1:end] if end > 0 else value[1:]
    return re.sub(r"\s+#.*$", "", value).strip()


_TOP_KEY = re.compile(r"^([A-Za-z0-9_.\-]+|\"[^\"]+\"|'[^']+'):[ \t]*(.*)$")
_CHILD_KEY = re.compile(r"^([ \t]+)([A-Za-z0-9_\-]+):[ \t]*(.*)$")


def scan_yaml(text: str | None) -> tuple[dict[str, str], dict[str, dict[str, str]]]:
    """Read the keys of a YAML file that are plain text.

    Returns the top level keys with their text, and the first level below each
    of them. Only what recognition needs is read, this is not a YAML parser.
    """
    top: dict[str, str] = {}
    children: dict[str, dict[str, str]] = {}
    if not text:
        return top, children

    section: str | None = None
    indent: str | None = None
    for line in text[:65536].splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith(("#", "---", "...")):
            continue

        if line[0] not in (" ", "\t"):
            match = _TOP_KEY.match(line)
            if match is None:
                section = None
                continue
            key = match.group(1).strip("'\"")
            top[key] = _clean_scalar(match.group(2))
            children[key] = {}
            section, indent = key, None
            continue

        if section is None:
            continue
        child = _CHILD_KEY.match(line)
        if child is None:
            continue
        if indent is None:
            indent = child.group(1)
        if child.group(1) == indent:
            children[section][child.group(2)] = _clean_scalar(child.group(3))

    return top, children


def theme_names(text: str | None) -> list[str]:
    """Return the names of the themes a theme file holds."""
    if text and text.lstrip().startswith("{"):
        value = parse_json_object(text)
        return [str(key) for key in value] if value else []
    top, _ = scan_yaml(text)
    return list(top)


def _basename(path: str) -> str:
    return path.rsplit("/", 1)[-1]


def _dirname(path: str) -> str:
    return path.rsplit("/", 1)[0] if "/" in path else ""


def _join(parent: str, name: str) -> str:
    return f"{parent}/{name}" if parent else name


def _depth(path: str) -> int:
    return len(path.split("/")) if path else 0


def folder_name(folder: str, archive_name: str = "") -> str:
    """Return the name of the repository an archive folder came from.

    Archives name their folder after the repository and the branch or version.
    """
    name = _basename(folder) if folder else re.sub(r"\.zip$", "", archive_name, flags=re.I)
    if match := _FOLDER_SUFFIX.match(name):
        name = match.group(1) or name
    return name


def slug(name: str) -> str:
    """Return a name that is safe as the name of a folder or file."""
    value = re.sub(r"[^a-z0-9._-]+", "-", name.lower()).strip("-._")
    return value or "uploaded"


def _script_names(name: str) -> list[str]:
    """Return the file names a dashboard resource called name can have."""
    names = [
        f"{name.replace('lovelace-', '')}.js",
        f"{name}.js",
        f"{name}.umd.js",
        f"{name}-bundle.js",
    ]
    return list(dict.fromkeys(names))


class _Index:
    """The paths of an archive, ready to be asked about."""

    def __init__(self, entries: list[str]) -> None:
        self.files: set[str] = set()
        self.dirs: set[str] = {""}
        for raw in entries:
            parts = raw.rstrip("/").split("/")
            if (
                not raw
                or "__macosx" in {part.lower() for part in parts}
                or parts[-1] == ".DS_Store"
                or parts[-1].startswith("._")
            ):
                continue
            path = "/".join(parts)
            if not raw.endswith("/"):
                self.files.add(path)
            for depth in range(1, len(parts) + (1 if raw.endswith("/") else 0)):
                self.dirs.add("/".join(parts[:depth]))
            if raw.endswith("/"):
                self.dirs.add(path)
        self._listing: dict[str, tuple[list[str], list[str]]] = {}
        for path in sorted(self.files):
            self._listing.setdefault(_dirname(path), ([], []))[0].append(
                _basename(path)
            )
        for path in sorted(self.dirs - {""}):
            self._listing.setdefault(_dirname(path), ([], []))[1].append(
                _basename(path)
            )

    def files_in(self, directory: str) -> list[str]:
        """Return the names of the files directly in a folder."""
        return self._listing.get(directory, ([], []))[0]

    def dirs_in(self, directory: str) -> list[str]:
        """Return the names of the folders directly in a folder."""
        return self._listing.get(directory, ([], []))[1]

    def roots(self) -> list[str]:
        """Return the folders a repository can start in, the shallowest first."""
        found = [
            directory
            for directory in self.dirs
            if _depth(directory) <= MAX_ROOT_DEPTH
            and not any(
                part.startswith(".") or part.lower() in _NOT_A_ROOT
                for part in directory.split("/")
                if part
            )
        ]
        return sorted(found, key=lambda path: (_depth(path), path))

    def below(self, directory: str) -> list[str]:
        """Return every file below a folder."""
        prefix = f"{directory}/" if directory else ""
        return sorted(path for path in self.files if path.startswith(prefix))


def _wanted_in_root(index: _Index, root: str) -> list[str]:
    """Return the small files that tell what a candidate root holds."""
    wanted = [_join(root, "hacs.json"), _join(root, "package.json")]
    if "manifest.json" in index.files_in(root):
        wanted.append(_join(root, "manifest.json"))

    components = _join(root, "custom_components")
    for name in index.dirs_in(components):
        wanted.append(_join(_join(components, name), "manifest.json"))

    themes = _join(root, "themes")
    wanted.extend(
        _join(themes, name)
        for name in index.files_in(themes)
        if name.endswith(".yaml")
    )

    blueprints = _join(root, "blueprints")
    wanted.extend(
        path
        for path in index.below(blueprints)
        if path.endswith(".yaml")
        and _depth(path) - _depth(blueprints) <= 4
    )
    return wanted


def _app_configs(index: _Index) -> list[str]:
    return [
        path
        for path in sorted(index.files, key=lambda item: (_depth(item), item))
        if re.fullmatch(r"config\.(yaml|yml|json)", _basename(path))
        and _depth(_dirname(path)) <= MAX_APP_DEPTH - 1
        and not any(
            part.startswith(".") or part.lower() in _NOT_AN_APP
            for part in _dirname(path).split("/")
            if part
        )
    ]


def _repository_files(index: _Index) -> list[str]:
    return [
        path
        for path in sorted(index.files, key=lambda item: (_depth(item), item))
        if re.fullmatch(r"repository\.(yaml|yml|json)", _basename(path))
        and _depth(_dirname(path)) <= MAX_ROOT_DEPTH
        and not any(
            part.startswith(".") or part.lower() in _NOT_AN_APP
            for part in _dirname(path).split("/")
            if part
        )
    ]


def marker_paths(entries: list[str]) -> list[str]:
    """Return the small files whose text is needed to tell what an archive holds."""
    index = _Index(entries)
    wanted: list[str] = []
    for root in index.roots():
        wanted.extend(_wanted_in_root(index, root))
    wanted.extend(_app_configs(index))
    wanted.extend(_repository_files(index))
    present = [path for path in dict.fromkeys(wanted) if path in index.files]
    return present[:MAX_MARKER_FILES]


def _manifest_text(manifest: dict | None, key: str) -> str | None:
    value = (manifest or {}).get(key)
    return value if isinstance(value, str) and value else None


def _integration_items(
    index: _Index, root: str, files: dict[str, str], hacs: dict | None
) -> list[Item]:
    found: list[Item] = []
    components = _join(root, "custom_components")
    candidates = [
        (_join(components, name), "integration_manifest")
        for name in index.dirs_in(components)
        if "manifest.json" in index.files_in(_join(components, name))
    ]
    if (hacs or {}).get("content_in_root") is True and (
        "manifest.json" in index.files_in(root)
    ):
        candidates.append((root, "integration_manifest_in_root"))

    for source, rule in candidates:
        marker = _join(source, "manifest.json")
        manifest = parse_json_object(files.get(marker))
        item = Item(
            kind="integration",
            name="",
            source=source,
            marker=marker,
            rule=rule,
            version=_manifest_text(manifest, "version"),
        )
        if manifest is None:
            item.problems.append("manifest_unreadable")
            item.domain = _basename(source)
        else:
            domain = _manifest_text(manifest, "domain")
            if domain is None:
                item.problems.append("manifest_without_domain")
                item.domain = _basename(source)
            elif not VALID_DOMAIN.match(domain):
                item.problems.append("invalid_domain")
                item.domain = domain
            else:
                item.domain = domain
        item.name = _manifest_text(manifest, "name") or item.domain or ""
        found.append(item)
    return found


def _plugin_item(
    index: _Index, root: str, files: dict[str, str], hacs: dict | None, name: str
) -> Item | None:
    directories = (root, _join(root, "dist"))
    script: str | None = None
    rule = "dashboard_root"

    filename = _manifest_text(hacs, "filename")
    if filename and filename.endswith(".js") and "/" not in filename:
        for directory in directories:
            if filename in index.files_in(directory):
                script = _join(directory, filename)
                rule = "dashboard_hacs_file"
                break
    else:
        for candidate in _script_names(name):
            for directory in directories:
                match = next(
                    (
                        file
                        for file in index.files_in(directory)
                        if file.lower() == candidate.lower()
                    ),
                    None,
                )
                if match is not None:
                    script = _join(directory, match)
                    rule = "dashboard_root" if directory == root else "dashboard_dist"
                    break
            if script:
                break

        if script is None:
            only = [
                file
                for file in index.files_in(directories[1])
                if file.endswith(".js")
            ]
            if len(only) == 1:
                script = _join(directories[1], only[0])
                rule = "dashboard_dist"

    if script is None:
        return None

    package = parse_json_object(files.get(_join(root, "package.json")))
    return Item(
        kind="plugin",
        name=_manifest_text(hacs, "name") or name,
        source=script,
        marker=script,
        rule=rule,
        version=_manifest_text(package, "version"),
        file=_basename(script),
    )


def _theme_items(
    index: _Index, root: str, files: dict[str, str], hacs: dict | None, name: str
) -> list[Item]:
    found: list[Item] = []
    themes = _join(root, "themes")
    theme_files = [file for file in index.files_in(themes) if file.endswith(".yaml")]
    if theme_files:
        names: list[str] = []
        readable = False
        for file in theme_files:
            text = files.get(_join(themes, file))
            if text is not None:
                readable = True
                names.extend(theme_names(text))
        item = Item(
            kind="theme",
            name=_manifest_text(hacs, "name") or name,
            source=themes,
            marker=_join(themes, theme_files[0]),
            rule="theme_folder",
            themes=list(dict.fromkeys(names)),
        )
        if not readable or not item.themes:
            item.problems.append("theme_without_names")
        found.append(item)

    filename = _manifest_text(hacs, "filename")
    if (
        filename
        and filename.endswith(".yaml")
        and "/" not in filename
        and filename in index.files_in(root)
        and not theme_files
    ):
        path = _join(root, filename)
        found.append(
            Item(
                kind="theme",
                name=_manifest_text(hacs, "name") or name,
                source=path,
                marker=path,
                rule="theme_hacs_file",
                themes=theme_names(files.get(path)),
            )
        )
    return found


def _template_items(
    index: _Index, root: str, hacs: dict | None, name: str
) -> list[Item]:
    filename = _manifest_text(hacs, "filename")
    if filename and filename.endswith(".jinja") and "/" not in filename:
        if filename in index.files_in(root):
            path = _join(root, filename)
            return [
                Item(
                    kind="template",
                    name=_manifest_text(hacs, "name") or filename[: -len(".jinja")],
                    source=path,
                    marker=_join(root, "hacs.json"),
                    rule="template_hacs_file",
                    file=filename,
                )
            ]
        return []

    return [
        Item(
            kind="template",
            name=file[: -len(".jinja")],
            source=_join(root, file),
            marker=_join(root, file),
            rule="template_root_file",
            file=file,
        )
        for file in index.files_in(root)
        if file.endswith(".jinja")
    ]


def _blueprint_items(
    index: _Index, root: str, files: dict[str, str]
) -> list[Item]:
    found: list[Item] = []
    blueprints = _join(root, "blueprints")
    for path in index.below(blueprints):
        if not path.endswith(".yaml") or path not in files:
            continue
        _, children = scan_yaml(files[path])
        if "blueprint" not in children:
            continue
        info = children["blueprint"]
        item = Item(
            kind="blueprint",
            name=info.get("name") or _basename(path)[: -len(".yaml")],
            source=path,
            marker=path,
            rule="blueprint_file",
            domain=info.get("domain") or None,
        )
        if item.domain not in BLUEPRINT_DOMAINS:
            item.problems.append("blueprint_domain_unknown")
        found.append(item)
    return found


def _apps(index: _Index, files: dict[str, str]) -> list[Item]:
    found: list[Item] = []
    for path in _app_configs(index):
        text = files.get(path)
        if text is None:
            continue
        values: dict[str, str]
        if path.endswith(".json"):
            parsed = parse_json_object(text) or {}
            values = {k: v for k, v in parsed.items() if isinstance(v, str)}
        else:
            values, _ = scan_yaml(text)
        if not (values.get("slug") and values.get("name") and values.get("version")):
            continue
        source = _dirname(path)
        found.append(
            Item(
                kind="app",
                name=values["name"],
                source=source,
                marker=path,
                rule="app_config",
                version=values["version"],
                domain=values["slug"],
            )
        )
    return found


def _app_repositories(
    index: _Index, files: dict[str, str], apps: list[Item]
) -> list[Item]:
    found: list[Item] = []
    for path in _repository_files(index):
        text = files.get(path)
        if text is None:
            continue
        if path.endswith(".json"):
            parsed = parse_json_object(text) or {}
            values = {k: v for k, v in parsed.items() if isinstance(v, str)}
        else:
            values, _ = scan_yaml(text)
        if not values.get("name"):
            continue
        source = _dirname(path)
        prefix = f"{source}/" if source else ""
        found.append(
            Item(
                kind="app_repository",
                name=values["name"],
                source=source,
                marker=path,
                rule="app_repository_file",
                themes=[
                    app.domain or app.name
                    for app in apps
                    if app.source.startswith(prefix)
                ],
            )
        )
    return found


def detect(
    entries: list[str],
    read: Callable[[str], str | None],
    archive_name: str = "",
) -> list[Item]:
    """Return what an archive holds, by the files that give it away.

    The repository content is searched from the archive root and from the
    folders below it, up to three deep, and the shallowest folder that holds
    something wins. Apps and their repositories are looked for next to that.
    """
    index = _Index(entries)
    files: dict[str, str] = {}
    for path in marker_paths(entries):
        if (text := read(path)) is not None:
            files[path] = text

    items: list[Item] = []
    best_depth: int | None = None
    for root in index.roots():
        if best_depth is not None and _depth(root) > best_depth:
            break
        hacs = parse_json_object(files.get(_join(root, "hacs.json")))
        name = _manifest_text(hacs, "name") or folder_name(root, archive_name)
        here = [
            *_integration_items(index, root, files, hacs),
            *_template_items(index, root, hacs, name),
            *_theme_items(index, root, files, hacs, name),
            *_blueprint_items(index, root, files),
        ]
        if (
            plugin := _plugin_item(index, root, files, hacs, name)
        ) is not None and not any(item.kind == "integration" for item in here):
            here.append(plugin)
        if here:
            best_depth = _depth(root)
            items.extend(here)

    apps = _apps(index, files)
    items.extend(_app_repositories(index, files, apps))
    items.extend(apps)

    return sorted(
        items,
        key=lambda item: (KIND_ORDER.index(item.kind), item.source),
    )


def stage_files(
    archive: zipfile.ZipFile,
    infos: dict[str, zipfile.ZipInfo],
    source: str,
    destination: Path,
    *,
    only: str | None = None,
    budget: int = MAX_UNPACKED,
) -> int:
    """Write the files below source into destination, return how many.

    Runs in the executor. Only plain files are written: folders are made as
    needed, nothing keeps the mode an entry names, and the history folder is
    left out. A file the archive says is smaller than it turns out to be is
    refused instead of being cut off.
    """
    prefix = f"{source}/" if source else ""
    resolved_destination = destination.resolve()
    written = 0
    spent = 0
    for name, info in infos.items():
        if info.is_dir() or not name.startswith(prefix):
            continue
        relative = name[len(prefix) :]
        if only is not None and relative != only:
            continue
        if any(
            part.lower() in SKIPPED_DIRECTORIES
            for part in PurePosixPath(relative).parts[:-1]
        ):
            continue

        target = (destination / relative).resolve()
        if resolved_destination not in target.parents:
            raise UploadError("upload_unsafe_path", path=name[:120])

        target.parent.mkdir(parents=True, exist_ok=True)
        spent = _copy_member(archive, info, target, spent, budget)
        written += 1

    return written


def _copy_member(
    archive: zipfile.ZipFile,
    info: zipfile.ZipInfo,
    target: Path,
    spent: int,
    budget: int,
) -> int:
    """Copy one member, counting what really comes out of it."""
    size = 0
    with archive.open(info) as source, target.open("xb") as handle:
        handle_out: IO[bytes] = handle
        while chunk := source.read(COPY_CHUNK):
            size += len(chunk)
            spent += len(chunk)
            if size > info.file_size or spent > budget:
                raise UploadError("upload_too_large_unpacked", limit=str(budget))
            handle_out.write(chunk)
    return spent
