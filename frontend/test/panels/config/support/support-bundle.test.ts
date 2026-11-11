import { describe, expect, it } from "vitest";
import type { BundleInput } from "../../../../src/panels/config/support/support-bundle";
import {
  BUNDLE_PROBLEM_LIMIT,
  buildSupportBundle,
  hideAddresses,
  supportBundleFileName,
} from "../../../../src/panels/config/support/support-bundle";

const base = (): BundleInput => ({
  generatedAt: new Date("2026-11-10T12:00:00Z"),
  version: "2026.11.1",
  language: "en",
  timeZone: "UTC",
  state: "RUNNING",
  safeMode: false,
  recoveryMode: false,
  components: ["light", "hue", "light"],
  problems: [],
  problemsUnavailable: false,
  userAgent: "TestBrowser/1.0",
});

describe("supportBundleFileName", () => {
  it("carries the day the bundle was made", () => {
    expect(supportBundleFileName(new Date("2026-11-10T23:59:00Z"))).toBe(
      "support-bundle-2026-11-10.txt"
    );
  });
});

describe("hideAddresses", () => {
  it.each([
    ["10.0.0.1", "[address hidden]"],
    ["host 255.255.255.255:8123", "host [address hidden]:8123"],
    ["::1", "[address hidden]"],
    ["2001:db8::8a2e:370:7334", "[address hidden]"],
    ["2001:0db8:85a3:0000:0000:8a2e:0370:7334", "[address hidden]"],
    ["aa-bb-cc-dd-ee-ff", "[address hidden]"],
    ["a.b+c@mail.example.org", "[address hidden]"],
  ])("hides %s", (input, expected) => {
    expect(hideAddresses(input)).toBe(expected);
  });

  it.each([
    "2026.11.1.85",
    "02:49:13",
    "version 1.2.3",
    "300.1.1.1",
    "light.kitchen at 12:30:45",
  ])("does not touch %s", (input) => {
    expect(hideAddresses(input)).toBe(input);
  });
});

describe("buildSupportBundle", () => {
  it("lists each integration once, sorted", () => {
    const text = buildSupportBundle(base());
    expect(text).toContain("Loaded integrations (2)");
    expect(text).toContain("hue, light");
  });

  it("hides credentials in titles and never includes problem details", () => {
    const text = buildSupportBundle({
      ...base(),
      problems: [
        {
          title: "Login failed with Bearer abcdefghijklmnop1234",
          count: 2,
          last_seen: "2026-11-09",
        },
      ],
    });
    expect(text).not.toContain("abcdefghijklmnop1234");
    expect(text).toContain("[hidden]");
    expect(text).toContain("2 times");
  });

  it("hides network and email addresses in problem titles", () => {
    const text = buildSupportBundle({
      ...base(),
      problems: [
        {
          title:
            "Cannot reach 192.168.1.20 and fe80::1ff:fe23:4567:890a, mac AA:BB:CC:DD:EE:FF, mail me@example.com",
          count: 1,
          last_seen: "2026-11-09",
        },
      ],
    });
    expect(text).not.toContain("192.168.1.20");
    expect(text).not.toContain("fe80");
    expect(text).not.toContain("AA:BB:CC:DD:EE:FF");
    expect(text).not.toContain("me@example.com");
    expect(text.match(/\[address hidden\]/g)).toHaveLength(4);
  });

  it("leaves versions and times in titles alone", () => {
    const title =
      "Update 2026.11.1.85 failed at 02:49:13, also 2025.1.2.3.4 and 12:30";
    const text = buildSupportBundle({
      ...base(),
      problems: [{ title, count: 1, last_seen: "2026-11-09" }],
    });
    expect(text).toContain(title);
  });

  it("says plainly what a bundle holds and that titles need a read", () => {
    const text = buildSupportBundle(base());
    expect(text).toContain("Time zone");
    expect(text).toContain("the loaded integrations");
    expect(text).toContain("may still contain names");
    expect(text).not.toContain("addresses, names of people");
  });

  it("caps the problem list and counts the rest", () => {
    const problems = Array.from(
      { length: BUNDLE_PROBLEM_LIMIT + 3 },
      (_, i) => ({
        title: `Problem ${i}`,
        count: 1,
        last_seen: `2026-11-${String(i + 1).padStart(2, "0")}`,
      })
    );
    const text = buildSupportBundle({ ...base(), problems });
    expect(text).toContain("and 3 more not listed");
  });

  it("says when the problem log could not be read", () => {
    const text = buildSupportBundle({ ...base(), problemsUnavailable: true });
    expect(text).toContain("The problem log could not be read.");
  });
});
