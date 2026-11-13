import { describe, expect, it } from "vitest";
import type { CardLibraryEntry } from "../../../../../src/data/frontend";
import type { LovelaceConfig } from "../../../../../src/data/lovelace/config/types";
import {
  buildCardFile,
  parseCardFile,
} from "../../../../../src/panels/lovelace/editor/tools/card-library";
import {
  capCardWidths,
  findWideCards,
} from "../../../../../src/panels/lovelace/editor/tools/dashboard-screens";

const entry: CardLibraryEntry = {
  id: "a",
  name: "Kitchen light",
  created: 1,
  versions: [
    { at: 1, card: { type: "tile", entity: "light.old" } },
    { at: 2, card: { type: "tile", entity: "[[light]]", name: "Kitchen" } },
  ],
};

describe("card files", () => {
  it("round trips the latest version with its inputs", () => {
    const { filename, text } = buildCardFile(entry);
    expect(filename).toBe("card-kitchen-light.json");
    const parsed = parseCardFile(text);
    expect(parsed).toEqual({
      ok: true,
      name: "Kitchen light",
      card: { type: "tile", entity: "[[light]]", name: "Kitchen" },
      inputs: ["light"],
    });
  });

  it("refuses files that are not card files", () => {
    expect(parseCardFile("not json")).toEqual({
      ok: false,
      reason: "not_json",
    });
    expect(parseCardFile('{"format":"other"}')).toEqual({
      ok: false,
      reason: "wrong_format",
    });
    expect(
      parseCardFile(
        '{"format":"dashboard-card","version":1,"name":"x","card":{"entity":"a"}}'
      )
    ).toEqual({ ok: false, reason: "no_card" });
    expect(parseCardFile("x".repeat(300_000))).toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("refuses dangerous keys and too much nesting", () => {
    const proto =
      '{"format":"dashboard-card","version":1,"name":"x","card":{"type":"tile","__proto__":{"a":1}}}';
    expect(parseCardFile(proto)).toEqual({ ok: false, reason: "unsafe" });
    let deep: unknown = "end";
    for (let i = 0; i < 40; i++) {
      deep = { a: deep };
    }
    const nested = JSON.stringify({
      format: "dashboard-card",
      version: 1,
      name: "x",
      card: { type: "tile", deep },
    });
    expect(parseCardFile(nested)).toEqual({ ok: false, reason: "unsafe" });
  });
});

const config = {
  views: [
    {
      type: "sections",
      sections: [
        {
          type: "grid",
          column_span: 2,
          cards: [
            { type: "tile", entity: "light.a", grid_options: { columns: 24 } },
            { type: "tile", entity: "light.b", grid_options: { columns: 6 } },
            {
              type: "heading",
              heading: "Hi",
              grid_options: { columns: "full" },
            },
            { type: "tile", entity: "light.c" },
          ],
        },
      ],
    },
    { type: "masonry", cards: [] },
  ],
} as unknown as LovelaceConfig;

describe("phone friendly widths", () => {
  it("finds only numeric widths wider than the phone in a sections view", () => {
    const wide = findWideCards(config, 0);
    expect(wide).toHaveLength(1);
    expect(wide[0].columns).toBe(24);
    expect(findWideCards(config, 1)).toEqual([]);
  });

  it("caps those widths and keeps everything else", () => {
    const next = capCardWidths(config, findWideCards(config, 0));
    const cards = (
      next.views[0] as unknown as {
        sections: { cards: { grid_options?: { columns?: unknown } }[] }[];
      }
    ).sections[0].cards;
    expect(cards[0].grid_options?.columns).toBe(12);
    expect(cards[1].grid_options?.columns).toBe(6);
    expect(cards[2].grid_options?.columns).toBe("full");
    expect(findWideCards(next, 0)).toEqual([]);
    // The input is not changed.
    expect(findWideCards(config, 0)).toHaveLength(1);
  });
});
