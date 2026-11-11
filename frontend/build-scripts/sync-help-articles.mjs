/**
 * Refreshes the offline help articles. Run by the maintainer, never by the
 * build, and the product never fetches these files at run time:
 *
 *   node build-scripts/sync-help-articles.mjs            # articles used by the interface
 *   node build-scripts/sync-help-articles.mjs --path /integrations/matter
 *   node build-scripts/sync-help-articles.mjs --update   # move the pinned commit to the newest one
 *   node build-scripts/sync-help-articles.mjs --dry      # list what would be fetched
 *
 * Source: the public repository home-assistant/home-assistant.io (Creative
 * Commons Attribution-NonCommercial-ShareAlike 4.0). Files are fetched one
 * by one from raw.githubusercontent.com at the pinned commit; the
 * repository is never cloned. The commit is kept in
 * `build-scripts/help-articles-pin.json`. The only other request is the one
 * that resolves the newest commit when there is no pin yet or `--update`
 * is given.
 *
 * Output (committed by the maintainer): `public/static/help/index.json`,
 * `public/static/help/articles/<slug>.json` and
 * `public/static/help/LICENSE-NOTICE.md`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  articleSlug,
  convertArticle,
  extractDocumentationPaths,
  normalizePath,
  sourceCandidates,
} from "./help-articles-convert.mjs";

const REPO = "home-assistant/home-assistant.io";
const BRANCH = "current";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pinFile = path.join(root, "build-scripts", "help-articles-pin.json");
const outDir = path.join(root, "public", "static", "help");
const articlesDir = path.join(outDir, "articles");

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const update = args.includes("--update");
const extra = [];
args.forEach((arg, i) => {
  if (arg === "--path" && args[i + 1]) {
    extra.push(normalizePath(args[i + 1]));
  }
});

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
};

const collectPaths = () => {
  const found = new Set(extra);
  for (const file of walk(path.join(root, "src"))) {
    for (const p of extractDocumentationPaths(fs.readFileSync(file, "utf8"))) {
      found.add(p);
    }
  }
  const existing = path.join(outDir, "index.json");
  if (fs.existsSync(existing)) {
    for (const a of JSON.parse(fs.readFileSync(existing, "utf8")).articles) {
      found.add(a.path);
    }
  }
  return [...found].sort();
};

const resolveCommit = async () => {
  let pin = {};
  if (fs.existsSync(pinFile)) {
    pin = JSON.parse(fs.readFileSync(pinFile, "utf8"));
  }
  if (pin.commit && !update) {
    return pin.commit;
  }
  const response = await fetch(
    `https://api.github.com/repos/${REPO}/commits/${BRANCH}`,
    { headers: { Accept: "application/vnd.github.sha" } }
  );
  if (!response.ok) {
    throw new Error(`Could not resolve the newest commit: ${response.status}`);
  }
  const commit = (await response.text()).trim();
  fs.writeFileSync(
    pinFile,
    `${JSON.stringify({ repo: REPO, commit }, null, 2)}\n`
  );
  return commit;
};

const fetchSource = async (commit, articlePath) => {
  for (const candidate of sourceCandidates(articlePath)) {
    const response = await fetch(
      `https://raw.githubusercontent.com/${REPO}/${commit}/${candidate}`
    );
    if (response.ok) {
      return { source: candidate, text: await response.text() };
    }
    if (response.status !== 404) {
      throw new Error(`${candidate}: HTTP ${response.status}`);
    }
  }
  return undefined;
};

const NOTICE = (commit, date) => `# Offline help articles: licence and source

The articles in this folder are copies of pages from the Home Assistant
documentation, published at https://www.home-assistant.io and maintained in
https://github.com/${REPO}.

- Licence: Creative Commons Attribution-NonCommercial-ShareAlike 4.0
  International (https://creativecommons.org/licenses/by-nc-sa/4.0/).
  This interface is free of charge. Reuse of the text carries the same
  licence, so every article in this folder is available under it.
- Attribution: text by the Home Assistant documentation authors and
  contributors, Open Home Foundation.
- Changes: the pages were converted from Jekyll Markdown to plain Markdown.
  Front matter was turned into metadata, Liquid tags were removed or reduced
  to plain text, raw HTML was removed, and images were not included. The
  wording of the text itself is unchanged.
- Source: each article records its source file, the commit it was taken
  from and the date it was fetched. This folder was last synchronized from
  commit ${commit} on ${date}.
- Refresh: \`node build-scripts/sync-help-articles.mjs\`, run by the
  maintainer. The interface never fetches these files at run time.
`;

const main = async () => {
  const paths = collectPaths();
  if (dry) {
    process.stdout.write(`${paths.join("\n")}\n(${paths.length} paths)\n`);
    return;
  }
  const commit = await resolveCommit();
  const date = new Date().toISOString().slice(0, 10);
  fs.mkdirSync(articlesDir, { recursive: true });
  const index = [];
  const missing = [];
  let bytes = 0;
  for (const articlePath of paths) {
    const fetched = await fetchSource(commit, articlePath);
    if (!fetched) {
      missing.push(articlePath);
      continue;
    }
    const converted = convertArticle(fetched.text);
    const title = converted.title || articlePath;
    const data = {
      path: articlePath,
      title,
      source: fetched.source,
      commit,
      fetched: date,
      body: converted.body,
    };
    const json = `${JSON.stringify(data)}\n`;
    bytes += Buffer.byteLength(json);
    fs.writeFileSync(
      path.join(articlesDir, `${articleSlug(articlePath)}.json`),
      json
    );
    index.push({ path: articlePath, title, source: fetched.source });
  }
  fs.writeFileSync(
    path.join(outDir, "index.json"),
    `${JSON.stringify({ repo: REPO, commit, fetched: date, articles: index }, null, 1)}\n`
  );
  fs.writeFileSync(
    path.join(outDir, "LICENSE-NOTICE.md"),
    NOTICE(commit, date)
  );
  process.stdout.write(
    `Fetched ${index.length} articles (${bytes} bytes) at ${commit}.\n` +
      (missing.length ? `Not found in the source: ${missing.join(", ")}\n` : "")
  );
};

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exitCode = 1;
});
