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
  it("presents a saved Number value with shared bounds without rewriting it", async () => {
    const element = await mount({});
    element.hass = {
      ...element.hass,
      services: {
        number: {
          set_value: {
            fields: { value: { required: true, selector: { text: {} } } },
            target: { entity: { domain: "number" } },
          },
        },
      },
      states: {
        "number.first": { attributes: { min: 0, max: 20, step: 1 } },
        "number.second": { attributes: { min: 5, max: 15, step: 0.5 } },
      },
    } as unknown as HomeAssistant;
    const target = { entity_id: ["number.first", "number.second"] };
    element.value = {
      action: "number.set_value",
      target,
      data: { value: "08.0" },
    };
    await element.updateComplete;
    const selector = Array.from(
      element.shadowRoot!.querySelectorAll("ha-selector")
    ).find((field) => Reflect.get(field, "key") === "value")!;
    expect(selector.selector).toEqual({
      number: { min: 5, max: 15, mode: "box", step: "any" },
    });
    expect(selector.value).toBe(8);
    expect(element.value!.data!.value).toBe("08.0");
    const edits = vi.fn();
    element.addEventListener("value-changed", edits);
    selector.dispatchEvent(
      new CustomEvent("value-changed", { detail: { value: 9 } })
    );
    expect(edits.mock.calls[0][0].detail.value).toEqual({
      action: "number.set_value",
      target,
      data: { value: 9 },
    });
  });

  it("keeps legacy date text and templates beside native dates", async () => {
    const element = await mount({});
    element.hass = {
      ...element.hass,
      services: {
        google: {
          create_event: {
            fields: {
              start_date: { selector: { text: {} } },
              end_date: { selector: { text: {} } },
              end_date_time: { selector: { text: {} } },
            },
            target: { entity: { domain: "calendar" } },
          },
        },
      },
    } as unknown as HomeAssistant;
    const data = {
      start_date: "2026-11-13",
      end_date: "2026-11-4",
      end_date_time: "{{ end }}",
    };
    element.value = { action: "google.create_event", data };
    await element.updateComplete;
    const fields = new Map(
      Array.from(element.shadowRoot!.querySelectorAll("ha-selector")).map(
        (field) => [Reflect.get(field, "key"), field.selector]
      )
    );
    expect(fields.get("start_date")).toEqual({ date: {} });
    expect(fields.get("end_date")).toEqual({ text: {} });
    expect(fields.get("end_date_time")).toEqual({ template: null });
    expect(element.value!.data).toEqual(data);
  });

  it("gives a filtered action field only the targets that support it", async () => {
    const element = await mount({});
    element.hass = {
      ...element.hass,
      services: {
        light: {
          turn_on: {
            fields: {
              effect: {
                selector: { state: { attribute: "effect" } },
                filter: { supported_features: [4] },
              },
            },
            target: { entity: { domain: "light" } },
          },
        },
      },
      states: {
        "light.effect": {
          attributes: { supported_features: 4, effect_list: ["rainbow"] },
        },
        "light.basic": { attributes: { supported_features: 0 } },
      },
    } as unknown as HomeAssistant;
    element.value = {
      action: "light.turn_on",
      target: { entity_id: ["light.effect", "light.basic"] },
      data: { effect: "rainbow" },
    };
    await element.updateComplete;
    const effect = Array.from(
      element.shadowRoot!.querySelectorAll("ha-selector")
    ).find((item) => Reflect.get(item, "key") === "effect");
    expect(effect?.context).toMatchObject({
      filter_entity: ["light.effect"],
      common_options_only: true,
    });
    expect(effect?.value).toBe("rainbow");
  });

  it("emits the calendar offset in its original service field", async () => {
    const element = await mount({});
    element.hass = {
      ...element.hass,
      services: {
        calendar: {
          create_event: { fields: { in: { selector: { object: {} } } } },
        },
      },
    } as HomeAssistant;
    element.value = {
      action: "calendar.create_event",
      data: { in: { days: 1 } },
    };
    await element.updateComplete;
    const adapter = element.shadowRoot!.querySelector(
      "ha-action-field-adapter"
    )!;
    expect(adapter.kind).toBe("calendar-offset");
    const changed = vi.fn();
    element.addEventListener("value-changed", changed);
    adapter.dispatchEvent(
      new CustomEvent("value-changed", { detail: { value: { weeks: 2 } } })
    );
    expect(changed).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          value: {
            action: "calendar.create_event",
            data: { in: { weeks: 2 } },
          },
        },
      })
    );
  });

  it("keeps the visual calendar controls when an optional offset is enabled", async () => {
    const element = await mount({});
    element.hass = {
      ...element.hass,
      services: {
        calendar: {
          create_event: { fields: { in: { selector: { object: {} } } } },
        },
      },
    } as HomeAssistant;
    element.value = { action: "calendar.create_event" };
    await element.updateComplete;
    element.addEventListener("value-changed", (event) => {
      element.value = event.detail.value;
    });
    const adapter = element.shadowRoot!.querySelector(
      "ha-action-field-adapter"
    )!;
    expect(adapter.disabled).toBe(true);
    const toggle = Array.from(
      element.shadowRoot!.querySelectorAll("ha-switch")
    ).find((candidate) => Reflect.get(candidate, "key") === "in")!;
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
    await element.updateComplete;
    expect(element.value?.data?.in).toEqual({ days: 0 });
    expect(adapter.disabled).toBe(false);
    expect(adapter.kind).toBe("calendar-offset");
  });

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
  it("shows only the target picker for an action with no declared settings", async () => {
    const element = await mount({}, {} as never);
    element.hass = {
      ...element.hass,
      services: {
        media_player: {
          media_next_track: {
            fields: {},
            target: {
              entity: { domain: "media_player", supported_features: [32] },
            },
          },
        },
      },
    } as unknown as HomeAssistant;
    element.value = { action: "media_player.media_next_track", data: {} };
    await element.updateComplete;
    expect(
      element.shadowRoot!.querySelector(".target-selector")
    ).not.toBeNull();
    expect(element.shadowRoot!.querySelector("ha-selector-object")).toBeNull();
    element.value = {
      action: "media_player.media_next_track",
      data: { legacy: 1 },
    };
    await element.updateComplete;
    expect(
      element.shadowRoot!.querySelector("ha-selector-object")
    ).not.toBeNull();
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

describe("legacy play media selection", () => {
  const mountMedia = async (
    data: Record<string, unknown>,
    action = "play_media",
    fields: Record<string, unknown> = {
      media: { required: true, selector: { media: {} } },
    }
  ) => {
    const element = await mount({});
    element.hass = {
      ...element.hass,
      services: {
        media_player: {
          [action]: { fields, target: { entity: { domain: "media_player" } } },
        },
      },
    } as never;
    element.value = {
      action: `media_player.${action}`,
      target: { entity_id: ["media_player.room"] },
      data,
    };
    await element.updateComplete;
    return element;
  };
  const field = (element: HaServiceControl, key: string) =>
    [...element.shadowRoot!.querySelectorAll("ha-selector")].find(
      (node) => (node as unknown as { key?: string }).key === key
    ) as HTMLElement & { value: unknown; selector: unknown; context: unknown };
  const change = (element: HTMLElement, value: unknown) =>
    element.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: { value },
        bubbles: true,
        composed: true,
      })
    );

  it("uses the existing media control once without rewriting legacy values on render", async () => {
    const data = {
      media_content_id: "https://example.test/music.mp3",
      media_content_type: "music",
      extra: { unchanged: true },
    };
    const element = await mountMedia(data);
    expect(field(element, "media").selector).toEqual({ media: {} });
    expect(field(element, "media").value).toEqual({
      media_content_id: data.media_content_id,
      media_content_type: "music",
    });
    expect(field(element, "media").context).toMatchObject({
      filter_entity: ["media_player.room"],
    });
    expect(element.value!.data).toEqual(data);
    const additional = element.shadowRoot!.querySelector(
      "ha-selector-object"
    ) as HTMLElement & { value: unknown; reservedKeys: string[] };
    expect(additional.value).toEqual({ extra: { unchanged: true } });
    expect(additional.reservedKeys).toContain("media_content_id");
  });

  it("updates both split fields atomically while retaining target and unrelated data", async () => {
    const element = await mountMedia({
      media_content_id: "old",
      media_content_type: "music",
      volume: 0.5,
    });
    let next: unknown;
    element.addEventListener("value-changed", (event) => {
      next = (event as CustomEvent).detail.value;
    });
    change(field(element, "media"), {
      media_content_id: "media-source://music/new",
      media_content_type: "audio/mpeg",
      metadata: { title: "New", browse_entity_id: "media_player.room" },
    });
    expect(next).toEqual({
      action: "media_player.play_media",
      target: { entity_id: ["media_player.room"] },
      data: {
        media_content_id: "media-source://music/new",
        media_content_type: "audio/mpeg",
        volume: 0.5,
      },
    });
  });

  it("does not clear saved media when changing only the browse player", async () => {
    const element = await mountMedia({
      media_content_id: "old",
      media_content_type: "music",
    });
    const changes = vi.fn();
    element.addEventListener("value-changed", changes);
    change(field(element, "media"), {
      media_content_id: "",
      media_content_type: "",
      metadata: { browse_entity_id: "media_player.room" },
    });
    expect(changes).not.toHaveBeenCalled();
    expect(element.value!.data).toEqual({
      media_content_id: "old",
      media_content_type: "music",
    });
  });

  it("keeps existing nested media intact and does not treat container fields as playable media", async () => {
    const nested = { media_content_id: "nested", media_content_type: "music" };
    const element = await mountMedia({
      media: nested,
      media_content_id: "passthrough",
    });
    expect(field(element, "media").value).toBe(nested);
    const browse = await mountMedia({}, "browse_media", {
      media_content_id: { selector: { text: {} } },
      media_content_type: { selector: { text: {} } },
    });
    expect(field(browse, "media_content_id").selector).toEqual({ text: {} });
    expect(field(browse, "media")).toBeUndefined();
  });

  it("leaves template and unsupported legacy values in the dictionary route", async () => {
    const data = {
      media_content_id: "{{ media }}",
      media_content_type: "music",
    };
    const element = await mountMedia(data);
    const additional = element.shadowRoot!.querySelector(
      "ha-selector-object"
    ) as HTMLElement & { value: unknown };
    expect(additional.value).toEqual(data);
    expect(element.value!.data).toEqual(data);
  });
});
