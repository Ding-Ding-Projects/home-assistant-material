import { afterEach, describe, expect, it, vi } from "vitest";
import type { HomeAssistant } from "../../src/types";
import type { HaServiceControl } from "../../src/components/ha-service-control";
import "../../src/components/ha-service-control";

vi.mock("../../src/components/ha-markdown", () => {
  customElements.define("ha-markdown", class extends HTMLElement {});
  return {};
});
vi.mock("../../src/data/integration", () => ({
  fetchIntegrationManifest: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../src/components/ha-selector/ha-selector-object", () => {
  customElements.define("ha-selector-object", class extends HTMLElement {});
  return {};
});
vi.mock("../../src/components/ha-selector/ha-selector", () => {
  customElements.define("ha-selector", class extends HTMLElement {});
  return {};
});
vi.mock("../../src/components/ha-service-picker", () => {
  customElements.define("ha-service-picker", class extends HTMLElement {});
  return {};
});

const mount = async (
  data: Record<string, unknown>,
  fields = {
    options: { selector: { object: null } },
    message: { selector: { text: null } },
  }
) => {
  const element = document.createElement(
    "ha-service-control"
  ) as HaServiceControl;
  element.hass = {
    localize: (key: string) => key,
    language: "en",
    services: { tts: { speak: { fields } } },
    states: {},
    entities: {},
    areas: {},
    devices: {},
    floors: {},
    labels: {},
    loadBackendTranslation: vi.fn(),
  } as unknown as HomeAssistant;
  element.value = { action: "tts.speak", data };
  document.body.append(element);
  await element.updateComplete;
  return element;
};
afterEach(() => {
  document.body.innerHTML = "";
});

describe("service action dictionaries", () => {
  it("keeps declared fields beside additional data instead of replacing them with YAML", async () => {
    const element = await mount({
      options: { voice: "legacy" },
      vendor: { nested: true },
    });
    expect(element.shadowRoot!.querySelectorAll("ha-selector").length).toBe(2);
    expect(element.shadowRoot!.querySelector("ha-yaml-editor")).toBeNull();
    const dictionary = element.shadowRoot!.querySelector(
      "ha-selector-object"
    ) as HTMLElement & { value: unknown };
    expect(dictionary.value).toEqual({ vendor: { nested: true } });
  });
  it("edits additional data without overwriting declared field values", async () => {
    const element = await mount({ options: { voice: "legacy" }, vendor: 1 });
    const changes: unknown[] = [];
    element.addEventListener("value-changed", (ev) =>
      changes.push((ev as CustomEvent).detail.value)
    );
    element.shadowRoot!.querySelector("ha-selector-object")!.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: { value: { vendor: 2 } },
        bubbles: true,
        composed: true,
      })
    );
    expect(changes[changes.length - 1]).toEqual({
      action: "tts.speak",
      data: { options: { voice: "legacy" }, vendor: 2 },
    });
  });
  it("uses the visual whole-map fallback for selectorless service metadata", async () => {
    const element = await mount({ vendor: [0, false, null] }, {} as never);
    expect(element.shadowRoot!.querySelector("ha-yaml-editor")).toBeNull();
    const dictionary = element.shadowRoot!.querySelector(
      "ha-selector-object"
    ) as HTMLElement & { value: unknown };
    expect(dictionary.value).toEqual({ vendor: [0, false, null] });
  });
  it("persists an empty dictionary when enabling an optional object field", async () => {
    const element = await mount({});
    let next: unknown;
    element.addEventListener("value-changed", (ev) => {
      next = (ev as CustomEvent).detail.value;
    });
    const toggle = element.shadowRoot!.querySelector(
      "ha-switch"
    ) as HTMLElement & { checked: boolean };
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
    expect(next).toEqual({ action: "tts.speak", data: { options: {} } });
  });
});

describe("fallback dictionary ownership", () => {
  it("keeps legacy entity_id in one editor and preserves it during whole-map edits", async () => {
    const element = await mount({ entity_id: "media_player.room", vendor: 1 }, {
      entity_id: { description: "Target" },
      vendor: {},
    } as never);
    const dictionary = element.shadowRoot!.querySelector(
      "ha-selector-object"
    ) as HTMLElement & { value: unknown; reservedKeys: string[] };
    expect(
      element.shadowRoot!.querySelectorAll("ha-entity-picker").length
    ).toBe(1);
    expect(dictionary.value).toEqual({ vendor: 1 });
    expect(dictionary.reservedKeys).toContain("entity_id");
    let next: unknown;
    element.addEventListener("value-changed", (event) => {
      next = (event as CustomEvent).detail.value;
    });
    dictionary.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: { value: { vendor: 2 } },
        bubbles: true,
        composed: true,
      })
    );
    expect(next).toEqual({
      action: "tts.speak",
      data: { entity_id: "media_player.room", vendor: 2 },
    });
  });

  it("filters suggested selectorless fields by the current target capabilities", async () => {
    const element = await mount({ advanced_options: { saved: true } }, {
      message: { selector: { text: null } },
      advanced_options: { filter: { supported_features: [1] } },
    } as never);
    element.hass = {
      ...element.hass,
      states: {
        "sensor.test": {
          entity_id: "sensor.test",
          state: "on",
          attributes: { supported_features: 0 },
        },
      },
    } as never;
    element.value = { ...element.value!, target: { entity_id: "sensor.test" } };
    await element.updateComplete;
    let dictionary = element.shadowRoot!.querySelector(
      "ha-selector-object"
    ) as HTMLElement & { value: unknown; manualOptions: { key: string }[] };
    expect(dictionary.manualOptions).toEqual([]);
    expect(dictionary.value).toEqual({ advanced_options: { saved: true } });
    element.hass = {
      ...element.hass,
      states: {
        "sensor.test": {
          entity_id: "sensor.test",
          state: "on",
          attributes: { supported_features: 1 },
        },
      },
    } as never;
    await element.updateComplete;
    dictionary = element.shadowRoot!.querySelector(
      "ha-selector-object"
    ) as typeof dictionary;
    expect(dictionary.manualOptions.map((option) => option.key)).toContain(
      "advanced_options"
    );
  });
});
