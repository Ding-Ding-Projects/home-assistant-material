import { describe, expect, it } from "vitest";
import {
  NEST_STEP_IDS,
  nestProgress,
  nestRedirectUri,
  restoreNestChecklist,
  serializeNestChecklist,
  validateNestClientText,
  validateNestProjectId,
} from "../../../../src/panels/config/google-setup/nest-guidance";

describe("validateNestProjectId", () => {
  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["1b2c3d4e-5f60-7182-93a4-b5c6d7e8f901", "valid"],
    ["  1B2C3D4E-5F60-7182-93A4-B5C6D7E8F901  ", "valid"],
    ["1b2c3d4e5f60718293a4b5c6d7e8f901", "invalid"],
    ["1b2c3d4e-5f60-7182-93a4-b5c6d7e8f90", "invalid"],
    ["1b2c3d4e-5f60-7182-93a4-b5c6d7e8f90g", "invalid"],
    ["my-cloud-project-123", "invalid"],
  ])("classifies %j as %s", (value, expected) => {
    expect(validateNestProjectId(value)).toBe(expected);
  });
});

describe("nestRedirectUri", () => {
  it("builds the callback from the origin", () => {
    expect(nestRedirectUri("http://homeassistant.local:8123")).toBe(
      "http://homeassistant.local:8123/auth/external/callback"
    );
    expect(nestRedirectUri("https://ha.example.com")).toBe(
      "https://ha.example.com/auth/external/callback"
    );
  });

  it("drops any path on the origin", () => {
    expect(nestRedirectUri("https://ha.example.com/lovelace/0")).toBe(
      "https://ha.example.com/auth/external/callback"
    );
  });

  it("uses the My Home Assistant address when that is loaded", () => {
    expect(nestRedirectUri("http://homeassistant.local:8123", true)).toBe(
      "https://my.home-assistant.io/redirect/oauth"
    );
  });

  it("returns nothing for an origin that is not http or https", () => {
    expect(nestRedirectUri("")).toBe("");
    expect(nestRedirectUri("null")).toBe("");
    expect(nestRedirectUri("file:///tmp/x")).toBe("");
  });
});

describe("nest checklist progress", () => {
  it("counts only known steps once", () => {
    expect(nestProgress([])).toEqual({ done: 0, total: 6 });
    expect(nestProgress(["create_project", "enable_api"])).toEqual({
      done: 2,
      total: 6,
    });
    expect(nestProgress(["create_project", "create_project", "bogus"])).toEqual(
      { done: 1, total: 6 }
    );
    expect(nestProgress(NEST_STEP_IDS)).toEqual({ done: 6, total: 6 });
  });

  it("round-trips through storage and ignores bad data", () => {
    const text = serializeNestChecklist(["redirect", "create_project", "x"]);
    expect([...restoreNestChecklist(text)]).toEqual([
      "create_project",
      "redirect",
    ]);
    expect(restoreNestChecklist(null).size).toBe(0);
    expect(restoreNestChecklist("not json").size).toBe(0);
    expect(restoreNestChecklist('{"a":1}').size).toBe(0);
  });
});

describe("validateNestClientText", () => {
  it("accepts a client file and rejects other text", () => {
    const ok = validateNestClientText(
      JSON.stringify({
        web: {
          client_id: "123-abc.apps.googleusercontent.com",
          client_secret: "s",
        },
      })
    );
    expect(ok).toMatchObject({ ok: true, kind: "web" });
    expect(validateNestClientText("nope")).toEqual({
      ok: false,
      error: "invalid_json",
    });
  });
});
