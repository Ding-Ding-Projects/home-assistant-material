import { describe, expect, it } from "vitest";
import {
  accountComplete,
  accountErrors,
  buildRail,
  buildReview,
  defaultUnitSystem,
  previewRegion,
  railProgress,
  reportPassword,
} from "../../src/onboarding/onboarding-logic";

describe("reportPassword", () => {
  it("is empty for no password and matches an empty confirmation", () => {
    const report = reportPassword("", "");
    expect(report.strength).toBe("empty");
    expect(report.matches).toBe(true);
    expect(report.confirmTouched).toBe(false);
  });

  it("rates short and repeated passwords as weak", () => {
    expect(reportPassword("abc", "").strength).toBe("weak");
    expect(reportPassword("aaaaaaaaaaaaaaaa", "").strength).toBe("weak");
  });

  it("rates a long mixed password as strong", () => {
    const report = reportPassword("Correct-horse-9-battery", "");
    expect(report.strength).toBe("strong");
    expect(report.longEnough).toBe(true);
  });

  it("detects a mismatch once the confirmation is typed", () => {
    const report = reportPassword("Correct-horse-9", "Correct-horse-");
    expect(report.confirmTouched).toBe(true);
    expect(report.matches).toBe(false);
    expect(reportPassword("Correct-horse-9", "Correct-horse-9").matches).toBe(
      true
    );
  });

  it("never contains the password in the report", () => {
    const secret = "Zx9!secretvalue";
    expect(JSON.stringify(reportPassword(secret, secret))).not.toContain(
      secret
    );
  });
});

describe("accountErrors and accountComplete", () => {
  const values = {
    name: "Sam",
    username: "sam",
    password: "Correct-horse-9",
    password_confirm: "Correct-horse-9",
  };

  it("shows no error for untouched fields", () => {
    expect(
      accountErrors({ ...values, username: "Bad Name" }, {})
    ).toStrictEqual({});
  });

  it("flags a username with capitals or spaces once touched", () => {
    expect(
      accountErrors({ ...values, username: "Sam" }, { username: true })
    ).toStrictEqual({ username: "not_normalized" });
  });

  it("flags a confirmation that differs", () => {
    expect(
      accountErrors(
        { ...values, password_confirm: "nope" },
        { password_confirm: true }
      )
    ).toStrictEqual({ password_confirm: "not_match" });
  });

  it("is complete only when every field is valid", () => {
    expect(accountComplete(values)).toBe(true);
    expect(accountComplete({ ...values, name: " " })).toBe(false);
    expect(accountComplete({ ...values, username: "Sam" })).toBe(false);
    expect(accountComplete({ ...values, password_confirm: "x" })).toBe(false);
  });
});

describe("buildRail", () => {
  const steps = [
    { step: "user", done: true },
    { step: "core_config", done: false },
    { step: "integration", done: false },
  ];

  it("marks done, current and todo", () => {
    expect(buildRail(steps).map((item) => item.state)).toStrictEqual([
      "done",
      "current",
      "todo",
    ]);
  });

  it("makes a done step reachable only when the server allows a change", () => {
    expect(buildRail(steps)[0].reachable).toBe(false);
    expect(buildRail(steps, new Set(["user"]))[0].reachable).toBe(true);
    expect(buildRail(steps, new Set(["integration"]))[2].reachable).toBe(false);
  });

  it("clamps progress", () => {
    expect(railProgress(1, 4)).toBe(0.25);
    expect(railProgress(9, 4)).toBe(1);
    expect(railProgress(1, 0)).toBe(0);
  });
});

describe("regional preview", () => {
  it("picks the unit system from the country", () => {
    expect(defaultUnitSystem("US")).toBe("us_customary");
    expect(defaultUnitSystem("CA")).toBe("metric");
    expect(defaultUnitSystem(undefined)).toBe("metric");
  });

  it("formats temperature and distance for the unit system", () => {
    const metric = previewRegion({
      language: "en",
      timeZone: "Etc/UTC",
      unitSystem: "metric",
      currency: "CAD",
    });
    expect(metric.temperature).toContain("°C");
    expect(metric.distance).toContain("km");
    expect(metric.currency).toContain("1,234.50");
    const us = previewRegion({
      language: "en",
      timeZone: "Etc/UTC",
      unitSystem: "us_customary",
      currency: undefined,
    });
    expect(us.temperature).toContain("°F");
    expect(us.distance).toContain("mi");
    expect(us.currency).toBe("");
  });

  it("returns empty text for a time zone the browser rejects", () => {
    expect(
      previewRegion({
        language: "en",
        timeZone: "Not/AZone",
        unitSystem: "metric",
        currency: undefined,
      }).date
    ).toBe("");
  });
});

describe("buildReview", () => {
  it("lists only the values given and has no password row", () => {
    const rows = buildReview({
      name: "Sam",
      username: "sam",
      location: [43.65321, -79.38318],
      country: "CA",
      unitSystem: "metric",
      currency: "CAD",
      timeZone: "America/Toronto",
    });
    expect(rows.map((row) => row.key)).toStrictEqual([
      "name",
      "username",
      "location",
      "country",
      "units",
      "time_zone",
    ]);
    expect(rows[2].value).toBe("43.653, -79.383");
    expect(JSON.stringify(rows)).not.toContain("password");
  });

  it("skips empty values", () => {
    expect(buildReview({ name: "Sam" })).toHaveLength(1);
  });
});
