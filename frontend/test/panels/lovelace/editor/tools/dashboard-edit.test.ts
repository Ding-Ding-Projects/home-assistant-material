import { describe, expect, it } from "vitest";
import type { LovelaceConfig } from "../../../../../src/data/lovelace/config/types";
import {
  clampColumns,
  clampRows,
  copyStyle,
  getCard,
  hasSectionsLayout,
  listEditableCards,
  pasteStyle,
  replaceCard,
  setGridForCards,
  setViewTheme,
  withGridOptions,
} from "../../../../../src/panels/lovelace/editor/tools/dashboard-edit";

const config = (): LovelaceConfig => ({
  views: [
    {
      title: "Home",
      sections: [
        {
          type: "grid",
          cards: [
            { type: "tile", entity: "light.a", color: "red", vertical: true },
            { type: "button", entity: "light.b", show_name: false },
          ],
        },
      ],
    },
    { title: "Old", cards: [{ type: "markdown", content: "x" }] },
  ],
});

describe("dashboard-edit", () => {
  it("lists cards of sections and plain views", () => {
    const cards = listEditableCards(config());
    expect(cards.map((c) => c.key)).toEqual(["0/0/0", "0/0/1", "1/-1/0"]);
    expect(cards[0].label).toBe("light.a");
  });

  it("replaces one card without touching the input", () => {
    const original = config();
    const next = replaceCard(
      original,
      { view: 1, section: -1, card: 0 },
      {
        type: "markdown",
        content: "y",
      }
    );
    expect(getCard(next, { view: 1, section: -1, card: 0 })?.content).toBe("y");
    expect(getCard(original, { view: 1, section: -1, card: 0 })?.content).toBe(
      "x"
    );
  });

  it("sets and clears a view theme", () => {
    const themed = setViewTheme(config(), 0, "midnight");
    expect(themed.views[0].theme).toBe("midnight");
    expect(setViewTheme(themed, 0, undefined).views[0].theme).toBeUndefined();
  });

  it("pastes only style keys the target type supports", () => {
    const copied = copyStyle({
      type: "tile",
      color: "red",
      vertical: true,
      grid_options: { columns: 6 },
    });
    const { card, applied, skipped } = pasteStyle(
      { type: "button", entity: "light.b" },
      copied
    );
    expect(applied).toEqual(["grid_options"]);
    expect(skipped).toEqual(["color", "vertical"]);
    expect(card.grid_options).toEqual({ columns: 6 });
    expect(card.color).toBeUndefined();
  });

  it("changes and removes grid options", () => {
    const sized = withGridOptions({ type: "tile" }, { columns: 6, rows: 2 });
    expect(sized.grid_options).toEqual({ columns: 6, rows: 2 });
    const cleared = withGridOptions(sized, {
      columns: undefined,
      rows: undefined,
    });
    expect(cleared.grid_options).toBeUndefined();
  });

  it("sizes many cards and clamps values", () => {
    const next = setGridForCards(
      config(),
      [
        { view: 0, section: 0, card: 0 },
        { view: 0, section: 0, card: 1 },
      ],
      { columns: 12 }
    );
    expect(
      getCard(next, { view: 0, section: 0, card: 1 })?.grid_options
    ).toEqual({ columns: 12 });
    expect(clampColumns(40)).toBe(12);
    expect(clampColumns(0)).toBe(1);
    expect(clampRows(2.4)).toBe(2);
  });

  it("knows which views have a sections layout", () => {
    expect(hasSectionsLayout(config(), 0)).toBe(true);
    expect(hasSectionsLayout(config(), 1)).toBe(false);
  });
});
