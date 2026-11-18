import { describe, expect, it } from "vitest";
import type { DefenderGuard, DefenderLogEntry } from "../../src/data/defenders";
import {
  defenderLogLine,
  formatHours,
  groupGuards,
  guardTitle,
  needsConfirmationToDisable,
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

  it("formats hours with one decimal", () => {
    expect(formatHours(5400)).toBe("1.5 h");
    expect(formatHours(0)).toBe("0 h");
  });

  it("asks for confirmation only when turning a safety guard off", () => {
    expect(needsConfirmationToDisable(guard("x", "safety", true))).toBe(true);
    expect(needsConfirmationToDisable(guard("x", "timing"))).toBe(false);
  });
});
