import { describe, expect, it } from "vitest";
import {
  applyQuickChange,
  unsupportedKeys,
  buildQuickControls,
  type QuickContext,
  type QuickControl,
  type QuickEntity,
} from "../../../src/components/action-editors/descriptors";
import {
  colorToRgb,
  durationSeconds,
  hexToRgb,
  hsToRgb,
  partsToSeconds,
  rgbToColor,
  rgbToHex,
  rgbToHs,
  rgbToXy,
  secondsToParts,
  secondsToText,
  xyToRgb,
} from "../../../src/components/action-editors/quick-rich";

const entity = (
  entity_id: string,
  attributes: Record<string, unknown> = {}
): QuickEntity => ({ entity_id, state: "on", attributes });

const fieldsFor = (...keys: string[]) =>
  Object.fromEntries(keys.map((key) => [key, { selector: { text: {} } }]));

const context = (
  action: string,
  keys: string[],
  data: Record<string, unknown> = {},
  entities: QuickEntity[] = [],
  extra: Partial<QuickContext> = {}
): QuickContext => ({
  action,
  data,
  fields: fieldsFor(...keys),
  domainServices: [],
  entities,
  ...extra,
});

const find = (controls: QuickControl[], key: string) =>
  controls.find((control) => control.key === key);

/** Visual change, then stored text, then the same controls back from it. */
const roundTrip = (
  ctx: QuickContext,
  key: string,
  value: unknown
): QuickControl[] => {
  const next = applyQuickChange(ctx.data, key, value) ?? {};
  const restored = JSON.parse(JSON.stringify(next)) as Record<string, unknown>;
  // Keys the editor does not show keep their value and their order.
  Object.keys(ctx.data).forEach((existing) => {
    if (existing !== key) {
      expect(restored[existing], existing).toEqual(ctx.data[existing]);
    }
  });
  return buildQuickControls({ ...ctx, data: restored });
};

describe("light colour controls", () => {
  const lamp = entity("light.lamp", {
    supported_color_modes: ["color_temp", "rgbww"],
    supported_features: 44,
    min_color_temp_kelvin: 2000,
    max_color_temp_kelvin: 6500,
    effect_list: ["rainbow", "pulse"],
  });
  const keys = [
    "brightness_pct",
    "color_temp_kelvin",
    "rgb_color",
    "rgbww_color",
    "effect",
    "flash",
    "transition",
  ];

  it("uses the colour wheel for colours and the temperature slider for kelvin", () => {
    const controls = buildQuickControls(
      context("light.turn_on", keys, {}, [lamp])
    );
    expect(find(controls, "rgb_color")).toMatchObject({
      kind: "color",
      space: "rgb",
      swatches: true,
    });
    expect(find(controls, "rgbww_color")).toMatchObject({
      kind: "color",
      space: "rgbww",
      swatches: false,
    });
    expect(find(controls, "color_temp_kelvin")).toMatchObject({
      kind: "selector",
      valueType: "color_temp",
    });
    expect(find(controls, "transition")).toMatchObject({ kind: "duration" });
    expect(find(controls, "effect")).toMatchObject({ kind: "tiles" });
    expect(find(controls, "flash")).toMatchObject({ kind: "tiles" });
  });

  it("hides what a light does not support", () => {
    const plain = entity("light.plug", {
      supported_color_modes: ["brightness"],
      supported_features: 0,
    });
    expect(
      buildQuickControls(context("light.turn_on", keys, {}, [plain])).map(
        (control) => control.key
      )
    ).toEqual(["brightness_pct"]);
  });

  it("keeps a stored colour in another model editable", () => {
    const controls = buildQuickControls(
      context("light.turn_on", ["hs_color", "xy_color", "rgb_color"], {
        hs_color: [30, 50],
        xy_color: [0.4, 0.4],
      })
    );
    expect(find(controls, "hs_color")).toMatchObject({
      kind: "color",
      space: "hs",
      value: [30, 50],
    });
    expect(find(controls, "xy_color")).toMatchObject({ space: "xy" });
  });

  it("round trips colours in every model and keeps the white channels", () => {
    const ctx = context("light.turn_on", ["rgbww_color"], {
      zeta: 1,
      rgbww_color: [1, 2, 3, 40, 50],
    });
    const picked = rgbToColor("rgbww", [255, 0, 0], [1, 2, 3, 40, 50]);
    expect(picked).toEqual([255, 0, 0, 40, 50]);
    const controls = roundTrip(ctx, "rgbww_color", picked);
    expect(find(controls, "rgbww_color")).toMatchObject({
      value: [255, 0, 0, 40, 50],
    });
  });

  it("leaves a template colour to its template editor", () => {
    expect(
      find(
        buildQuickControls(
          context("light.turn_on", ["rgb_color"], {
            rgb_color: "{{ [255, 0, 0] }}",
          })
        ),
        "rgb_color"
      )
    ).toBeUndefined();
  });
});

describe("colour and duration conversions", () => {
  it("converts hex, hue and saturation, and xy without losing the colour", () => {
    expect(hexToRgb("#ff8000")).toEqual([255, 128, 0]);
    expect(rgbToHex([255, 128, 0])).toBe("#ff8000");
    expect(hexToRgb("nope")).toBeUndefined();
    expect(rgbToHs([255, 0, 0])).toEqual([0, 100]);
    expect(hsToRgb([120, 100])).toEqual([0, 255, 0]);
    const [x, y] = rgbToXy([0, 0, 255]);
    const back = xyToRgb([x, y]);
    expect(back[2]).toBeGreaterThan(back[0]);
    expect(colorToRgb("hs", [0, 100])).toEqual([255, 0, 0]);
    expect(colorToRgb("rgbw", [1, 2, 3, 4])).toEqual([1, 2, 3]);
    expect(colorToRgb("rgb", undefined)).toBeUndefined();
  });

  it("reads and writes durations as seconds or text", () => {
    expect(durationSeconds(90)).toBe(90);
    expect(durationSeconds("00:01:30")).toBe(90);
    expect(durationSeconds("01:30")).toBe(90);
    expect(durationSeconds("45")).toBe(45);
    expect(durationSeconds("soon")).toBeUndefined();
    expect(secondsToText(3725)).toBe("01:02:05");
    expect(secondsToParts(3725)).toMatchObject({
      hours: 1,
      minutes: 2,
      seconds: 5,
    });
    expect(partsToSeconds({ hours: 1, minutes: 2, seconds: 5 })).toBe(3725);
  });
});

describe("durations keep the stored form", () => {
  it("timers store text and scene transitions store seconds", () => {
    const timer = buildQuickControls(
      context("timer.start", ["duration"], { duration: "00:05:00" })
    );
    expect(timer[0]).toMatchObject({ kind: "duration", format: "hms" });
    const scene = buildQuickControls(
      context("scene.turn_on", ["transition"], { transition: 4 })
    );
    expect(scene[0]).toMatchObject({
      kind: "duration",
      format: "seconds",
      value: 4,
    });
  });

  it("round trips a timer duration", () => {
    const ctx = context("timer.start", ["duration"], { keep: 1 });
    const controls = roundTrip(ctx, "duration", "00:10:00");
    expect(controls[0]).toMatchObject({ kind: "duration", value: "00:10:00" });
  });
});

describe("speech", () => {
  const engine = entity("tts.cloud", {});
  const keys = [
    "media_player_entity_id",
    "message",
    "language",
    "options",
    "cache",
  ];

  it("offers speakers, a counted message, languages, voices and a test button", () => {
    const controls = buildQuickControls(
      context("tts.speak", keys, {}, [engine], {
        engines: {
          "tts.cloud": {
            languages: ["en", "yue"],
            options: ["voice"],
            commonOptions: ["preferred_format"],
          },
        },
      })
    );
    expect(find(controls, "media_player_entity_id")).toMatchObject({
      kind: "entities",
      domain: "media_player",
      multiple: true,
    });
    expect(find(controls, "message")).toMatchObject({
      kind: "text",
      multiline: true,
      showCount: true,
    });
    expect(find(controls, "language")).toMatchObject({
      kind: "selector",
      valueType: "language",
      selector: { language: { languages: ["en", "yue"] } },
    });
    const options = find(controls, "options");
    expect(options).toMatchObject({ kind: "options" });
    expect(
      (options as Extract<QuickControl, { kind: "options" }>).fields.map(
        (field) => [field.name, field.type]
      )
    ).toEqual([
      ["voice", "voice"],
      ["preferred_format", "text"],
    ]);
    expect(find(controls, "cache")).toMatchObject({ kind: "switch" });
    expect(find(controls, "$run")).toMatchObject({ kind: "run" });
  });

  it("falls back to a labelled text box when the engine reports no languages", () => {
    const controls = buildQuickControls(
      context("tts.speak", keys, {}, [engine])
    );
    expect(find(controls, "language")).toMatchObject({ kind: "text" });
  });

  it("only offers the test button on speak, never on say", () => {
    const say = buildQuickControls(
      context("tts.say", ["entity_id", "message"], {}, [engine])
    );
    expect(find(say, "$run")).toBeUndefined();
  });

  it("keeps stored engine options visible and editable", () => {
    const controls = buildQuickControls(
      context("tts.speak", ["options"], { options: { voice: "x", vendor: 1 } })
    );
    expect(find(controls, "options")).toMatchObject({
      value: { voice: "x", vendor: 1 },
    });
  });
});

describe("tailored editors beyond the first group", () => {
  it("gates the update fields on the supported features", () => {
    const keys = ["version", "backup"];
    expect(
      buildQuickControls(
        context("update.install", keys, {}, [
          entity("update.core", { supported_features: 1 }),
        ])
      ).filter((control) => control.kind !== "notice")
    ).toEqual([]);
    const full = buildQuickControls(
      context("update.install", keys, {}, [
        entity("update.core", {
          supported_features: 11,
          latest_version: "2.0",
        }),
      ])
    );
    expect(find(full, "version")).toMatchObject({ kind: "text" });
    expect(find(full, "backup")).toMatchObject({ kind: "switch" });
  });

  it("offers only the forecasts a weather entity supports", () => {
    const controls = buildQuickControls(
      context("weather.get_forecasts", ["type"], {}, [
        entity("weather.home", { supported_features: 3 }),
      ])
    );
    expect(
      (
        find(controls, "type") as Extract<QuickControl, { kind: "tiles" }>
      ).options.map((option) => option.value)
    ).toEqual(["hourly", "daily"]);
  });

  it("hides a lawn mower service it does not support", () => {
    const controls = buildQuickControls({
      ...context("lawn_mower.start_mowing", [], {}, [
        entity("lawn_mower.garden", { supported_features: 5 }),
      ]),
      domainServices: ["start_mowing", "pause", "dock", "stop"],
    });
    expect(
      (controls[0] as Extract<QuickControl, { kind: "services" }>).options.map(
        (option) => option.value
      )
    ).toEqual([
      "lawn_mower.start_mowing",
      "lawn_mower.dock",
      "lawn_mower.stop",
    ]);
  });

  it("shows the media player controls only for the right service", () => {
    expect(
      find(
        buildQuickControls(
          context("media_player.repeat_set", ["repeat"], { repeat: "all" })
        ),
        "repeat"
      )
    ).toMatchObject({ kind: "tiles", value: "all" });
    expect(
      find(
        buildQuickControls(context("media_player.join", ["group_members"], {})),
        "group_members"
      )
    ).toMatchObject({ kind: "entities", domain: "media_player" });
  });

  it("builds a to-do item with date pickers and status tiles", () => {
    const add = buildQuickControls(
      context("todo.add_item", [
        "item",
        "due_date",
        "due_datetime",
        "description",
      ])
    );
    expect(find(add, "due_date")).toMatchObject({ kind: "date" });
    expect(find(add, "due_datetime")).toMatchObject({ kind: "datetime" });
    expect(find(add, "description")).toMatchObject({
      kind: "text",
      multiline: true,
    });
    const update = buildQuickControls(
      context("todo.update_item", ["item", "status", "rename"])
    );
    expect(find(update, "status")).toMatchObject({ kind: "tiles" });
    // The item itself keeps the existing list-aware picker.
    expect(find(update, "item")).toBeUndefined();
  });

  it("warns before the actions that cannot be undone", () => {
    [
      "homeassistant.restart",
      "homeassistant.stop",
      "recorder.purge",
      "persistent_notification.dismiss_all",
      "system_log.clear",
      "scene.delete",
      "tts.clear_cache",
    ].forEach((action) =>
      expect(
        buildQuickControls(context(action, [])).some(
          (control) => control.kind === "notice" && control.tone === "caution"
        ),
        action
      ).toBe(true)
    );
  });

  it("bounds the recorder purge to a slider of days", () => {
    expect(
      find(
        buildQuickControls(context("recorder.purge", ["keep_days"], {})),
        "keep_days"
      )
    ).toMatchObject({ kind: "slider", min: 0, max: 365 });
  });

  it("gives remote commands chips that replace the text", () => {
    const send = buildQuickControls(
      context("remote.send_command", ["device", "command", "num_repeats"], {})
    );
    const command = find(send, "command") as Extract<
      QuickControl,
      { kind: "text" }
    >;
    expect(command.chips?.every((chip) => chip.replace)).toBe(true);
    expect(
      find(
        buildQuickControls(
          context("remote.send_command", ["command"], { command: ["a", "b"] })
        ),
        "command"
      )
    ).toBeUndefined();
  });

  it("covers the helper domains the first group left out", () => {
    const cases: [string, string, unknown, string][] = [
      ["counter.set_value", "value", 5, "stepper"],
      ["timer.change", "duration", "00:01:00", "duration"],
      [
        "input_datetime.set_datetime",
        "datetime",
        "2026-01-02 03:04:05",
        "datetime",
      ],
      ["date.set_value", "date", "2026-01-02", "date"],
      ["time.set_value", "time", "03:04:05", "time"],
      ["datetime.set_value", "datetime", "2026-01-02 03:04:05", "datetime"],
      ["select.select_option", "option", "two", "tiles"],
      ["input_select.select_next", "cycle", true, "switch"],
      ["valve.set_valve_position", "position", 40, "slider"],
      ["fan.increase_speed", "percentage_step", 10, "slider"],
      ["climate.set_humidity", "humidity", 45, "slider"],
      ["water_heater.set_away_mode", "away_mode", true, "switch"],
      ["vacuum.set_fan_speed", "fan_speed", "max", "tiles"],
      ["ai_task.clear_images", "days", 7, "slider"],
      ["homeassistant.set_location", "latitude", 51.5, "stepper"],
      ["device_tracker.see", "gps_accuracy", 20, "slider"],
      ["conversation.process", "language", "en", "selector"],
      ["shopping_list.sort", "reverse", true, "switch"],
      ["system_log.write", "level", "error", "tiles"],
      ["persistent_notification.create", "message", "Hello", "text"],
      ["camera.record", "duration", 30, "duration"],
      ["assist_satellite.announce", "preannounce", true, "switch"],
    ];
    cases.forEach(([action, key, value, kind]) => {
      const entities =
        action === "select.select_option" ||
        action === "input_select.select_next"
          ? [entity("select.x", { options: ["one", "two"] })]
          : action === "vacuum.set_fan_speed"
            ? [entity("vacuum.x", { fan_speed_list: ["max"] })]
            : [];
      const ctx = context(action, [key], { other: 1 }, entities);
      const controls = roundTrip(ctx, key, value);
      expect(find(controls, key), `${action} ${key}`).toMatchObject({
        kind,
        value,
      });
    });
  });
});

describe("the all-day switch", () => {
  const now = new Date(2026, 10, 17, 9, 0, 0);

  it("turns timed dates into dates and back without losing the day", () => {
    const timed = {
      summary: "Dentist",
      start_date_time: "2026-11-20 09:30:00",
      end_date_time: "2026-11-20 10:30:00",
    };
    const day = applyQuickChange(timed, "$all_day", true, now)!;
    expect(day).toEqual({
      summary: "Dentist",
      start_date: "2026-11-20",
      end_date: "2026-11-20",
    });
    const back = applyQuickChange(day, "$all_day", false, now)!;
    expect(back).toEqual({
      summary: "Dentist",
      start_date_time: "2026-11-20 00:00:00",
      end_date_time: "2026-11-20 00:00:00",
    });
  });

  it("starts an empty event on today and tomorrow", () => {
    expect(applyQuickChange({}, "$all_day", true, now)).toEqual({
      start_date: "2026-11-17",
      end_date: "2026-11-18",
    });
  });

  it("shows date pickers for a day event and date-time pickers otherwise", () => {
    const keys = [
      "summary",
      "start_date",
      "end_date",
      "start_date_time",
      "end_date_time",
    ];
    const day = buildQuickControls(
      context("calendar.create_event", keys, { start_date: "2026-11-20" })
    );
    expect(find(day, "$all_day")).toMatchObject({
      kind: "switch",
      value: true,
    });
    expect(find(day, "start_date")).toMatchObject({ kind: "date" });
    expect(find(day, "start_date_time")).toBeUndefined();
    const timed = buildQuickControls(
      context("calendar.create_event", keys, {})
    );
    expect(find(timed, "$all_day")).toMatchObject({ value: false });
    expect(find(timed, "start_date_time")).toMatchObject({ kind: "datetime" });
  });

  it("leaves an event with an offset to the offset editor", () => {
    const controls = buildQuickControls(
      context(
        "calendar.create_event",
        ["summary", "start_date", "start_date_time", "in"],
        { in: { days: 1 } }
      )
    );
    expect(find(controls, "$all_day")).toBeUndefined();
  });

  it("changes nothing else through the normal path", () => {
    expect(applyQuickChange({ a: 1 }, "a", 2)).toEqual({ a: 2 });
  });
});

describe("the generic rich form for any other integration", () => {
  const ctx = (fields: QuickContext["fields"], data = {}): QuickContext => ({
    action: "example.do_it",
    data,
    fields,
    domainServices: [],
    entities: [],
  });

  it("makes steppers of unbounded numbers and list boxes of long lists", () => {
    const controls = buildQuickControls(
      ctx({
        count: { selector: { number: { mode: "box" } } },
        limit: { selector: { number: { min: 1, max: 9, mode: "box" } } },
        many: {
          selector: {
            select: {
              options: Array.from({ length: 12 }, (_, index) => `v${index}`),
            },
          },
        },
      })
    );
    expect(controls.map((control) => [control.key, control.kind])).toEqual([
      ["count", "stepper"],
      ["limit", "stepper"],
      ["many", "selector"],
    ]);
    expect(controls[1]).toMatchObject({ min: 1, max: 9 });
    expect(controls[2]).toMatchObject({
      valueType: "list",
      selector: { select: { mode: "dropdown" } },
    });
  });

  it("keeps text, dates, templates and objects with their own selectors", () => {
    expect(
      buildQuickControls(
        ctx(
          {
            note: { selector: { text: {} } },
            when: { selector: { datetime: {} } },
            blob: { selector: { object: {} } },
            level: { selector: { number: { min: 0, max: 5 } } },
          },
          { level: "{{ x }}" }
        )
      )
    ).toEqual([]);
  });
});

describe("fields hidden for unsupported entities", () => {
  it("hides an unsupported field but never one that holds a saved value", () => {
    const keys = ["version", "backup"];
    const plain = entity("update.core", { supported_features: 1 });
    const empty = context("update.install", keys, {}, [plain]);
    const hidden = unsupportedKeys(empty, buildQuickControls(empty));
    expect([...hidden].sort()).toEqual(["backup", "version"]);
    const saved = context("update.install", keys, { backup: true }, [plain]);
    expect([...unsupportedKeys(saved, buildQuickControls(saved))]).toEqual([
      "version",
    ]);
  });

  it("hides nothing when the targets are unknown", () => {
    const ctx = context("update.install", ["version"], {}, []);
    expect(unsupportedKeys(ctx, buildQuickControls(ctx)).size).toBe(0);
  });
});
