import { tmpdir } from "os";
import { join } from "path";
import { appendFileSync } from "fs";
import { describe, it } from "vitest";
import "../../../../../src/panels/lovelace/editor/card-editor/hui-dialog-edit-card";

const OUT = join(tmpdir(), "card-editor-probe.txt");
const log = (...a: unknown[]) => appendFileSync(OUT, a.map(String).join(" ") + "\n");

window.matchMedia = ((q: string) => ({
  matches: q.includes("max-width"),
  media: q,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
})) as any;

const hass: any = {
  localize: (k: string) => k,
  states: { "light.a": { entity_id: "light.a", state: "on", attributes: {} } },
  services: { light: { toggle: {} } },
  entities: {}, devices: {}, areas: {}, floors: {},
  config: { components: [] }, user: { id: "u" }, language: "en",
  locale: { language: "en" }, themes: {}, selectedTheme: null,
};

describe("probe2", () => {
  it("dialog editor", async () => {
    const d = document.createElement("hui-dialog-edit-card") as any;
    d.hass = hass;
    document.body.appendChild(d);
    const card = { type: "tile", entity: "light.a" };
    await d.showDialog({
      lovelaceConfig: { views: [{ cards: [card] }] },
      saveCardConfig: async () => {},
      path: [0, 0],
      cardConfig: card,
    });
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => { setTimeout(r, 500); });
      const ed = d.shadowRoot?.querySelector("hui-card-element-editor");
      log(i, "editor", !!ed, "cfg", ed?._configElement?.localName, "gui", ed?.GUImode, "loading", ed?._loading, "errors", ed?._errors, "warn", ed?._warnings, "inDom", !!ed?.shadowRoot?.querySelector("hui-tile-card-editor"));
    }
    const ed = d.shadowRoot.querySelector("hui-card-element-editor");
    const t = ed.shadowRoot.querySelector("hui-tile-card-editor");
    const f = t.shadowRoot.querySelector("ha-form");
    log("FORM", f?.shadowRoot?.innerHTML.replace(/<!--[^>]*-->/g, "").replace(/<style>[\s\S]*?<\/style>/g, "").replace(/\s+/g," ").slice(0, 2000));
    log("DLG", d.shadowRoot.innerHTML.replace(/<!--[^>]*-->/g, "").replace(/<style>[\s\S]*?<\/style>/g, "").replace(/\s+/g," ").slice(0, 2500));
  }, 30000);
});
