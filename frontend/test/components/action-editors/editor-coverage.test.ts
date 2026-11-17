import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACTION_TYPE_EDITORS,
  CONDITION_TYPE_EDITORS,
  TRIGGER_TYPE_EDITORS,
} from "../../../src/components/action-editors/registry";

const root = resolve(__dirname, "../../../src/panels/config/automation");

const typeFiles = (kind: "action" | "trigger" | "condition") =>
  readdirSync(resolve(root, kind, "types"))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => ({
      name,
      type: name.replace(`ha-automation-${kind}-`, "").replace(/\.ts$/, ""),
      source: readFileSync(resolve(root, kind, "types", name), "utf8"),
    }));

const registries = {
  action: ACTION_TYPE_EDITORS,
  trigger: TRIGGER_TYPE_EDITORS,
  condition: CONDITION_TYPE_EDITORS,
} as const;

describe.each(["action", "trigger", "condition"] as const)(
  "visual editor coverage for %s types",
  (kind) => {
    const registry: Record<string, string> = registries[kind];
    const files = typeFiles(kind);

    it("has a registered visual editor for every type file", () => {
      const missing = files
        .map((file) => file.type)
        .filter((type) => !(type in registry));
      expect(missing).toEqual([]);
    });

    it("registers no type without an element behind it", () => {
      const present = new Set(files.map((file) => file.type));
      // Repeat variants share one element.
      const orphans = Object.keys(registry).filter(
        (type) => !present.has(type)
      );
      expect(orphans).toEqual([]);
    });

    it("names the element each file really defines", () => {
      files.forEach((file) => {
        expect(file.source, file.name).toContain(
          `@customElement("${registry[file.type]}")`
        );
      });
    });

    it("never renders a code box in place of a visual form", () => {
      const offenders = files
        .filter((file) =>
          /<ha-(yaml-editor|code-editor)\b|<ha-textarea\b/.test(file.source)
        )
        .map((file) => file.name);
      expect(offenders).toEqual([]);
    });
  }
);
