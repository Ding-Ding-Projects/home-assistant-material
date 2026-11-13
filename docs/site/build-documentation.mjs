import { createRequire } from "node:module";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const site = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(site, "../..");
const requireFrontend = createRequire(path.join(root, "frontend/package.json"));
const { Marked } = requireFrontend("marked");
const { JSDOM } = requireFrontend("jsdom");

const sourceRoot = path.join(root, "docs");
const outputRoot = path.resolve(process.argv[2] || path.join(site, "guides"));
const sourceUrl = "https://github.com/Ding-Ding-Projects/home-assistant-material/blob/main/";
const virtualOrigin = "https://documentation.invalid/";
const bundledImages = new Set([
  "screenshots/automation-speech-dictionary-demo.png",
  "screenshots/published-repairs-editor.png",
]);

async function markdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(path.join(sourceRoot, directory), { withFileTypes: true })) {
    const relative = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(relative));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(relative);
  }
  return files.sort();
}

function escape(text) {
  return text.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function route(relative) {
  return relative.endsWith("/README.md")
    ? relative.replace(/README\.md$/, "index.html")
    : relative.replace(/\.md$/, ".html");
}

function relativeLink(from, to) {
  return path.posix.relative(path.posix.dirname(from), to) || path.posix.basename(to);
}

function slug(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").trim().replace(/\s/g, "-") || "section";
}

function sourceDestination(article, href, known) {
  if (href.startsWith("#")) return href;
  const url = new URL(href, new URL(article, virtualOrigin));
  if (!["http:", "https:", "mailto:"].includes(url.protocol)) return null;
  if (url.origin + "/" !== virtualOrigin) return url.href;
  const local = decodeURI(url.pathname.slice(1));
  if (known.has(local)) return relativeLink(route(article), route(local)) + url.hash;
  if (bundledImages.has(local)) return relativeLink(route(article), local) + url.hash;
  if (!href.startsWith("/")) return sourceUrl + "docs/" + local + url.hash;
  return sourceUrl + local + url.hash;
}

function renderBody(markdown, article, known) {
  const parser = new Marked({ renderer: { html: ({ text }) => escape(text) } });
  const document = JSDOM.fragment(parser.parse(markdown));
  const headings = new Set();
  for (const heading of document.querySelectorAll("h1,h2,h3,h4,h5,h6")) {
    const base = slug(heading.textContent);
    let id = base;
    for (let number = 1; headings.has(id); number++) id = `${base}-${number}`;
    heading.id = id;
    headings.add(id);
  }
  for (const link of document.querySelectorAll("a[href]")) {
    const href = sourceDestination(article, link.getAttribute("href"), known);
    if (href) link.setAttribute("href", href);
    else link.removeAttribute("href");
  }
  for (const image of document.querySelectorAll("img[src]")) {
    const src = image.getAttribute("src");
    const url = new URL(src, new URL(article, virtualOrigin));
    if (url.origin + "/" === virtualOrigin && bundledImages.has(url.pathname.slice(1))) {
      image.setAttribute("src", relativeLink(route(article), url.pathname.slice(1)));
      image.setAttribute("loading", "lazy");
    } else {
      image.replaceWith(image.ownerDocument.createTextNode(image.alt));
    }
  }
  const holder = document.ownerDocument.createElement("div");
  holder.append(document);
  return holder.innerHTML;
}

function layout(title, navigation, body, assets) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(title)} | Home Assistant Material</title>
  <link rel="stylesheet" href="${assets}m3.css">
  <link rel="stylesheet" href="${assets}app.css">
  <link rel="stylesheet" href="${assets}guides.css">
</head>
<body class="m3">
  <a class="skip" href="#article">Skip to content</a>
  <main class="guide">
    <nav aria-label="Documentation">${navigation}</nav>
    <article id="article">${body}</article>
  </main>
</body>
</html>
`;
}

const articles = [
  ...await markdownFiles("features"),
  ...await markdownFiles("wiki"),
  "automation-repositories.md", "feature-status.md", "material-changes.md",
];
const known = new Set(articles);
for (const image of bundledImages) {
  const destination = path.join(outputRoot, image);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(path.join(sourceRoot, image), destination);
}
for (const relative of articles) {
  const markdown = await readFile(path.join(sourceRoot, relative), "utf8");
  const page = route(relative);
  const title = /^# (.+)/m.exec(markdown)?.[1] || path.posix.basename(relative, ".md");
  const assets = "../".repeat(page.split("/").length);
  const index = relative.startsWith("wiki/") ? "wiki/index.html" : "features/index.html";
  const navigation = [
    `<a href="${assets}">Project home</a>`,
    `<a href="${relativeLink(page, "features/index.html")}">Guides</a>`,
    `<a href="${relativeLink(page, "wiki/index.html")}">Wiki</a>`,
    `<a href="${assets}demo/">Interactive demo</a>`,
  ].join("");
  const seeAlso = `<p class="guide-source"><a href="${relativeLink(page, index)}">Browse related guides</a> · <a href="${sourceUrl}docs/${relative}">View source</a></p>`;
  const destination = path.join(outputRoot, page);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, layout(title, navigation, renderBody(markdown, relative, known) + seeAlso, assets));
}

console.log(`Built ${articles.length} documentation pages.`);
