import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const walk = (dir: string, out: string[] = []): string[] => {
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

describe("help addresses", () => {
  // Reads every source file, so it needs more than the default time when the
  // whole suite runs at once.
  it(
    "are never opened with window.open (help opens in the reader)",
    {
      timeout: 60000,
    },
    () => {
      const offenders: string[] = [];
      for (const file of walk(path.resolve(__dirname, "../../../src"))) {
        const text = fs.readFileSync(file, "utf8");
        if (/window\.open\(\s*documentationUrl(?:ForVersion)?\(/.test(text)) {
          offenders.push(path.relative(process.cwd(), file));
        }
      }
      expect(offenders).toEqual([]);
    }
  );
});
