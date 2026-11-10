// Expands the shared pieces of an artboard source (*.src.html) into a self-contained artboard.
//   @@HEAD:Title[|dark]@@   document head, fonts, shared stylesheet, and the opening root element
//   @@RAIL:Name@@           the navigation rail with one destination selected
//   @@BAR:Name@@            the page tab bar with one tab selected
//   @@I:Name[.class]@@      one icon from the Material Design Icons set the frontend ships
//   @@SHELL:Rail|Tab|h@@    the app frame: rail, pane and tab bar (close with @@/SHELL:footer text@@)
//   @@SURF:Crumb|Title|h@@  one focused surface with a back button and title (close with @@/SURF@@)
//   @@LI:Icon|Title|Desc@@  a list row; put its control after it and close with @@/LI@@
//   @@SW:on|Label@@         a switch (on or off)
//   @@INFO:Label@@          the per-control information button
//   @@TAIL:w,h@@            closing markup and the preview size
// Usage: node inline-assets.mjs <Name> [...]     (reads Name.src.html, writes ../canvas/Name.dc.html)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.env.ARTBOARD_OUT || join(here, "..", "canvas");
const css = readFileSync(join(here, "m3.css"), "utf8").trim();
const iconFile = join(here, "icons.json");
const icons = existsSync(iconFile) ? JSON.parse(readFileSync(iconFile, "utf8")) : {};
let all = null;
if (process.env.MDI_MODULE) all = await import(process.env.MDI_MODULE);
mkdirSync(out, { recursive: true });

function path(name) {
  if (!icons[name] && all && all["mdi" + name]) icons[name] = all["mdi" + name];
  if (!icons[name]) throw new Error(`unknown icon ${name}`);
  return icons[name];
}
function icon(name, cls = "") {
  return `<svg class="ic${cls ? " " + cls : ""}" viewBox="0 0 24 24" aria-hidden="true"><path d="${path(name)}"></path></svg>`;
}

const destinations = [
  ["Home", "ViewDashboard"], ["Energy", "LightningBolt"], ["Map", "Map"],
  ["Activity", "FormatListBulleted"], ["Media", "PlayBoxMultiple"], ["Tools", "Toolbox"],
];
function rail(selected) {
  const items = destinations.map(([label, ic]) =>
    `<a class="ri${label === selected ? " sel" : ""}" href="#${label.toLowerCase()}"><span class="pill">${icon(ic)}</span><span class="lm">${label}</span></a>`
  ).join("\n");
  return `<nav class="rail" aria-label="Main">
<button class="ib" aria-label="Expand navigation">${icon("Menu")}</button>
<button class="ib f" aria-label="Ask Assist" style="margin: 4px 0 12px; border-radius: 16px; width: 56px; height: 56px">${icon("Microphone")}</button>
${items}
<span class="grow"></span>
<a class="ri${selected === "Alerts" ? " sel" : ""}" href="#alerts"><span class="pill">${icon("Bell")}<span class="badge">3</span></span><span class="lm">Alerts</span></a>
<a class="ri${selected === "Settings" ? " sel" : ""}" href="#settings"><span class="pill">${icon("Cog")}</span><span class="lm">Settings</span></a>
</nav>`;
}
function bar(selected) {
  const names = ["Home", "Energy", "Map", "Activity", "Media", "Tools", "Settings"];
  // A page opened from the New tab catalog gets its own tab, before Settings.
  if (selected && !names.includes(selected)) names.splice(6, 0, selected);
  const tabs = names.map((label) => label === selected
    ? `<button class="pt sel" role="tab" aria-selected="true">${label}${icon("Close", "s")}</button>`
    : `<button class="pt" role="tab" aria-selected="false">${label}</button>`
  ).join("\n");
  return `<header class="bar">
<div class="row" role="tablist" aria-label="Open pages" style="gap: 4px; flex-wrap: wrap">
${tabs}
<button class="ib" aria-label="New tab" style="width: 40px; height: 40px">${icon("Plus")}</button>
</div>
<span class="grow"></span>
<button class="find" style="width: 280px"><span class="row grow" style="gap: 12px">${icon("Magnify")}<span class="bl">Search</span></span><span class="kbd">Ctrl Shift F</span></button>
<button class="ib" aria-label="Accessibility tools">${icon("HumanHandsup")}</button>
<button class="av" aria-label="Account, Sam">S</button>
</header>`;
}
function head(arg) {
  const [title, mode] = arg.split("|");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto+Flex:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500&display=swap">
<style>
${css}
</style>
</helmet>
<div class="m3${mode === "dark" ? " dark" : ""}">`;
}
function tail(arg) {
  const [w, h] = arg.split(",").map((n) => parseInt(n, 10));
  return `</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":${w},"height":${h}}}'>
class Component extends DCLogic {
renderVals() {
return {};
}
}
</script>
</body>
</html>`;
}

function shell(arg) {
  const [r, t, h] = arg.split("|");
  return `<div class="app" style="min-height: ${h || 900}px">\n${rail(r)}\n<main class="pane">\n${bar(t)}`;
}
function surf(arg) {
  const [crumb, title, h] = arg.split("|");
  return `<div class="stage" style="min-height: ${h || 820}px"><main class="pane">
<header class="bar" style="padding-left: 16px; gap: 12px; flex-wrap: nowrap">
<button class="ib" aria-label="Back">${icon("ArrowLeft")}</button>
<div class="col grow"><span class="bs mu">${crumb}</span><h1 class="tl">${title}</h1></div>
<button class="ib" aria-label="About this page">${icon("HelpCircleOutline")}</button>
<button class="ib" aria-label="More options">${icon("DotsVertical")}</button>
</header>`;
}
function li(arg) {
  const [ic, title, desc] = arg.split("|");
  return `<div class="li"><span class="lead">${icon(ic)}</span><span class="col grow"><span class="ll">${title}</span>${desc ? `<span class="bs mu">${desc}</span>` : ""}</span>`;
}
function sw(arg) {
  const [state, label] = arg.split("|");
  const on = state === "on";
  return `<button class="sw${on ? " on" : ""}" role="switch" aria-checked="${on}" aria-label="${label}"><i></i></button>`;
}

for (const name of process.argv.slice(2)) {
  let src = readFileSync(join(here, `${name}.src.html`), "utf8");
  src = src
    .replace(/@@HEAD:([^@]*)@@/g, (_, a) => head(a))
    .replace(/@@RAIL:([^@]*)@@/g, (_, a) => rail(a))
    .replace(/@@BAR:([^@]*)@@/g, (_, a) => bar(a))
    .replace(/@@TAIL:([^@]*)@@/g, (_, a) => tail(a))
    .replace(/@@SHELL:([^@]*)@@/g, (_, a) => shell(a))
    .replace(/@@\/SHELL:([^@]*)@@/g, (_, a) => `<div class="foot">${a}</div>\n</main>\n</div>`)
    .replace(/@@SURF:([^@]*)@@/g, (_, a) => surf(a))
    .replace(/@@\/SURF@@/g, "</main></div>")
    .replace(/@@LI:([^@]*)@@/g, (_, a) => li(a))
    .replace(/@@\/LI@@/g, "</div>")
    .replace(/@@SW:([^@]*)@@/g, (_, a) => sw(a))
    .replace(/@@INFO:([^@]*)@@/g, (_, a) => `<button class="ib" style="width: 32px; height: 32px" aria-label="About ${a}">${icon("InformationOutline", "s")}</button>`)
    .replace(/@@I:([A-Za-z0-9]+)(?:\.([a-z ]+))?@@/g, (_, n, c) => icon(n, c));
  if (src.includes("@@")) throw new Error(`${name}: unresolved placeholder near "${src.slice(src.indexOf("@@"), src.indexOf("@@") + 40)}"`);
  if (/\{\{|\}\}/.test(src.replace(/<script[\s\S]*<\/script>/g, ""))) throw new Error(`${name}: stray template braces in markup`);
  writeFileSync(join(out, `${name}.dc.html`), src);
  console.log(`${name}: ${src.length} bytes`);
}
writeFileSync(iconFile, JSON.stringify(Object.fromEntries(Object.entries(icons).sort()), null, 0) + "\n");
