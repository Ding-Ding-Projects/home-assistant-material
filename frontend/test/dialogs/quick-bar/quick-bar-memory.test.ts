import { describe, expect, it } from "vitest";
import {
  clearRecent,
  isPinned,
  leadingResults,
  normalizeQuickBarMemory,
  quickBarResultKey,
  RECENT_LIMIT,
  recordRecent,
  togglePinned,
} from "../../../src/dialogs/quick-bar/quick-bar-memory";

// The quick bar remembers pins and recent results. Keys must survive a
// reordered list, and stored text from the instance must never break the bar.

describe("quick bar memory", () => {
  it("builds keys from what a result is, not from its list position", () => {
    expect(
      quickBarResultKey({
        id: "navigation_4_/config",
        path: "/config",
      })
    ).toBe("path:/config");
    expect(
      quickBarResultKey({
        id: "navigation_9_/config",
        path: "/config",
      })
    ).toBe("path:/config");
    expect(
      quickBarResultKey({
        id: "entity________light.a",
        stateObj: { entity_id: "light.a" },
      })
    ).toBe("entity:light.a");
    expect(quickBarResultKey({ id: "device________abc" })).toBe("device:abc");
    expect(
      quickBarResultKey({
        id: "server_control_2_restart",
        action: "restart",
        domain: "homeassistant",
      })
    ).toBe("action:homeassistant.restart");
    expect(quickBarResultKey({ id: "ask-assist", assistPrompt: "hi" })).toBe(
      undefined
    );
  });

  it("toggles a pin and keeps the order", () => {
    let memory = normalizeQuickBarMemory(undefined);
    memory = togglePinned(memory, { key: "a", title: "A" });
    memory = togglePinned(memory, { key: "b", title: "B" });
    expect(memory.pinned.map((e) => e.key)).toEqual(["a", "b"]);
    expect(isPinned(memory, "a")).toBe(true);
    memory = togglePinned(memory, { key: "a", title: "A" });
    expect(memory.pinned.map((e) => e.key)).toEqual(["b"]);
  });

  it("keeps only the last ten recent results, newest first, without repeats", () => {
    let memory = normalizeQuickBarMemory(undefined);
    for (let i = 0; i < 14; i++) {
      memory = recordRecent(memory, { key: `k${i}`, title: `T${i}` });
    }
    memory = recordRecent(memory, { key: "k10", title: "T10" });
    expect(memory.recent).toHaveLength(RECENT_LIMIT);
    expect(memory.recent[0].key).toBe("k10");
    expect(memory.recent.filter((e) => e.key === "k10")).toHaveLength(1);
    expect(clearRecent(memory).recent).toEqual([]);
  });

  it("leads with pins, then recent results that are not pinned, skipping missing ones", () => {
    const memory = {
      pinned: [
        { key: "a", title: "A" },
        { key: "gone", title: "Gone" },
      ],
      recent: [
        { key: "a", title: "A" },
        { key: "b", title: "B" },
      ],
    };
    const found = leadingResults(memory, (key) =>
      key === "gone" ? undefined : key.toUpperCase()
    );
    expect(found).toEqual({ pinned: ["A"], recent: ["B"] });
  });

  it("drops anything that is not a valid stored entry", () => {
    const memory = normalizeQuickBarMemory({
      pinned: [{ key: "ok", title: "Ok" }, { key: 4 }, "x", null],
      recent: "nope",
    });
    expect(memory.pinned).toEqual([{ key: "ok", title: "Ok" }]);
    expect(memory.recent).toEqual([]);
  });
});
