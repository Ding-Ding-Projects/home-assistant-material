import { describe, expect, it } from "vitest";
import type { HassEntity } from "home-assistant-js-websocket";
import {
  durationToMinutes,
  isPaused,
  listPrinter3DDevices,
  parseHmsProblems,
  parsePrintError,
  progressTicks,
  resolvePrinter3DEntities,
  safeWikiUrl,
  splitMinutes,
  stageLook,
  stepTarget,
  temperatureTrend,
} from "../../src/data/printer_3d";

const entry = (
  entity_id: string,
  translation_key: string,
  device_id: string,
  platform = "bambu_lab"
) => ({ entity_id, translation_key, device_id, platform });

const entities = Object.fromEntries(
  [
    entry("sensor.h2d_stage", "stage", "h2d"),
    entry("sensor.h2d_print_status", "print_status", "h2d"),
    entry("sensor.h2d_left_nozzle", "left_nozzle_temp", "h2d"),
    entry("sensor.h2d_bed", "bed_temp", "h2d"),
    // Same translation key in two domains: the key map is per domain.
    entry("sensor.h2d_airduct", "airduct_mode", "h2d"),
    entry("select.h2d_airduct", "airduct_mode", "h2d"),
    entry("fan.h2d_chamber_fan", "chamber_fan", "h2d"),
    entry("button.h2d_stop", "stop", "h2d"),
    // A device of the same integration that is not a printer.
    entry("sensor.ams_humidity", "humidity", "ams"),
    // Another integration's entity on the printer device is ignored.
    entry("sensor.other_stage", "stage", "h2d", "other"),
    entry("sensor.p1s_print_status", "print_status", "p1s"),
  ].map((e) => [e.entity_id, e])
) as never;

const devices = {
  h2d: { id: "h2d", name: "Workshop", model: "H2D" },
  p1s: { id: "p1s", name: "Office", model: "P1S" },
  ams: { id: "ams", name: "AMS", model: "AMS 2 Pro" },
} as never;

describe("resolvePrinter3DEntities", () => {
  it("finds entities by key and domain, not by name", () => {
    const found = resolvePrinter3DEntities({ entities }, "h2d");
    expect(found).toEqual({
      stage: "sensor.h2d_stage",
      printStatus: "sensor.h2d_print_status",
      leftNozzleTemp: "sensor.h2d_left_nozzle",
      bedTemp: "sensor.h2d_bed",
      airductMode: "select.h2d_airduct",
      chamberFan: "fan.h2d_chamber_fan",
      stop: "button.h2d_stop",
    });
  });

  it("leaves out what the printer does not have", () => {
    const found = resolvePrinter3DEntities({ entities }, "p1s");
    expect(Object.keys(found)).toEqual(["printStatus"]);
  });
});

describe("listPrinter3DDevices", () => {
  it("lists printers only, ordered by name", () => {
    const list = listPrinter3DDevices({ entities, devices }, (id) =>
      id === "h2d" ? "Workshop H2D" : "Office P1S"
    );
    expect(list.map((p) => p.deviceId)).toEqual(["p1s", "h2d"]);
    expect(list[1].model).toBe("H2D");
  });
});

describe("parseHmsProblems", () => {
  it("reads numbered attributes in order, ignoring the count", () => {
    const problems = parseHmsProblems({
      Count: 2,
      "2-Error": "Second",
      "2-Code": "HMS_2",
      "1-Error": "First",
      "1-Code": "HMS_1",
      "1-Wiki": "https://wiki.example/1",
      "1-Severity": "Serious",
    });
    expect(problems.map((p) => p.code)).toEqual(["HMS_1", "HMS_2"]);
    expect(problems[0]).toMatchObject({ severity: "Serious", text: "First" });
    expect(problems[1].wiki).toBeUndefined();
  });

  it("returns nothing for no attributes", () => {
    expect(parseHmsProblems(undefined)).toEqual([]);
    expect(parseHmsProblems({ Count: 0 })).toEqual([]);
  });
});

describe("parsePrintError", () => {
  const state = (s: string, attributes = {}) =>
    ({ state: s, attributes }) as unknown as HassEntity;
  it("is only reported while the entity is on", () => {
    expect(parsePrintError(state("off", { code: "1", error: "x" }))).toBe(
      undefined
    );
    expect(
      parsePrintError(state("on", { code: "0700_8011", error: "Out" }))
    ).toEqual({
      code: "0700_8011",
      text: "Out",
    });
    expect(parsePrintError(state("on"))).toBe(undefined);
  });
});

describe("safeWikiUrl", () => {
  it("only lets web addresses through", () => {
    expect(safeWikiUrl("https://wiki.example/x")).toBe(
      "https://wiki.example/x"
    );
    expect(safeWikiUrl(["java", "script:alert(1)"].join(""))).toBe(undefined);
    expect(safeWikiUrl("not a url")).toBe(undefined);
    expect(safeWikiUrl(undefined)).toBe(undefined);
  });
});

describe("stageLook", () => {
  it("tells a user pause from a problem pause", () => {
    expect(stageLook("paused_user", "pause", true).tone).toBe("amber");
    expect(stageLook("paused_filament_runout", "pause", true).tone).toBe(
      "error"
    );
    expect(isPaused("paused_filament_runout", "pause")).toBe(true);
  });

  it("pulses while printing or heating, and is quiet when offline", () => {
    expect(stageLook("printing", "running", true)).toEqual({
      tone: "primary",
      pulse: true,
    });
    expect(stageLook("heating_hotend", "prepare", true)).toEqual({
      tone: "amber",
      pulse: true,
    });
    expect(stageLook("printing", "running", false)).toEqual({
      tone: "neutral",
      pulse: false,
    });
    expect(stageLook("idle", "finish", true).tone).toBe("green");
  });
});

describe("progressTicks", () => {
  it("marks the layer being printed only while a print is under way", () => {
    expect(progressTicks(0).includes("current")).toBe(false);
    expect(progressTicks(100).includes("current")).toBe(false);
    const half = progressTicks(50);
    expect(half.filter((t) => t === "done")).toHaveLength(20);
    expect(half[20]).toBe("current");
    expect(half).toHaveLength(40);
  });

  it("copes with bad numbers", () => {
    expect(progressTicks(Number.NaN).every((t) => t === "todo")).toBe(true);
    expect(progressTicks(250).every((t) => t === "done")).toBe(true);
  });
});

describe("temperatureTrend", () => {
  it("compares with the target, and a target of 0 means off", () => {
    expect(temperatureTrend(100, 220)).toBe("heating");
    expect(temperatureTrend(220, 220)).toBe("at_target");
    expect(temperatureTrend(250, 220)).toBe("cooling");
    expect(temperatureTrend(120, 0)).toBe("target_off_cooling");
    expect(temperatureTrend(25, 0)).toBe("target_off");
    expect(temperatureTrend(undefined, 220)).toBe("none");
  });

  it("can need a wider margin before it calls it cooling", () => {
    expect(temperatureTrend(222, 220, { coolAbove: 2 })).toBe("at_target");
    expect(temperatureTrend(223, 220, { coolAbove: 2 })).toBe("cooling");
  });
});

describe("stepTarget", () => {
  it("jumps to a usable target on the first raise from off", () => {
    expect(stepTarget("nozzle", 0, 1, 0, 320)).toBe(220);
    expect(stepTarget("bed", 0, 1, 0, 120)).toBe(60);
    expect(stepTarget("chamber", 0, 1, 0, 30)).toBe(30);
  });

  it("steps by 5 and stays inside the limits", () => {
    expect(stepTarget("bed", 60, 1, 0, 120)).toBe(65);
    expect(stepTarget("bed", 118, 1, 0, 120)).toBe(120);
    expect(stepTarget("bed", 3, -1, 0, 120)).toBe(0);
  });
});

describe("durations", () => {
  it("converts a reading to minutes whatever its unit", () => {
    expect(durationToMinutes(1.5, "h")).toBe(90);
    expect(durationToMinutes(84, "min")).toBe(84);
    expect(durationToMinutes(120, "s")).toBe(2);
    expect(splitMinutes(84)).toEqual({ hours: 1, minutes: 24 });
    expect(splitMinutes(-5)).toEqual({ hours: 0, minutes: 0 });
  });
});
