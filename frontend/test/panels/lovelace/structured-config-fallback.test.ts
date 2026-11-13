import { describe, expect, it } from "vitest";
import { render } from "lit";
import {
  dashboardFieldSelector,
  editableConfig,
  isConfigRecord,
  restoreOpaqueConfig,
  HuiStructuredConfigEditor,
} from "../../../src/panels/lovelace/editor/config-elements/hui-structured-config-editor";
import { HuiElementEditor } from "../../../src/panels/lovelace/editor/hui-element-editor";
import type { HomeAssistant } from "../../../src/types";

class FallbackHost extends HuiElementEditor {
  public load() {
    return this.loadConfigElement();
  }
  public editor() {
    return this._configElement;
  }
  public native?: any;
  protected async getConfigElement() {
    return this.native;
  }
}
customElements.define("test-dashboard-fallback-host", FallbackHost);
const hass = { localize: (key: string) => key } as unknown as HomeAssistant;

describe("dashboard structured fallback", () => {
  it("retains symbols, callbacks and opaque nested values without stringifying them", () => {
    const symbol = Symbol("preview");
    const callback = () => undefined;
    const config = {
      type: "custom:example",
      entity: "light.one",
      callback,
      nested: { callback },
      [symbol]: callback,
    };
    const data = editableConfig(config);
    expect(data).toEqual({ type: "custom:example", entity: "light.one" });
    const updated = restoreOpaqueConfig(config, {
      type: "custom:example",
      title: "New",
    });
    expect(updated.entity).toBeUndefined();
    expect(updated.callback).toBe(callback);
    expect(updated.nested).toBe(config.nested);
    expect(Reflect.get(updated, symbol)).toBe(callback);
  });
  it("accepts records only, never silently normalizing arrays or scalar YAML", () => {
    for (const value of [undefined, null, [], "text", 4, false, new Date()]) {
      expect(isConfigRecord(value)).toBe(false);
      const editor = new HuiStructuredConfigEditor();
      editor.hass = hass;
      expect(() => editor.setConfig(value)).toThrow();
    }
    expect(isConfigRecord({})).toBe(true);
  });
  it("loads the visual fallback only when no native editor or form exists", async () => {
    const host = new FallbackHost();
    host.hass = hass;
    host.value = {
      type: "custom:example",
      arbitrary: [1, false, { nested: "kept" }],
    };
    await host.load();
    expect(host.editor()?.localName).toBe("hui-structured-config-editor");
  });
  it("keeps a native editor ahead of the fallback", async () => {
    const host = new FallbackHost();
    host.hass = hass;
    const native = Object.assign(document.createElement("div"), {
      setConfig: () => undefined,
    });
    host.native = native;
    host.value = { type: "native" };
    await host.load();
    expect(host.editor()).toBe(native);
  });
  it("blocks scalar YAML and preserves the preceding config", () => {
    const host = new FallbackHost();
    host.hass = hass;
    const config = { type: "custom:example" };
    host.value = config;
    (host as any)._handleYAMLChanged(
      new CustomEvent("value-changed", { detail: { isValid: true, value: [] } })
    );
    expect(host.value).toBe(config);
    expect(host.hasError).toBe(true);
  });
  it("keeps an own __proto__ field as data", () => {
    const edited = JSON.parse('{"__proto__":{"polluted":true}}');
    const result = restoreOpaqueConfig({ type: "custom:example" }, edited);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(result, "__proto__")).toBe(
      true
    );
  });
  it("preserves nested null-prototype records as opaque values", () => {
    const settings = Object.assign(Object.create(null), { retained: 7 });
    const original = { type: "custom:example", settings };
    expect(editableConfig(original)).toEqual({ type: "custom:example" });
    expect(restoreOpaqueConfig(original, { title: "Edited" }).settings).toBe(
      settings
    );
  });
  it("keeps an invalid visual draft and its save verdict together", async () => {
    const host = new FallbackHost();
    host.hass = hass;
    host.value = { type: "custom:example" };
    (host as any)._handleUIConfigChanged(
      new CustomEvent("config-changed", {
        detail: { config: host.value, error: "Invalid value" },
      })
    );
    await host.toggleMode();
    expect(host.GUImode).toBe(true);
    expect(host.hasError).toBe(true);
  });
  it("does not install an older editor after a newer load finishes", async () => {
    const host = new FallbackHost();
    host.hass = hass;
    let resolveOld!: (value: any) => void;
    host.native = new Promise((resolve) => {
      resolveOld = resolve;
    });
    host.value = { type: "old" };
    const current = Object.assign(document.createElement("div"), {
      setConfig: () => undefined,
    });
    host.native = current;
    host.value = { type: "new" };
    await host.load();
    expect(host.editor()).toBe(current);
    resolveOld(
      Object.assign(document.createElement("span"), {
        setConfig: () => undefined,
      })
    );
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(host.editor()).toBe(current);
  });
  it("reports invalid visual drafts without replacing the last valid config", () => {
    const editor = new HuiStructuredConfigEditor();
    editor.hass = hass;
    const config = { type: "custom:example", count: 3 };
    editor.setConfig(config);
    const events: any[] = [];
    editor.addEventListener("config-changed", (ev: any) =>
      events.push(ev.detail)
    );
    (editor as any)._validityChanged(
      new CustomEvent("object-editor-validity-changed", {
        detail: { valid: false },
      })
    );
    expect(events[0].config).toBe(config);
    expect(events[0].error).toBeTruthy();
    (editor as any)._validityChanged(
      new CustomEvent("object-editor-validity-changed", {
        detail: { valid: true },
      })
    );
    expect(events[1].error).toBeUndefined();
  });
});

describe("dashboard native fallback fields", () => {
  it("maps only losslessly compatible existing values", () => {
    expect(dashboardFieldSelector("icon", "mdi:home")).toEqual({ icon: {} });
    expect(dashboardFieldSelector("navigation_path", "/lovelace/home")).toEqual(
      { navigation: null }
    );
    expect(
      dashboardFieldSelector("entities", ["light.one", "switch.two"])
    ).toEqual({ entity: { multiple: true, reorder: true } });
    expect(dashboardFieldSelector("entities", [])).toBeDefined();
    for (const [key, value] of [
      ["icon", "{{ icon }}"],
      ["navigation_path", "{% if active %}/one{% endif %}"],
      ["entities", ["light.one", { entity: "light.two" }]],
      ["entities", ["light.one", "light.one"]],
      ["entities", ["{{ entity }}"]],
      ["entities", "light.one"],
      ["entities", new Array(1)],
      ["icon", {}],
      [
        "tap_action",
        { action: "navigate", navigation_path: "/home", custom: true },
      ],
    ] as const) {
      expect(dashboardFieldSelector(key, value)).toBeUndefined();
    }
  });

  const setup = (config: Record<string, unknown>) => {
    const editor = new HuiStructuredConfigEditor();
    editor.hass = hass;
    editor.setConfig(config);
    const events: any[] = [];
    editor.addEventListener("config-changed", (ev: any) =>
      events.push(ev.detail)
    );
    const select = (key: string, value: unknown) => {
      const target = Object.assign(document.createElement("div"), {
        name: key,
      });
      target.addEventListener("value-changed", (ev) =>
        (editor as any)._nativeChanged(ev)
      );
      target.dispatchEvent(
        new CustomEvent("value-changed", { detail: { value } })
      );
    };
    return { editor, events, select };
  };

  it("renders labeled native selectors and keeps their fields out of the generic projection", () => {
    const { editor } = setup({
      type: "custom:example",
      icon: "mdi:home",
      navigation_path: "/one",
      entities: ["light.one"],
      extra: "kept",
    });
    const container = document.createElement("div");
    render((editor as any).render(), container, { host: editor });
    const selectors = [...container.querySelectorAll("ha-selector")];
    expect(selectors.map((item) => item.name)).toEqual([
      "icon",
      "navigation_path",
      "entities",
    ]);
    expect(selectors.every((item) => !!item.label && !item.disabled)).toBe(
      true
    );
    const generic = container.querySelector("ha-object-editor")!;
    expect(generic.value).toEqual({ type: "custom:example", extra: "kept" });
    expect(generic.reservedKeys).toEqual([
      "icon",
      "navigation_path",
      "entities",
    ]);
  });

  it("changes ordered IDs without losing opaque or unknown configuration", () => {
    const symbol = Symbol("preview");
    const callback = () => undefined;
    const original = {
      type: "custom:example",
      entities: ["light.one", "switch.two"],
      icon: "mdi:home",
      callback,
      [symbol]: callback,
      custom: { keep: [1, false] },
    };
    const { events, select } = setup(original);
    select("entities", ["switch.two", "light.one"]);
    expect(events[0].config).toEqual({
      ...original,
      entities: ["switch.two", "light.one"],
    });
    expect(Reflect.get(events[0].config, symbol)).toBe(callback);
    expect(events[0].config.callback).toBe(callback);
    expect(original.entities).toEqual(["light.one", "switch.two"]);
  });

  it("preserves native fields while generic data changes or is removed", () => {
    const { editor, events } = setup({
      type: "custom:example",
      icon: "mdi:home",
      entities: ["light.one"],
      extra: "remove",
    });
    (editor as any)._valueChanged(
      new CustomEvent("value-changed", {
        detail: { value: { type: "custom:example", added: 3 } },
      })
    );
    expect(events[0].config).toEqual({
      type: "custom:example",
      icon: "mdi:home",
      entities: ["light.one"],
      added: 3,
    });
  });

  it("blocks native edits during an invalid generic draft, then permits corrected data", () => {
    const { editor, events, select } = setup({
      type: "custom:example",
      icon: "mdi:home",
    });
    (editor as any)._validityChanged(
      new CustomEvent("object-editor-validity-changed", {
        detail: { valid: false },
      })
    );
    select("icon", "mdi:lightbulb");
    expect(events).toHaveLength(1);
    expect(events[0].error).toBeTruthy();
    const container = document.createElement("div");
    render((editor as any).render(), container, { host: editor });
    expect(container.querySelector("ha-selector")!.disabled).toBe(true);
    expect(
      container.querySelector(".native-field")!.hasAttribute("inert")
    ).toBe(true);
    (editor as any)._validityChanged(
      new CustomEvent("object-editor-validity-changed", {
        detail: { valid: true },
      })
    );
    select("icon", "mdi:lightbulb");
    expect(events[events.length - 1].config.icon).toBe("mdi:lightbulb");
  });

  it("allows clearing a field and rejects wrong-shaped native events", () => {
    const { events, select } = setup({
      type: "custom:example",
      navigation_path: "/one",
      entities: ["light.one"],
    });
    select("entities", [{ entity: "light.one" }]);
    select("navigation_path", {});
    select("not_a_field", "x");
    expect(events).toHaveLength(0);
    select("navigation_path", undefined);
    expect(events[0].config).toEqual({
      type: "custom:example",
      entities: ["light.one"],
    });
  });
});

it("removes a native field through its labeled control without dropping siblings", () => {
  const editor = new HuiStructuredConfigEditor();
  editor.hass = hass;
  editor.setConfig({ type: "custom:example", icon: "mdi:home", extra: 42 });
  let changed: any;
  editor.addEventListener("config-changed", (ev: any) => {
    changed = ev.detail.config;
  });
  const container = document.createElement("div");
  render((editor as any).render(), container, { host: editor });
  const button = container.querySelector("ha-icon-button")!;
  expect(button.label).toContain("icon");
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(changed).toEqual({ type: "custom:example", extra: 42 });
});

it("offers labeled button ordering, preserves siblings and refuses boundary moves", () => {
  const editor = new HuiStructuredConfigEditor();
  editor.hass = hass;
  const original = {
    type: "custom:example",
    entities: ["light.one", "light.two", "light.three"],
    custom: { retained: true },
  };
  editor.setConfig(original);
  let changed: any;
  editor.addEventListener("config-changed", (ev: any) => {
    changed = ev.detail.config;
  });
  const container = document.createElement("div");
  render((editor as any).render(), container, { host: editor });
  const firstRow = container.querySelector(".entity-order")!;
  const up = firstRow.querySelector<
    HTMLElement & { disabled: boolean; label: string }
  >("[data-direction='-1']")!;
  const down = firstRow.querySelector<
    HTMLElement & { disabled: boolean; label: string }
  >("[data-direction='1']")!;
  expect(up.disabled).toBe(true);
  expect(down.disabled).toBe(false);
  expect(down.label).toContain("move_down");
  expect(down.label).toContain("light.one");
  up.dispatchEvent(new MouseEvent("click"));
  expect(changed).toBeUndefined();
  down.dispatchEvent(new MouseEvent("click"));
  expect(changed).toEqual({
    ...original,
    entities: ["light.two", "light.one", "light.three"],
  });
  expect(original.entities).toEqual(["light.one", "light.two", "light.three"]);
  editor.setConfig(changed);
  render((editor as any).render(), container, { host: editor });
  expect(
    [...container.querySelectorAll<HTMLElement>(".entity-order")].map(
      (row) => row.dataset.entity
    )
  ).toEqual(changed.entities);
  expect(container.querySelectorAll(".entity-order")[1]).toBe(firstRow);
  expect(container.querySelector("ha-selector")!.selector).toEqual({
    entity: { multiple: true, reorder: true },
  });
});

it("does not reorder native entities while a generic draft is invalid", () => {
  const editor = new HuiStructuredConfigEditor();
  editor.hass = hass;
  editor.setConfig({
    type: "custom:example",
    entities: ["light.one", "light.two"],
  });
  const events: any[] = [];
  editor.addEventListener("config-changed", (ev: any) =>
    events.push(ev.detail)
  );
  (editor as any)._validityChanged(
    new CustomEvent("object-editor-validity-changed", {
      detail: { valid: false },
    })
  );
  const container = document.createElement("div");
  render((editor as any).render(), container, { host: editor });
  const down = container.querySelector<HTMLElement & { disabled: boolean }>(
    "[data-direction='1']"
  )!;
  expect(down.disabled).toBe(true);
  down.dispatchEvent(new MouseEvent("click"));
  expect(events).toHaveLength(1);
  expect(events[0].error).toBeTruthy();
});
