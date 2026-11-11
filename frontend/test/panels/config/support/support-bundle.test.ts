import { describe, expect, it } from "vitest";
import type { BundleInput } from "../../../../src/panels/config/support/support-bundle";
import {
  BUNDLE_PROBLEM_LIMIT,
  buildSupportBundle,
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
