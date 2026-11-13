import { describe, expect, it } from "vitest";
import type { LoadSample } from "../../../../src/panels/lovelace/common/load-diagnostics";
import {
  applyFix,
  buildFindings,
  customResourceTimings,
  ownFileTimings,
  summarizeLoad,
} from "../../../../src/panels/config/performance/perf-findings";

const ORIGIN = "http://ha.test";

const sample = (over: Partial<LoadSample> = {}): LoadSample => ({
  version: 1,
  urlPath: null,
  path: "/lovelace/0",
  mode: "storage",
  startedAt: 1000,
  sinceNavigationMs: 400,
  cards: [],
  skippedCards: 0,
  entityCount: 0,
  requests: [],
  images: [],
  finished: true,
  ...over,
});

describe("summarizeLoad", () => {
  it("reports the first and the last finished card", () => {
    const result = summarizeLoad(
      sample({
        cards: [
          { type: "a", label: "", startedMs: 0, endedMs: 800, entityCount: 0 },
          {
            type: "b",
            label: "",
            startedMs: 10,
            endedMs: 3100,
            entityCount: 0,
          },
          {
            type: "c",
            label: "",
            startedMs: 20,
            endedMs: 1200,
            entityCount: 0,
          },
        ],
      })
    );
    expect(result).toEqual({ firstCardsMs: 800, allCardsMs: 3100 });
  });

  it("says nothing when no card was drawn", () => {
    expect(summarizeLoad(sample())).toEqual({});
  });
});

describe("buildFindings", () => {
  it("lists long history requests and keeps the slowest per entity set", () => {
    const base = {
      kind: "history" as const,
      at: 1500,
      entityIds: ["sensor.a", "sensor.b"],
      entityCount: 2,
      spanHours: 720,
    };
    const findings = buildFindings(
      sample({
        requests: [
          { ...base, ms: 100 },
          { ...base, ms: 600 },
          { ...base, ms: 50, spanHours: 24 },
        ],
      })
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("history-span");
    expect(findings[0].ms).toBe(600);
    expect(findings[0].fix).toEqual({
      type: "history-hours",
      entityIds: ["sensor.a", "sensor.b"],
      to: 24,
    });
  });

  it("offers no fix when only some of the entities were recorded", () => {
    const [finding] = buildFindings(
      sample({
        requests: [
          {
            kind: "statistics",
            at: 1500,
            ms: 900,
            entityIds: ["sensor.a"],
            entityCount: 80,
            spanHours: 24 * 30,
          },
        ],
      })
    );
    expect(finding.kind).toBe("statistics-span");
    expect(finding.fix).toBeUndefined();
  });

  it("sorts slowest first and skips failed requests and fast cards", () => {
    const findings = buildFindings(
      sample({
        cards: [
          {
            type: "map",
            label: "Home",
            startedMs: 0,
            endedMs: 1900,
            entityCount: 1,
          },
          {
            type: "tile",
            label: "",
            startedMs: 0,
            endedMs: 100,
            entityCount: 1,
          },
        ],
        requests: [
          {
            kind: "history",
            at: 1500,
            ms: 600,
            entityIds: ["sensor.a"],
            entityCount: 1,
            spanHours: 100,
          },
          {
            kind: "history",
            at: 1500,
            ms: 9000,
            entityIds: ["sensor.z"],
            entityCount: 1,
            spanHours: 100,
            failed: true,
          },
        ],
      })
    );
    expect(findings.map((f) => f.kind)).toEqual(["slow-card", "history-span"]);
  });

  it("flags an oversized picture and offers a smaller stored copy only for uploads", () => {
    const image = {
      naturalWidth: 4000,
      naturalHeight: 3000,
      shownWidth: 400,
      shownHeight: 300,
      pixelRatio: 1,
      decodedBytes: 48_000_000,
    };
    const findings = buildFindings(
      sample({
        images: [
          { ...image, path: "/api/image/serve/abc/original" },
          { ...image, path: "/local/big.jpg" },
          { ...image, path: "/local/small.jpg", naturalWidth: 500 },
        ],
      })
    );
    expect(findings).toHaveLength(2);
    const upload = findings.find((f) => f.id.includes("serve"))!;
    expect(upload.fix).toEqual({
      type: "image-size",
      path: "/api/image/serve/abc/original",
      size: 512,
    });
    expect(findings.find((f) => f.id.includes("/local/big"))!.fix).toBe(
      undefined
    );
  });

  it("lists slow or large custom resources for review", () => {
    const findings = buildFindings(sample(), [
      { url: "/local/fast.js", ms: 50, bytes: 1000 },
      { url: "/local/slow.js", ms: 1500 },
      { url: "/local/large.js", ms: 100, bytes: 900_000 },
    ]);
    expect(findings.map((f) => f.args.url)).toEqual([
      "/local/slow.js",
      "/local/large.js",
    ]);
    expect(findings[0].reviewPath).toBe("/config/lovelace/resources");
  });
});

describe("applyFix", () => {
  const config = {
    views: [
      {
        sections: [
          {
            cards: [
              {
                type: "history-graph",
                hours_to_show: 720,
                entities: ["sensor.a", { entity: "sensor.b" }],
              },
              {
                type: "history-graph",
                hours_to_show: 12,
                entities: ["sensor.a", "sensor.b"],
              },
              {
                type: "history-graph",
                hours_to_show: 720,
                entities: ["sensor.other"],
              },
            ],
          },
        ],
      },
    ],
  };

  it("changes only the matching card and leaves the original untouched", () => {
    const result = applyFix(
      config,
      { type: "history-hours", entityIds: ["sensor.b", "sensor.a"], to: 24 },
      ORIGIN
    );
    expect(result?.changed).toBe(1);
    const cards = (result!.config as typeof config).views[0].sections[0].cards;
    expect(cards.map((c) => c.hours_to_show)).toEqual([24, 12, 720]);
    expect(config.views[0].sections[0].cards[0].hours_to_show).toBe(720);
  });

  it("returns nothing when no card matches", () => {
    expect(
      applyFix(
        config,
        { type: "history-hours", entityIds: ["sensor.none"], to: 24 },
        ORIGIN
      )
    ).toBeUndefined();
  });

  it("swaps the original picture for a sized copy in any string", () => {
    const result = applyFix(
      { cards: [{ type: "picture", image: "/api/image/serve/abc/original" }] },
      { type: "image-size", path: "/api/image/serve/abc/original", size: 512 },
      ORIGIN
    );
    expect(result?.changed).toBe(1);
    expect(JSON.stringify(result?.config)).toContain(
      "/api/image/serve/abc/512x512"
    );
  });
});

describe("resource timings", () => {
  const entry = (name: string, duration: number, transferSize = 0) => ({
    name,
    duration,
    transferSize,
    decodedBodySize: 0,
    initiatorType: "script",
  });

  it("keeps the app's own files and not the data requests, slowest first", () => {
    const files = ownFileTimings(
      [
        entry(`${ORIGIN}/frontend_latest/a.js`, 100, 5000),
        entry(`${ORIGIN}/frontend_latest/b.js`, 900),
        entry(`${ORIGIN}/api/states`, 5000),
        entry("http://other.test/x.js", 7000),
      ],
      ORIGIN
    );
    expect(files.map((f) => f.url)).toEqual([
      "/frontend_latest/b.js",
      "/frontend_latest/a.js",
    ]);
    expect(files[1].bytes).toBe(5000);
  });

  it("matches custom resources by address, ignoring the version query", () => {
    const timings = customResourceTimings(
      ["/local/card.js?v=3", "/local/missing.js"],
      [entry(`${ORIGIN}/local/card.js?v=3`, 321, 2048)],
      ORIGIN
    );
    expect(timings).toEqual([{ url: "/local/card.js", ms: 321, bytes: 2048 }]);
  });
});
