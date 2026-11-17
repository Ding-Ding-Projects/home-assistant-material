import { describe, expect, it } from "vitest";
import type { ReleaseEntry } from "../../src/data/build-changes";
import {
  areaShares,
  timeApart,
  changesToText,
  correctRange,
  countByArea,
  countChanges,
  defaultFromBuild,
  defaultRange,
  detailsForMode,
  filterReleases,
  parseChangeList,
  sliceReleases,
} from "../../src/data/build-changes";

const change = (
  title: string,
  areas: string[],
  extra: Record<string, unknown> = {}
) => ({
  sha: `sha${title}`,
  date: "2026-11-16T10:00:00Z",
  title,
  areas,
  ...extra,
});

const release = (build: number, changes: ReturnType<typeof change>[]) => ({
  build,
  core: `2026.11.1.${build}`,
  supervisor: "2026.11.0.1",
  os: "18.5.1",
  tag: null,
  source: "abcdef123",
  date: "2026-11-16T10:00:00Z",
  previous_build: null,
  changes,
});

const file = (releases: unknown[]) => ({
  format: 1,
  generated: "2026-11-16T22:00:00Z",
  repository: "owner/name",
  newest_build: 460,
  releases,
});

const list = () =>
  parseChangeList(
    file([
      release(450, [change("Old", ["core"])]),
      release(460, [
        change("Search fix", ["interface"], {
          detail: "English words",
          detail_yue: "廣東話",
        }),
        change("Image build", ["build", "os"]),
      ]),
      release(457, [change("Feed move", ["build"])]),
    ])
  )!;

describe("parseChangeList", () => {
  it("sorts newest first and keeps valid entries", () => {
    expect(list().releases.map((item) => item.build)).toEqual([460, 457, 450]);
  });

  it("ignores malformed releases and changes", () => {
    const parsed = parseChangeList(
      file([
        release(460, [change("Good", ["core"]), { sha: "x" } as never]),
        { build: "x", core: "y" },
        { build: 5 },
        null,
      ])
    );
    expect(parsed?.releases).toHaveLength(1);
    expect(parsed?.releases[0].changes).toHaveLength(1);
  });

  it("refuses a file that is not a change list", () => {
    expect(parseChangeList({ format: 2, releases: [] })).toBeUndefined();
    expect(parseChangeList(null)).toBeUndefined();
    expect(parseChangeList({ format: 1 })).toBeUndefined();
  });
});

describe("the range the comparison opens on", () => {
  const releases = list().releases;

  it("runs from the installed build to the newest when the installed one is older", () => {
    expect(defaultRange(releases, 457)).toEqual({
      from: 457,
      to: 460,
      belowList: false,
      latestOnly: false,
    });
  });

  it("opens on the newest build alone when the installed one is the newest", () => {
    expect(defaultRange(releases, 460)).toEqual({
      from: 457,
      to: 460,
      belowList: false,
      latestOnly: true,
    });
  });

  it("does the same when the installed build is newer than the list", () => {
    const range = defaultRange(releases, 999);
    expect(range.from).toBe(457);
    expect(range.to).toBe(460);
    expect(range.latestOnly).toBe(true);
  });

  it("never opens with From equal to To when the list has an older build", () => {
    [undefined, 100, 450, 457, 458, 460, 461].forEach((installed) => {
      const range = defaultRange(releases, installed);
      expect(range.from, String(installed)).toBeLessThan(range.to);
    });
  });
});

describe("choosing the starting build", () => {
  const releases = list().releases;

  it("uses the installed build when the list has it", () => {
    expect(defaultFromBuild(releases, 457)).toEqual({
      build: 457,
      belowList: false,
    });
  });

  it("uses the nearest older build when the installed one is not listed", () => {
    expect(defaultFromBuild(releases, 458)).toEqual({
      build: 457,
      belowList: false,
    });
    expect(defaultFromBuild(releases, 999)).toEqual({
      build: 460,
      belowList: false,
    });
  });

  it("falls back to the oldest build when the installed one is older than all", () => {
    expect(defaultFromBuild(releases, 100)).toEqual({
      build: 450,
      belowList: true,
    });
  });

  it("starts at the oldest build when the installed build is unknown", () => {
    expect(defaultFromBuild(releases, undefined).build).toBe(450);
    expect(defaultFromBuild([], 5).build).toBeUndefined();
  });
});

describe("ranges", () => {
  const releases = list().releases;

  it("takes the builds after From up to and including To", () => {
    expect(
      sliceReleases(releases, { from: 450, to: 460 }).map((item) => item.build)
    ).toEqual([460, 457]);
    expect(
      sliceReleases(releases, { from: 457, to: 460 }).map((item) => item.build)
    ).toEqual([460]);
    expect(sliceReleases(releases, { from: 460, to: 460 })).toEqual([]);
  });

  it("works when From is not a listed build", () => {
    expect(
      sliceReleases(releases, { from: 455, to: 460 }).map((item) => item.build)
    ).toEqual([460, 457]);
  });

  it("keeps From at or below To", () => {
    expect(correctRange({ from: 460, to: 450 }, "from")).toEqual({
      from: 460,
      to: 460,
    });
    expect(correctRange({ from: 460, to: 450 }, "to")).toEqual({
      from: 450,
      to: 450,
    });
    expect(correctRange({ from: 450, to: 460 }, "to")).toEqual({
      from: 450,
      to: 460,
    });
  });
});

describe("filtering", () => {
  const releases = list().releases;

  it("counts changes per area, counting a change once for each of its areas", () => {
    expect(countByArea(releases)).toEqual({
      core: 1,
      interface: 1,
      build: 2,
      os: 1,
    });
    expect(countChanges(releases)).toBe(4);
  });

  it("keeps changes with any chosen area and drops empty builds", () => {
    const result = filterReleases(releases, {
      areas: new Set(["os"]),
      query: "",
    });
    expect(result).toHaveLength(1);
    expect(result[0].changes.map((item) => item.title)).toEqual([
      "Image build",
    ]);
  });

  it("searches titles and both detail texts without regard to case", () => {
    const by = (query: string) =>
      countChanges(filterReleases(releases, { areas: new Set(), query }));
    expect(by("SEARCH")).toBe(1);
    expect(by("english")).toBe(1);
    expect(by("廣東")).toBe(1);
    expect(by("nothing like it")).toBe(0);
  });

  it("reads /pattern/ as a pattern", () => {
    expect(
      countChanges(
        filterReleases(releases, { areas: new Set(), query: "/^(Old|Feed)/" })
      )
    ).toBe(2);
  });

  it("returns everything when no filter is set", () => {
    expect(filterReleases(releases, { areas: new Set(), query: " " })).toBe(
      releases
    );
  });
});

describe("text", () => {
  const search = list().releases[0].changes[0];

  it("chooses detail paragraphs by language mode", () => {
    expect(detailsForMode(search, "english")).toEqual(["English words"]);
    expect(detailsForMode(search, "cantonese")).toEqual(["廣東話"]);
    expect(detailsForMode(search, "bilingual")).toEqual([
      "English words",
      "廣東話",
    ]);
  });

  it("falls back to English when there is no Cantonese text", () => {
    const only = { ...search, detailYue: undefined };
    expect(detailsForMode(only, "cantonese")).toEqual(["English words"]);
    expect(detailsForMode(only, "bilingual")).toEqual(["English words"]);
    expect(detailsForMode({ ...only, detail: undefined }, "english")).toEqual(
      []
    );
  });

  it("writes the filtered list as plain text", () => {
    const releases: ReleaseEntry[] = list().releases.slice(0, 1);
    const text = changesToText(releases, {
      heading: "Heading",
      releaseLabel: (item) => `Build ${item.build}`,
      areaLabel: (area) => area.toUpperCase(),
      details: (item) => detailsForMode(item, "english"),
    });
    expect(text).toBe(
      [
        "Heading",
        "",
        "Build 460",
        "- Search fix [INTERFACE]",
        "    English words",
        "- Image build [BUILD, OS]",
      ].join("\n")
    );
  });
});

describe("time apart and area bars", () => {
  it("measures the time between two release dates", () => {
    expect(
      timeApart("2026-11-14T00:56:00-05:00", "2026-11-16T14:43:00-05:00")
    ).toEqual({ days: 2, hours: 13, minutes: 47 });
    expect(timeApart("2026-11-16T14:43:00Z", "2026-11-14T00:56:00Z")).toEqual({
      days: 2,
      hours: 13,
      minutes: 47,
    });
    expect(timeApart("nope", "2026-11-16T14:43:00Z")).toBeUndefined();
    expect(timeApart(undefined, undefined)).toBeUndefined();
  });

  it("sizes each bar as a share of the largest count", () => {
    expect(areaShares({ docs: 40, interface: 20, core: 7 })).toEqual({
      docs: 100,
      interface: 50,
      core: 18,
    });
    expect(areaShares({})).toEqual({});
    expect(areaShares({ docs: 0 })).toEqual({ docs: 0 });
  });
});
