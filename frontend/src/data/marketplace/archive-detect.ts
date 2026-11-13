/**
 * Tells what an archive holds, from the paths in it and the text of a few
 * small files. Nothing here needs the history folder of a repository: the
 * content is recognised by the files Home Assistant and the Marketplace look
 * for, in the shallowest place they are found, because an archive often has
 * one wrapping folder and the content can sit a folder or two deeper.
 *
 * The server applies the same rules before it installs anything
 * (core/homeassistant/components/marketplace/upload_archive.py), and the two
 * are tested against the same cases, so what is announced here is what is
 * installed.
 */

export type ArchiveItemKind =
  | "integration"
  | "plugin"
  | "theme"
  | "template"
  | "blueprint"
  | "app_repository"
  | "app";

export type ArchiveRule =
  | "integration_manifest"
  | "integration_manifest_in_root"
  | "dashboard_hacs_file"
  | "dashboard_dist"
  | "dashboard_root"
  | "theme_folder"
  | "theme_hacs_file"
  | "template_hacs_file"
  | "template_root_file"
  | "blueprint_file"
  | "app_config"
  | "app_repository_file";

export type ArchiveProblem =
  | "manifest_unreadable"
  | "manifest_without_domain"
  | "invalid_domain"
  | "theme_without_names"
  | "blueprint_domain_unknown";

export interface ArchiveItem {
  /** Unique in an archive */
  id: string;
  kind: ArchiveItemKind;
  name: string;
  version?: string;
  /** The folder, or the file, in the archive that holds it */
  source: string;
  /** The file that gave it away */
  marker: string;
  rule: ArchiveRule;
  /** The domain of an integration or blueprint, the slug of an app */
  domain?: string;
  /** The script of a card, the file of a template */
  file?: string;
  themes: string[];
  /** The apps a repository of apps holds */
  apps: string[];
  problems: ArchiveProblem[];
}

export interface ArchiveGitInfo {
  /** Where the history folder sits in the archive */
  folder: string;
  /** The address it was cloned from, without any credentials */
  origin?: string;
  branch?: string;
}

export interface ArchiveDetection {
  items: ArchiveItem[];
  git?: ArchiveGitInfo;
}

/** What the Marketplace can add from a file, the rest is only announced. */
export const INSTALLABLE_KINDS: readonly ArchiveItemKind[] = [
  "integration",
  "plugin",
  "theme",
  "template",
  "blueprint",
];

/** Kinds that run code in the home once added. */
export const CODE_KINDS: readonly ArchiveItemKind[] = [
  "integration",
  "plugin",
  "app",
];

/** What is looked for, in the words shown when nothing is found. */
export const LOOKED_FOR: readonly string[] = [
  "custom_components/<name>/manifest.json",
  "hacs.json",
  "dist/*.js",
  "themes/*.yaml",
  "blueprints/**/*.yaml",
  "repository.yaml",
  "config.yaml",
];

export const isInstallable = (item: ArchiveItem): boolean =>
  INSTALLABLE_KINDS.includes(item.kind) && item.problems.length === 0;

const KIND_ORDER: readonly ArchiveItemKind[] = [
  "integration",
  "plugin",
  "theme",
  "template",
  "blueprint",
  "app_repository",
  "app",
];

const MAX_ROOT_DEPTH = 3;
const MAX_APP_DEPTH = 4;
const MAX_MARKER_FILES = 400;
const BLUEPRINT_DOMAINS = ["automation", "script", "template"];
const VALID_DOMAIN = /^[a-z0-9_-]+$/;

const NOT_A_ROOT = new Set([
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
]);
const NOT_AN_APP = new Set([
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
]);

const FOLDER_SUFFIX =
  /^(.*?)-(?:main|master|develop|dev|trunk|head|v?\d+(?:\.\d+)*(?:[-+.][\w.]+)?)$/i;

const compare = (a: string, b: string): number => {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
};

const basename = (path: string): string =>
  path.slice(path.lastIndexOf("/") + 1);

const dirname = (path: string): string =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";

const join = (parent: string, name: string): string =>
  parent ? `${parent}/${name}` : name;

const depth = (path: string): number => (path ? path.split("/").length : 0);

const withoutSuffix = (value: string, suffix: string): string =>
  value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;

/** The name of the repository an archive folder came from. */
export const folderName = (folder: string, archiveName = ""): string => {
  let name = folder ? basename(folder) : archiveName.replace(/\.zip$/i, "");
  const match = FOLDER_SUFFIX.exec(name);
  if (match) {
    name = match[1] || name;
  }
  return name;
};

const scriptNames = (name: string): string[] =>
  Array.from(
    new Set([
      `${name.split("lovelace-").join("")}.js`,
      `${name}.js`,
      `${name}.umd.js`,
      `${name}-bundle.js`,
    ])
  );

const parseJsonObject = (
  text: string | undefined
): Record<string, unknown> | undefined => {
  if (text === undefined) {
    return undefined;
  }
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch (_err) {
    return undefined;
  }
};

const textOf = (
  values: Record<string, unknown> | undefined,
  key: string
): string | undefined => {
  const value = values?.[key];
  return typeof value === "string" && value ? value : undefined;
};

const cleanScalar = (raw: string): string => {
  const value = raw.trim();
  if (value[0] === "'" || value[0] === '"') {
    const end = value.indexOf(value[0], 1);
    return end > 0 ? value.slice(1, end) : value.slice(1);
  }
  return value.replace(/\s+#.*$/, "").trim();
};

const TOP_KEY = /^([A-Za-z0-9_.-]+|"[^"]+"|'[^']+'):[ \t]*(.*)$/;
const CHILD_KEY = /^([ \t]+)([A-Za-z0-9_-]+):[ \t]*(.*)$/;

interface YamlScan {
  top: Record<string, string>;
  children: Record<string, Record<string, string>>;
}

/**
 * The keys of a YAML file that are plain text: the top level, and the first
 * level below each top level key. Only what recognition needs is read, this
 * is not a YAML parser.
 */
export const scanYaml = (text: string | undefined): YamlScan => {
  const top: Record<string, string> = {};
  const children: Record<string, Record<string, string>> = {};
  if (!text) {
    return { top, children };
  }
  let section: string | undefined;
  let indent: string | undefined;
  for (const line of text.slice(0, 65536).split(/\r\n|\n|\r/)) {
    const stripped = line.trim();
    if (
      !stripped ||
      stripped.startsWith("#") ||
      stripped.startsWith("---") ||
      stripped.startsWith("...")
    ) {
      continue;
    }
    if (line[0] !== " " && line[0] !== "\t") {
      const match = TOP_KEY.exec(line);
      if (!match) {
        section = undefined;
        continue;
      }
      const key = match[1].replace(/^['"]|['"]$/g, "");
      top[key] = cleanScalar(match[2]);
      children[key] = {};
      section = key;
      indent = undefined;
      continue;
    }
    if (section === undefined) {
      continue;
    }
    const child = CHILD_KEY.exec(line);
    if (!child) {
      continue;
    }
    if (indent === undefined) {
      indent = child[1];
    }
    if (child[1] === indent) {
      children[section][child[2]] = cleanScalar(child[3]);
    }
  }
  return { top, children };
};

/** The names of the themes a theme file holds. */
export const themeNames = (text: string | undefined): string[] => {
  if (text && text.trimStart().startsWith("{")) {
    const value = parseJsonObject(text);
    return value ? Object.keys(value) : [];
  }
  return Object.keys(scanYaml(text).top);
};

class Index {
  public files = new Set<string>();

  public dirs = new Set<string>([""]);

  private _listing = new Map<string, [string[], string[]]>();

  constructor(entries: readonly string[]) {
    for (const raw of entries) {
      const isDirectory = raw.endsWith("/");
      const parts = raw.replace(/\/+$/, "").split("/");
      if (
        !raw ||
        parts.some((part) => part.toLowerCase() === "__macosx") ||
        parts[parts.length - 1] === ".DS_Store" ||
        parts[parts.length - 1].startsWith("._")
      ) {
        continue;
      }
      const path = parts.join("/");
      if (!isDirectory) {
        this.files.add(path);
      }
      for (let at = 1; at < parts.length + (isDirectory ? 1 : 0); at++) {
        this.dirs.add(parts.slice(0, at).join("/"));
      }
    }
    for (const path of [...this.files].sort(compare)) {
      this._entry(dirname(path))[0].push(basename(path));
    }
    for (const path of [...this.dirs].filter(Boolean).sort(compare)) {
      this._entry(dirname(path))[1].push(basename(path));
    }
  }

  private _entry(directory: string): [string[], string[]] {
    let entry = this._listing.get(directory);
    if (!entry) {
      entry = [[], []];
      this._listing.set(directory, entry);
    }
    return entry;
  }

  public filesIn(directory: string): string[] {
    return this._listing.get(directory)?.[0] ?? [];
  }

  public dirsIn(directory: string): string[] {
    return this._listing.get(directory)?.[1] ?? [];
  }

  /** The folders a repository can start in, the shallowest first. */
  public roots(): string[] {
    return [...this.dirs]
      .filter(
        (directory) =>
          depth(directory) <= MAX_ROOT_DEPTH &&
          !directory
            .split("/")
            .filter(Boolean)
            .some(
              (part) =>
                part.startsWith(".") || NOT_A_ROOT.has(part.toLowerCase())
            )
      )
      .sort((a, b) => depth(a) - depth(b) || compare(a, b));
  }

  public below(directory: string): string[] {
    const prefix = directory ? `${directory}/` : "";
    return [...this.files]
      .filter((path) => path.startsWith(prefix))
      .sort(compare);
  }
}

const sortedByDepth = (paths: Iterable<string>): string[] =>
  [...paths].sort((a, b) => depth(a) - depth(b) || compare(a, b));

const appConfigs = (index: Index): string[] =>
  sortedByDepth(index.files).filter(
    (path) =>
      /^config\.(yaml|yml|json)$/.test(basename(path)) &&
      depth(dirname(path)) <= MAX_APP_DEPTH - 1 &&
      !dirname(path)
        .split("/")
        .filter(Boolean)
        .some(
          (part) => part.startsWith(".") || NOT_AN_APP.has(part.toLowerCase())
        )
  );

const repositoryFiles = (index: Index): string[] =>
  sortedByDepth(index.files).filter(
    (path) =>
      /^repository\.(yaml|yml|json)$/.test(basename(path)) &&
      depth(dirname(path)) <= MAX_ROOT_DEPTH &&
      !dirname(path)
        .split("/")
        .filter(Boolean)
        .some(
          (part) => part.startsWith(".") || NOT_AN_APP.has(part.toLowerCase())
        )
  );

const wantedInRoot = (index: Index, root: string): string[] => {
  const wanted = [join(root, "hacs.json"), join(root, "package.json")];
  if (index.filesIn(root).includes("manifest.json")) {
    wanted.push(join(root, "manifest.json"));
  }
  const components = join(root, "custom_components");
  for (const name of index.dirsIn(components)) {
    wanted.push(join(join(components, name), "manifest.json"));
  }
  const themes = join(root, "themes");
  wanted.push(
    ...index
      .filesIn(themes)
      .filter((name) => name.endsWith(".yaml"))
      .map((name) => join(themes, name))
  );
  const blueprints = join(root, "blueprints");
  wanted.push(
    ...index
      .below(blueprints)
      .filter(
        (path) => path.endsWith(".yaml") && depth(path) - depth(blueprints) <= 4
      )
  );
  return wanted;
};

const GIT_FILES = ["config", "HEAD"];

/**
 * The small files whose text is needed to tell what an archive holds, the
 * history folder's two files included when there is one.
 */
export const markerPaths = (entries: readonly string[]): string[] => {
  const index = new Index(entries);
  const wanted: string[] = [];
  for (const root of index.roots()) {
    wanted.push(...wantedInRoot(index, root));
  }
  wanted.push(...appConfigs(index), ...repositoryFiles(index));
  const present = Array.from(new Set(wanted))
    .filter((path) => index.files.has(path))
    .slice(0, MAX_MARKER_FILES);

  const all = new Set(entries);
  for (const folder of ["", ...index.dirsIn("")]) {
    for (const name of GIT_FILES) {
      const path = join(join(folder, ".git"), name);
      if (all.has(path)) {
        present.push(path);
      }
    }
  }
  return present;
};

const integrationItems = (
  index: Index,
  root: string,
  files: Record<string, string>,
  hacs: Record<string, unknown> | undefined
): ArchiveItem[] => {
  const components = join(root, "custom_components");
  const candidates: [string, ArchiveRule][] = index
    .dirsIn(components)
    .filter((name) =>
      index.filesIn(join(components, name)).includes("manifest.json")
    )
    .map((name) => [join(components, name), "integration_manifest"]);
  if (
    hacs?.content_in_root === true &&
    index.filesIn(root).includes("manifest.json")
  ) {
    candidates.push([root, "integration_manifest_in_root"]);
  }

  return candidates.map(([source, rule]) => {
    const marker = join(source, "manifest.json");
    const manifest = parseJsonObject(files[marker]);
    const problems: ArchiveProblem[] = [];
    let domain: string;
    if (!manifest) {
      problems.push("manifest_unreadable");
      domain = basename(source);
    } else {
      const declared = textOf(manifest, "domain");
      if (declared === undefined) {
        problems.push("manifest_without_domain");
        domain = basename(source);
      } else {
        domain = declared;
        if (!VALID_DOMAIN.test(declared)) {
          problems.push("invalid_domain");
        }
      }
    }
    return newItem({
      kind: "integration",
      name: textOf(manifest, "name") || domain,
      source,
      marker,
      rule,
      version: textOf(manifest, "version"),
      domain,
      problems,
    });
  });
};

const pluginItem = (
  index: Index,
  root: string,
  files: Record<string, string>,
  hacs: Record<string, unknown> | undefined,
  name: string
): ArchiveItem | undefined => {
  const directories = [root, join(root, "dist")];
  let script: string | undefined;
  let rule: ArchiveRule = "dashboard_root";

  const filename = textOf(hacs, "filename");
  if (filename && filename.endsWith(".js") && !filename.includes("/")) {
    const found = directories.find((directory) =>
      index.filesIn(directory).includes(filename)
    );
    if (found !== undefined) {
      script = join(found, filename);
      rule = "dashboard_hacs_file";
    }
  } else {
    for (const candidate of scriptNames(name)) {
      for (const directory of directories) {
        const match = index
          .filesIn(directory)
          .find((file) => file.toLowerCase() === candidate.toLowerCase());
        if (match !== undefined) {
          script = join(directory, match);
          rule = directory === root ? "dashboard_root" : "dashboard_dist";
          break;
        }
      }
      if (script) {
        break;
      }
    }
    if (script === undefined) {
      const only = index
        .filesIn(directories[1])
        .filter((file) => file.endsWith(".js"));
      if (only.length === 1) {
        script = join(directories[1], only[0]);
        rule = "dashboard_dist";
      }
    }
  }
  if (script === undefined) {
    return undefined;
  }
  const pkg = parseJsonObject(files[join(root, "package.json")]);
  return newItem({
    kind: "plugin",
    name: textOf(hacs, "name") || name,
    source: script,
    marker: script,
    rule,
    version: textOf(pkg, "version"),
    file: basename(script),
  });
};

const themeItems = (
  index: Index,
  root: string,
  files: Record<string, string>,
  hacs: Record<string, unknown> | undefined,
  name: string
): ArchiveItem[] => {
  const found: ArchiveItem[] = [];
  const themes = join(root, "themes");
  const themeFiles = index
    .filesIn(themes)
    .filter((file) => file.endsWith(".yaml"));
  if (themeFiles.length) {
    const names: string[] = [];
    let readable = false;
    for (const file of themeFiles) {
      const text = files[join(themes, file)];
      if (text !== undefined) {
        readable = true;
        names.push(...themeNames(text));
      }
    }
    const unique = Array.from(new Set(names));
    found.push(
      newItem({
        kind: "theme",
        name: textOf(hacs, "name") || name,
        source: themes,
        marker: join(themes, themeFiles[0]),
        rule: "theme_folder",
        themes: unique,
        problems: !readable || !unique.length ? ["theme_without_names"] : [],
      })
    );
  }
  const filename = textOf(hacs, "filename");
  if (
    filename &&
    filename.endsWith(".yaml") &&
    !filename.includes("/") &&
    index.filesIn(root).includes(filename) &&
    !themeFiles.length
  ) {
    const path = join(root, filename);
    found.push(
      newItem({
        kind: "theme",
        name: textOf(hacs, "name") || name,
        source: path,
        marker: path,
        rule: "theme_hacs_file",
        themes: themeNames(files[path]),
      })
    );
  }
  return found;
};

const templateItems = (
  index: Index,
  root: string,
  hacs: Record<string, unknown> | undefined
): ArchiveItem[] => {
  const filename = textOf(hacs, "filename");
  if (filename && filename.endsWith(".jinja") && !filename.includes("/")) {
    if (!index.filesIn(root).includes(filename)) {
      return [];
    }
    return [
      newItem({
        kind: "template",
        name: textOf(hacs, "name") || withoutSuffix(filename, ".jinja"),
        source: join(root, filename),
        marker: join(root, "hacs.json"),
        rule: "template_hacs_file",
        file: filename,
      }),
    ];
  }
  return index
    .filesIn(root)
    .filter((file) => file.endsWith(".jinja"))
    .map((file) =>
      newItem({
        kind: "template",
        name: withoutSuffix(file, ".jinja"),
        source: join(root, file),
        marker: join(root, file),
        rule: "template_root_file",
        file,
      })
    );
};

const blueprintItems = (
  index: Index,
  root: string,
  files: Record<string, string>
): ArchiveItem[] => {
  const found: ArchiveItem[] = [];
  for (const path of index.below(join(root, "blueprints"))) {
    if (!path.endsWith(".yaml") || files[path] === undefined) {
      continue;
    }
    const info = scanYaml(files[path]).children.blueprint;
    if (!info) {
      continue;
    }
    const domain = info.domain || undefined;
    found.push(
      newItem({
        kind: "blueprint",
        name: info.name || withoutSuffix(basename(path), ".yaml"),
        source: path,
        marker: path,
        rule: "blueprint_file",
        domain,
        problems:
          domain && BLUEPRINT_DOMAINS.includes(domain)
            ? []
            : ["blueprint_domain_unknown"],
      })
    );
  }
  return found;
};

const valuesOf = (path: string, text: string): Record<string, string> => {
  if (path.endsWith(".json")) {
    const parsed = parseJsonObject(text) ?? {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
    );
  }
  return scanYaml(text).top;
};

const appItems = (
  index: Index,
  files: Record<string, string>
): ArchiveItem[] => {
  const found: ArchiveItem[] = [];
  for (const path of appConfigs(index)) {
    if (files[path] === undefined) {
      continue;
    }
    const values = valuesOf(path, files[path]);
    if (!(values.slug && values.name && values.version)) {
      continue;
    }
    found.push(
      newItem({
        kind: "app",
        name: values.name,
        source: dirname(path),
        marker: path,
        rule: "app_config",
        version: values.version,
        domain: values.slug,
      })
    );
  }
  return found;
};

const appRepositoryItems = (
  index: Index,
  files: Record<string, string>,
  apps: ArchiveItem[]
): ArchiveItem[] => {
  const found: ArchiveItem[] = [];
  for (const path of repositoryFiles(index)) {
    if (files[path] === undefined) {
      continue;
    }
    const values = valuesOf(path, files[path]);
    if (!values.name) {
      continue;
    }
    const source = dirname(path);
    const prefix = source ? `${source}/` : "";
    found.push(
      newItem({
        kind: "app_repository",
        name: values.name,
        source,
        marker: path,
        rule: "app_repository_file",
        apps: apps
          .filter((app) => app.source.startsWith(prefix))
          .map((app) => app.domain || app.name),
      })
    );
  }
  return found;
};

const newItem = (
  values: Pick<ArchiveItem, "kind" | "name" | "source" | "marker" | "rule"> &
    Partial<ArchiveItem>
): ArchiveItem => ({
  id: `${values.kind}:${values.source}${values.file ? `:${values.file}` : ""}`,
  themes: [],
  apps: [],
  problems: [],
  ...values,
});

const gitInfo = (
  index: Index,
  files: Record<string, string>
): ArchiveGitInfo | undefined => {
  const folders = ["", ...index.dirsIn("")].filter(
    (folder) => !folder.toLowerCase().includes("__macosx")
  );
  const folder = folders.find((candidate) =>
    index.dirs.has(join(candidate, ".git"))
  );
  if (folder === undefined) {
    return undefined;
  }
  const info: ArchiveGitInfo = { folder };
  const head = files[join(join(folder, ".git"), "HEAD")]?.trim();
  if (head) {
    const ref = /^ref:\s*refs\/heads\/(.+)$/.exec(head);
    info.branch = ref ? ref[1] : head.slice(0, 7);
  }
  const config = files[join(join(folder, ".git"), "config")];
  if (config) {
    const match = /\[remote "origin"\][^[]*?\burl\s*=\s*(\S+)/.exec(config);
    if (match) {
      // Credentials in an address are never shown
      info.origin = match[1].replace(
        /^([a-z][a-z0-9+.-]*:\/\/)[^/@\s]*@/i,
        "$1"
      );
    }
  }
  return info;
};

export const detectArchive = (
  entries: readonly string[],
  files: Record<string, string>,
  archiveName = ""
): ArchiveDetection => {
  const index = new Index(entries);
  const items: ArchiveItem[] = [];
  let bestDepth: number | undefined;
  for (const root of index.roots()) {
    if (bestDepth !== undefined && depth(root) > bestDepth) {
      break;
    }
    const hacs = parseJsonObject(files[join(root, "hacs.json")]);
    const name = textOf(hacs, "name") || folderName(root, archiveName);
    const here = [
      ...integrationItems(index, root, files, hacs),
      ...templateItems(index, root, hacs),
      ...themeItems(index, root, files, hacs, name),
      ...blueprintItems(index, root, files),
    ];
    const plugin = pluginItem(index, root, files, hacs, name);
    if (plugin && !here.some((item) => item.kind === "integration")) {
      here.push(plugin);
    }
    if (here.length) {
      bestDepth = depth(root);
      items.push(...here);
    }
  }

  const apps = appItems(index, files);
  items.push(...appRepositoryItems(index, files, apps), ...apps);
  items.sort(
    (a, b) =>
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      compare(a.source, b.source)
  );
  return { items, git: gitInfo(index, files) };
};
