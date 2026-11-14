import { describe, expect, it } from "vitest";
import { getActionDateSelector } from "../../src/data/action-date-selectors";
import type { Selector } from "../../src/data/selector";

const text: Selector = { text: {} };
const dateFields = [
  ["input_datetime.set_datetime", "date"],
  ["google.create_event", "start_date"],
  ["google.create_event", "end_date"],
] as const;
const datetimeFields = [
  ["input_datetime.set_datetime", "datetime"],
  ["google.create_event", "start_date_time"],
  ["google.create_event", "end_date_time"],
] as const;

describe("exact action date controls", () => {
  it.each(dateFields)("offers native dates for %s %s", (action, field) => {
    for (const value of [
      undefined,
      "",
      "1970-01-01",
      "2000-02-29",
      "2024-02-29",
      "9999-12-31",
    ]) {
      expect(getActionDateSelector(action, field, text, value)).toEqual({
        date: {},
      });
    }
  });
  it.each(datetimeFields)(
    "offers native local datetimes for %s %s",
    (action, field) => {
      for (const value of [
        undefined,
        "",
        "1970-01-01 00:00:00",
        "2024-02-29 23:59:59",
        "9999-12-31 12:00:00",
      ]) {
        expect(getActionDateSelector(action, field, text, value)).toEqual({
          datetime: {},
        });
      }
    }
  );
  it.each([
    "1969-12-31",
    "0000-01-01",
    "10000-01-01",
    "2024-2-09",
    "2024-02-9",
    "2023-02-29",
    "2100-02-29",
    "2024-04-31",
    "2024-00-01",
    "2024-13-01",
    "2024-01-00",
    "2024-01-01 ",
    "2024-01-01T00:00:00",
    "{{ date }}",
    null,
    20240101,
    [],
    {},
  ])("preserves unsupported date text: %j", (value) => {
    expect(
      getActionDateSelector("input_datetime.set_datetime", "date", text, value)
    ).toBe(text);
    expect(
      getActionDateSelector(
        "input_datetime.set_datetime",
        "date",
        { date: {} },
        value
      )
    ).toEqual({ text: {} });
  });
  it.each([
    "2024-01-01T12:00:00",
    "2024-01-01 12:00:00Z",
    "2024-01-01 12:00:00+01:00",
    "2024-01-01 12:00:00.123",
    "2024-01-01 12:00",
    "2024-01-01 24:00:00",
    "2024-01-01 12:60:00",
    "2024-01-01 12:00:60",
    "2024-1-01 12:00:00",
    "1969-12-31 23:59:59",
    "2024-01-01  12:00:00",
    "2023-02-29 12:00:00",
    null,
    false,
    {},
  ])("preserves unsupported datetime text: %j", (value) => {
    expect(
      getActionDateSelector(
        "google.create_event",
        "start_date_time",
        text,
        value
      )
    ).toBe(text);
    expect(
      getActionDateSelector(
        "google.create_event",
        "start_date_time",
        { datetime: {} },
        value
      )
    ).toEqual({ text: {} });
  });
  it("does not override unrelated actions, fields or custom selectors", () => {
    expect(
      getActionDateSelector("google.add_event", "start_date", text, undefined)
    ).toBe(text);
    expect(
      getActionDateSelector(
        "calendar.create_event",
        "start_date",
        text,
        undefined
      )
    ).toBe(text);
    expect(
      getActionDateSelector(
        "input_datetime.set_datetime",
        "timestamp",
        text,
        undefined
      )
    ).toBe(text);
    expect(getActionDateSelector(undefined, "date", text, undefined)).toBe(
      text
    );
    expect(
      getActionDateSelector(
        "input_datetime.set_datetime",
        "date",
        undefined,
        undefined
      )
    ).toBeUndefined();
    for (const selector of [
      { template: {} },
      { select: { options: ["today"] } },
      { object: {} },
      { datetime: {} },
    ] satisfies Selector[]) {
      expect(
        getActionDateSelector(
          "input_datetime.set_datetime",
          "date",
          selector,
          "2024-01-01"
        )
      ).toBe(selector);
    }
  });
  it("preserves valid native selector identity", () => {
    const native: Selector = { datetime: null };
    expect(
      getActionDateSelector(
        "input_datetime.set_datetime",
        "datetime",
        native,
        "2024-01-01 12:00:00"
      )
    ).toBe(native);
  });
  it("enhances only canonical legacy cv.time text and leaves native time behavior alone", () => {
    for (const value of [undefined, "", "00:00:00", "23:59:59"]) {
      expect(
        getActionDateSelector(
          "input_datetime.set_datetime",
          "time",
          text,
          value
        )
      ).toEqual({ time: {} });
    }
    for (const value of [
      "1:02:03",
      "12:00",
      "24:00:00",
      "12:00:00.1",
      "12:00:00+01:00",
      null,
    ]) {
      expect(
        getActionDateSelector(
          "input_datetime.set_datetime",
          "time",
          text,
          value
        )
      ).toBe(text);
    }
    const native: Selector = { time: { no_second: true } };
    expect(
      getActionDateSelector(
        "input_datetime.set_datetime",
        "time",
        native,
        "12:00"
      )
    ).toBe(native);
  });
});
