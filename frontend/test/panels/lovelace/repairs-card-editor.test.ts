import { afterEach, describe, expect, it, vi } from "vitest";
import { HuiRepairsCard } from "../../../src/panels/lovelace/cards/hui-repairs-card";
import { HuiRepairsCardEditor } from "../../../src/panels/lovelace/editor/config-elements/hui-repairs-card-editor";
import type { RepairsCardConfig } from "../../../src/panels/lovelace/cards/types";

vi.mock("../../../src/components/ha-form/ha-form", () => {
  customElements.define("ha-form", class extends HTMLElement {});
  return {};
});
let editor: HuiRepairsCardEditor;
afterEach(() => {
  editor?.remove();
});
const mount = async (config: RepairsCardConfig) => {
  editor = new HuiRepairsCardEditor();
  editor.hass = { localize: (key: string) => key } as never;
  editor.setConfig(config);
  document.body.append(editor);
  await editor.updateComplete;
  return editor.shadowRoot!.querySelector(
    "ha-form"
  ) as unknown as HTMLElement & {
    data: RepairsCardConfig;
    schema: { name: string; schema?: { name: string }[] }[];
  };
};
describe("Repairs card visual editor", () => {
  it("is discoverable through the native card editor factory", async () => {
    expect(await HuiRepairsCard.getConfigElement()).toBeInstanceOf(
      HuiRepairsCardEditor
    );
    expect(HuiRepairsCard.getStubConfig()).toEqual({ type: "repairs" });
  });
  it("offers the real controls and native action selectors without duplicating Layout", async () => {
    const form = await mount({ type: "repairs" });
    const names = form.schema.flatMap((entry) =>
      entry.schema ? entry.schema.map((field) => field.name) : [entry.name]
    );
    expect(names).toEqual([
      "hide_empty",
      "vertical",
      "tap_action",
      "hold_action",
      "double_tap_action",
    ]);
    expect(form.data.tap_action).toEqual({
      action: "navigate",
      navigation_path: "/config/repairs",
    });
  });
  it("preserves unknown and layout keys and leaves default navigation implicit", async () => {
    const config = {
      type: "repairs",
      grid_options: { columns: 6 },
      future_key: { preserve: true },
    };
    const form = await mount(config);
    let changed: unknown;
    editor.addEventListener("config-changed", (event) => {
      changed = (event as CustomEvent).detail.config;
    });
    form.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: {
          value: {
            hide_empty: true,
            vertical: true,
            tap_action: form.data.tap_action,
          },
        },
        bubbles: true,
      })
    );
    expect(changed).toEqual({ ...config, hide_empty: true, vertical: true });
  });
  it("keeps explicit custom actions and allows optional actions to be removed", async () => {
    const config = {
      type: "repairs",
      tap_action: { action: "url", url_path: "https://example.test" },
      hold_action: { action: "none" },
      extra: 1,
    } as RepairsCardConfig;
    const form = await mount(config);
    let changed: unknown;
    editor.addEventListener("config-changed", (event) => {
      changed = (event as CustomEvent).detail.config;
    });
    form.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: { value: { tap_action: config.tap_action } },
        bubbles: true,
      })
    );
    expect(changed).toEqual({
      type: "repairs",
      tap_action: config.tap_action,
      extra: 1,
    });
  });
});
