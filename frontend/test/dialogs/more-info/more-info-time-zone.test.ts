import { describe, expect, it } from "vitest";
import {
  calendarDaysFromToday,
  getZonedParts,
  parseCalendarValue,
  startOfDayInZone,
  todayInZone,
  zonedWallTimeToDate,
} from "../../../src/dialogs/more-info/controls/more-info-time-zone";

describe("more-info time zone helpers", () => {
  // 2026-11-10 03:30 UTC is still the 9th in Los Angeles, already the 10th
  // in Tokyo
  const instant = new Date("2026-11-10T03:30:00Z");

  it("reads the wall clock of zones east and west of UTC", () => {
    expect(getZonedParts(instant, "America/Los_Angeles")).toMatchObject({
      year: 2026,
      month: 11,
      day: 9,
      hour: 19,
      minute: 30,
    });
    expect(getZonedParts(instant, "Asia/Tokyo")).toMatchObject({
      day: 10,
      hour: 12,
      minute: 30,
    });
  });

  it("takes today from the zone, not from the browser", () => {
    expect(todayInZone("America/Los_Angeles", instant).day).toBe(9);
    expect(todayInZone("Asia/Tokyo", instant).day).toBe(10);
  });

  it("builds an instant from a wall clock reading and reads it back", () => {
    const date = zonedWallTimeToDate("Asia/Tokyo", 2026, 11, 10, 8, 15, 0);
    expect(date.toISOString()).toBe("2026-11-09T23:15:00.000Z");
    const west = zonedWallTimeToDate("America/Los_Angeles", 2026, 11, 9, 20);
    expect(west.toISOString()).toBe("2026-11-10T04:00:00.000Z");
  });

  it("finds the start of the day", () => {
    expect(startOfDayInZone("Asia/Tokyo", instant).toISOString()).toBe(
      "2026-11-09T15:00:00.000Z"
    );
  });

  it("uses the right offset on both sides of a daylight-saving change", () => {
    // New York moved to daylight time on 2026-03-08
    expect(
      zonedWallTimeToDate("America/New_York", 2026, 3, 7, 12).toISOString()
    ).toBe("2026-03-07T17:00:00.000Z");
    expect(
      zonedWallTimeToDate("America/New_York", 2026, 3, 8, 12).toISOString()
    ).toBe("2026-03-08T16:00:00.000Z");
    // The day that has the jump is only 23 hours long
    const start = startOfDayInZone(
      "America/New_York",
      new Date("2026-03-08T18:00:00Z")
    );
    const next = zonedWallTimeToDate("America/New_York", 2026, 3, 9);
    expect((next.getTime() - start.getTime()) / 3600000).toBe(23);
  });

  it("moves a skipped reading to just after the jump and keeps the first of a repeated one", () => {
    // 02:30 does not exist on 2026-03-08 in New York
    expect(
      zonedWallTimeToDate("America/New_York", 2026, 3, 8, 2, 30).toISOString()
    ).toBe("2026-03-08T07:30:00.000Z");
    // 01:30 happens twice on 2026-11-01, first in daylight time
    expect(
      zonedWallTimeToDate("America/New_York", 2026, 11, 1, 1, 30).toISOString()
    ).toBe("2026-11-01T05:30:00.000Z");
  });

  it("counts calendar days in the zone", () => {
    expect(
      calendarDaysFromToday(
        new Date("2026-11-11T12:00:00Z"),
        "Asia/Tokyo",
        instant
      )
    ).toBe(1);
    expect(
      calendarDaysFromToday(
        new Date("2026-11-11T12:00:00Z"),
        "America/Los_Angeles",
        instant
      )
    ).toBe(2);
  });

  it("parses calendar values by their kind", () => {
    expect(parseCalendarValue("2026-11-10", "Asia/Tokyo").getDate()).toBe(10);
    expect(
      parseCalendarValue(
        "2026-11-10T08:00:00+01:00",
        "Asia/Tokyo"
      ).toISOString()
    ).toBe("2026-11-10T07:00:00.000Z");
    expect(
      parseCalendarValue("2026-11-10 08:00:00", "Asia/Tokyo").toISOString()
    ).toBe("2026-11-09T23:00:00.000Z");
  });
});
