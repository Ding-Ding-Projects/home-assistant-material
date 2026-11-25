import { tmpdir } from "os";
import { join } from "path";
import { appendFileSync } from "fs";
import { describe, it } from "vitest";
import "../../../../../src/panels/lovelace/editor/card-editor/hui-card-element-editor";

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
  entities: {},
  devices: {},
  areas: {},
  floors: {},
  config: { components: [] },
  user: { id: "u" },
  language: "en",
  locale: { language: "en" },
};

describe("probe", () => {
  it("loads editor", async () => {
    const el = document.createElement("hui-card-element-editor") as any;
    el.hass = hass;
    el.showStyleTab = true;
    el.showVisibilityTab = true;
    document.body.appendChild(el);
    el.value = { type: "tile", entity: "light.a" };
    await new Promise((r) => {
      setTimeout(r, 2000);
    });
    await el.updateComplete;
    log(
      "configElement",
      el._configElement?.localName,
      "gui",
      el._guiSupported,
      "loading",
      el._loading,
      "errors",
      el._errors,
      "GUImode",
      el.GUImode
    );
    const t = el.shadowRoot.querySelector("hui-tile-card-editor"); await t?.updateComplete; log("TILE", t?.shadowRoot?.innerHTML.replace(/<!--[^>]*-->/g, "").replace(/<style>[\s\S]*?<\/style>/g, "").slice(0, 3000));
    log(el.shadowRoot.innerHTML.replace(/<!--[^>]*-->/g, "").slice(0, 3000));
  }, 20000);
});
