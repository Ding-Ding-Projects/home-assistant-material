import { describe, expect, it } from "vitest";
import {
  appendViewToConfig,
  buildDashboardEnvelope,
  buildViewEnvelope,
  DASHBOARD_FILE_FORMAT,
  exportFileName,
  parseDashboardFileText,
  pickNewDashboardUrlPath,
  routeDroppedFile,
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
