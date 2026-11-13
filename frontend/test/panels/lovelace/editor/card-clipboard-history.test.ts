import { beforeEach, describe, expect, it } from "vitest";

import {
  addClipboardEntry,
  CARD_CLIPBOARD_HISTORY_LIMIT,
  clearClipboardHistory,
  parseClipboardHistory,
  pushClipboardHistory,
  readClipboardHistory,
  subscribeClipboardHistory,
  withoutCardStyle,
} from "../../../../src/panels/lovelace/editor/card-clipboard-history";

const entry = (id: string, type = "tile") => ({
  id,
  time: 1000,
  cards: [{ type, name: id }],
});

describe("card clipboard history", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("lists the newest copy first and never grows past the limit", () => {
    let history = [] as ReturnType<typeof readClipboardHistory>;
    for (let i = 0; i < CARD_CLIPBOARD_HISTORY_LIMIT + 3; i++) {
      history = addClipboardEntry(history, entry(`e${i}`));
    }
    expect(history).toHaveLength(CARD_CLIPBOARD_HISTORY_LIMIT);
    expect(history[0].id).toBe(`e${CARD_CLIPBOARD_HISTORY_LIMIT + 2}`);
  });

  it("moves a repeated copy to the front instead of listing it twice", () => {
    let history = addClipboardEntry([], entry("one"));
    history = addClipboardEntry(history, entry("two"));
    history = addClipboardEntry(history, {
      ...entry("again"),
      cards: history[1].cards,
    });
    expect(history.map((item) => item.id)).toEqual(["again", "two"]);
  });

  it("drops stored entries that are not valid", () => {
    const raw = JSON.stringify([
      entry("ok"),
      { id: "no-cards", time: 1, cards: [] },
      { id: "bad-card", time: 1, cards: [{ name: "no type" }] },
      { id: 5, time: 1, cards: [{ type: "tile" }] },
      "junk",
    ]);
    expect(parseClipboardHistory(raw).map((item) => item.id)).toEqual(["ok"]);
    expect(parseClipboardHistory("not json")).toEqual([]);
    expect(parseClipboardHistory(null)).toEqual([]);
  });

  it("keeps copies in local storage and tells listeners", () => {
    const seen: number[] = [];
    const stop = subscribeClipboardHistory((history) =>
      seen.push(history.length)
    );
    pushClipboardHistory([{ type: "tile" }, { type: "button" }]);
    expect(readClipboardHistory()[0].cards).toHaveLength(2);
    clearClipboardHistory();
    stop();
    pushClipboardHistory([{ type: "tile" }]);
    expect(seen).toEqual([1, 0]);
  });

  it("removes a card's style values when pasting without styles", () => {
    expect(
      withoutCardStyle({
        type: "tile",
        entity: "light.kitchen",
        color: "red",
        vertical: true,
        style: { font_size: 20 },
        grid_options: { columns: 6 },
      })
    ).toEqual({ type: "tile", entity: "light.kitchen" });
  });
});
