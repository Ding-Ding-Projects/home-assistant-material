import { describe, expect, it } from "vitest";
import {
  emptyDraft,
  googleEnableApiUrl,
  googleRedirectUri,
  parseGoogleClientJson,
  restoreDraft,
  serializeDraft,
} from "../../../../src/data/google_setup";

const CLIENT_ID = "123-abc.apps.googleusercontent.com";

describe("parseGoogleClientJson", () => {
  it("reads a web client", () => {
    const result = parseGoogleClientJson(
      JSON.stringify({
        web: {
          client_id: CLIENT_ID,
          client_secret: "s3cret",
          redirect_uris: ["https://my.home-assistant.io/redirect/oauth"],
        },
      })
    );
    expect(result).toEqual({
      ok: true,
      kind: "web",
      clientId: CLIENT_ID,
      clientSecret: "s3cret",
      redirectUris: ["https://my.home-assistant.io/redirect/oauth"],
    });
  });

  it("reads an installed client", () => {
    const result = parseGoogleClientJson(
      JSON.stringify({
        installed: { client_id: CLIENT_ID, client_secret: "x" },
      })
    );
    expect(result).toMatchObject({ ok: true, kind: "installed" });
  });

  it.each([
    ["not json", "invalid_json"],
    ["[]", "not_a_client"],
    [JSON.stringify({ other: {} }), "not_a_client"],
    [JSON.stringify({ web: { client_secret: "x" } }), "missing_client_id"],
    [
      JSON.stringify({ web: { client_id: "nope", client_secret: "x" } }),
      "client_id_shape",
    ],
    [
      JSON.stringify({ web: { client_id: CLIENT_ID } }),
      "missing_client_secret",
    ],
    ["x".repeat(30000), "too_large"],
  ])("rejects %#", (text, error) => {
    expect(parseGoogleClientJson(text)).toEqual({ ok: false, error });
  });

  it("never puts the secret in an error", () => {
    const result = parseGoogleClientJson(
      JSON.stringify({ web: { client_id: "bad", client_secret: "TOPSECRET" } })
    );
    expect(JSON.stringify(result)).not.toContain("TOPSECRET");
  });
});

describe("redirect address", () => {
  it("uses the My Home Assistant address when it is loaded", () => {
    expect(googleRedirectUri(true, "http://ha.local:8123")).toBe(
      "https://my.home-assistant.io/redirect/oauth"
    );
  });

  it("uses the instance callback otherwise", () => {
    expect(googleRedirectUri(false, "http://ha.local:8123")).toBe(
      "http://ha.local:8123/auth/external/callback"
    );
  });
});

describe("console link", () => {
  it("builds the one-click enable address", () => {
    expect(googleEnableApiUrl("drive.googleapis.com")).toBe(
      "https://console.cloud.google.com/flows/enableapi?apiid=drive.googleapis.com"
    );
  });
});

describe("draft", () => {
  it("round trips and holds no secrets", () => {
    const stored = serializeDraft({
      ...emptyDraft(),
      step: "credentials",
      clientId: CLIENT_ID,
      // Extra fields must never be written.
      ...({ clientSecret: "TOPSECRET", key: "PRIVATE" } as object),
    });
    expect(stored).not.toContain("TOPSECRET");
    expect(stored).not.toContain("PRIVATE");
    expect(restoreDraft(stored)).toMatchObject({
      step: "credentials",
      clientId: CLIENT_ID,
    });
  });

  it("drops unknown or malformed content", () => {
    expect(restoreDraft("{not json")).toEqual(emptyDraft());
    expect(restoreDraft(null)).toEqual(emptyDraft());
    expect(restoreDraft(JSON.stringify({ step: "nope" })).step).toBe("helper");
  });
});
