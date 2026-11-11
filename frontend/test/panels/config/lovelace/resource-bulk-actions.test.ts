import { describe, expect, it } from "vitest";
import type { LovelaceResource } from "../../../../src/data/lovelace/resource";
import {
  buildResourceDeletePreview,
  resourceAddress,
  summarizeResourceDelete,
} from "../../../../src/panels/config/lovelace/resources/resource-bulk-actions";

// Echoes the key and values so a test sees which line was built
const localize = (key: string, values?: Record<string, string | number>) =>
  values ? `${key}|${JSON.stringify(values)}` : key;

const resources: LovelaceResource[] = [
  { id: "a", type: "module", url: "/local/card.js" },
  { id: "b", type: "module", url: "https://cdn.example.com/lib/x.js?v=1" },
  { id: "c", type: "css", url: "https://ha.local:8123/local/x.css" },
];

describe("resourceAddress", () => {
  it("treats a relative path as local", () => {
    expect(resourceAddress("/local/card.js", "ha.local:8123")).toEqual({
      label: "/local/card.js",
      outside: false,
    });
  });

  it("shows only the host of an outside address", () => {
    expect(
      resourceAddress("https://cdn.example.com/lib/x.js?v=1", "ha.local:8123")
    ).toEqual({ label: "cdn.example.com", outside: true });
  });

  it("treats a protocol relative address as outside", () => {
    expect(resourceAddress("//cdn.example.com/x.js", "ha.local:8123")).toEqual({
      label: "cdn.example.com",
      outside: true,
    });
  });

  it("treats an address on this instance as local, ignoring case", () => {
    expect(
      resourceAddress("https://HA.local:8123/local/x.css", "ha.local:8123")
        .outside
    ).toBe(false);
  });

  it("treats an absolute address as outside when the own host is unknown", () => {
    expect(resourceAddress("https://ha.local:8123/x.js").outside).toBe(true);
  });
});

describe("buildResourceDeletePreview", () => {
  it("names each address and marks outside ones", () => {
    const preview = buildResourceDeletePreview(
      {
        resources,
        selectedIds: ["a", "b"],
        hiddenCount: 0,
        ownHost: "ha.local:8123",
        usage: {},
      },
      localize
    );
    expect(preview.changeCount).toBe(2);
    expect(preview.items.map((item) => item.text)).toEqual([
      'ui.panel.config.lovelace.resources.bulk_preview_item|{"address":"/local/card.js"}',
      'ui.panel.config.lovelace.resources.bulk_preview_outside|{"address":"cdn.example.com"}',
    ]);
  });

  it("warns once per resource that a dashboard loads", () => {
    const preview = buildResourceDeletePreview(
      {
        resources,
        selectedIds: ["a", "c"],
        hiddenCount: 0,
        ownHost: "ha.local:8123",
        usage: { a: ["Overview", "Garage"] },
      },
      localize
    );
    const warnings = preview.items.filter((item) => item.kind === "skip");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].text).toContain("Overview, Garage");
  });

  it("says so when dashboard use cannot be known", () => {
    const preview = buildResourceDeletePreview(
      { resources, selectedIds: ["a"], hiddenCount: 0 },
      localize
    );
    expect(
      preview.items.filter((item) => item.kind === "skip").map((i) => i.text)
    ).toEqual(["ui.panel.config.lovelace.resources.bulk_usage_unknown"]);
  });

  it("includes a hidden selection and says it is hidden", () => {
    const preview = buildResourceDeletePreview(
      {
        resources,
        selectedIds: ["a", "b"],
        hiddenCount: 1,
        usage: {},
      },
      localize
    );
    expect(preview.changeCount).toBe(2);
    expect(preview.items[preview.items.length - 1]).toEqual({
      kind: "same",
      text: 'ui.bulk.preview_hidden|{"count":1}',
    });
  });

  it("ignores selected ids that no longer exist and blocks an empty run", () => {
    const preview = buildResourceDeletePreview(
      { resources, selectedIds: ["gone"], hiddenCount: 0, usage: {} },
      localize
    );
    expect(preview.changeCount).toBe(0);
    expect(preview.items).toEqual([]);
  });
});

describe("summarizeResourceDelete", () => {
  it("separates the deleted from the failed so failures stay selected", () => {
    const summary = summarizeResourceDelete(
      ["a", "b", "c"],
      [
        { status: "fulfilled", value: undefined },
        { status: "rejected", reason: new Error("no") },
        { status: "fulfilled", value: undefined },
      ]
    );
    expect(summary).toEqual({ deletedIds: ["a", "c"], failedIds: ["b"] });
  });

  it("reports everything as deleted when nothing failed", () => {
    const summary = summarizeResourceDelete(
      ["a"],
      [{ status: "fulfilled", value: undefined }]
    );
    expect(summary.failedIds).toEqual([]);
  });
});
