import { describe, expect, it } from "vitest";
import {
  consentStatus,
  extensionTitle,
  panelAbilities,
  readConsents,
  resourceAbilities,
  sourceOf,
  withConsent,
  withoutConsent,
} from "../../../src/common/extensions/extension-logic";

const consent = (key: string, url: string) => ({
  key,
  url,
  by: "Owner",
  at: "2026-11-12T10:00:00.000Z",
});

describe("consent records", () => {
  it("tells allowed, changed address and nothing recorded apart", () => {
    const list = [consent("resource:1", "/local/a.js")];
    expect(consentStatus(list, "resource:1", "/local/a.js")).toBe("allowed");
    expect(consentStatus(list, "resource:1", "/local/b.js")).toBe("changed");
    expect(consentStatus(list, "resource:2", "/local/a.js")).toBe("none");
  });

  it("keeps one record per extension, the newest", () => {
    const first = consent("resource:1", "/local/a.js");
    const second = consent("resource:1", "/local/b.js");
    expect(withConsent([first], second)).toEqual([second]);
    expect(
      withoutConsent([first, consent("panel:x", "/x.js")], "resource:1")
    ).toHaveLength(1);
  });

  it("drops anything that is not a well formed record", () => {
    expect(readConsents("nope")).toEqual([]);
    expect(
      readConsents([consent("a", "b"), { key: 1 }, null, { key: "a" }])
    ).toEqual([consent("a", "b")]);
  });
});

describe("what an extension can do", () => {
  it("says a script runs with the session and a stylesheet only restyles", () => {
    expect(resourceAbilities("module")).toEqual(["runs_code", "uses_session"]);
    expect(resourceAbilities("js")).toEqual(["runs_code", "uses_session"]);
    expect(resourceAbilities("css")).toEqual(["restyle"]);
    expect(resourceAbilities("html")).toContain("runs_code");
  });

  it("separates a framed panel from one that runs in the interface", () => {
    expect(
      panelAbilities({ embed_iframe: true, trust_external: false })
    ).toEqual(["framed"]);
    expect(
      panelAbilities({ embed_iframe: false, trust_external: true })
    ).toEqual(["runs_code", "uses_session", "external_trusted"]);
  });
});

describe("sourceOf", () => {
  it("compares the address with this server", () => {
    expect(sourceOf("/local/a.js", "home.local:8123").kind).toBe("same_server");
    expect(
      sourceOf("https://home.local:8123/local/a.js", "home.local:8123").kind
    ).toBe("same_server");
    expect(sourceOf("https://cdn.example.com/a.js", "home.local:8123")).toEqual(
      { kind: "other_server", host: "cdn.example.com" }
    );
    expect(sourceOf("javascript:alert(1)", "home.local:8123").kind).toBe(
      "unknown"
    );
  });
});

describe("extensionTitle", () => {
  it("uses the file name without version query or extension", () => {
    expect(extensionTitle("/local/room-planner.js?v=2")).toBe("room-planner");
    expect(extensionTitle("/hacsfiles/x/card.css")).toBe("card");
  });
});
