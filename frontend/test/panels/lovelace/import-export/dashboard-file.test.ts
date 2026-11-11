import { describe, expect, it } from "vitest";
import {
  analyzeDashboardImport,
  appendViewToConfig,
  buildDashboardEnvelope,
  buildViewEnvelope,
  configIsAsImported,
  DASHBOARD_FILE_FORMAT,
  exportFileName,
  parseDashboardFileText,
  pickNewDashboardUrlPath,
  removeImportedView,
  routeDroppedFile,
  safeText,
  SUMMARY_LIST_LIMIT,
  validateDashboardFile,
} from "../../../../src/panels/lovelace/import-export/dashboard-file";

const settings = {
  title: "Kitchen",
  icon: "mdi:stove",
  url_path: "dashboard-kitchen",
  require_admin: true,
  show_in_sidebar: false,
};

describe("routeDroppedFile", () => {
  it("sends a dashboard file to the dashboard import", () => {
    const text = JSON.stringify(
      buildDashboardEnvelope(settings, { views: [{ title: "A" }] })
    );
    expect(routeDroppedFile("Kitchen.dashboard.json", text).route).toBe(
      "dashboard"
    );
  });

  it("sends a wording file on to the wording import", () => {
    const text = JSON.stringify({ version: 1, entries: { a: "b" } });
    expect(routeDroppedFile("wording.json", text).route).toBe("other");
  });

  it("leaves unreadable and non JSON files to the wording import", () => {
    expect(routeDroppedFile("broken.json", "{not json").route).toBe("other");
    expect(routeDroppedFile("notes.txt", "views: []").route).toBe("other");
    expect(routeDroppedFile("list.json", "[1,2]").route).toBe("other");
  });

  it("accepts a plain configuration with views, as YAML or JSON", () => {
    expect(
      routeDroppedFile("ui-lovelace.yaml", "views:\n  - title: Home\n").route
    ).toBe("dashboard");
    expect(routeDroppedFile("c.json", '{"views":[{"title":"x"}]}').route).toBe(
      "dashboard"
    );
    expect(routeDroppedFile("c.yaml", "title: no views\n").route).toBe("other");
  });

  it("does not take a wording file with a views list for a dashboard", () => {
    const withViews = (extra: Record<string, unknown>) =>
      JSON.stringify({ views: [{ title: "x" }], ...extra });
    expect(
      routeDroppedFile("w.json", withViews({ schemaVersion: 1, entries: {} }))
        .route
    ).toBe("other");
    expect(routeDroppedFile("w.json", withViews({ entries: {} })).route).toBe(
      "other"
    );
    // A list of things that do not look like views is not a dashboard.
    expect(
      routeDroppedFile("w.json", JSON.stringify({ views: [{ a: 1 }] })).route
    ).toBe("other");
    expect(
      routeDroppedFile("w.json", JSON.stringify({ views: [1, 2] })).route
    ).toBe("other");
    // The format marker always wins.
    expect(
      routeDroppedFile(
        "w.json",
        JSON.stringify({ format: DASHBOARD_FILE_FORMAT, entries: {} })
      ).route
    ).toBe("dashboard");
  });

  it("still routes a file with an unknown version, to refuse it clearly", () => {
    const text = JSON.stringify({ format: DASHBOARD_FILE_FORMAT, version: 99 });
    expect(routeDroppedFile("x.json", text).route).toBe("dashboard");
  });
});

describe("validateDashboardFile", () => {
  it("round trips an exported dashboard", () => {
    const envelope = buildDashboardEnvelope(settings, {
      views: [{ title: "Main", cards: [{ type: "markdown", content: "hi" }] }],
    });
    const result = parseDashboardFileText(
      "k.dashboard.json",
      JSON.stringify(envelope),
      "fallback"
    );
    expect(result).toMatchObject({
      ok: true,
      kind: "dashboard",
      stripped: false,
      settings,
    });
  });

  it("removes resource and module entries and reports it", () => {
    const result = validateDashboardFile(
      {
        views: [{ cards: [{ type: "custom:x", module_url: "/a.js" }] }],
        resources: [{ url: "/evil.js", type: "module" }],
      },
      "T"
    );
    expect(result.ok).toBe(true);
    if (result.ok && result.kind === "dashboard") {
      expect(result.stripped).toBe(true);
      expect(result.config).not.toHaveProperty("resources");
      expect(JSON.stringify(result.config)).not.toContain("module_url");
      // Custom card types stay as configuration.
      expect(JSON.stringify(result.config)).toContain("custom:x");
    }
  });

  it("drops prototype keys", () => {
    const parsed = JSON.parse('{"views":[{"__proto__":{"x":1},"title":"a"}]}');
    const result = validateDashboardFile(parsed, "T");
    expect(result.ok).toBe(true);
    if (result.ok && result.kind === "dashboard") {
      expect(Object.keys(result.config.views[0])).toEqual(["title"]);
    }
  });

  it("refuses bad shapes, versions and sizes without partial results", () => {
    expect(validateDashboardFile({ views: "no" }, "T")).toMatchObject({
      ok: false,
    });
    expect(
      validateDashboardFile(
        { format: DASHBOARD_FILE_FORMAT, version: 2, kind: "dashboard" },
        "T"
      )
    ).toEqual({ ok: false, error: "unsupported_version" });
    expect(
      validateDashboardFile(
        {
          format: DASHBOARD_FILE_FORMAT,
          version: 1,
          kind: "dashboard",
          config: { views: Array.from({ length: 101 }, () => ({})) },
        },
        "T"
      )
    ).toEqual({ ok: false, error: "too_many_views" });
    expect(
      parseDashboardFileText("a.json", "x".repeat(3 * 1024 * 1024), "T")
    ).toEqual({ ok: false, error: "too_large" });
  });

  it("reads a view file and uses a fallback title and safe icon", () => {
    const result = validateDashboardFile(
      buildViewEnvelope({ title: "Tab", cards: [] }, "Kitchen"),
      "T"
    );
    expect(result).toMatchObject({
      ok: true,
      kind: "view",
      sourceTitle: "Kitchen",
    });
    const dash = validateDashboardFile({ views: [], title: " " }, "From file");
    expect(dash).toMatchObject({
      ok: true,
      settings: { title: "From file" },
    });
  });
});

describe("helpers", () => {
  it("makes safe file names", () => {
    expect(exportFileName('Kit:chen/"x"', "dashboard")).toBe(
      "Kit chen x.dashboard.json"
    );
    expect(exportFileName("", "view")).toBe("dashboard.view.json");
  });

  it("picks a unique address with a hyphen", () => {
    const taken = new Set(["dashboard-kitchen", "dashboard-kitchen-2"]);
    expect(pickNewDashboardUrlPath("Kitchen", undefined, taken)).toBe(
      "dashboard-kitchen-3"
    );
    expect(pickNewDashboardUrlPath("Overview (edited)", undefined, taken)).toBe(
      "overview-edited"
    );
    expect(pickNewDashboardUrlPath("x", "bad path!", new Set())).toBe(
      "dashboard-x"
    );
  });

  it("appends a view at the end with a unique path", () => {
    const config = appendViewToConfig(
      { views: [{ path: "a" }, { path: "b" }] },
      { path: "a", title: "New" }
    );
    expect(config.views).toHaveLength(3);
    expect((config.views[2] as { path: string }).path).toBe("a-2");
  });
});

const summarize = (file: unknown) => {
  const parsed = validateDashboardFile(file, "Fallback");
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return analyzeDashboardImport(parsed);
};

const RLO = String.fromCharCode(0x202e);
const LRI = String.fromCharCode(0x2066);
const BEL = String.fromCharCode(7);

describe("safeText", () => {
  it("shows direction overrides and control characters as codes", () => {
    expect(safeText(`a${RLO}b`)).toBe("aU+202Eb");
    expect(safeText(`x${String.fromCharCode(0)}y\nz${LRI}`)).toBe(
      "xU+0000yU+000AzU+2066"
    );
    expect(safeText("plain text")).toBe("plain text");
  });

  it("cuts long text", () => {
    expect(safeText("x".repeat(300), 10)).toBe(`${"x".repeat(10)}…`);
  });
});

describe("analyzeDashboardImport", () => {
  it("counts tabs and cards through nested stacks, conditions and sections", () => {
    const summary = summarize({
      views: [
        {
          title: "A",
          cards: [
            {
              type: "vertical-stack",
              cards: [
                { type: "markdown" },
                { type: "conditional", card: { type: "custom:deep-card" } },
              ],
            },
          ],
        },
        { sections: [{ cards: [{ type: "tile" }] }] },
      ],
    });
    expect(summary.views).toBe(2);
    expect(summary.cards).toBe(5);
    expect(summary.customTypes.items).toEqual([
      { type: "custom:deep-card", kind: "card" },
    ]);
  });

  it("lists custom strategies apart from custom cards", () => {
    const summary = summarize({
      strategy: { type: "custom:my-strategy" },
      views: [{ title: "x", cards: [{ type: "custom:my-card" }] }],
    });
    expect(summary.customTypes.items).toEqual([
      { type: "custom:my-strategy", kind: "strategy" },
      { type: "custom:my-card", kind: "card" },
    ]);
  });

  it("lists actions in rows, badges and features, and skips safe ones", () => {
    const summary = summarize({
      views: [
        {
          title: "V",
          badges: [
            {
              type: "entity",
              entity: "sensor.a",
              tap_action: {
                action: "url",
                url_path: "https://evil.example/go",
              },
            },
            {
              type: "entity",
              entity: "sensor.b",
              tap_action: { action: "toggle" },
            },
          ],
          cards: [
            {
              type: "entities",
              title: "Lights",
              entities: [
                {
                  entity: "light.kitchen",
                  tap_action: {
                    action: "perform-action",
                    perform_action: "light.turn_on",
                    target: { entity_id: "light.kitchen" },
                  },
                },
                {
                  entity: "light.hall",
                  tap_action: { action: "navigate", navigation_path: "/x" },
                },
                { entity: "light.den", tap_action: { action: "more-info" } },
                { entity: "light.den", tap_action: { action: "none" } },
              ],
              features: [
                {
                  type: "toggle",
                  hold_action: {
                    action: "call-service",
                    service: "script.run",
                    service_data: { entity_id: "script.run" },
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(summary.actions.total).toBe(3);
    expect(summary.actions.items).toEqual(
      expect.arrayContaining([
        {
          where: "light.kitchen",
          action: "perform-action",
          service: "light.turn_on",
          target: '{"entity_id":"light.kitchen"}',
        },
        {
          where: "sensor.a",
          action: "url",
          service: "",
          target: "https://evil.example/go",
        },
        {
          where: "toggle",
          action: "call-service",
          service: "script.run",
          target: "script.run",
        },
      ])
    );
    expect(summary.addresses.items).toEqual([
      {
        host: "evil.example",
        address: "https://evil.example/go",
        where: "sensor.a",
      },
    ]);
  });

  it("shows the host first and finds addresses in text and templates", () => {
    const summary = summarize({
      views: [
        {
          title: "V",
          cards: [
            {
              type: "picture",
              image: "https://user:pw@Cdn.Example.com:8123/a.png",
            },
            { type: "iframe", url: "//other.example/page" },
            { type: "markdown", content: "see https://docs.example/x. Thanks" },
            { type: "markdown", content: "no address here" },
            {
              type: "button",
              tap_action: {
                action: "url",
                url_path: "{{ states('sensor.x') }}",
              },
            },
            { type: "picture", image: "/local/inside.png" },
          ],
        },
      ],
    });
    expect(summary.addresses.items.map((item) => item.host)).toEqual([
      "Cdn.Example.com:8123",
      "other.example",
      "docs.example",
      "{{ states('sensor.x') }}",
    ]);
  });

  it("shows hidden characters in names and values as codes", () => {
    const summary = summarize({
      title: `Evil${RLO}title`,
      views: [
        {
          title: "V",
          cards: [
            {
              type: "button",
              name: `Go${BEL}`,
              tap_action: {
                action: "url",
                url_path: `https://a.example/${RLO}x`,
              },
            },
          ],
        },
      ],
    });
    expect(summary.title).toBe("EvilU+202Etitle");
    expect(summary.actions.items[0].where).toBe("GoU+0007");
    expect(summary.addresses.items[0].address).toBe(
      "https://a.example/U+202Ex"
    );
    const text = JSON.stringify(summary);
    expect(text.includes(RLO) || text.includes(BEL)).toBe(false);
  });

  it("caps long lists but keeps the exact count", () => {
    const total = SUMMARY_LIST_LIMIT * 2 + 5;
    const summary = summarize({
      views: [
        {
          title: "V",
          cards: Array.from({ length: total }, (_unused, index) => ({
            type: `custom:card-${index}`,
            image: `https://host${index}.example/a.png`,
            tap_action: { action: "call-service", service: `s.a${index}` },
          })),
        },
      ],
    });
    expect(summary.cards).toBe(total);
    for (const list of [
      summary.addresses,
      summary.customTypes,
      summary.actions,
    ]) {
      expect(list.total).toBe(total);
      expect(list.items).toHaveLength(SUMMARY_LIST_LIMIT);
    }
  });

  it("reports removed resources and module addresses, with exact counts", () => {
    const summary = summarize({
      views: [
        { title: "V", cards: [{ type: "custom:x", module_url: "/m.js" }] },
      ],
      resources: Array.from(
        { length: SUMMARY_LIST_LIMIT + 3 },
        (_unused, i) => ({
          url: `/r${i}.js`,
          type: "module",
        })
      ),
    });
    expect(summary.removed.total).toBe(SUMMARY_LIST_LIMIT + 4);
    expect(summary.removed.items).toHaveLength(SUMMARY_LIST_LIMIT);
    expect(summary.removed.items[0]).toEqual({
      kind: "module",
      address: "/m.js",
    });
  });

  it("summarises a single view and a file that holds nothing risky", () => {
    const summary = summarize(
      buildViewEnvelope({ title: "Tab", cards: [{ type: "markdown" }] })
    );
    expect(summary).toMatchObject({
      kind: "view",
      views: 1,
      cards: 1,
      title: "Tab",
    });
    expect(summary.addresses.total).toBe(0);
    expect(summary.actions.total).toBe(0);
    expect(summary.customTypes.total).toBe(0);
    expect(summary.removed.total).toBe(0);
  });
});

describe("undo checks", () => {
  const imported = { title: "Imported", cards: [{ type: "markdown" }] };

  it("removes only the imported view and keeps later edits", () => {
    const current = {
      title: "Later title",
      views: [
        { path: "first", title: "Edited later" },
        { cards: [{ type: "markdown" }], title: "Imported" },
        { title: "Added after" },
      ],
    };
    const result = removeImportedView(current, imported);
    expect((result as { title?: string } | undefined)?.title).toBe(
      "Later title"
    );
    expect(result?.views).toEqual([
      { path: "first", title: "Edited later" },
      { title: "Added after" },
    ]);
  });

  it("refuses when the view changed or is gone", () => {
    expect(
      removeImportedView(
        { views: [{ title: "Imported", cards: [] }] },
        imported
      )
    ).toBeUndefined();
    expect(removeImportedView({ views: [] }, imported)).toBeUndefined();
    expect(removeImportedView({ strategy: {} }, imported)).toBeUndefined();
  });

  it("compares configurations whatever the key order", () => {
    const config = { views: [{ title: "A", cards: [{ type: "x", a: 1 }] }] };
    expect(
      configIsAsImported(
        { views: [{ cards: [{ a: 1, type: "x" }], title: "A" }] },
        config
      )
    ).toBe(true);
    expect(
      configIsAsImported(
        { views: [{ title: "A", cards: [{ type: "x", a: 2 }] }] },
        config
      )
    ).toBe(false);
    expect(configIsAsImported(undefined, config)).toBe(false);
  });
});
