// Writes src/data/changelog.json from ../CHANGELOG.md, so the interface can
// show what changed without a connection. Run it after editing the
// changelog: `node build-scripts/sync-changelog.mjs` in `frontend/`.
//
// Each entry gets the commit that first added its text, found with
// `git log -S`. Without git, or for an entry not yet committed, the entry
// keeps the commit it had in the file, or has none.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.resolve(root, "..", "CHANGELOG.md");
const target = path.resolve(root, "src/data/changelog.json");

const DAY = /^## (\d{4}-\d{2}-\d{2})\s*$/;

const parse = (markdown) => {
  const days = [];
  let day;
  let item;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = DAY.exec(line);
    if (heading) {
      day = { date: heading[1], items: [] };
      days.push(day);
      item = undefined;
    } else if (line.startsWith("## ")) {
      day = undefined;
      item = undefined;
    } else if (day && line.startsWith("- ")) {
      item = { text: line.slice(2).trim() };
      day.items.push(item);
    } else if (day && item && /^\s+\S/.test(line)) {
      item.text += ` ${line.trim()}`;
    } else if (!line.trim()) {
      item = undefined;
    }
  }
  return days.filter((entry) => entry.items.length);
};

const firstLine = (markdown, text) =>
  markdown
    .split(/\r?\n/)
    .find(
      (line) => line.startsWith("- ") && text.startsWith(line.slice(2).trim())
    );

const commitOf = (line) => {
  try {
    const out = execFileSync(
      "git",
      ["log", "--format=%H", "--reverse", "-S", line, "--", "CHANGELOG.md"],
      {
        cwd: path.dirname(source),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }
    );
    return out.split("\n").find(Boolean)?.slice(0, 12);
  } catch (_err) {
    return undefined;
  }
};

const markdown = readFileSync(source, "utf8");
const previous = existsSync(target)
  ? new Map(
      JSON.parse(readFileSync(target, "utf8")).days.flatMap((day) =>
        day.items.map((item) => [item.text, item.commit])
      )
    )
  : new Map();

const days = parse(markdown).map((day) => ({
  date: day.date,
  items: day.items.map((item) => {
    const line = firstLine(markdown, item.text);
    const commit = (line && commitOf(line)) || previous.get(item.text);
    return commit ? { text: item.text, commit } : { text: item.text };
  }),
}));

writeFileSync(target, `${JSON.stringify({ days }, null, 2)}\n`);
console.log(
  `${days.length} days, ${days.reduce((sum, day) => sum + day.items.length, 0)} entries written to src/data/changelog.json`
);
