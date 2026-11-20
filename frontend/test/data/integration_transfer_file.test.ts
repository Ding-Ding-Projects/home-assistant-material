import { describe, expect, it } from "vitest";
import type {
  DomainHere,
  IntegrationsListRow,
} from "../../src/data/integration_transfer";
import {
  countEntityKinds,
  formatMadeAt,
  groupImportedList,
  integrationsListText,
  readIntegrationsList,
  readSettingsFileHead,
  settingValueText,
} from "../../src/data/integration_transfer_file";

const row = (
  domain: string,
  extra: Partial<IntegrationsListRow> = {}
): IntegrationsListRow => ({
  domain,
  name: domain.toUpperCase(),
  source: "built_in",
  version: null,
  entries: 1,
  entity_kinds: ["sensor"],
  ...extra,
});

const listFile = (rows: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    kind: "home-assistant-material/integrations-list",
    format: 1,
    build: "2026.11.2.529",
    made_at: "2026-11-19T19:40:00+00:00",
    names_included: false,
    counts_included: true,
    integrations: rows,
    ...extra,
  });

describe("readIntegrationsList", () => {
  it("reads a list saved by Export the list", () => {
    const result = readIntegrationsList(
      listFile([
        row("mqtt", {
          entity_kinds: ["light", "sensor"],
          entity_counts: { light: 6, sensor: 41 },
          devices: 3,
        }),
        row("my_heater", { source: "custom", version: "1.4.0" }),
      ])
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.integrations).toHaveLength(2);
    expect(result.value.integrations[0].entity_counts).toEqual({
      light: 6,
      sensor: 41,
    });
    expect(countEntityKinds(result.value)).toBe(3);
  });

  it("round-trips the text it saves", () => {
    const first = readIntegrationsList(listFile([row("met")]));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const again = readIntegrationsList(integrationsListText(first.value));
    expect(again).toEqual(first);
  });

  it.each([
    ["not json", "{ nope", "not_json"],
    [
      "another kind",
      JSON.stringify({ kind: "other", format: 1 }),
      "wrong_kind",
    ],
    ["a newer format", listFile([], { format: 2 }), "wrong_kind"],
    ["an array", "[]", "wrong_kind"],
    [
      "rows that are not a list",
      listFile([], { integrations: {} }),
      "wrong_shape",
    ],
    ["an unsafe domain", listFile([row("../etc")]), "wrong_shape"],
    ["markup as a domain", listFile([row("<img src=x>")]), "wrong_shape"],
    ["a duplicate domain", listFile([row("met"), row("met")]), "wrong_shape"],
    [
      "a negative count",
      listFile([row("met", { entries: -1 })]),
      "wrong_shape",
    ],
    [
      "an unknown source",
      listFile([{ ...row("met"), source: "elsewhere" }]),
      "wrong_shape",
    ],
    [
      "a bad entity count",
      listFile([row("met", { entity_counts: { sensor: 1.5 } })]),
      "wrong_shape",
    ],
  ])("refuses %s whole", (_label, text, reason) => {
    expect(readIntegrationsList(text)).toEqual({ ok: false, reason });
  });

  it("refuses a file over 1 MB before reading it", () => {
    const big = listFile([row("met", { name: "x".repeat(150) })]).padEnd(
      1024 * 1024 + 1,
      " "
    );
    expect(readIntegrationsList(big)).toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("keeps markup in a name as text", () => {
    const result = readIntegrationsList(
      listFile([row("met", { name: "<script>alert(1)</script>" })])
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.integrations[0].name).toBe("<script>alert(1)</script>");
  });

  it("drops fields it does not know", () => {
    const result = readIntegrationsList(
      listFile([{ ...row("met"), url: "https://example.com/x.js" }])
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.value.integrations[0])).not.toContain("url");
  });
});

describe("groupImportedList", () => {
  const here: Record<string, DomainHere> = {
    mqtt: { known: true, built_in: true, config_flow: true, entries: 0 },
    met: { known: true, built_in: true, config_flow: true, entries: 2 },
    yaml_only: { known: true, built_in: true, config_flow: false, entries: 0 },
    my_heater: {
      known: false,
      built_in: false,
      config_flow: false,
      entries: 0,
    },
    gone: { known: false, built_in: false, config_flow: false, entries: 0 },
  };

  it("sorts rows into the three groups", () => {
    const groups = groupImportedList(
      [
        row("mqtt"),
        row("met"),
        row("yaml_only"),
        row("my_heater", { source: "custom" }),
        row("gone"),
      ],
      here
    );
    expect(groups.notHere.map((r) => r.domain)).toEqual(["mqtt"]);
    expect(groups.alreadyHere.map((r) => r.domain)).toEqual(["met"]);
    expect(
      groups.cannotAdd.map((item) => [item.row.domain, item.reason])
    ).toEqual([
      ["yaml_only", "no_setup"],
      ["my_heater", "custom_missing"],
      ["gone", "unknown"],
    ]);
  });

  it("treats a domain this system did not report as unknown", () => {
    const groups = groupImportedList([row("never_asked")], {});
    expect(groups.cannotAdd[0].reason).toBe("unknown");
  });

  it("moves a row to Already here only when an entry exists", () => {
    const after = { ...here, mqtt: { ...here.mqtt, entries: 1 } };
    expect(groupImportedList([row("mqtt")], here).notHere).toHaveLength(1);
    expect(groupImportedList([row("mqtt")], after).alreadyHere).toHaveLength(1);
  });
});

describe("readSettingsFileHead", () => {
  const settings = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      kind: "home-assistant-material/integration-settings",
      format: 1,
      domain: "mqtt",
      ...extra,
    });

  it("reads the integration a settings file is for", () => {
    expect(readSettingsFileHead(settings({ locked: true }))).toEqual({
      ok: true,
      value: { domain: "mqtt", locked: true },
    });
  });

  it("refuses a list file and a bad domain", () => {
    expect(readSettingsFileHead(listFile([]))).toEqual({
      ok: false,
      reason: "wrong_kind",
    });
    expect(readSettingsFileHead(settings({ domain: "a/b" }))).toEqual({
      ok: false,
      reason: "wrong_shape",
    });
  });
});

describe("formatMadeAt", () => {
  it("uses a 24-hour time", () => {
    expect(formatMadeAt("2026-11-19T19:40:00+00:00", "en-GB")).toContain(
      "19:40"
    );
    expect(formatMadeAt("2026-11-19T19:40:00+00:00", "en-US")).toContain(
      "19:40"
    );
  });

  it("shows text that is not a date as it is", () => {
    expect(formatMadeAt("<b>soon</b>", "en")).toBe("<b>soon</b>");
  });
});

describe("settingValueText", () => {
  it("shows values as plain text and cuts long ones", () => {
    expect(settingValueText(true)).toBe("true");
    expect(settingValueText(30)).toBe("30");
    expect(settingValueText("x".repeat(100), 10)).toBe(`${"x".repeat(9)}…`);
  });
});
