import { describe, expect, it } from "vitest";
import type {
  QuickContext,
  QuickControl,
  QuickEntity,
} from "../../../src/components/action-editors/descriptors";
import {
  applyControlValue,
  buildQuickControls,
  claimedKeys,
  coerceText,
  snapToStep,
} from "../../../src/components/action-editors/descriptors";
import {
  resolveActionEditor,
  TAILORED_DOMAINS,
} from "../../../src/components/action-editors/registry";

const entity = (
  entity_id: string,
  attributes: Record<string, unknown> = {}
): QuickEntity => ({ entity_id, state: "on", attributes });

const numberField = { selector: { number: { min: 0, max: 100 } } };

const context = (
  action: string,
  fieldKeys: string[],
  entities: QuickEntity[] = [],
  data: Record<string, unknown> = {},
  domainServices: string[] = []
): QuickContext => ({
  action,
  data,
  fields: Object.fromEntries(fieldKeys.map((key) => [key, numberField])),
  domainServices,
  entities,
});

const keys = (controls: QuickControl[]) => controls.map((c) => c.key);

describe("registry resolution", () => {
  it("marks registered domains as tailored and others as the generic form", () => {
    expect(resolveActionEditor("light.turn_on")?.kind).toBe("tailored");
    expect(resolveActionEditor("notify.mobile_app_phone")?.kind).toBe(
      "tailored"
    );
    expect(resolveActionEditor("vacuum.start")?.kind).toBe("tailored");
    expect(resolveActionEditor("persistent_notification.create")?.kind).toBe(
      "form"
    );
  });

  it("ignores actions without a domain and a service", () => {
    expect(resolveActionEditor(undefined)).toBeUndefined();
    expect(resolveActionEditor("")).toBeUndefined();
    expect(resolveActionEditor("light")).toBeUndefined();
    expect(resolveActionEditor("light.")).toBeUndefined();
  });

  it("covers every domain the brief names", () => {
    [
      "light",
      "climate",
      "cover",
      "media_player",
      "lock",
      "fan",
      "vacuum",
      "alarm_control_panel",
      "valve",
      "siren",
      "humidifier",
      "water_heater",
      "number",
      "input_number",
      "select",
      "input_select",
      "input_datetime",
      "input_text",
      "text",
      "input_boolean",
      "switch",
      "scene",
      "script",
      "notify",
      "button",
      "input_button",
      "timer",
      "counter",
    ].forEach((domain) => expect(TAILORED_DOMAINS).toContain(domain));
  });
});

describe("supported-feature gating", () => {
  const lightFields = [
    "brightness_pct",
    "color_temp_kelvin",
    "rgb_color",
    "transition",
  ];

  it("shows only brightness for a dimmable white light", () => {
    const light = entity("light.desk", {
      supported_color_modes: ["brightness"],
      supported_features: 0,
    });
    expect(
      keys(buildQuickControls(context("light.turn_on", lightFields, [light])))
    ).toEqual(["brightness_pct"]);
  });

  it("adds colour temperature, colours and transition when supported", () => {
    const light = entity("light.lamp", {
      supported_color_modes: ["color_temp", "hs"],
      supported_features: 32,
      min_color_temp_kelvin: 2200,
      max_color_temp_kelvin: 6000,
    });
    const controls = buildQuickControls(
      context("light.turn_on", lightFields, [light])
    );
    expect(keys(controls)).toEqual([
      "brightness_pct",
      "color_temp_kelvin",
      "rgb_color",
      "transition",
    ]);
    const kelvin = controls.find((c) => c.key === "color_temp_kelvin");
    expect(kelvin).toMatchObject({ kind: "slider", min: 2200, max: 6000 });
  });

  it("shows nothing for an on/off light", () => {
    const light = entity("light.plug", { supported_color_modes: ["onoff"] });
    expect(
      buildQuickControls(context("light.turn_on", lightFields, [light]))
    ).toEqual([]);
  });

  it("unions the options of several targeted entities", () => {
    const a = entity("climate.a", { hvac_modes: ["off", "heat"] });
    const b = entity("climate.b", { hvac_modes: ["heat", "cool"] });
    const controls = buildQuickControls(
      context("climate.set_hvac_mode", ["hvac_mode"], [a, b])
    );
    expect(controls[0]).toMatchObject({ kind: "tiles", key: "hvac_mode" });
    expect(
      (controls[0] as Extract<QuickControl, { kind: "tiles" }>).options.map(
        (option) => option.value
      )
    ).toEqual(["off", "heat", "cool"]);
  });

  it("bounds the climate stepper by the entity limits and step", () => {
    const thermostat = entity("climate.hall", {
      supported_features: 1,
      min_temp: 10,
      max_temp: 28,
      target_temp_step: 0.5,
    });
    const [stepper] = buildQuickControls(
      context("climate.set_temperature", ["temperature"], [thermostat])
    );
    expect(stepper).toMatchObject({
      kind: "stepper",
      min: 10,
      max: 28,
      step: 0.5,
    });
  });

  it("hides the climate range controls without the range feature", () => {
    const thermostat = entity("climate.hall", { supported_features: 1 });
    expect(
      keys(
        buildQuickControls(
          context(
            "climate.set_temperature",
            ["temperature", "target_temp_low", "target_temp_high"],
            [thermostat]
          )
        )
      )
    ).toEqual(["temperature"]);
  });

  it("only offers sibling tiles that the instance really provides", () => {
    const controls = buildQuickControls(
      context("cover.open_cover", [], [], {}, [
        "open_cover",
        "close_cover",
        "toggle",
      ])
    );
    expect(controls[0]).toMatchObject({
      kind: "services",
      value: "cover.open_cover",
      options: [
        { value: "cover.open_cover" },
        { value: "cover.close_cover" },
        { value: "cover.toggle" },
      ],
    });
  });

  it("warns before unlocking and before disarming", () => {
    const unlock = buildQuickControls(
      context("lock.unlock", ["code"], [], {}, ["lock", "unlock"])
    );
    expect(unlock.some((c) => c.kind === "notice")).toBe(true);
    const lock = buildQuickControls(
      context("lock.lock", ["code"], [], {}, ["lock", "unlock"])
    );
    expect(lock.some((c) => c.kind === "notice")).toBe(false);
    expect(
      buildQuickControls(
        context("alarm_control_panel.alarm_disarm", ["code"])
      ).some((c) => c.kind === "notice")
    ).toBe(true);
  });

  it("skips a control whose stored value is a template", () => {
    const controls = buildQuickControls(
      context("cover.set_cover_position", ["position"], [], {
        position: "{{ states('input_number.x') }}",
      })
    );
    expect(controls).toEqual([]);
  });

  it("scales the media volume slider to a percentage", () => {
    const [volume] = buildQuickControls(
      context("media_player.volume_set", ["volume_level"], [], {
        volume_level: 0.25,
      })
    );
    expect(volume).toMatchObject({ kind: "slider", scale: 100, value: 0.25 });
  });
});

describe("the generic rich form", () => {
  it("turns booleans, bounded numbers and short lists into rich controls", () => {
    const ctx: QuickContext = {
      action: "example.do_it",
      data: {},
      domainServices: ["do_it"],
      entities: [],
      fields: {
        loud: { selector: { boolean: {} } },
        level: { selector: { number: { min: 1, max: 5, step: 1 } } },
        size: { selector: { select: { options: ["small", "large"] } } },
        free: { selector: { number: { mode: "box" } } },
        many: {
          selector: {
            select: { options: Array.from({ length: 12 }, (_, i) => `v${i}`) },
          },
        },
        entity_id: { selector: { entity: {} } },
      },
    };
    const controls = buildQuickControls(ctx);
    expect(controls.map((c) => [c.key, c.kind])).toEqual([
      ["loud", "switch"],
      ["level", "slider"],
      ["size", "tiles"],
    ]);
  });

  it("leaves fields it cannot show richly to the existing selectors", () => {
    const ctx: QuickContext = {
      action: "example.do_it",
      data: {},
      domainServices: [],
      entities: [],
      fields: { blob: { selector: { object: {} } } },
    };
    expect(buildQuickControls(ctx)).toEqual([]);
  });

  it("lets a stored value outside the option list stay visible", () => {
    const ctx: QuickContext = {
      action: "example.do_it",
      data: { size: "huge" },
      domainServices: [],
      entities: [],
      fields: { size: { selector: { select: { options: ["small"] } } } },
    };
    const [tiles] = buildQuickControls(ctx);
    expect(
      (tiles as Extract<QuickControl, { kind: "tiles" }>).options.map(
        (o) => o.value
      )
    ).toEqual(["small", "huge"]);
  });

  it("gives scripts a rich form from their declared fields", () => {
    const ctx: QuickContext = {
      action: "script.goodnight",
      data: { delay_min: 5 },
      domainServices: ["goodnight"],
      entities: [],
      fields: { delay_min: numberField },
    };
    expect(buildQuickControls(ctx)[0]).toMatchObject({
      kind: "slider",
      value: 5,
    });
  });
});

describe("config round trip", () => {
  const roundTrip = (ctx: QuickContext, key: string, value: unknown) => {
    const next = applyControlValue(ctx.data, key, value) ?? {};
    // Code view is the JSON form of the same object.
    const restored = JSON.parse(JSON.stringify(next)) as Record<
      string,
      unknown
    >;
    return buildQuickControls({ ...ctx, data: restored });
  };

  it("keeps unknown keys and their order for every tailored editor", () => {
    const original = { zeta: 1, brightness_pct: 40, alpha: { nested: true } };
    const ctx = context("light.turn_on", ["brightness_pct"], [], original);
    const next = applyControlValue(original, "brightness_pct", 80)!;
    expect(Object.keys(next)).toEqual(["zeta", "brightness_pct", "alpha"]);
    expect(next.alpha).toEqual({ nested: true });
    const controls = roundTrip(ctx, "brightness_pct", 80);
    expect(controls[0]).toMatchObject({ value: 80 });
  });

  it("rebuilds the same controls from code view for each tailored value", () => {
    const cases: [string, string, unknown, string[]][] = [
      ["climate.set_temperature", "temperature", 21.5, ["temperature"]],
      ["cover.set_cover_position", "position", 30, ["position"]],
      ["media_player.volume_set", "volume_level", 0.4, ["volume_level"]],
      ["fan.set_percentage", "percentage", 66, ["percentage"]],
      ["humidifier.set_humidity", "humidity", 55, ["humidity"]],
      ["number.set_value", "value", 7, ["value"]],
      ["scene.turn_on", "transition", 3, ["transition"]],
    ];
    cases.forEach(([action, key, value, fields]) => {
      const entities =
        action === "climate.set_temperature"
          ? [entity("climate.x", { supported_features: 1 })]
          : action === "fan.set_percentage"
            ? [entity("fan.x", { supported_features: 1 })]
            : [];
      const controls = roundTrip(
        context(action, fields, entities, {}),
        key,
        value
      );
      expect(controls[0], action).toMatchObject({ key, value });
    });
  });

  it("round trips text values, colours and switches", () => {
    const ctx = context("notify.notify", ["title", "message"], [], {});
    const withTitle = roundTrip(ctx, "title", "Hello");
    expect(withTitle[0]).toMatchObject({ kind: "text", value: "Hello" });
    const light = context("light.turn_on", ["rgb_color"], [], {});
    const colour = roundTrip(light, "rgb_color", [255, 0, 0]);
    expect(colour[0]).toMatchObject({ kind: "swatches", value: [255, 0, 0] });
  });

  it("removes the key when a control is cleared and returns the same object when nothing changes", () => {
    const data = { a: 1, b: 2 };
    expect(applyControlValue(data, "a", undefined)).toEqual({ b: 2 });
    expect(applyControlValue(data, "missing", undefined)).toBe(data);
    expect(applyControlValue(data, "a", 1)).toBe(data);
    expect(applyControlValue(undefined, "a", undefined)).toBeUndefined();
  });

  it("claims only the keys it shows", () => {
    const controls = buildQuickControls({
      ...context("light.turn_on", ["brightness_pct"], [], {}),
      fields: {
        brightness_pct: numberField,
        flash: { selector: { object: {} } },
      },
    });
    expect([...claimedKeys(controls)]).toEqual(["brightness_pct"]);
  });

  it("keeps the stored type in text boxes", () => {
    expect(coerceText("12", 5)).toBe(12);
    expect(coerceText("abc", 5)).toBe("abc");
    expect(coerceText("true", false)).toBe(true);
    expect(coerceText("", "x")).toBeUndefined();
  });

  it("snaps values to bounds and step without float noise", () => {
    expect(snapToStep(21.26, 10, 30, 0.5)).toBe(21.5);
    expect(snapToStep(99, 10, 30, 0.5)).toBe(30);
    expect(snapToStep(-3, 0, 1, 0.1)).toBe(0);
    expect(snapToStep(0.3, 0, 1, 0.1)).toBe(0.3);
  });
});
