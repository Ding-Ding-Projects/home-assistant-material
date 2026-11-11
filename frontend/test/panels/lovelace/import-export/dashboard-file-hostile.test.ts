import { describe, expect, it } from "vitest";
import {
  analyzeDashboardImport,
  parseDashboardFileText,
  validateDashboardFile,
  SUMMARY_LIST_LIMIT,
} from "../../../../src/panels/lovelace/import-export/dashboard-file";

// A dropped dashboard file is someone else's content. These tests protect the
// summary shown before anything is created: a crafted file must not be able to
// make the summary say something the file does not do.

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

const RLO = String.fromCharCode(0x202e);
const ZWSP = String.fromCharCode(0x200b);

describe("summary hosts", () => {
  it("takes the host a browser would go to when a backslash is used", () => {
    const summary = summarize(
      dashboardWith([
        { type: "picture", image: "https://evil.com\\@google.com/x" },
      ])
    );
    expect(summary.addresses.items[0].host).toBe("evil.com");
  });

  it("flags hosts that are not plain ASCII", () => {
    const summary = summarize(
      dashboardWith([{ type: "picture", image: "https://gооgle.com/x.png" }])
    );
    expect(summary.addresses.items[0].problem).toBe("non_ascii");
  });

  it("flags an address that cannot be read", () => {
    const summary = summarize(
      dashboardWith([{ type: "picture", image: "https://[bad/x.png" }])
    );
    expect(summary.addresses.items[0].problem).toBe("unreadable");
  });

  it("keeps the end of a long host visible", () => {
    const host = `google.com.${"a".repeat(80)}.evil.com`;
    const summary = summarize(
      dashboardWith([{ type: "picture", image: `https://${host}/x.png` }])
    );
    const shown = summary.addresses.items[0].host;
    expect(shown.endsWith("evil.com")).toBe(true);
    expect(shown.length).toBeLessThan(host.length);
  });

  it("marks an address with an impossibly long host", () => {
    const host = `${"b".repeat(60)}.${"c".repeat(60)}.${"d".repeat(60)}.${"e".repeat(60)}.${"f".repeat(30)}.com`;
    const summary = summarize(
      dashboardWith([{ type: "picture", image: `https://${host}/x.png` }])
    );
    expect(summary.addresses.items[0].problem).toBe("too_long");
  });

  it("lists a problem address before harmless ones, whatever its position", () => {
    const cards = Array.from(
      { length: SUMMARY_LIST_LIMIT + 5 },
      (_unused, i) => ({
        type: "picture",
        image: `https://h${i}.example/a.png`,
      })
    );
    cards.push({ type: "picture", image: "https://[bad/x.png" });
    const summary = summarize(dashboardWith(cards));
    expect(summary.addresses.items[0].problem).toBe("unreadable");
    expect(summary.addresses.total).toBe(SUMMARY_LIST_LIMIT + 6);
    expect(summary.addresses.all).toHaveLength(SUMMARY_LIST_LIMIT + 6);
  });
});

describe("summary actions", () => {
  it("lists actions written with the older service key", () => {
    const summary = summarize(
      dashboardWith([
        {
          type: "entities",
          entities: [
            {
              type: "call-service",
              name: "Go",
              service: "homeassistant.restart",
            },
          ],
        },
        {
          type: "picture-elements",
          elements: [{ type: "service-button", service: "script.wipe" }],
        },
      ])
    );
    const services = summary.actions.items.map((item) => item.service);
    expect(services).toContain("homeassistant.restart");
    expect(services).toContain("script.wipe");
  });

  it("does not let harmless actions bury a dangerous one", () => {
    const cards: unknown[] = Array.from(
      { length: SUMMARY_LIST_LIMIT + 10 },
      () => ({
        type: "button",
        tap_action: {
          action: "perform-action",
          perform_action: "light.toggle",
        },
      })
    );
    cards.push({
      type: "button",
      name: "Last",
      tap_action: {
        action: "perform-action",
        perform_action: "homeassistant.restart",
      },
    });
    const summary = summarize(dashboardWith(cards));
    expect(summary.actions.items[0].service).toBe("homeassistant.restart");
  });

  it("never cuts the risky class", () => {
    const cards = Array.from({ length: SUMMARY_LIST_LIMIT + 7 }, (_u, i) => ({
      type: "button",
      tap_action: { action: "perform-action", perform_action: `x.risky${i}` },
    }));
    const summary = summarize(dashboardWith(cards));
    expect(summary.actions.items).toHaveLength(SUMMARY_LIST_LIMIT + 7);
  });
});

describe("imported titles", () => {
  it("removes hidden characters from titles and says so", () => {
    const parsed = validateDashboardFile(
      {
        views: [{ title: `Home${RLO}${ZWSP}`, cards: [] }],
        title: `Evil${RLO}`,
      },
      "Fallback"
    );
    if (!parsed.ok || parsed.kind !== "dashboard") {
      throw new Error("expected a dashboard");
    }
    expect(parsed.settings.title).toBe("Evil");
    expect((parsed.config.views[0] as { title: string }).title).toBe("Home");
    expect(parsed.removed.total).toBeGreaterThan(0);
    expect(parsed.removed.items.some((item) => item.kind === "text")).toBe(
      true
    );
  });

  it("falls back when a title is only hidden characters", () => {
    const parsed = validateDashboardFile(
      { views: [{ cards: [] }], title: `${ZWSP}${RLO}` },
      "Fallback"
    );
    if (!parsed.ok || parsed.kind !== "dashboard") {
      throw new Error("expected a dashboard");
    }
    expect(parsed.settings.title).toBe("Fallback");
  });
});

describe("file size", () => {
  it("measures bytes, not characters", () => {
    // About 2.2 MiB of two-byte characters is fewer characters than the limit.
    const text = JSON.stringify({ views: [{ title: "é".repeat(1_100_000) }] });
    expect(text.length).toBeLessThan(2 * 1024 * 1024);
    const result = parseDashboardFileText("x.json", text, "F");
    expect(result).toEqual({ ok: false, error: "too_large" });
  });
});
