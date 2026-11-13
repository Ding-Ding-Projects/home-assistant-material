import { describe, expect, it } from "vitest";

import type { LovelaceConfig } from "../../../../src/data/lovelace/config/types";
import { duplicateView } from "../../../../src/panels/lovelace/editor/config-util";
import {
  addEmptySection,
  appendCardsTo,
  deleteSelectedCards,
  duplicateSelectedCards,
  listCardTargets,
  moveSelectedCards,
  normalizeSelection,
  selectedCards,
  styleSelectedCards,
} from "../../../../src/panels/lovelace/editor/multi-select-actions";

// These protect the bulk edits: a wrong index silently changes the wrong
// card in somebody's saved dashboard.

const sample = (): LovelaceConfig => ({
  views: [
    {
      title: "Home",
      path: "home",
      type: "sections",
      sections: [
        {
          type: "grid",
          cards: [{ type: "a" }, { type: "b" }, { type: "c" }],
        },
        { type: "grid", cards: [{ type: "d" }] },
      ],
    },
    { title: "Old", path: "old", cards: [{ type: "e" }] },
  ],
});

const types = (config: LovelaceConfig, path: (string | number)[]) =>
  (
    path.reduce((node: any, key) => node[key], config as unknown) as {
      type: string;
    }[]
  ).map((card) => card.type);

const SECTION_0 = ["views", 0, "sections", 0, "cards"];

describe("multi-select actions", () => {
  it("keeps document order and drops duplicates and children of selected cards", () => {
    expect(
      normalizeSelection([
        ["views", 0, "sections", 0, "cards", 2],
        ["views", 0, "sections", 0, "cards", 0],
        ["views", 0, "sections", 0, "cards", 0],
        ["views", 0, "sections", 0, "cards", 2, "cards", 1],
      ])
    ).toEqual([
      ["views", 0, "sections", 0, "cards", 0],
      ["views", 0, "sections", 0, "cards", 2],
    ]);
  });

  it("deletes the right cards however they were picked", () => {
    const next = deleteSelectedCards(sample(), [
      ["views", 0, "sections", 0, "cards", 2],
      ["views", 0, "sections", 0, "cards", 0],
    ]);
    expect(types(next, SECTION_0)).toEqual(["b"]);
    expect(types(next, ["views", 0, "sections", 1, "cards"])).toEqual(["d"]);
  });

  it("duplicates each card right after itself", () => {
    const next = duplicateSelectedCards(sample(), [
      ["views", 0, "sections", 0, "cards", 0],
      ["views", 0, "sections", 0, "cards", 1],
    ]);
    expect(types(next, SECTION_0)).toEqual(["a", "a", "b", "b", "c"]);
  });

  it("moves cards to the end of another section and keeps their order", () => {
    const next = moveSelectedCards(
      sample(),
      [
        ["views", 0, "sections", 0, "cards", 2],
        ["views", 0, "sections", 0, "cards", 0],
      ],
      ["views", 0, "sections", 1]
    );
    expect(types(next, SECTION_0)).toEqual(["b"]);
    expect(types(next, ["views", 0, "sections", 1, "cards"])).toEqual([
      "d",
      "a",
      "c",
    ]);
  });

  it("moves cards into a view without sections", () => {
    const next = moveSelectedCards(
      sample(),
      [["views", 0, "sections", 1, "cards", 0]],
      ["views", 1]
    );
    expect(types(next, ["views", 1, "cards"])).toEqual(["e", "d"]);
    expect(types(next, ["views", 0, "sections", 1, "cards"])).toEqual([]);
  });

  it("moves within the same section by putting the cards last", () => {
    const next = moveSelectedCards(
      sample(),
      [["views", 0, "sections", 0, "cards", 0]],
      ["views", 0, "sections", 0]
    );
    expect(types(next, SECTION_0)).toEqual(["b", "c", "a"]);
  });

  it("copies are independent of the dashboard", () => {
    const config = sample();
    const cards = selectedCards(config, [
      ["views", 0, "sections", 0, "cards", 0],
    ]);
    cards[0].type = "changed";
    expect(types(config, SECTION_0)[0]).toBe("a");
  });

  it("styles every card and keeps the style values it did not touch", () => {
    const config = sample();
    (config.views[0] as any).sections[0].cards[0].style = {
      font_size: 12,
      border_width: 2,
    };
    const next = styleSelectedCards(
      config,
      [
        ["views", 0, "sections", 0, "cards", 0],
        ["views", 0, "sections", 0, "cards", 1],
      ],
      { font_size: 20 },
      { tap: "ripple" }
    );
    const cards = (next.views[0] as any).sections[0].cards;
    expect(cards[0].style).toEqual({ font_size: 20, border_width: 2 });
    expect(cards[1].style).toEqual({ font_size: 20 });
    expect(cards[1].gesture_feedback).toEqual({ tap: "ripple" });
    expect(cards[2].style).toBeUndefined();
  });

  it("lists every view or section that can take cards", () => {
    const config = sample();
    config.views.push({ strategy: { type: "original-states" } } as any);
    const targets = listCardTargets(config);
    expect(targets.map((target) => target.path)).toEqual([
      ["views", 0, "sections", 0],
      ["views", 0, "sections", 1],
      ["views", 1],
    ]);
  });

  it("adds a new section to a sections view", () => {
    const { config, path } = addEmptySection(sample(), 0);
    expect(path).toEqual(["views", 0, "sections", 2]);
    const next = appendCardsTo(config, path, [{ type: "x" }]);
    expect(types(next, ["views", 0, "sections", 2, "cards"])).toEqual(["x"]);
  });
});

describe("duplicateView", () => {
  it("puts the copy right after the original with its own title and path", () => {
    const { config, index } = duplicateView(sample(), 0, "copy");
    expect(index).toBe(1);
    expect(config.views.map((view) => view.path)).toEqual([
      "home",
      "home-copy",
      "old",
    ]);
    expect(config.views[1].title).toBe("Home (copy)");
  });

  it("never reuses a path", () => {
    let config = sample();
    config = duplicateView(config, 0, "copy").config;
    config = duplicateView(config, 0, "copy").config;
    expect(config.views.map((view) => view.path)).toEqual([
      "home",
      "home-copy-2",
      "home-copy",
      "old",
    ]);
  });

  it("copies the cards, not a reference to them", () => {
    const original = sample();
    const { config } = duplicateView(original, 0, "copy");
    (config.views[1] as any).sections[0].cards[0].type = "changed";
    expect((original.views[0] as any).sections[0].cards[0].type).toBe("a");
  });
});
