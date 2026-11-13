"""Tests for looking inside uploaded archives."""

import json
from pathlib import Path
import stat
import zipfile

import pytest

from homeassistant.components.marketplace.upload_archive import (
    MAX_ENTRIES,
    MAX_PATH_DEPTH,
    UploadError,
    check_entry_name,
    detect,
    folder_name,
    marker_paths,
    parse_json_object,
    read_marker,
    scan_yaml,
    slug,
    stage_files,
    theme_names,
    validate_archive,
)

CASES = json.loads(
    (Path(__file__).parent / "fixtures" / "archive_detection_cases.json").read_text(
        encoding="utf-8"
    )
)["cases"]


@pytest.mark.parametrize("case", CASES, ids=[case["id"] for case in CASES])
def test_detect_matches_the_cases_the_panel_is_tested_with(
    case: dict[str, object],
) -> None:
    """Test that the server finds what the panel finds in the same archive."""
    files: dict[str, str] = case["files"]  # type: ignore[assignment]

    items = detect(list(files), files.get, str(case.get("archive_name", "")))

    assert [
        {"kind": item.kind, "source": item.source, "installable": item.installable}
        for item in items
    ] == case["expect"]


def test_detect_reads_the_details_of_an_integration() -> None:
    """Test that the name, version and domain come from the manifest."""
    files = {
        "demo-main/custom_components/demo_x/manifest.json": json.dumps(
            {"domain": "demo_x", "name": "Demo X", "version": "1.2.0"}
        )
    }

    (item,) = detect(list(files), files.get)

    assert (item.name, item.version, item.domain) == ("Demo X", "1.2.0", "demo_x")
    assert item.rule == "integration_manifest"


def test_detect_refuses_a_domain_that_names_another_folder() -> None:
    """Test that a domain with a path in it is a problem, not an install."""
    files = {
        "x/custom_components/y/manifest.json": json.dumps({"domain": "../../evil"})
    }

    (item,) = detect(list(files), files.get)

    assert item.problems == ["invalid_domain"]
    assert not item.installable


def test_marker_paths_asks_for_small_files_only() -> None:
    """Test that the files to read are the ones that tell what the archive holds."""
    entries = [
        "x-main/hacs.json",
        "x-main/custom_components/a/manifest.json",
        "x-main/custom_components/a/big_data.json",
        "x-main/src/huge.bin",
    ]

    assert marker_paths(entries) == [
        "x-main/hacs.json",
        "x-main/custom_components/a/manifest.json",
    ]


@pytest.mark.parametrize(
    ("folder", "archive_name", "expected"),
    [
        ("lovelace-card-main", "", "lovelace-card"),
        ("card-v1.2.3", "", "card"),
        ("plain", "", "plain"),
        ("", "my-card-master.zip", "my-card"),
        ("", "", ""),
    ],
)
def test_folder_name(folder: str, archive_name: str, expected: str) -> None:
    """Test the name of a repository, taken from the folder of an archive."""
    assert folder_name(folder, archive_name) == expected


def test_slug() -> None:
    """Test that a name is turned into a safe folder name."""
    assert slug("My Card!") == "my-card"
    assert slug("../..") == "uploaded"


def test_scan_yaml_reads_plain_keys() -> None:
    """Test the small reader of the keys recognition needs."""
    top, children = scan_yaml(
        "# comment\nname: 'My app'  # trailing\nslug: hello\n"
        "blueprint:\n  name: Motion\n  domain: automation\n    deep: ignored\n"
    )

    assert top["name"] == "My app"
    assert top["slug"] == "hello"
    assert children["blueprint"] == {"name": "Motion", "domain": "automation"}


def test_theme_names() -> None:
    """Test that the top level keys of a theme file are its themes."""
    assert theme_names("Ocean:\n  primary-color: red\nForest:\n  x: y\n") == [
        "Ocean",
        "Forest",
    ]
    assert theme_names('{"Json": {}}') == ["Json"]


def test_parse_json_object() -> None:
    """Test that only an object counts."""
    assert parse_json_object('{"a": 1}') == {"a": 1}
    assert parse_json_object("[1]") is None
    assert parse_json_object("nope") is None
    assert parse_json_object(None) is None


@pytest.mark.parametrize(
    "name",
    [
        "",
        "/etc/passwd",
        "../evil.txt",
        "a/../../evil.txt",
        "a/./b",
        "a//b",
        "C:/windows/x.dll",
        "a\\b.txt",
        "nul\x00.txt",
        "evil\u202egpj.exe",
        "x/" * (MAX_PATH_DEPTH + 1) + "f",
    ],
)
def test_unsafe_names_are_refused(name: str) -> None:
    """Test that a name that could leave its folder refuses the archive."""
    with pytest.raises(UploadError):
        check_entry_name(name)


@pytest.mark.parametrize("name", ["a.txt", "a/b/c.json", "dir/", "x-main/.git/HEAD"])
def test_plain_names_are_accepted(name: str) -> None:
    """Test that ordinary names pass."""
    check_entry_name(name)


def _info(name: str, **attributes: int) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(name)
    info.file_size = attributes.get("file_size", 1)
    info.compress_size = attributes.get("compress_size", 1)
    info.flag_bits = attributes.get("flag_bits", 0)
    info.compress_type = attributes.get("compress_type", zipfile.ZIP_DEFLATED)
    info.create_system = attributes.get("create_system", 3)
    info.external_attr = attributes.get("external_attr", 0)
    return info


@pytest.mark.parametrize(
    ("infos", "key"),
    [
        pytest.param(
            [_info("link", external_attr=(stat.S_IFLNK | 0o777) << 16)],
            "upload_link_entry",
            id="symlink",
        ),
        pytest.param(
            [_info("device", external_attr=(stat.S_IFCHR | 0o600) << 16)],
            "upload_link_entry",
            id="device",
        ),
        pytest.param([_info("secret", flag_bits=1)], "upload_encrypted", id="encrypted"),
        pytest.param(
            [_info("odd", compress_type=zipfile.ZIP_BZIP2)],
            "upload_unsupported_method",
            id="method",
        ),
        pytest.param(
            [_info("bomb", file_size=500 * 1024 * 1024, compress_size=10_000)],
            "upload_ratio",
            id="ratio",
        ),
        pytest.param(
            [_info(f"f{index}") for index in range(MAX_ENTRIES + 1)],
            "upload_too_many_entries",
            id="count",
        ),
        pytest.param(
            [
                _info("a", file_size=80 * 1024 * 1024, compress_size=80 * 1024 * 1024),
                _info("b", file_size=80 * 1024 * 1024, compress_size=80 * 1024 * 1024),
            ],
            "upload_too_large_unpacked",
            id="total",
        ),
        pytest.param([_info("../x")], "upload_unsafe_path", id="traversal"),
    ],
)
def test_validate_archive_refuses(infos: list[zipfile.ZipInfo], key: str) -> None:
    """Test what an archive may not hold."""
    with pytest.raises(UploadError) as error:
        validate_archive(infos)

    assert error.value.key == key


def test_validate_archive_accepts_plain_files() -> None:
    """Test that files and folders from any system pass."""
    validate_archive(
        [
            _info("dir/", external_attr=(stat.S_IFDIR | 0o755) << 16),
            _info("dir/file.txt", external_attr=(stat.S_IFREG | 0o644) << 16),
            _info("win.txt", create_system=0),
        ]
    )


def _write_zip(path: Path, files: dict[str, bytes]) -> zipfile.ZipFile:
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    return zipfile.ZipFile(path)


def test_read_marker_skips_what_is_not_a_small_text_file(tmp_path: Path) -> None:
    """Test that only small UTF-8 files are read."""
    archive = _write_zip(
        tmp_path / "a.zip",
        {"ok.json": b"\xef\xbb\xbf{}", "binary.bin": b"\xff\xfe\xfd", "big.json": b"x" * (300 * 1024)},
    )

    assert read_marker(archive, archive.getinfo("ok.json")) == "{}"
    assert read_marker(archive, archive.getinfo("binary.bin")) is None
    assert read_marker(archive, archive.getinfo("big.json")) is None


def test_stage_files_writes_only_plain_files_below_the_source(tmp_path: Path) -> None:
    """Test that only the chosen folder is written, without the history folder."""
    archive = _write_zip(
        tmp_path / "a.zip",
        {
            "x-main/custom_components/a/manifest.json": b"{}",
            "x-main/custom_components/a/sub/data.txt": b"data",
            "x-main/custom_components/a/.git/HEAD": b"ref",
            "x-main/custom_components/b/manifest.json": b"{}",
            "x-main/README.md": b"hi",
        },
    )
    destination = tmp_path / "out"
    destination.mkdir()

    written = stage_files(
        archive,
        {info.filename: info for info in archive.infolist()},
        "x-main/custom_components/a",
        destination,
    )

    assert written == 2
    assert sorted(
        path.relative_to(destination).as_posix()
        for path in destination.rglob("*")
        if path.is_file()
    ) == ["manifest.json", "sub/data.txt"]


def test_stage_files_one_file(tmp_path: Path) -> None:
    """Test that a single file of a folder can be taken alone."""
    archive = _write_zip(
        tmp_path / "a.zip", {"dist/card.js": b"js", "dist/card.js.map": b"map"}
    )
    destination = tmp_path / "out"
    destination.mkdir()

    stage_files(
        archive,
        {info.filename: info for info in archive.infolist()},
        "dist",
        destination,
        only="card.js",
    )

    assert [path.name for path in destination.iterdir()] == ["card.js"]


def test_stage_files_stops_at_the_budget(tmp_path: Path) -> None:
    """Test that more data than allowed is refused instead of written."""
    archive = _write_zip(tmp_path / "a.zip", {"f.txt": b"x" * 1000})
    destination = tmp_path / "out"
    destination.mkdir()

    with pytest.raises(UploadError) as error:
        stage_files(
            archive,
            {info.filename: info for info in archive.infolist()},
            "",
            destination,
            budget=100,
        )

    assert error.value.key == "upload_too_large_unpacked"
