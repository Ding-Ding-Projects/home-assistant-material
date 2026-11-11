import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertionCredentialToJSON,
  base64urlToBuffer,
  bufferToBase64url,
  creationOptionsFromJSON,
  deleteAllPasskeys,
  fetchPasskeyAvailable,
  isIpAddressHost,
  isPasskeySupported,
  PasskeyError,
  registerPasskey,
  registrationCredentialToJSON,
  requestOptionsFromJSON,
  signInWithPasskey,
  toPasskeyError,
} from "../../src/data/passkey";

const bytesOf = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer));

const toBuffer = (bytes: number[]) => new Uint8Array(bytes).buffer;

describe("base64url helpers", () => {
  it("uses the url alphabet without padding", () => {
    expect(bufferToBase64url(toBuffer([0xfb, 0xff, 0xfe]))).toBe("-__-");
    expect(bufferToBase64url(toBuffer([1]))).toBe("AQ");
    expect(bufferToBase64url(toBuffer([1, 2]))).toBe("AQI");
    expect(bufferToBase64url(toBuffer([]))).toBe("");
  });

  it("decodes values with every padding length", () => {
    expect(bytesOf(base64urlToBuffer("-__-"))).toEqual([0xfb, 0xff, 0xfe]);
    expect(bytesOf(base64urlToBuffer("AQ"))).toEqual([1]);
    expect(bytesOf(base64urlToBuffer("AQI"))).toEqual([1, 2]);
    expect(bytesOf(base64urlToBuffer(""))).toEqual([]);
  });

  it("round trips every byte value", () => {
    const all = Array.from({ length: 256 }, (_, i) => i);
    expect(
      bytesOf(base64urlToBuffer(bufferToBase64url(toBuffer(all))))
    ).toEqual(all);
  });
});

describe("option conversion", () => {
  it("decodes the binary fields of the creation options", () => {
    const options = creationOptionsFromJSON({
      rp: { id: "ha.example.com", name: "Home Assistant" },
      user: { id: "AQI", name: "Test", displayName: "Test" },
      challenge: "-__-",
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      excludeCredentials: [{ id: "AQ", type: "public-key" }],
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
      attestation: "none",
      timeout: 1000,
    });

    expect(bytesOf(options.user.id as ArrayBuffer)).toEqual([1, 2]);
    expect(bytesOf(options.challenge as ArrayBuffer)).toEqual([
      0xfb, 0xff, 0xfe,
    ]);
    expect(options.excludeCredentials).toHaveLength(1);
    expect(bytesOf(options.excludeCredentials![0].id as ArrayBuffer)).toEqual([
      1,
    ]);
    expect(options.rp.id).toBe("ha.example.com");
    expect(options.authenticatorSelection?.residentKey).toBe("required");
    expect(options.attestation).toBe("none");
  });

  it("keeps the list of allowed credentials empty for a discoverable sign-in", () => {
    const options = requestOptionsFromJSON({
      challenge: "AQ",
      rpId: "ha.example.com",
      allowCredentials: [],
      userVerification: "required",
    });

    expect(bytesOf(options.challenge as ArrayBuffer)).toEqual([1]);
    expect(options.allowCredentials).toEqual([]);
    expect(options.userVerification).toBe("required");
  });
});

describe("credential encoding", () => {
  const base = {
    id: "AQ",
    rawId: toBuffer([1]),
    type: "public-key",
    authenticatorAttachment: "platform",
    getClientExtensionResults: () => ({}),
  };

  it("encodes a registration credential", () => {
    const json = registrationCredentialToJSON({
      ...base,
      response: {
        clientDataJSON: toBuffer([2]),
        attestationObject: toBuffer([3]),
        getTransports: () => ["internal"],
      },
    } as unknown as PublicKeyCredential);

    expect(json.rawId).toBe("AQ");
    expect(json.response).toEqual({
      clientDataJSON: "Ag",
      attestationObject: "Aw",
      transports: ["internal"],
    });
  });

  it("encodes a registration credential from a browser without transports", () => {
    const json = registrationCredentialToJSON({
      ...base,
      response: {
        clientDataJSON: toBuffer([2]),
        attestationObject: toBuffer([3]),
      },
    } as unknown as PublicKeyCredential);

    expect(json.response.transports).toEqual([]);
  });

  it("encodes an assertion with and without a user handle", () => {
    const response = {
      clientDataJSON: toBuffer([2]),
      authenticatorData: toBuffer([4]),
      signature: toBuffer([5]),
    };
    const withHandle = assertionCredentialToJSON({
      ...base,
      response: { ...response, userHandle: toBuffer([6]) },
    } as unknown as PublicKeyCredential);
    const withoutHandle = assertionCredentialToJSON({
      ...base,
      response: { ...response, userHandle: null },
    } as unknown as PublicKeyCredential);

    expect(withHandle.response).toEqual({
      clientDataJSON: "Ag",
      authenticatorData: "BA",
      signature: "BQ",
      userHandle: "Bg",
    });
    expect(withoutHandle.response.userHandle).toBeNull();
  });
});

describe("support and errors", () => {
  it("needs a secure context and the browser API", () => {
    expect(
      isPasskeySupported({
        isSecureContext: true,
        PublicKeyCredential: vi.fn(),
      })
    ).toBe(true);
    expect(
      isPasskeySupported({
        isSecureContext: false,
        PublicKeyCredential: vi.fn(),
      })
    ).toBe(false);
    expect(isPasskeySupported({ isSecureContext: true })).toBe(false);
  });

  it("is not supported on an IP address", () => {
    const env = { isSecureContext: true, PublicKeyCredential: vi.fn() };
    expect(
      isPasskeySupported({ ...env, location: { hostname: "ha.example.com" } })
    ).toBe(true);
    expect(
      isPasskeySupported({ ...env, location: { hostname: "localhost" } })
    ).toBe(true);
    expect(
      isPasskeySupported({ ...env, location: { hostname: "192.168.1.5" } })
    ).toBe(false);
    expect(
      isPasskeySupported({ ...env, location: { hostname: "[2001:db8::1]" } })
    ).toBe(false);
  });

  it("recognises IP address hosts", () => {
    expect(isIpAddressHost("10.0.0.1")).toBe(true);
    expect(isIpAddressHost("::1")).toBe(true);
    expect(isIpAddressHost("ha.example.com")).toBe(false);
    expect(isIpAddressHost("1.example.com")).toBe(false);
  });

  it("treats a dismissed prompt as a cancel and everything else as a failure", () => {
    expect(toPasskeyError({ name: "NotAllowedError" }).kind).toBe("cancelled");
    expect(toPasskeyError({ name: "AbortError" }).kind).toBe("cancelled");
    expect(toPasskeyError({ name: "SecurityError" }).kind).toBe("failed");
    expect(toPasskeyError(new Error("boom")).kind).toBe("failed");
    expect(toPasskeyError(undefined).kind).toBe("failed");
    const existing = new PasskeyError("cancelled");
    expect(toPasskeyError(existing)).toBe(existing);
  });

  it("recognises the answer for a session that is too old", () => {
    expect(toPasskeyError({ code: "recent_sign_in_required" }).kind).toBe(
      "sign_in_required"
    );
    expect(toPasskeyError({ code: "other" }).kind).toBe("failed");
  });
});

describe("fetchPasskeyAvailable", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns what the server says", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ available: true }),
      })
    );
    await expect(fetchPasskeyAvailable()).resolves.toBe(true);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ available: false }),
      })
    );
    await expect(fetchPasskeyAvailable()).resolves.toBe(false);
  });

  it("is false when the server cannot be asked", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(fetchPasskeyAvailable()).resolves.toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(fetchPasskeyAvailable()).resolves.toBe(false);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    );
    await expect(fetchPasskeyAvailable()).resolves.toBe(false);
  });
});

describe("registration", () => {
  it("reports a session that is too old as a sign in required", async () => {
    const hass = {
      callWS: vi.fn().mockRejectedValue({ code: "recent_sign_in_required" }),
    };
    await expect(registerPasskey(hass as any, "Phone")).rejects.toMatchObject({
      kind: "sign_in_required",
    });
  });

  it("removes all passkeys through one call", async () => {
    const hass = { callWS: vi.fn().mockResolvedValue({ removed: 2 }) };
    await expect(deleteAllPasskeys(hass as any)).resolves.toEqual({
      removed: 2,
    });
    expect(hass.callWS).toHaveBeenCalledWith({
      type: "passkey/delete_all",
      user_id: undefined,
    });
  });
});

describe("signInWithPasskey", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const params = {
    clientId: "https://ha.example.com/",
    redirectUri: "https://ha.example.com/?auth_callback=1",
  };

  const stubFetch = (...responses: { ok: boolean; body?: unknown }[]) => {
    const fetchMock = vi.fn();
    responses.forEach((response) =>
      fetchMock.mockResolvedValueOnce({
        ok: response.ok,
        json: async () => response.body,
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  const begin = {
    ok: true,
    body: {
      challenge_id: "abc",
      options: { challenge: "AQ", allowCredentials: [] },
    },
  };

  it("posts the begin and finish requests and returns the code", async () => {
    const fetchMock = stubFetch(begin, { ok: true, body: { result: "code" } });
    vi.stubGlobal("navigator", {
      credentials: {
        get: vi.fn().mockResolvedValue({
          id: "AQ",
          rawId: toBuffer([1]),
          type: "public-key",
          authenticatorAttachment: null,
          getClientExtensionResults: () => ({}),
          response: {
            clientDataJSON: toBuffer([2]),
            authenticatorData: toBuffer([4]),
            signature: toBuffer([5]),
            userHandle: toBuffer([6]),
          },
        }),
      },
    });

    await expect(signInWithPasskey(params)).resolves.toBe("code");

    expect(fetchMock.mock.calls[0][0]).toBe("/auth/passkey/begin");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      client_id: params.clientId,
      redirect_uri: params.redirectUri,
    });
    expect(fetchMock.mock.calls[1][0]).toBe("/auth/passkey/finish");
    const finishBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(finishBody.challenge_id).toBe("abc");
    expect(finishBody.credential.response.userHandle).toBe("Bg");
  });

  it("reports a dismissed browser prompt as a cancel", async () => {
    stubFetch(begin);
    vi.stubGlobal("navigator", {
      credentials: {
        get: vi.fn().mockRejectedValue({ name: "NotAllowedError" }),
      },
    });

    await expect(signInWithPasskey(params)).rejects.toMatchObject({
      kind: "cancelled",
    });
  });

  it("reports a refused begin or finish as a plain failure", async () => {
    stubFetch({ ok: false });
    await expect(signInWithPasskey(params)).rejects.toMatchObject({
      kind: "failed",
    });

    stubFetch(begin, { ok: false });
    vi.stubGlobal("navigator", {
      credentials: {
        get: vi.fn().mockResolvedValue({
          id: "AQ",
          rawId: toBuffer([1]),
          type: "public-key",
          authenticatorAttachment: null,
          getClientExtensionResults: () => ({}),
          response: {
            clientDataJSON: toBuffer([2]),
            authenticatorData: toBuffer([4]),
            signature: toBuffer([5]),
            userHandle: null,
          },
        }),
      },
    });
    await expect(signInWithPasskey(params)).rejects.toMatchObject({
      kind: "failed",
    });
  });
});
