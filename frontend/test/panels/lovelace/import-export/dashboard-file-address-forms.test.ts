import { describe, expect, it } from "vitest";
import {
  hostOf,
  isOutsideAddress,
  normalizeAddress,
} from "../../../../src/panels/lovelace/import-export/address-host";
import {
  analyzeDashboardImport,
  validateDashboardFile,
} from "../../../../src/panels/lovelace/import-export/dashboard-file";

// The summary is the only thing read before an imported dashboard goes live.
// These tests protect two promises: the host it names is the host a browser
// goes to, and an action that can unlock or open something is never called
// plain. Every address form below was checked against the URL parser.

const BASE = "https://ha.example/";
const BS = "\\";
const TAB = "\t";
const NL = "\n";
const CR = "\r";
const C0 = String.fromCharCode(1);
// Written in two parts so a lint rule against script addresses stays quiet.
const JS = ["java", "script:"].join("");

const summarize = (file: unknown) => {
  const parsed = validateDashboardFile(file, "Fallback");
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return analyzeDashboardImport(parsed);
};

const dashboardWith = (cards: unknown[]) => ({
  views: [{ title: "V", cards }],
});

const actionCard = (tapAction: Record<string, unknown>, entity?: string) => ({
  type: "button",
  ...(entity ? { entity } : {}),
  tap_action: tapAction,
});

describe("normalizeAddress", () => {
  it("deletes tab, carriage return and line feed anywhere", () => {
    expect(normalizeAddress(`ja${TAB}va${NL}sc${CR}ript:x`)).toEqual({
      value: `${JS}x`,
      hadControl: true,
    });
  });

  it("drops leading and trailing control characters and spaces", () => {
    expect(normalizeAddress(`${C0}  https://a.example/ `).value).toBe(
      "https://a.example/"
    );
    expect(normalizeAddress(`${C0}x`).hadControl).toBe(true);
    expect(normalizeAddress("https://a.example/").hadControl).toBe(false);
  });
});

describe("hostOf address forms", () => {
  it("names the host after a tab, newline or carriage return in the host", () => {
    for (const control of [TAB, NL, CR]) {
      expect(hostOf(`https://ha.local${control}.evil.com/x`, BASE)).toEqual({
        host: "ha.local.evil.com",
        problem: "control_characters",
      });
    }
  });

  it("flags a scheme broken up by a tab, or led by a control character", () => {
    expect(hostOf(`java${TAB}script:alert(1)`, BASE)).toEqual({
      host: JS,
      problem: "control_characters",
    });
    expect(hostOf(`${C0}${JS}alert(1)`, BASE)).toEqual({
      host: JS,
      problem: "control_characters",
    });
  });

  it("reads a tab between the slashes of a protocol-relative address", () => {
    expect(hostOf(`/${TAB}/evil.com/x`, BASE)).toEqual({
      host: "evil.com",
      problem: "control_characters",
    });
  });

  it.each([
    ["backslashes after the scheme", `https:${BS}${BS}evil.com`],
    ["a slash and a backslash after the scheme", `https:/${BS}evil.com`],
    ["two leading backslashes", `${BS}${BS}evil.com`],
    ["a leading slash and backslash", `/${BS}evil.com`],
    ["http with one slash", "http:/evil.com"],
    ["http with none", "http:evil.com"],
    ["wss with none", "wss:evil.com"],
    ["ftp with none", "ftp:evil.com"],
  ])("takes the browser's host and flags %s as odd", (_name, address) => {
    expect(hostOf(address, BASE)).toEqual({
      host: "evil.com",
      problem: "odd_form",
    });
  });

  it("names this site for a same-scheme address without slashes, and flags it", () => {
    for (const address of ["https:evil.com", "https:/evil.com"]) {
      expect(hostOf(address, BASE)).toEqual({
        host: "ha.example",
        problem: "odd_form",
      });
    }
  });

  it("does not flag the ordinary form", () => {
    expect(hostOf("https://evil.com/x", BASE)).toEqual({ host: "evil.com" });
    expect(hostOf("//evil.com/x", BASE)).toEqual({ host: "evil.com" });
  });
});

describe("isOutsideAddress", () => {
  it.each([
    ["a tab between the slashes", `/${TAB}/evil.com`],
    ["a slash and a backslash", `/${BS}evil.com`],
    ["two backslashes", `${BS}${BS}evil.com`],
    ["a protocol-relative address", "//evil.com"],
    ["a scheme without slashes", "https:evil.com"],
    ["a control character after a path", `/local/x${TAB}`],
    ["a leading control character", `${C0}/local/x`],
    ["a template", "/{{ states('sensor.x') }}"],
    ["a relative path", "lovelace/0"],
  ])("treats %s as outside", (_name, address) => {
    expect(isOutsideAddress(address, BASE)).toBe(true);
  });

  it("keeps a plain path on this site", () => {
    expect(isOutsideAddress("/local/a.png", BASE)).toBe(false);
    expect(isOutsideAddress("  /lovelace/0", BASE)).toBe(false);
  });
});

describe("summary addresses are classified before they are escaped", () => {
  it("lists a tab-split host under the host the browser goes to", () => {
    const summary = summarize(
      dashboardWith([
        { type: "picture", image: `https://ha.local${TAB}.evil.com/x` },
      ])
    );
    const [entry] = summary.addresses.items;
    expect(entry.host).toBe("ha.local.evil.com");
    expect(entry.problem).toBe("control_characters");
    expect(entry.address).toBe("https://ha.localU+0009.evil.com/x");
  });

  it("flags a script address with a tab or a leading control character", () => {
    const summary = summarize(
      dashboardWith([
        { type: "iframe", url: `java${TAB}script:alert(1)` },
        { type: "iframe", url: `${C0}${JS}alert(2)` },
      ])
    );
    expect(summary.addresses.total).toBe(2);
    for (const entry of summary.addresses.items) {
      expect(entry.problem).toBe("control_characters");
    }
  });

  it("flags a url action that only looks like a path", () => {
    const summary = summarize(
      dashboardWith([
        actionCard({ action: "url", url_path: `/${TAB}/evil.com` }),
        actionCard({ action: "url", url_path: `/${BS}evil.com` }),
        actionCard({ action: "url", url_path: "/local/ok.png" }),
      ])
    );
    const byTarget = new Map(
      summary.actions.all.map((item) => [item.target, item.needsLook])
    );
    expect(byTarget.get("/U+0009/evil.com")).toBe(true);
    expect(byTarget.get(`/${BS}evil.com`)).toBe(true);
    expect(byTarget.get("/local/ok.png")).toBe(false);
    // The two that leave the site come first.
    expect(summary.actions.items[2].target).toBe("/local/ok.png");
    expect(summary.addresses.all.map((entry) => entry.host)).toEqual(
      expect.arrayContaining(["evil.com"])
    );
  });

  it.each([
    ["backslashes after the scheme", `https:${BS}${BS}evil.com`, "odd_form"],
    ["a slash and a backslash", `https:/${BS}evil.com`, "odd_form"],
    ["two leading backslashes", `${BS}${BS}evil.com`, "odd_form"],
    ["a leading slash and backslash", `/${BS}evil.com`, "odd_form"],
    ["no slashes", "https:evil.com", "odd_form"],
    ["one slash", "https:/evil.com", "odd_form"],
  ])("finds and flags %s as a whole value", (_name, address, problem) => {
    const summary = summarize(
      dashboardWith([{ type: "picture", image: address }])
    );
    expect(summary.addresses.total).toBe(1);
    expect(summary.addresses.items[0].problem).toBe(problem);
  });

  it.each([
    ["backslashes after the scheme", `https:${BS}${BS}evil.com`],
    ["a slash and a backslash", `https:/${BS}evil.com`],
    ["two leading backslashes", `${BS}${BS}evil.com`],
    ["no slashes", "wss:evil.com"],
  ])("finds %s inside a sentence", (_name, address) => {
    const summary = summarize(
      dashboardWith([{ type: "markdown", content: `Visit ${address} now` }])
    );
    expect(summary.addresses.total).toBe(1);
    expect(summary.addresses.items[0].host).toBe("evil.com");
    expect(summary.addresses.items[0].problem).toBe("odd_form");
  });

  it("does not take ordinary words with a colon for an address", () => {
    const summary = summarize(
      dashboardWith([{ type: "markdown", content: "Note: https: is a scheme" }])
    );
    expect(summary.addresses.total).toBe(0);
  });
});

describe("summary toggles", () => {
  it.each([
    "lock.front_door",
    "cover.garage",
    "alarm_control_panel.house",
    "valve.main",
    "siren.hall",
    "climate.living",
    "water_heater.tank",
    "vacuum.robot",
  ])("lists a toggle on %s with its entity", (entity) => {
    const summary = summarize(
      dashboardWith([actionCard({ action: "toggle" }, entity)])
    );
    expect(summary.actions.items).toEqual([
      {
        where: entity,
        action: "toggle",
        service: "",
        target: "",
        needsLook: true,
      },
    ]);
  });

  it("lists a toggle that names its own target", () => {
    const summary = summarize(
      dashboardWith([
        {
          type: "button",
          tap_action: {
            action: "toggle",
            target: { entity_id: "lock.back_door" },
          },
        },
      ])
    );
    expect(summary.actions.total).toBe(1);
    expect(summary.actions.items[0].target).toBe(
      '{"entity_id":"lock.back_door"}'
    );
    expect(summary.actions.items[0].needsLook).toBe(true);
  });

  it("still leaves out a toggle on a light or a sensor", () => {
    const summary = summarize(
      dashboardWith([
        actionCard({ action: "toggle" }, "light.kitchen"),
        actionCard({ action: "toggle" }, "sensor.temperature"),
      ])
    );
    expect(summary.actions.total).toBe(0);
  });

  it("lists a button card on a lock that has no action of its own", () => {
    const summary = summarize(
      dashboardWith([{ type: "button", entity: "lock.front_door" }])
    );
    expect(summary.actions.items).toEqual([
      {
        where: "lock.front_door",
        action: "toggle",
        service: "",
        target: "lock.front_door",
        needsLook: true,
      },
    ]);
  });

  it("does not list a button card on a light, or one with its own action", () => {
    const summary = summarize(
      dashboardWith([
        { type: "button", entity: "light.kitchen" },
        {
          type: "button",
          entity: "lock.front_door",
          tap_action: { action: "navigate", navigation_path: "/x" },
        },
      ])
    );
    expect(summary.actions.total).toBe(0);
  });
});

describe("summary plain actions", () => {
  const call = (service: string, extra: Record<string, unknown>) =>
    actionCard({
      action: "perform-action",
      perform_action: service,
      ...extra,
    });

  it("calls a plain service on named entities of its own domain plain", () => {
    const summary = summarize(
      dashboardWith([
        call("light.turn_on", { target: { entity_id: "light.kitchen" } }),
        call("fan.toggle", { data: { entity_id: ["fan.a", "fan.b"] } }),
        call("media_player.media_pause", {
          service_data: { entity_id: "media_player.tv" },
        }),
      ])
    );
    expect(summary.actions.all.map((item) => item.needsLook)).toEqual([
      false,
      false,
      false,
    ]);
  });

  it.each([
    ["no entity named", "light.turn_on", {}],
    ["an area", "light.turn_on", { target: { area_id: "kitchen" } }],
    ["a device", "light.turn_on", { target: { device_id: "abc" } }],
    ["a label", "light.turn_on", { target: { label_id: "night" } }],
    ["a floor", "light.turn_on", { target: { floor_id: "up" } }],
    [
      "an area beside an entity",
      "light.turn_on",
      { target: { entity_id: "light.a", area_id: "kitchen" } },
    ],
    ["all", "light.turn_off", { target: { entity_id: "all" } }],
    [
      "a template",
      "light.turn_on",
      { target: { entity_id: "{{ states('input_text.x') }}" } },
    ],
    [
      "an entity of another domain",
      "light.turn_on",
      { target: { entity_id: "lock.front_door" } },
    ],
    [
      "one entity of another domain in a list",
      "light.turn_on",
      { target: { entity_id: ["light.a", "switch.b"] } },
    ],
    [
      "a switch service",
      "switch.turn_on",
      { target: { entity_id: "switch.pump" } },
    ],
    [
      "a cover service",
      "cover.open_cover",
      { target: { entity_id: "cover.garage" } },
    ],
    [
      "a scene service",
      "scene.turn_on",
      { target: { entity_id: "scene.night" } },
    ],
    [
      "an input boolean service",
      "input_boolean.toggle",
      { target: { entity_id: "input_boolean.x" } },
    ],
  ])("needs a look with %s", (_name, service, extra) => {
    const summary = summarize(dashboardWith([call(service, extra)]));
    expect(summary.actions.total).toBe(1);
    expect(summary.actions.items[0].needsLook).toBe(true);
  });

  it("lists the actions that need a look before the plain ones", () => {
    const summary = summarize(
      dashboardWith([
        call("light.turn_on", { target: { entity_id: "light.a" } }),
        call("switch.turn_on", { target: { entity_id: "switch.b" } }),
      ])
    );
    expect(summary.actions.items.map((item) => item.service)).toEqual([
      "switch.turn_on",
      "light.turn_on",
    ]);
  });
});

describe("summary actions that name a service twice", () => {
  it("lists both services and takes the riskier", () => {
    const summary = summarize(
      dashboardWith([
        actionCard({
          action: "perform-action",
          perform_action: "light.turn_on",
          service: "lock.unlock",
          target: { entity_id: "light.a" },
        }),
      ])
    );
    expect(summary.actions.total).toBe(1);
    expect(summary.actions.items[0].service).toBe("light.turn_on, lock.unlock");
    expect(summary.actions.items[0].needsLook).toBe(true);
  });

  it("is plain only when both services are plain", () => {
    const summary = summarize(
      dashboardWith([
        actionCard({
          action: "perform-action",
          perform_action: "light.turn_on",
          service: "light.turn_off",
          target: { entity_id: "light.a" },
        }),
      ])
    );
    expect(summary.actions.items[0].needsLook).toBe(false);
  });

  it("shows the target and the data entity together", () => {
    const summary = summarize(
      dashboardWith([
        actionCard({
          action: "perform-action",
          perform_action: "light.turn_on",
          target: { entity_id: "light.a" },
          data: { entity_id: "lock.front_door" },
        }),
      ])
    );
    const [item] = summary.actions.items;
    expect(item.target).toBe(
      'target: {"entity_id":"light.a"}; data.entity_id: lock.front_door'
    );
    // A second entity of another domain keeps it from being plain.
    expect(item.needsLook).toBe(true);
  });
});
