import type { HassEntity } from "home-assistant-js-websocket";
import { describe, expect, it } from "vitest";
import { isRiskyEntity, quickControlFor } from "../../src/data/quick-control";

// Protects the decision of which control is shown in place for an entity:
// a wrong answer either hides a control people expect, or shows a control
// for a risky thing without the confirmation it needs.

const entity = (
  entity_id: string,
  state: string,
  attributes: Record<string, unknown> = {}
): HassEntity => ({
  entity_id,
  state,
  attributes,
  last_changed: "",
  last_updated: "",
  context: { id: "", parent_id: null, user_id: null },
});

describe("quickControlFor", () => {
  it("gives a plain light a toggle", () => {
    const control = quickControlFor(
      entity("light.porch", "off", { supported_color_modes: ["onoff"] })
    );
    expect(control.kind).toBe("toggle");
    expect(control.toggle?.on).toBe(false);
    expect(control.risky).toBe(false);
  });

  it("gives a dimmable light a brightness slider beside its toggle", () => {
    const control = quickControlFor(
      entity("light.hall", "on", {
        supported_color_modes: ["brightness"],
        brightness: 158,
      })
    );
    expect(control.kind).toBe("slider");
    expect(control.toggle?.on).toBe(true);
    expect(control.slider?.value).toBe(62);
    expect(control.slider?.field).toBe("brightness_pct");
  });

  it("gives a colour light a colour button", () => {
    const control = quickControlFor(
      entity("light.desk", "on", {
        supported_color_modes: ["hs"],
        brightness: 255,
      })
    );
    expect(control.kind).toBe("colour");
    expect(control.colour).toBe(true);
    expect(control.slider?.value).toBe(100);
  });

  it("gives a fan with speeds a percentage slider using its step", () => {
    const control = quickControlFor(
      entity("fan.bed", "on", {
        supported_features: 1,
        percentage: 66,
        percentage_step: 33.33,
      })
    );
    expect(control.kind).toBe("slider");
    expect(control.slider?.service).toEqual({
      domain: "fan",
      service: "set_percentage",
    });
    expect(control.slider?.step).toBeCloseTo(33.33);
  });

  it("gives a fan without speeds a toggle", () => {
    expect(quickControlFor(entity("fan.plug", "off")).kind).toBe("toggle");
  });

  it("toggles switches, helpers, automations and humidifiers", () => {
    for (const id of [
      "switch.plug",
      "input_boolean.guest",
      "automation.lights",
      "humidifier.room",
    ]) {
      expect(quickControlFor(entity(id, "on")).kind).toBe("toggle");
    }
  });

  it("presses buttons, scenes and scripts, even before a first press", () => {
    expect(quickControlFor(entity("button.restart", "unknown")).kind).toBe(
      "press"
    );
    expect(quickControlFor(entity("input_button.ring", "unknown")).kind).toBe(
      "press"
    );
    expect(
      quickControlFor(entity("scene.evening", "2026-11-20T10:00:00")).press
        ?.service
    ).toEqual({ domain: "scene", service: "turn_on" });
    expect(quickControlFor(entity("script.bed", "off")).kind).toBe("press");
  });

  it("uses the cover position when there is one", () => {
    const control = quickControlFor(
      entity("cover.blind", "open", {
        // Open, close and set position.
        supported_features: 7,
        current_position: 40,
      })
    );
    expect(control.kind).toBe("slider");
    expect(control.slider?.value).toBe(40);
  });

  it("never gives a garage door a slider, and marks it risky", () => {
    const control = quickControlFor(
      entity("cover.garage", "closed", {
        device_class: "garage",
        // Open, close and set position.
        supported_features: 7,
        current_position: 0,
      })
    );
    expect(control.kind).toBe("toggle");
    expect(control.risky).toBe(true);
    expect(control.toggle?.nextAction).toBe("open");
  });

  it("gives a playing media player a volume slider on a 0 to 100 scale", () => {
    const control = quickControlFor(
      entity("media_player.kitchen", "playing", {
        supported_features: 4,
        volume_level: 0.35,
      })
    );
    expect(control.kind).toBe("slider");
    expect(control.slider?.value).toBe(35);
    expect(control.slider?.scale).toBe(100);
  });

  it("uses the number's own range and step", () => {
    const control = quickControlFor(
      entity("input_number.target", "21.5", { min: 10, max: 30, step: 0.5 })
    );
    expect(control.slider).toMatchObject({
      min: 10,
      max: 30,
      step: 0.5,
      value: 21.5,
    });
  });

  it("gives a thermostat a stepper for its target temperature", () => {
    const control = quickControlFor(
      entity("climate.living", "heat", {
        supported_features: 1,
        temperature: 20,
        min_temp: 7,
        max_temp: 30,
        target_temp_step: 0.5,
      })
    );
    expect(control.kind).toBe("slider");
    expect(control.slider?.stepper).toBe(true);
    expect(control.slider?.value).toBe(20);
  });

  it("shows only the value of a thermostat set to a range", () => {
    expect(
      quickControlFor(
        entity("climate.living", "heat_cool", {
          supported_features: 2,
          target_temp_low: 18,
          target_temp_high: 24,
        })
      ).kind
    ).toBe("value");
  });

  it("offers the options of a select", () => {
    const control = quickControlFor(
      entity("input_select.mode", "Home", { options: ["Home", "Away"] })
    );
    expect(control.kind).toBe("select");
    expect(control.select?.options).toEqual(["Home", "Away"]);
  });

  it("shows only the value of read-only kinds", () => {
    for (const id of [
      "sensor.temperature",
      "binary_sensor.door",
      "weather.home",
      "sun.sun",
      "person.alex",
      "zone.home",
    ]) {
      expect(quickControlFor(entity(id, "21.4")).kind).toBe("value");
    }
  });

  it("shows no control when unavailable or unknown", () => {
    expect(quickControlFor(entity("switch.plug", "unavailable"))).toMatchObject(
      { kind: "none", reason: "unavailable" }
    );
    expect(quickControlFor(entity("switch.plug", "unknown"))).toMatchObject({
      kind: "none",
      reason: "unknown",
    });
    expect(quickControlFor(entity("button.restart", "unavailable")).kind).toBe(
      "none"
    );
  });

  it("asks first for locks, alarms, valves and sirens", () => {
    const lock = quickControlFor(entity("lock.front", "locked"));
    expect(lock).toMatchObject({ kind: "toggle", risky: true });
    expect(lock.toggle?.nextAction).toBe("unlock");
    expect(
      quickControlFor(entity("alarm_control_panel.home", "armed_away")).toggle
        ?.nextAction
    ).toBe("disarm");
    expect(quickControlFor(entity("valve.water", "open")).risky).toBe(true);
    expect(quickControlFor(entity("siren.hall", "off")).risky).toBe(true);
  });
});

describe("isRiskyEntity", () => {
  it("marks only covers that secure the home", () => {
    expect(
      isRiskyEntity(entity("cover.gate", "closed", { device_class: "gate" }))
    ).toBe(true);
    expect(
      isRiskyEntity(entity("cover.door", "closed", { device_class: "door" }))
    ).toBe(true);
    expect(
      isRiskyEntity(entity("cover.blind", "closed", { device_class: "blind" }))
    ).toBe(false);
  });

  it("leaves ordinary things alone", () => {
    expect(isRiskyEntity(entity("light.hall", "on"))).toBe(false);
    expect(isRiskyEntity(entity("switch.plug", "on"))).toBe(false);
  });
});
