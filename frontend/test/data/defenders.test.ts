import { describe, expect, it } from "vitest";
import type { DefenderGuard, DefenderLogEntry } from "../../src/data/defenders";
import {
  commandReason,
  defenderLogLine,
  describeReason,
  formatHours,
  groupGuards,
  guardDescriptionKey,
  guardTitle,
  isStandingDown,
  needsConfirmationToDisable,
  siblingPath,
  splitDuration,
  usageTabKey,
} from "../../src/data/defenders";

const guard = (id: string, group: string, safety = false): DefenderGuard => ({
  id,
  family: group,
  group,
  safety,
  enabled: true,
  settings: {},
  last_acted: null,
  reason: null,
});

const handover = (
  code: string,
  extra: Partial<DefenderLogEntry["values"]> = {}
): DefenderLogEntry => ({
  time: "2026-07-14T14:00:00+00:00",
  kind: "handover",
  guard: "ac",
  message: "",
  values: { code, values: { room: 24.04, low: 22, high: 24 }, ...extra },
});

describe("groupGuards", () => {
  it("puts safety first, whatever the guard's own group is", () => {
    const groups = groupGuards([
      guard("peak_power_saver", "money"),
      guard("comfort_sync", "timing"),
      guard("hot_room_override", "safety", true),
      guard("front_door_guard_post", "people", true),
    ]);
    expect(groups.map((g) => g.group)).toEqual(["safety", "timing", "money"]);
    expect(groups[0].guards.map((g) => g.id)).toEqual([
      "front_door_guard_post",
      "hot_room_override",
    ]);
  });

  it("drops groups that have no match", () => {
    const groups = groupGuards(
      [guard("a_guard", "money"), guard("b_guard", "timing")],
      (g) => g.id === "b_guard"
    );
    expect(groups.map((g) => g.group)).toEqual(["timing"]);
  });
});

describe("defenderLogLine", () => {
  it("uses the sibling voices for an ordinary handover", () => {
    const line = defenderLogLine(handover("heat_off_still_hot"), false);
    expect(line?.key).toBe(
      "ui.panel.config.defenders.log.voice.heat_off_still_hot"
    );
    expect(line?.values).toEqual({ room: "24.0", low: "22.0", high: "24.0" });
  });

  it("uses plain words when Plain log is on", () => {
    expect(defenderLogLine(handover("heat_off_still_hot"), true)?.key).toBe(
      "ui.panel.config.defenders.log.plain.heat_off_still_hot"
    );
  });

  it("always uses plain words for safety lines", () => {
    expect(defenderLogLine(handover("floor_reached"), false)?.key).toBe(
      "ui.panel.config.defenders.log.plain.floor_reached"
    );
    expect(defenderLogLine(handover("too_hot"), false)?.key).toBe(
      "ui.panel.config.defenders.log.plain.too_hot"
    );
  });

  it("has no line for anything that is not a handover", () => {
    expect(
      defenderLogLine({ ...handover("x"), kind: "command" }, false)
    ).toBeUndefined();
  });
});

describe("small helpers", () => {
  it("makes a readable guard title", () => {
    expect(guardTitle("hot_room_override")).toBe("Hot room override");
  });

  it("names guards without cooling words for the heat direction", () => {
    expect(guardTitle("cool_mode_restore", "heat")).toBe("Mode restore");
    expect(guardTitle("cool_mode_restore")).toBe("Cool mode restore");
    expect(guardTitle("comfort_sync", "heat")).toBe("Comfort sync");
  });

  it("formats hours with one decimal", () => {
    expect(formatHours(5400)).toBe("1.5 h");
    expect(formatHours(0)).toBe("0 h");
  });

  it("asks for confirmation only when turning a safety guard off", () => {
    expect(needsConfirmationToDisable(guard("x", "safety", true))).toBe(true);
    expect(needsConfirmationToDisable(guard("x", "timing"))).toBe(false);
  });
});

describe("duration and log helpers", () => {
  it("splits a duration into whole hours and minutes", () => {
    expect(splitDuration(11520)).toEqual({ hours: 3, minutes: 12 });
    expect(splitDuration(-5)).toEqual({ hours: 0, minutes: 0 });
  });

  it("knows when a defender stands down", () => {
    expect(isStandingDown("paused")).toBe(true);
    expect(isStandingDown("stopped")).toBe(true);
    expect(isStandingDown("defending")).toBe(false);
  });

  it("takes the reason out of a logged command", () => {
    expect(
      commandReason("keep_heating_off: set_hvac_mode off (heating is kept off)")
    ).toBe("Heating is kept off");
  });
});

describe("reasons in the viewer's language", () => {
  const words: Record<string, string> = {
    "reason.below_floor": "Room {room}, floor {floor}",
    "reason.holding_target_because": "Holding {target}: {because}",
    "reason.walking_back": "Back {step}",
  };
  const translate = (key: string, values?: Record<string, string | number>) =>
    (words[key] ?? "").replace(/\{(\w+)\}/g, (_, name) =>
      String(values?.[name])
    );

  it("words a code with its values to one decimal", () => {
    expect(
      describeReason(
        { code: "below_floor", params: { room: 15, floor: 16 } },
        "english",
        translate
      )
    ).toBe("Room 15.0, floor 16.0");
  });

  it("words a reason that has a reason inside", () => {
    expect(
      describeReason(
        {
          code: "holding_target_because",
          params: {
            target: 23,
            because: { code: "walking_back", params: { step: 0.5 } },
          },
        },
        "english",
        translate
      )
    ).toBe("Holding 23.0: Back 0.5");
  });

  it("falls back to the plain text for a plain reason or an unknown code", () => {
    expect(describeReason(null, "plain text", translate)).toBe("plain text");
    expect(
      describeReason({ code: "new_code", params: {} }, "plain text", translate)
    ).toBe("plain text");
  });
});

describe("page helpers of the defenders", () => {
  it("points to the page of the other defender with its entry", () => {
    const sibling = { role: "heat", entry_id: "abc" } as any;
    expect(siblingPath(sibling)).toBe("/config/heat-defender?entry=abc");
    expect(siblingPath({ ...sibling, role: "ac" })).toBe(
      "/config/ac-defender?entry=abc"
    );
  });

  it("uses the heat description only where it differs", () => {
    expect(guardDescriptionKey("hot_room_override", "heat")).toBe(
      "guard_desc_heat.hot_room_override"
    );
    expect(guardDescriptionKey("hot_room_override", "cool")).toBe(
      "guard_desc.hot_room_override"
    );
    expect(guardDescriptionKey("comfort_sync", "heat")).toBe(
      "guard_desc.comfort_sync"
    );
  });

  it("names the third tab by what it measures", () => {
    expect(usageTabKey("cool")).toBe("tabs.usage_cool");
    expect(usageTabKey("heat")).toBe("tabs.usage_heat");
  });
});
