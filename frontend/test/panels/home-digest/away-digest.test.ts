import { describe, expect, it } from "vitest";
import {
  absenceWindow,
  attentionItems,
  AWAY_MAX_WINDOW_MS,
  buildDigest,
  describeDuration,
  digestLead,
  digestRows,
  shouldShowDigest,
} from "../../../src/panels/home-digest/away-digest";
import type { DigestStates } from "../../../src/panels/home-digest/away-digest";
import type { LogbookEntry } from "../../../src/data/logbook";
import { normalizePersonalPreferences } from "../../../src/common/preferences/personal-preferences";

const HOUR = 3600 * 1000;
const NOW = Date.UTC(2026, 10, 17, 12, 0, 0);

const states: DigestStates = {
  "automation.porch": { state: "on", attributes: { friendly_name: "Porch" } },
  "binary_sensor.front_door": {
    state: "off",
    attributes: { device_class: "door", friendly_name: "Front door" },
  },
  "binary_sensor.motion": {
    state: "off",
    attributes: { device_class: "motion", friendly_name: "Motion" },
  },
  "person.sam": { state: "home", attributes: { friendly_name: "Sam" } },
  "light.hall": { state: "unavailable", attributes: { friendly_name: "Hall" } },
  "sensor.remote_battery": {
    state: "9",
    attributes: { device_class: "battery", friendly_name: "Remote" },
  },
  "sensor.phone_battery": {
    state: "80",
    attributes: { device_class: "battery", friendly_name: "Phone" },
  },
};

const at = (hoursAgo: number) => (NOW - hoursAgo * HOUR) / 1000;

const entries: LogbookEntry[] = [
  {
    when: at(5),
    domain: "automation",
    entity_id: "automation.porch",
    message: "triggered by state of binary_sensor.front_door",
    context_event_type: "automation_triggered",
  },
  { when: at(5), entity_id: "automation.porch", state: "on" },
  { when: at(4), entity_id: "binary_sensor.front_door", state: "on" },
  { when: at(4), entity_id: "binary_sensor.front_door", state: "off" },
  { when: at(3), entity_id: "binary_sensor.motion", state: "on" },
  { when: at(2), entity_id: "person.sam", state: "home", name: "Sam" },
  { when: at(1), entity_id: "light.hall", state: "unavailable" },
  // Before the window, so never counted.
  { when: at(30), entity_id: "person.sam", state: "home" },
];

describe("shouldShowDigest", () => {
  const base = {
    enabled: true,
    gapHours: 2,
    lastSeen: NOW - 3 * HOUR,
    now: NOW,
  };

  it("shows after the gap", () => {
    expect(shouldShowDigest(base)).toBe(true);
    expect(shouldShowDigest({ ...base, lastSeen: NOW - 2 * HOUR })).toBe(true);
  });

  it("stays away below the gap", () => {
    expect(shouldShowDigest({ ...base, lastSeen: NOW - HOUR })).toBe(false);
  });

  it("stays away when switched off, on a first visit or after a clock change", () => {
    expect(shouldShowDigest({ ...base, enabled: false })).toBe(false);
    expect(shouldShowDigest({ ...base, lastSeen: undefined })).toBe(false);
    expect(shouldShowDigest({ ...base, lastSeen: NOW + HOUR })).toBe(false);
  });
});

describe("the preference", () => {
  it("is on with a two hour gap by default and keeps the gap in range", () => {
    const defaults = normalizePersonalPreferences(undefined);
    expect(defaults.awayDigest).toBe(true);
    expect(defaults.awayDigestGapHours).toBe(2);
    expect(
      normalizePersonalPreferences({ awayDigestGapHours: 500 })
        .awayDigestGapHours
    ).toBe(24);
    expect(
      normalizePersonalPreferences({ awayDigestGapHours: 0 }).awayDigestGapHours
    ).toBe(1);
    expect(
      normalizePersonalPreferences({ awayDigest: "no" as never }).awayDigest
    ).toBe(true);
  });
});

describe("absenceWindow", () => {
  it("covers the whole absence when it is short", () => {
    expect(absenceWindow(NOW - 5 * HOUR, NOW)).toEqual({
      start: NOW - 5 * HOUR,
      end: NOW,
      capped: false,
    });
  });

  it("is capped at seven days", () => {
    const window = absenceWindow(NOW - 30 * 24 * HOUR, NOW);
    expect(window.end - window.start).toBe(AWAY_MAX_WINDOW_MS);
    expect(window.capped).toBe(true);
  });
});

describe("describeDuration", () => {
  it("picks the unit", () => {
    expect(describeDuration(10 * 60 * 1000)).toEqual({
      unit: "minutes",
      count: 10,
    });
    expect(describeDuration(5 * HOUR)).toEqual({ unit: "hours", count: 5 });
    expect(describeDuration(50 * HOUR)).toEqual({ unit: "days", count: 2 });
  });
});

describe("buildDigest", () => {
  const digest = buildDigest(entries, states, {
    start: NOW - 6 * HOUR,
    end: NOW,
  });

  it("counts from the entries inside the window", () => {
    expect(digest.counts).toEqual({
      automations: 1,
      openings: 1,
      arrivals: 1,
      attention: 2,
    });
  });

  it("only lists tiles the home can really count", () => {
    expect(digest.sources).toEqual({
      automations: true,
      openings: true,
      arrivals: true,
    });
    const bare = buildDigest(
      entries,
      { "light.hall": states["light.hall"] },
      {
        start: NOW - 6 * HOUR,
        end: NOW,
      }
    );
    expect(bare.sources).toEqual({
      automations: false,
      openings: false,
      arrivals: false,
    });
  });

  it("lists notable events newest first", () => {
    expect(digest.events.map((event) => event.entityId)).toEqual([
      "person.sam",
      "binary_sensor.front_door",
    ]);
  });
});

describe("attentionItems", () => {
  it("lists an entity that went unavailable and still is, and low batteries", () => {
    const items = attentionItems(entries, states);
    expect(items.map((item) => [item.kind, item.entityId])).toEqual([
      ["unavailable", "light.hall"],
      ["battery", "sensor.remote_battery"],
    ]);
    expect(items[1].percent).toBe(9);
  });

  it("skips an entity that came back", () => {
    const back: DigestStates = {
      ...states,
      "light.hall": { state: "on", attributes: {} },
    };
    expect(
      attentionItems(entries, back).some((item) => item.kind === "unavailable")
    ).toBe(false);
  });
});

describe("digestLead and digestRows", () => {
  it("chooses a lead from how much happened", () => {
    const counts = { automations: 0, openings: 0, arrivals: 0, attention: 0 };
    expect(digestLead(counts)).toBe("nothing");
    expect(digestLead({ ...counts, openings: 4 })).toBe("quiet");
    expect(digestLead({ ...counts, automations: 11 })).toBe("busy");
  });

  it("puts what needs a look first and shows at most six rows", () => {
    const digest = buildDigest(entries, states, {
      start: NOW - 6 * HOUR,
      end: NOW,
    });
    const rows = digestRows(digest);
    expect(rows.map((row) => row.type)).toEqual([
      "attention",
      "attention",
      "event",
      "event",
    ]);
    const many = digestRows({
      attention: [],
      events: Array.from({ length: 10 }, (_, index) => ({
        kind: "opening" as const,
        entityId: `binary_sensor.d${index}`,
        name: `D${index}`,
        when: index,
      })),
    });
    expect(many).toHaveLength(6);
  });
});
