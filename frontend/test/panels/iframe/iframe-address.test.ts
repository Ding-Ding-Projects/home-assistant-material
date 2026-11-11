import { describe, expect, it } from "vitest";
import {
  displayAddress,
  hasHiddenAddressParts,
  isOwnOrigin,
  resolveAddress,
} from "../../../src/panels/iframe/iframe-address";

// Protects the rule that decides whether an embedded page may be opened from
// the product: only an address on this instance's own origin may.

const BASE = "https://home.example:8123/lovelace/0";

describe("isOwnOrigin", () => {
  it("accepts a relative address and the same origin", () => {
    expect(isOwnOrigin("/api/hassio_ingress/abc", BASE)).toBe(true);
    expect(isOwnOrigin("https://home.example:8123/x?y=1", BASE)).toBe(true);
  });

  it("rejects another host, port or scheme", () => {
    expect(isOwnOrigin("https://other.example/", BASE)).toBe(false);
    expect(isOwnOrigin("https://home.example:9000/", BASE)).toBe(false);
    expect(isOwnOrigin("http://home.example:8123/", BASE)).toBe(false);
  });

  it("is not fooled by an address that merely contains the host", () => {
    expect(isOwnOrigin("https://home.example:8123.evil.example/", BASE)).toBe(
      false
    );
    expect(isOwnOrigin("https://home.example:8123@evil.example/", BASE)).toBe(
      false
    );
  });

  it("rejects an opaque origin and an address that cannot be read", () => {
    expect(isOwnOrigin("data:text/html,hello", BASE)).toBe(false);
    expect(isOwnOrigin("https://", BASE)).toBe(false);
  });
});

describe("displayAddress", () => {
  it("shows origin and path and hides the query and the user info", () => {
    expect(displayAddress("https://other.example/a/b?token=abc#x", BASE)).toBe(
      "https://other.example/a/b?…"
    );
    expect(displayAddress("https://user:pw@other.example/a", BASE)).toBe(
      "https://other.example/a"
    );
    expect(displayAddress("/local/page", BASE)).toBe(
      "https://home.example:8123/local/page"
    );
  });

  it("never leaks a secret from an address that cannot be read", () => {
    expect(displayAddress("https://user:pw@/a?token=abc", BASE)).not.toMatch(
      /pw|abc/
    );
    expect(displayAddress("data:text/html,secret", BASE)).toBe("data:…");
  });

  it("says when something was hidden", () => {
    expect(hasHiddenAddressParts("https://o.example/a?x=1", BASE)).toBe(true);
    expect(hasHiddenAddressParts("https://u:p@o.example/a", BASE)).toBe(true);
    expect(hasHiddenAddressParts("https://o.example/a", BASE)).toBe(false);
  });
});

describe("resolveAddress", () => {
  it("gives undefined for an address that is not valid", () => {
    expect(resolveAddress("https://", BASE)).toBeUndefined();
    expect(resolveAddress("/a", BASE)?.href).toBe(
      "https://home.example:8123/a"
    );
  });
});
