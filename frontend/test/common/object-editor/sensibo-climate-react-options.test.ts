import type { HassEntities } from "home-assistant-js-websocket";
import { describe, expect, it } from "vitest";
import { catalogueOptions } from "../../../src/common/object-editor/known-options-catalogue";
import { mergeKnownOptions } from "../../../src/common/object-editor/known-options";
import { sensiboClimateReactOptions } from "../../../src/common/object-editor/sensibo-climate-react-options";

const action = "sensibo.enable_climate_react";
const field = "high_temperature_state";
const fixture = (modes: unknown, second: unknown = modes) =>
  ({
    "climate.one": { attributes: { hvac_modes: modes } },
    "climate.two": { attributes: { hvac_modes: second } },
  }) as unknown as HassEntities;
const entities = {
  "climate.one": { platform: "sensibo" },
  "climate.two": { platform: "sensibo" },
};
const resolve = (states: HassEntities, ids = ["climate.one", "climate.two"]) =>
  sensiboClimateReactOptions(action, field, ids, states, entities);

describe("Sensibo climate-react named controls", () => {
  it("declares optional typed keys for exactly the two state dictionaries", () => {
    for (const name of [field, "low_temperature_state"]) {
      const options = catalogueOptions(action, name, (key) => key);
      expect(options.map((option) => option.key)).toEqual([
        "on",
        "targetTemperature",
        "temperatureUnit",
        "mode",
        "fanLevel",
        "swing",
        "horizontalSwing",
        "light",
      ]);
      expect(options.find((option) => option.key === "on")?.kind).toEqual({
        type: "boolean",
      });
      expect(
        options.find((option) => option.key === "targetTemperature")?.kind
      ).toEqual({ type: "number" });
      expect(
        options.find((option) => option.key === "temperatureUnit")?.kind
      ).toEqual({ type: "choice", choices: [{ value: "C" }, { value: "F" }] });
      expect(options.every((option) => option.default === undefined)).toBe(
        true
      );
      for (const key of ["fanLevel", "swing", "horizontalSwing", "light"]) {
        expect(options.find((option) => option.key === key)?.kind).toEqual({
          type: "text",
        });
      }
    }
    expect(catalogueOptions(action, "options", () => "")).toEqual([]);
    expect(catalogueOptions("other.action", field, () => "")).toEqual([]);
  });
  it("maps supported modes to raw values, intersects targets, and excludes off", () => {
    expect(
      resolve(
        fixture(
          ["off", "cool", "fan_only", "heat_cool", "cool"],
          ["heat_cool", "fan_only", "dry", "off"]
        ),
        ["climate.one", "climate.two", "climate.one"]
      )
    ).toEqual([
      {
        key: "mode",
        source: "declared",
        kind: {
          type: "choice",
          choices: [{ value: "fan" }, { value: "auto" }],
        },
      },
    ]);
  });
  it.each([
    undefined,
    null,
    [],
    ["off"],
    ["unknown"],
    ["constructor"],
    ["cool", 5],
  ])(
    "does not infer choices from incomplete or invalid metadata: %j",
    (modes) => {
      const states = fixture(["cool"]);
      states["climate.two"].attributes.hvac_modes = modes;
      expect(resolve(states)).toEqual([]);
    }
  );
  it("does not infer target identity or borrow choices from another integration", () => {
    const states = fixture(["cool"]);
    expect(
      sensiboClimateReactOptions(action, field, ["climate.one"], states, {})
    ).toEqual([]);
    expect(
      sensiboClimateReactOptions(action, field, ["climate.one"], states, {
        "climate.one": { platform: "other" },
      })
    ).toEqual([]);
    expect(resolve({})).toEqual([]);
    expect(resolve(states, [])).toEqual([]);
    expect(
      sensiboClimateReactOptions(
        "other.action",
        field,
        ["climate.one"],
        states,
        entities
      )
    ).toEqual([]);
  });
  it("excludes known non-applicable targets without losing compatible choices", () => {
    expect(
      sensiboClimateReactOptions(
        action,
        field,
        ["climate.one", "climate.two", "light.other"],
        fixture(["cool"], []),
        { ...entities, "climate.two": { platform: "other" } }
      )[0].kind
    ).toEqual({ type: "choice", choices: [{ value: "cool" }] });
  });
  it("refreshes choices from the supplied targets and states without mutating either", () => {
    const first = fixture(["cool"], ["heat"]);
    const snapshot = JSON.stringify(first);
    expect(resolve(first)).toEqual([]);
    expect(resolve(first, ["climate.two"])[0].kind).toEqual({
      type: "choice",
      choices: [{ value: "heat" }],
    });
    expect(resolve(fixture(["dry"]))[0].kind).toEqual({
      type: "choice",
      choices: [{ value: "dry" }],
    });
    expect(JSON.stringify(first)).toBe(snapshot);
  });
  it("merges verified choices without replacing localized labels or other key types", () => {
    const options = mergeKnownOptions(
      resolve(fixture(["cool"])),
      catalogueOptions(action, field, (key) => key)
    );
    expect(options.find((option) => option.key === "mode")?.label).toBe(
      "ui.components.object-editor.catalogue.sensibo_mode.label"
    );
    expect(options.find((option) => option.key === "mode")?.kind).toEqual({
      type: "choice",
      choices: [{ value: "cool" }],
    });
    expect(options).toHaveLength(8);
    expect(catalogueOptions("tts.speak", "options", () => "")).toHaveLength(5);
  });
});
