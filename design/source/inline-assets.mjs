// Inlines the shared stylesheet and the product's own icon paths into an artboard source.
// Usage: node inline-assets.mjs <Name.dc.html> [...]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "canvas");
const css = readFileSync(join(here, "m3.css"), "utf8").trim();
const icons = JSON.parse(readFileSync(join(here, "icons.json"), "utf8"));
mkdirSync(out, { recursive: true });

for (const name of process.argv.slice(2)) {
  let src = readFileSync(join(here, name), "utf8");
  src = src.replace("/*@@M3CSS@@*/", css);
  src = src.replace(/\/\*@@ICONS:([^@]*)@@\*\//g, (_, list) =>
    list.split(",").map((k) => {
      const key = k.trim();
      if (!icons[key]) throw new Error(`${name}: unknown icon ${key}`);
      return `${key}:${JSON.stringify(icons[key])}`;
    }).join(",")
  );
  if (src.includes("@@")) throw new Error(`${name}: unresolved placeholder`);
  writeFileSync(join(out, name), src);
  console.log(`${name}: ${src.length} bytes`);
}
