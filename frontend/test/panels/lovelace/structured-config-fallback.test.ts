import { describe, expect, it } from "vitest";
import {
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
