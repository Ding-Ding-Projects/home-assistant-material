import { describe, expect, it } from "vitest";
import {
  collectHoldActions,
  decideTouchHold,
  TOUCH_HOLD_MS,
  TOUCH_HOLD_OVER_ACTION_MS,
} from "../../../src/components/appearance/touch-hold";

// Protects a person's own hold action. A touch hold may open the element menu
// only where it cannot take a configured hold away; if this rule breaks, a
// card set to "toggle on hold" would silently stop doing that on a phone.

describe("decideTouchHold", () => {
  it("opens the menu after the normal hold on an element with no hold action", () => {
    // A tile has a tap action, which is an action handler, but no hold action
    expect(decideTouchHold([{ hasHold: false }], [])).toEqual({
      open: true,
      delayMs: TOUCH_HOLD_MS,
    });
    expect(decideTouchHold([], [])).toEqual({
      open: true,
      delayMs: TOUCH_HOLD_MS,
    });
  });

  it("waits longer than the action handler when the hold is the default more-info", () => {
    const decision = decideTouchHold([{ hasHold: true }], ["more-info"]);
    expect(decision).toEqual({
      open: true,
      delayMs: TOUCH_HOLD_OVER_ACTION_MS,
    });
    // The action handler fires at 500 ms; the menu must come clearly later
    expect(TOUCH_HOLD_OVER_ACTION_MS).toBeGreaterThan(500 + 200);
  });

  it("never takes a configured hold action", () => {
    for (const action of [
      "toggle",
      "navigate",
      "call-service",
      "perform-action",
      "url",
      "assist",
    ]) {
      expect(decideTouchHold([{ hasHold: true }], [action])).toEqual({
        open: false,
      });
    }
  });

  it("keeps the hold when any one of several hold actions is not replaceable", () => {
    expect(
      decideTouchHold([{ hasHold: true }], ["more-info", "toggle"])
    ).toEqual({ open: false });
    expect(
      decideTouchHold([{ hasHold: true }], ["more-info", "unknown"])
    ).toEqual({ open: false });
  });

  it("does not guess when the hold action could not be read", () => {
    expect(decideTouchHold([{ hasHold: true }], [])).toEqual({ open: false });
  });
});

describe("collectHoldActions", () => {
  it("reads the hold actions of a card and of what it contains", () => {
    expect(
      collectHoldActions({
        type: "glance",
        hold_action: { action: "more-info" },
        entities: [
          { entity: "light.a", hold_action: { action: "toggle" } },
          { entity: "light.b" },
        ],
        icon_hold_action: { action: "none" },
      }).sort()
    ).toEqual(["more-info", "none", "toggle"]);
  });

  it("reports a value that is not an action as unknown", () => {
    expect(collectHoldActions({ hold_action: "toggle" })).toEqual(["unknown"]);
    expect(collectHoldActions({ hold_action: null })).toEqual(["unknown"]);
  });

  it("finds nothing in something that is not a configuration", () => {
    expect(collectHoldActions(undefined)).toEqual([]);
    expect(collectHoldActions("text")).toEqual([]);
    expect(collectHoldActions({ tap_action: { action: "toggle" } })).toEqual(
      []
    );
  });

  it("does not call a configuration too big to read safe", () => {
    const big: Record<string, unknown> = {};
    for (let i = 0; i < 3000; i++) {
      big[`key${i}`] = { nested: { value: i } };
    }
    big.hold_action = { action: "more-info" };
    const found = collectHoldActions(big);
    expect(found).toContain("unknown");
    expect(decideTouchHold([{ hasHold: true }], found)).toEqual({
      open: false,
    });
  });
});
