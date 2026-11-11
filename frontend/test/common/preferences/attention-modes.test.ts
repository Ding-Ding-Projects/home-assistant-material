import { describe, expect, it } from "vitest";
import {
  clockText,
  elapsedMinutes,
  isPlainAppPath,
  MOMENTUM_MAX_AGE_MS,
  shouldOfferMomentum,
} from "../../../src/common/preferences/attention-modes";

// Protects the offer to go back from pointing at another site: only one plain
// in-app path is accepted.
describe("isPlainAppPath", () => {
  it("accepts in-app paths", () => {
    expect(isPlainAppPath("/")).toBe(true);
    expect(isPlainAppPath("/config/areas?x=1#top")).toBe(true);
  });

  it("refuses addresses that leave the app", () => {
    expect(isPlainAppPath("//evil.example")).toBe(false);
    expect(isPlainAppPath("/\\evil.example")).toBe(false);
    expect(isPlainAppPath("/a\\b")).toBe(false);
    expect(isPlainAppPath("https://example.com")).toBe(false);
    expect(isPlainAppPath("config")).toBe(false);
    expect(isPlainAppPath("/a\nb")).toBe(false);
    expect(isPlainAppPath(5)).toBe(false);
  });
});

describe("clockText with a bad language tag", () => {
  it("falls back to the default locale instead of throwing", () => {
    const now = new Date(2024, 0, 3, 9, 5);
    expect(() => clockText(now, now.getTime(), "not a tag!!")).not.toThrow();
  });
});

describe("elapsedMinutes", () => {
  it("counts whole minutes and never goes negative", () => {
    expect(elapsedMinutes(0, 59_999)).toBe(0);
    expect(elapsedMinutes(0, 125_000)).toBe(2);
    expect(elapsedMinutes(10_000, 0)).toBe(0);
  });
});

describe("clockText", () => {
  it("shows the time and the minutes this tab has been open", () => {
    const now = new Date(2024, 0, 3, 9, 5);
    const text = clockText(now, now.getTime() - 12 * 60000, "en-GB");
    expect(text).toContain("09:05");
    expect(text).toContain("12");
  });

  it("switches to hours after an hour", () => {
    const now = new Date(2024, 0, 3, 9, 5);
    const text = clockText(now, now.getTime() - 135 * 60000, "en-GB");
    expect(text).toContain("2");
    expect(text).toContain("15");
  });
});

// Protects the offer to go back: it must not point at the page you are on,
// at an old or malformed record, or at an address outside this app.
describe("shouldOfferMomentum", () => {
  const now = 1_000_000_000_000;

  it("offers a recent page that is not the current one", () => {
    expect(
      shouldOfferMomentum(
        { path: "/config/areas", at: now - 1000 },
        "/lovelace/0",
        now
      )
    ).toBe(true);
  });

  it("does not offer the current page", () => {
    expect(
      shouldOfferMomentum(
        { path: "/lovelace/0", at: now - 1000 },
        "/lovelace/0",
        now
      )
    ).toBe(false);
  });

  it("does not offer an old page", () => {
    expect(
      shouldOfferMomentum(
        { path: "/config", at: now - MOMENTUM_MAX_AGE_MS - 1 },
        "/lovelace/0",
        now
      )
    ).toBe(false);
  });

  it("does not offer nothing or a bad record", () => {
    expect(shouldOfferMomentum(undefined, "/", now)).toBe(false);
    expect(
      shouldOfferMomentum({ path: "https://example.com", at: now }, "/", now)
    ).toBe(false);
    expect(
      shouldOfferMomentum({ path: "/config", at: "x" } as never, "/", now)
    ).toBe(false);
  });
});
