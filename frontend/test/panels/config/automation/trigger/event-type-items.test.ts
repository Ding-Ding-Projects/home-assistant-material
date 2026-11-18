import { describe, expect, it } from "vitest";
import {
  COMMON_EVENT_TYPES,
  eventTypeItems,
} from "../../../../../src/panels/config/automation/trigger/event-type-items";

describe("eventTypeItems", () => {
  it("lists reported events with their listeners, then the common ones, sorted", () => {
    const items = eventTypeItems(
      [
        { event: "zz_custom", listener_count: 2 },
        { event: "state_changed", listener_count: 7 },
      ],
      (count) => `${count} listeners`
    );
    expect(items.map((item) => item.id)).toEqual(
      [...new Set(["zz_custom", "state_changed", ...COMMON_EVENT_TYPES])].sort()
    );
    expect(items.find((item) => item.id === "state_changed")?.secondary).toBe(
      "7 listeners"
    );
    expect(
      items.find((item) => item.id === "call_service")?.secondary
    ).toBeUndefined();
  });

  it("still offers the common events when nothing was reported", () => {
    expect(eventTypeItems(undefined, () => "").length).toBe(
      COMMON_EVENT_TYPES.length
    );
  });
});
