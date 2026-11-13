import { describe, expect, it } from "vitest";
import {
  actionFieldAdapterKind,
  decodeCalendarOffset,
  decodeWiLightTrigger,
  encodeCalendarOffset,
  encodeWiLightTrigger,
  WILIGHT_WEEKDAYS,
} from "../../src/data/action-field-adapters";

describe("calendar offset action field", () => {
  it.each([{ days: 0 }, { weeks: 2 }, { days: Number.MAX_SAFE_INTEGER }])(
    "round-trips %j without extra keys",
    (value) => {
      expect(encodeCalendarOffset(decodeCalendarOffset(value)!)).toEqual(value);
    }
  );
  it.each([
    {},
    { days: 1, weeks: 1 },
    { days: "2" },
    { days: -1 },
    { days: 1.5 },
    { days: Infinity },
    { hours: 1 },
    { days: 1, custom: true },
    "{{ offset }}",
    null,
  ])("leaves unsupported values unchanged: %j", (value) => {
    expect(
      actionFieldAdapterKind("calendar.create_event", "in", value)
    ).toBeUndefined();
  });
  it("writes exactly one key after switching units", () => {
    expect(encodeCalendarOffset({ amount: 3, unit: "weeks" })).toEqual({
      weeks: 3,
    });
    expect(
      actionFieldAdapterKind("calendar.create_event", "in", undefined)
    ).toBe("calendar-offset");
  });
});
describe("WiLight trigger action field", () => {
  it("round-trips every weekday mask at time and active boundaries", () => {
    for (let mask = 0; mask < 128; mask++) {
      for (const suffix of ["00000", "00001", "23590", "23591"]) {
        const wire = `${String(mask).padStart(3, "0")}${suffix}`;
        expect(encodeWiLightTrigger(decodeWiLightTrigger(wire)!)).toBe(wire);
      }
    }
  });
  it("uses Sunday as bit zero and Saturday as bit six", () => {
    expect(decodeWiLightTrigger("00107001")).toEqual({
      weekdays: ["sunday"],
      time: "07:00",
      active: true,
    });
    expect(decodeWiLightTrigger("06423590")).toEqual({
      weekdays: ["saturday"],
      time: "23:59",
      active: false,
    });
    expect(decodeWiLightTrigger("12719001")?.weekdays).toEqual(
      WILIGHT_WEEKDAYS
    );
  });
  it.each([
    "12800000",
    "12724000",
    "12700600",
    "12700002",
    "1270700",
    " 12707001",
    "{{ trigger }}",
    12707001,
    null,
  ])("preserves unsupported legacy input %j on its existing route", (value) => {
    expect(
      actionFieldAdapterKind("wilight.set_trigger", "trigger", value)
    ).toBeUndefined();
  });
  it("rejects incomplete or invalid edited values instead of overwriting the wire value", () => {
    expect(
      encodeWiLightTrigger({
        weekdays: ["holiday"],
        time: "07:00",
        active: true,
      })
    ).toBeUndefined();
    expect(
      encodeWiLightTrigger({ weekdays: [], time: "", active: true })
    ).toBeUndefined();
    expect(encodeCalendarOffset({ unit: "days", amount: NaN })).toBeUndefined();
  });
  it("does not match unrelated fields or actions", () => {
    expect(
      actionFieldAdapterKind("wilight.set_trigger", "trigger_index", undefined)
    ).toBeUndefined();
    expect(
      actionFieldAdapterKind("calendar.get_events", "in", undefined)
    ).toBeUndefined();
  });
});
