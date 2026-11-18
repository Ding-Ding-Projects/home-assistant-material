import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DOMAINS_WITH_CARD } from "../../../src/common/const";
import { DOMAINS_WITH_FRAME_CONTROL } from "../../../src/dialogs/more-info/const";

import {
  ENTITY_FIRST_CONTROL,
  STATE_NOTE_DOMAINS,
} from "../../../src/dialogs/more-info/entity-first-controls";

const source = (path: string) =>
  readFileSync(resolve(__dirname, "../../../src", path), "utf8");

describe("entity more-info coverage", () => {
  it("keeps the frame's own press control for the press-only domains", () => {
    // These domains have no body of their own, and the only way to press them
    // is the button the frame's state card draws.
    ["button", "input_button"].forEach((domain) => {
      expect(DOMAINS_WITH_CARD).toContain(domain);
      expect(DOMAINS_WITH_FRAME_CONTROL).toContain(domain);
    });
  });

  it("gives a remote a power control, not only its activity chips", () => {
    expect(source("dialogs/more-info/controls/more-info-remote.ts")).toContain(
      "<ha-state-control-toggle"
    );
  });

  it("wraps the select strip so no select is cut off on a phone", () => {
    const css = source(
      "dialogs/more-info/components/ha-more-info-control-select-container.ts"
    );
    const block = css.slice(css.indexOf(".controls-scroll {"));
    expect(block.slice(0, block.indexOf("}"))).toContain("flex-wrap: wrap");
    expect(css).not.toContain("margin: -2px calc(var(--ha-space-6) * -1)");
  });

  it("keeps the media cover small on a phone", () => {
    const css = source("dialogs/more-info/controls/more-info-media_player.ts");
    expect(css).toMatch(
      /@media \(max-width: 600px\)[^{]*\{[^}]*\.cover-container/s
    );
  });

  it("names a first control for every platform of the core source", () => {
    const platforms = readFileSync(
      resolve(
        __dirname,
        "../../../../core/homeassistant/generated/entity_platforms.py"
      ),
      "utf8"
    )
      .split("\n")
      .map((line) => /^\s+[A-Z_]+ = "([a-z_]+)"$/.exec(line)?.[1])
      .filter((domain): domain is string => Boolean(domain));
    expect(platforms.length).toBeGreaterThan(40);
    const missing = platforms.filter((domain) => !ENTITY_FIRST_CONTROL[domain]);
    expect(missing).toEqual([]);
  });

  it("keeps the first control of the board for the main kinds", () => {
    expect(ENTITY_FIRST_CONTROL).toMatchObject({
      light: "brightness_bar",
      lock: "slide_unlock",
      cover: "position",
      valve: "position",
      fan: "level_bar",
      climate: "target",
      media_player: "transport",
      select: "option_tiles",
      input_select: "option_tiles",
      person: "map",
    });
  });

  it("explains every state-note kind in both languages", () => {
    const en = JSON.parse(source("translations/en.json"));
    const yue = JSON.parse(source("translations/yue-own.json"));
    STATE_NOTE_DOMAINS.forEach((domain) => {
      expect(en.ui.entity_sheet.purpose[domain], domain).toBeTruthy();
      expect(yue.ui.entity_sheet.purpose[domain], domain).toBeTruthy();
    });
  });

  it("keeps hero type at 28 px or less on a phone in every more-info control", () => {
    const dirs = [
      "dialogs/more-info/controls",
      "dialogs/more-info/components",
      "state-control",
    ];
    const bad: string[] = [];
    const walk = (dir: string) => {
      readdirSync(resolve(__dirname, "../../../src", dir), {
        withFileTypes: true,
      }).forEach((entry) => {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(path);
          return;
        }
        if (!entry.name.endsWith(".ts")) return;
        source(path)
          .split("\n")
          .forEach((line, index) => {
            const match = /font-size:\s*([^;]+);/.exec(line);
            if (!match || match[1].includes("clamp(")) return;
            const px = /(\d+(?:\.\d+)?)px/.exec(match[1]);
            const token = /--ha-font-size-(\w+)/.exec(match[1]);
            const big =
              (px && Number(px[1]) > 28) ||
              (token && ["3xl", "4xl", "5xl", "6xl"].includes(token[1]));
            if (big) bad.push(`${path}:${index + 1} ${match[1]}`);
          });
      });
    };
    dirs.forEach(walk);
    expect(bad).toEqual([]);
  });
});
