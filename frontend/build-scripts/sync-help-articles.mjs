/**
 * Refreshes the offline help articles. Run by the maintainer, never by the
 * build, and the product never fetches these files at run time:
 *
 *   node build-scripts/sync-help-articles.mjs               # everything the interface needs
 *   node build-scripts/sync-help-articles.mjs --path /integrations/matter
 *   node build-scripts/sync-help-articles.mjs --update      # move the pinned commit to the newest one
 *   node build-scripts/sync-help-articles.mjs --dry         # list what would be fetched
 *   node build-scripts/sync-help-articles.mjs --no-integrations   # skip the per-integration pages
 *   node build-scripts/sync-help-articles.mjs --no-images         # skip the images
 *
 * Source: the public repository home-assistant/home-assistant.io (Creative
 * Commons Attribution-NonCommercial-ShareAlike 4.0). Files are fetched one
 * by one from raw.githubusercontent.com at the pinned commit; the
 * repository is never cloned. The commit is kept in
 * `build-scripts/help-articles-pin.json`. The only other requests are one
 * call to the git tree API for that commit (the file list, used to find
 * source files and image sizes without guessing) and, when there is no pin
 * yet or `--update` is given, the one that resolves the newest commit.
 *
 * The run is resumable: pages already stored for the pinned commit are
 * skipped, requests are paced, and when the source refuses or rate-limits
 * the run stops cleanly, keeps what it has and reports the count.
 *
 * Output (committed by the maintainer), under `public/static/help/`:
 * `index.json` (articles and redirects), `articles/<slug>.json`,
 * `integrations/index.json` and `integrations/<domain>.json` (one page per
 * integration of this build, loaded only when opened), `images/` (images
 * from the documentation repository, PNG/JPEG/WebP only, each under 300 KB,
 * 20 MB in total) and `LICENSE-NOTICE.md`.
 */
/* eslint-disable no-await-in-loop, no-promise-executor-return */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  articleSlug,
  checkConverted,
  convertArticle,
  convertLiquid,
  extractDocumentationPaths,
  followRedirects,
  hasRasterMagic,
  imageFileName,
  imageSources,
  integrationDomain,
  normalizePath,
  parseRedirects,
  repositoryImagePath,
  sourceCandidates,
  splitFrontMatter,
} from "./help-articles-convert.mjs";

const REPO = "home-assistant/home-assistant.io";
const BRANCH = "current";
const FORMAT = 4;
const MAX_IMAGE_BYTES = 300 * 1024;
const MAX_IMAGE_TOTAL = 20 * 1024 * 1024;
const ARTICLE_IMAGE_CAP = 1536 * 1024;
const INTEGRATION_IMAGE_CAP = 250 * 1024;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pinFile = path.join(root, "build-scripts", "help-articles-pin.json");
const outDir = path.join(root, "public", "static", "help");
const articlesDir = path.join(outDir, "articles");
const integrationsDir = path.join(outDir, "integrations");
const imagesDir = path.join(outDir, "images");
const componentsDir = path.resolve(
  root,
  "..",
  "core",
  "homeassistant",
  "components"
);

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const update = args.includes("--update");
const withIntegrations = !args.includes("--no-integrations");
const withImages = !args.includes("--no-images");
const extra = [];
args.forEach((arg, i) => {
  if (arg === "--path" && args[i + 1]) {
    extra.push(normalizePath(args[i + 1]));
  }
});

/**
 * Paths with no article of their own: the nearest real article takes their
 * place, never the website. `/integrations` is the directory the reader
 * builds from the integration pages, so it is left alone.
 */
const NEAREST = {
  "/get-blueprints": "/docs/automation/using_blueprints",
  "/connect/zwa-2": "/integrations/zwave_js",
  "/installation": "/getting-started/onboarding",
  "/docs/configuration/templating/template-functions": "/docs/templating",
};
const DIRECTORY_PATHS = new Set(["/integrations"]);

class StopError extends Error {}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let requests = 0;
const get = async (url, init) => {
  requests++;
  if (requests % 100 === 0) {
    await sleep(1500);
  } else {
    await sleep(25);
  }
  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try {
      response = await fetch(url, init);
    } catch (err) {
      last = String(err.message || err);
      await sleep(1000 * (attempt + 1));
      continue;
    }
    if (response.status === 404) {
      return undefined;
    }
    if (response.ok) {
      return response;
    }
    last = `HTTP ${response.status}`;
    if (response.status === 403 || response.status === 429) {
      throw new StopError(`${url}: ${last} (refused or rate limited)`);
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new StopError(`${url}: ${last}`);
};

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_err) {
    return undefined;
  }
};

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

const documentationPathOf = (url) => {
  const match =
    /^https:\/\/(?:www|rc|next)\.home-assistant\.io(\/[^\s#?]*)/.exec(
      url || ""
    );
  return match ? normalizePath(match[1]) : undefined;
};

const collectPaths = (existingIndex) => {
  const found = new Set(extra);
  for (const file of [
    ...walk(path.join(root, "src")),
    ...walk(path.join(root, "landing-page", "src")),
  ]) {
    for (const p of extractDocumentationPaths(fs.readFileSync(file, "utf8"))) {
      found.add(p);
    }
  }
  for (const a of existingIndex?.articles ?? []) {
    found.add(a.path);
  }
  for (const from of Object.keys(existingIndex?.redirects ?? {})) {
    found.add(from);
  }
  const domains = new Set();
  if (withIntegrations && fs.existsSync(componentsDir)) {
    for (const entry of fs.readdirSync(componentsDir)) {
      const manifest = readJson(
        path.join(componentsDir, entry, "manifest.json")
      );
      const docPath = documentationPathOf(manifest?.documentation);
      if (docPath) {
        found.add(docPath);
        domains.add(entry);
      }
    }
  }
  for (const file of fs.existsSync(integrationsDir)
    ? fs.readdirSync(integrationsDir)
    : []) {
    if (file.endsWith(".json") && file !== "index.json") {
      found.add(`/integrations/${file.slice(0, -5)}`);
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
  const response = await get(
    `https://api.github.com/repos/${REPO}/commits/${BRANCH}`,
    { headers: { Accept: "application/vnd.github.sha" } }
  );
  const commit = (await response.text()).trim();
  fs.writeFileSync(
    pinFile,
    `${JSON.stringify({ repo: REPO, commit }, null, 2)}\n`
  );
  return commit;
};

const fetchTree = async (commit) => {
  const response = await get(
    `https://api.github.com/repos/${REPO}/git/trees/${commit}?recursive=1`
  );
  const data = await response.json();
  if (data.truncated) {
    throw new StopError("The file list of the source repository is truncated.");
  }
  const sizes = new Map();
  for (const entry of data.tree) {
    if (entry.type === "blob") {
      sizes.set(entry.path, entry.size);
    }
  }
  return sizes;
};

const fetchText = async (commit, file) => {
  const response = await get(
    `https://raw.githubusercontent.com/${REPO}/${commit}/${file}`
  );
  return response ? response.text() : undefined;
};

const NOTICE = (
  commit,
  date,
  stats
) => `# Offline help articles: licence and source

The articles in this folder are copies of pages from the Home Assistant
documentation, published at https://www.home-assistant.io and maintained in
https://github.com/${REPO}.

- Licence: Creative Commons Attribution-NonCommercial-ShareAlike 4.0
  International (https://creativecommons.org/licenses/by-nc-sa/4.0/).
  This interface is free of charge. Reuse of the text and images carries the
  same licence, so every file in this folder is available under it.
- Attribution: text and images by the Home Assistant documentation authors
  and contributors, Open Home Foundation.
- Changes: the pages were converted from Jekyll Markdown to plain Markdown.
  Front matter was turned into metadata, Liquid tags were removed or reduced
  to plain text (an icon is replaced by its name), and raw HTML was removed.
  Links to pages that are not bundled became plain text, and so did every
  link to another site. The wording of the text itself is unchanged. Images that live in the documentation repository were copied
  unchanged when they are PNG, JPEG or WebP, smaller than 300 KB and within
  the 20 MB total; every other image is marked "image not included" in the
  article. SVG images are never included.
- Source: each page records its source file, the commit it was taken from
  and the date it was fetched. This folder was last synchronized from
  commit ${commit} on ${date}.
- Contents at that time: ${stats}.
- Refresh: \`node build-scripts/sync-help-articles.mjs\`, run by the
  maintainer. The interface never fetches these files at run time.
`;

const main = async () => {
  const indexFile = path.join(outDir, "index.json");
  const existingIndex = fs.existsSync(indexFile)
    ? readJson(indexFile)
    : undefined;
  const requested = collectPaths(existingIndex);
  if (dry) {
    process.stdout.write(
      `${requested.join("\n")}\n(${requested.length} paths)\n`
    );
    return;
  }
  const commit = await resolveCommit();
  const date = new Date().toISOString().slice(0, 10);
  fs.mkdirSync(articlesDir, { recursive: true });
  fs.mkdirSync(integrationsDir, { recursive: true });
  fs.mkdirSync(imagesDir, { recursive: true });

  const tree = await fetchTree(commit);
  const redirectsText = await fetchText(commit, "source/_redirects");
  const redirects = parseRedirects(redirectsText ?? "");

  // Resolve every requested path to a real source file.
  const resolve = (original) => {
    let current = original;
    const seen = new Set();
    for (let hop = 0; hop < 8; hop++) {
      const base = normalizePath(current);
      if (seen.has(base) || DIRECTORY_PATHS.has(base)) {
        return undefined;
      }
      seen.add(base);
      const source = sourceCandidates(base).find((c) => tree.has(c));
      if (source) {
        return { path: base, source, hash: current.split("#")[1] ?? "" };
      }
      const next = followRedirects(current, redirects);
      if (next !== current) {
        current = next;
        continue;
      }
      if (NEAREST[base]) {
        current = NEAREST[base];
        continue;
      }
      return undefined;
    }
    return undefined;
  };

  const articles = new Map(); // final path -> source
  const integrations = new Map(); // domain -> source
  const aliases = {};
  const unresolved = [];
  for (const original of requested) {
    const target = resolve(original);
    if (!target) {
      if (!DIRECTORY_PATHS.has(original)) {
        unresolved.push(original);
      }
      continue;
    }
    const domain = integrationDomain(target.path);
    if (domain) {
      integrations.set(domain, target.source);
    } else {
      articles.set(target.path, target.source);
    }
    if (target.path !== original) {
      aliases[original] = target.path + (target.hash ? `#${target.hash}` : "");
    }
  }

  // Images: decided and downloaded before a page is converted, so a page
  // never references an image that was not stored.
  let imageBytes = 0;
  for (const file of fs.readdirSync(imagesDir)) {
    imageBytes += fs.statSync(path.join(imagesDir, file)).size;
  }
  const keptImages = new Map(); // source address -> local address
  let imagesAdded = 0;
  let imagesSkipped = 0;
  const prepareImages = async (source, pageCap) => {
    if (!withImages) {
      return;
    }
    let pageBytes = 0;
    const wanted = imageSources(convertLiquid(splitFrontMatter(source).body))
      .map((src) => ({ src, repo: repositoryImagePath(src) }))
      .filter((x) => x.repo && tree.has(x.repo))
      .sort((a, b) => tree.get(a.repo) - tree.get(b.repo));
    for (const { src, repo } of wanted) {
      if (keptImages.has(src)) {
        continue;
      }
      const name = imageFileName(repo);
      const file = path.join(imagesDir, name);
      const size = tree.get(repo);
      if (size > MAX_IMAGE_BYTES) {
        imagesSkipped++;
        continue;
      }
      if (fs.existsSync(file)) {
        keptImages.set(src, `/static/help/images/${name}`);
        continue;
      }
      if (imageBytes + size > MAX_IMAGE_TOTAL || pageBytes + size > pageCap) {
        imagesSkipped++;
        continue;
      }
      const response = await get(
        `https://raw.githubusercontent.com/${REPO}/${commit}/${repo}`
      );
      if (!response) {
        continue;
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!hasRasterMagic(bytes) || bytes.length > MAX_IMAGE_BYTES) {
        imagesSkipped++;
        continue;
      }
      fs.writeFileSync(file, bytes);
      imageBytes += bytes.length;
      pageBytes += bytes.length;
      imagesAdded++;
      keptImages.set(src, `/static/help/images/${name}`);
    }
  };

  const store = async (finalPath, source, file, pageCap) => {
    const existing = readJson(file);
    if (existing?.commit === commit && existing?.format === FORMAT) {
      return { skipped: true, data: existing };
    }
    const text = await fetchText(commit, source);
    if (text === undefined) {
      return undefined;
    }
    await prepareImages(text, pageCap);
    const converted = convertArticle(text, (src) => keptImages.get(src));
    const problems = checkConverted(converted.body);
    if (problems.length) {
      throw new Error(
        `${source}: the converted page still contains ${problems.slice(0, 3).join("; ")}`
      );
    }
    const data = {
      format: FORMAT,
      path: finalPath,
      title: converted.title || finalPath,
      description: converted.description || undefined,
      source,
      commit,
      fetched: date,
      body: converted.body,
    };
    fs.writeFileSync(file, `${JSON.stringify(data)}\n`);
    return { skipped: false, data };
  };

  let stopped;
  const missing = [];
  let articleBytes = 0;
  const indexArticles = [];
  try {
    for (const [articlePath, source] of articles) {
      const stored = await store(
        articlePath,
        source,
        path.join(articlesDir, `${articleSlug(articlePath)}.json`),
        ARTICLE_IMAGE_CAP
      );
      if (!stored) {
        missing.push(articlePath);
        continue;
      }
      indexArticles.push({
        path: articlePath,
        title: stored.data.title,
        source: stored.data.source,
      });
    }
    let done = 0;
    for (const [domain, source] of [...integrations].sort()) {
      const stored = await store(
        `/integrations/${domain}`,
        source,
        path.join(integrationsDir, `${domain}.json`),
        INTEGRATION_IMAGE_CAP
      );
      if (!stored) {
        missing.push(`/integrations/${domain}`);
      } else if (!stored.skipped && ++done % 100 === 0) {
        process.stdout.write(`  ${done} integration pages fetched…\n`);
      }
    }
  } catch (err) {
    if (!(err instanceof StopError)) {
      throw err;
    }
    stopped = err.message;
  }

  // Remove files of pages that moved (for example integration pages stored
  // as articles by the first sync).
  const keepSlugs = new Set(
    indexArticles.map((a) => `${articleSlug(a.path)}.json`)
  );
  if (!stopped) {
    for (const file of fs.readdirSync(articlesDir)) {
      if (!keepSlugs.has(file)) {
        fs.rmSync(path.join(articlesDir, file));
      }
    }
  }
  const have = new Set(indexArticles.map((a) => a.path));
  if (stopped) {
    for (const file of fs.readdirSync(articlesDir)) {
      const data = readJson(path.join(articlesDir, file));
      if (data && !have.has(data.path)) {
        indexArticles.push({
          path: data.path,
          title: data.title,
          source: data.source,
        });
        have.add(data.path);
      }
    }
  }
  indexArticles.sort((a, b) => a.path.localeCompare(b.path));
  for (const a of indexArticles) {
    articleBytes += fs.statSync(
      path.join(articlesDir, `${articleSlug(a.path)}.json`)
    ).size;
  }

  // Integration directory.
  const integrationEntries = [];
  let integrationBytes = 0;
  for (const file of fs.readdirSync(integrationsDir).sort()) {
    if (!file.endsWith(".json") || file === "index.json") {
      continue;
    }
    const full = path.join(integrationsDir, file);
    const data = readJson(full);
    if (data) {
      integrationBytes += fs.statSync(full).size;
      integrationEntries.push({ domain: file.slice(0, -5), title: data.title });
    }
  }
  fs.writeFileSync(
    path.join(integrationsDir, "index.json"),
    `${JSON.stringify({ commit, fetched: date, integrations: integrationEntries })}\n`
  );

  // Redirects: the ones this build asked for, plus every redirect of the
  // source whose end point is bundled, so links inside articles resolve.
  const bundled = new Set([
    ...indexArticles.map((a) => a.path),
    ...integrationEntries.map((i) => `/integrations/${i.domain}`),
  ]);
  const redirectMap = {};
  for (const [from, to] of Object.entries(aliases)) {
    if (bundled.has(normalizePath(to))) {
      redirectMap[from] = to;
    }
  }
  for (const from of redirects.exact.keys()) {
    const end = followRedirects(from, redirects);
    if (end !== from && bundled.has(normalizePath(end)) && !bundled.has(from)) {
      redirectMap[from] = end;
    }
  }
  fs.writeFileSync(
    indexFile,
    `${JSON.stringify(
      {
        repo: REPO,
        commit,
        fetched: date,
        articles: indexArticles,
        redirects: Object.fromEntries(Object.entries(redirectMap).sort()),
      },
      null,
      1
    )}\n`
  );
  // Drop images that no stored page references any more.
  if (!stopped) {
    const referenced = new Set();
    for (const dir of [articlesDir, integrationsDir]) {
      for (const file of fs.readdirSync(dir)) {
        const text = fs.readFileSync(path.join(dir, file), "utf8");
        for (const m of text.matchAll(
          /\/static\/help\/images\/([A-Za-z0-9._-]+)/g
        )) {
          referenced.add(m[1]);
        }
      }
    }
    imageBytes = 0;
    for (const file of fs.readdirSync(imagesDir)) {
      const full = path.join(imagesDir, file);
      if (referenced.has(file)) {
        imageBytes += fs.statSync(full).size;
      } else {
        fs.rmSync(full);
      }
    }
  }
  const stats = `${indexArticles.length} articles, ${integrationEntries.length} integration pages, ${fs.readdirSync(imagesDir).length} images`;
  fs.writeFileSync(
    path.join(outDir, "LICENSE-NOTICE.md"),
    NOTICE(commit, date, stats)
  );
  const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;
  process.stdout.write(
    `Articles: ${indexArticles.length} (${mb(articleBytes)}). Integration pages: ${integrationEntries.length} (${mb(integrationBytes)}). Images: ${fs.readdirSync(imagesDir).length} (${mb(imageBytes)}; ${imagesAdded} added, ${imagesSkipped} skipped by size or budget). Commit ${commit}.\n` +
      (unresolved.length
        ? `No source and no redirect: ${unresolved.join(", ")}\n`
        : "") +
      (missing.length
        ? `Not found in the source: ${missing.join(", ")}\n`
        : "") +
      (stopped
        ? `Stopped early, progress kept; run again to resume: ${stopped}\n`
        : "")
  );
};

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exitCode = 1;
});
