import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { load } from "js-yaml";
import {
  buildQuickControls,
  type QuickContext,
  type QuickControl,
  type QuickEntity,
} from "../../../src/components/action-editors/descriptors";
import {
  ENTITY_DOMAIN_SERVICES,
  SYSTEM_DOMAIN_SERVICES,
} from "../../../src/components/action-editors/inventory";
import {
  componentFor,
  KEY_VALUE_TYPE,
  REQUIRED_COMPONENT,
} from "../../../src/components/action-editors/quick-rich";
import {
  hasTailoredService,
  TAILORED_DOMAINS,
} from "../../../src/components/action-editors/registry";

const everyDomain = { ...ENTITY_DOMAIN_SERVICES, ...SYSTEM_DOMAIN_SERVICES };

describe("entity coverage", () => {
  it("has a tailored editor for every service of every entity and system domain", () => {
    const missing: string[] = [];
    Object.entries(everyDomain).forEach(([domain, services]) => {
      if (!TAILORED_DOMAINS.includes(domain)) {
        missing.push(`${domain} (whole domain)`);
        return;
      }
      services.forEach((service) => {
        if (!hasTailoredService(domain, service)) {
          missing.push(`${domain}.${service}`);
        }
      });
    });
    expect(missing).toEqual([]);
  });

  it("lists the hand-written entity domains this Core is known to have", () => {
    // Written out by hand so a mistake in the generated inventory cannot hide
    // a domain: every one of these must be in the inventory.
    [
      "alarm_control_panel",
      "assist_satellite",
      "button",
      "calendar",
      "camera",
      "climate",
      "conversation",
      "cover",
      "date",
      "datetime",
      "device_tracker",
      "fan",
      "humidifier",
      "image",
      "lawn_mower",
      "light",
      "lock",
      "media_player",
      "notify",
      "number",
      "remote",
      "scene",
      "select",
      "siren",
      "switch",
      "text",
      "time",
      "todo",
      "tts",
      "update",
      "vacuum",
      "valve",
      "water_heater",
      "weather",
      "input_boolean",
      "input_button",
      "input_datetime",
      "input_number",
      "input_select",
      "input_text",
      "counter",
      "timer",
      "schedule",
      "group",
      "person",
      "zone",
      "homeassistant",
      "automation",
      "script",
      "persistent_notification",
      "logbook",
      "system_log",
      "recorder",
      "backup",
      "shopping_list",
      "frontend",
    ].forEach((domain) => expect(everyDomain, domain).toHaveProperty(domain));
  });

  const components = resolve(
    __dirname,
    "../../../../core/homeassistant/components"
  );

  it.skipIf(!existsSync(components))(
    "matches the services.yaml files of this Core",
    () => {
      const mismatches: string[] = [];
      Object.entries(everyDomain).forEach(([domain, services]) => {
        const file = resolve(components, domain, "services.yaml");
        if (!existsSync(file)) {
          mismatches.push(`${domain}: no services.yaml`);
          return;
        }
        const doc = (load(readFileSync(file, "utf8")) ?? {}) as Record<
          string,
          unknown
        >;
        const actual = Object.keys(doc).filter(
          (name) => !name.startsWith(".") && !name.startsWith("_")
        );
        const extra = actual.filter((name) => !services.includes(name));
        const gone = services.filter((name) => !actual.includes(name));
        if (extra.length || gone.length) {
          mismatches.push(
            `${domain}: new [${extra.join(",")}] removed [${gone.join(",")}]`
          );
        }
      });
      expect(mismatches).toEqual([]);
    }
  );

  it.skipIf(!existsSync(components))(
    "knows every entity domain that registers entity services",
    () => {
      const known = new Set(Object.keys(everyDomain));
      // Integrations that happen to register entity services but are not an
      // entity domain people build automations around.
      const integrationOnly = new Set(["remember_the_milk"]);
      const unknown = readdirSync(components).filter((name) => {
        const init = resolve(components, name, "__init__.py");
        if (!existsSync(resolve(components, name, "services.yaml"))) {
          return false;
        }
        if (!existsSync(init) || known.has(name) || integrationOnly.has(name)) {
          return false;
        }
        const text = readFileSync(init, "utf8");
        return (
          /EntityComponent\b/.test(text) &&
          /async_register_entity_service/.test(text)
        );
      });
      expect(unknown).toEqual([]);
    }
  );
});

/**
 * A context where every field exists and every targeted entity supports
 * everything, so a builder cannot hide a control behind a gate.
 */
const everything = (action: string): QuickContext => {
  const entity: QuickEntity = {
    entity_id: "x.y",
    state: "on",
    attributes: {
      supported_features: 2 ** 20 - 1,
      supported_color_modes: ["rgbww", "rgbw", "xy", "hs", "color_temp"],
      min_color_temp_kelvin: 2000,
      max_color_temp_kelvin: 6500,
      effect_list: ["a", "b"],
      hvac_modes: ["heat", "cool"],
      preset_modes: ["eco"],
      fan_modes: ["low"],
      swing_modes: ["on"],
      options: ["one", "two"],
      source_list: ["tv"],
      sound_mode_list: ["movie"],
      fan_speed_list: ["max"],
      available_modes: ["auto"],
      operation_list: ["eco"],
      activity_list: ["watch"],
    },
  };
  return {
    action,
    data: {},
    // Every field name exists.
    fields: new Proxy(
      {},
      {
        has: () => true,
        get: () => ({ selector: { text: {} } }),
      }
    ) as QuickContext["fields"],
    domainServices: [],
    entities: [entity],
    engines: {
      "x.y": {
        languages: ["en", "yue"],
        options: ["voice"],
        commonOptions: ["preferred_format"],
      },
    },
  };
};

const allControls = (): { action: string; control: QuickControl }[] =>
  Object.entries(everyDomain).flatMap(([domain, services]) =>
    services.flatMap((service) =>
      buildQuickControls(everything(`${domain}.${service}`)).map((control) => ({
        action: `${domain}.${service}`,
        control,
      }))
    )
  );

describe("rich components for typed values", () => {
  it("renders every colour, temperature, time, date, duration, icon and entity by its own component", () => {
    const offenders: string[] = [];
    allControls().forEach(({ action, control }) => {
      if (control.kind === "notice" || control.kind === "services") return;
      const valueType =
        control.kind === "selector"
          ? control.valueType
          : control.kind === "color"
            ? "color"
            : control.kind === "duration"
              ? "duration"
              : control.kind === "time" ||
                  control.kind === "date" ||
                  control.kind === "datetime"
                ? control.kind
                : control.kind === "entities"
                  ? "entity"
                  : KEY_VALUE_TYPE[control.key];
      const required = valueType ? REQUIRED_COMPONENT[valueType] : undefined;
      if (required && !required.includes(componentFor(control))) {
        offenders.push(
          `${action} ${control.key} is ${valueType} but renders as ${control.kind} (${componentFor(control)})`
        );
      }
    });
    expect(offenders).toEqual([]);
  });

  it("walks a real set of controls, so the check above is not empty", () => {
    const kinds = new Set(allControls().map(({ control }) => control.kind));
    [
      "color",
      "duration",
      "selector",
      "entities",
      "options",
      "time",
      "datetime",
    ].forEach((kind) => expect(kinds.has(kind as never), kind).toBe(true));
  });

  it("never gives a typed key a plain text box, number box or slider", () => {
    const plain = new Set(["text", "slider", "stepper", "tiles", "switch"]);
    const offenders = allControls()
      .filter(
        ({ control }) =>
          plain.has(control.kind) && control.key in KEY_VALUE_TYPE
      )
      .map(
        ({ action, control }) => `${action} ${control.key} (${control.kind})`
      );
    expect(offenders).toEqual([]);
  });

  it("keeps the element honest: each typed kind renders through its component", () => {
    const source = readFileSync(
      resolve(
        __dirname,
        "../../../src/components/action-editors/ha-action-quick-controls.ts"
      ),
      "utf8"
    );
    expect(source).toContain("<ha-hs-color-picker");
    expect(source).toContain("<ha-duration-input");
    expect(source).toContain("<ha-selector");
    // No native range or number boxes in place of the tree's components.
    expect(source).not.toMatch(/type="(range|number)"/);
    expect(source).not.toMatch(/<input\b/);
  });
});
