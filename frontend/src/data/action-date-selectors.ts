import type { Selector } from "./selector";

type DateControl = "date" | "datetime" | "time";

const controlFor = (
  action: string | undefined,
  field: string
): DateControl | undefined => {
  if (action === "input_datetime.set_datetime") {
    if (field === "date" || field === "datetime" || field === "time") {
      return field;
    }
  }
  if (action === "google.create_event") {
    if (field === "start_date" || field === "end_date") return "date";
    if (field === "start_date_time" || field === "end_date_time") {
      return "datetime";
    }
  }
  return undefined;
};

/** Validate the literal calendar date, without Date parsing or timezone conversion. */
const pickerDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // ha-date-input supplies 1970-01-01 as its default lower bound.
  if (year < 1970 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
};

const pickerTime = (value: string): boolean =>
  /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value);

const representable = (value: unknown, control: DateControl): boolean => {
  if (value === undefined || value === "") return true;
  if (typeof value !== "string") return false;
  if (control === "date") return pickerDate(value);
  if (control === "time") return pickerTime(value);
  // ha-selector-datetime splits only on a literal space. ISO T, offsets and
  // fractions must remain editable in their original text representation.
  return (
    value.length === 19 &&
    value[10] === " " &&
    pickerDate(value.slice(0, 10)) &&
    pickerTime(value.slice(11))
  );
};

/**
 * Adds native controls only for verified action fields and lossless values.
 * The returned selector never normalizes, parses, or rewrites the input value.
 * Backend contracts: input_datetime/services.py and calendar/services.py,
 * which google/services.py reuses for create_event.
 */
export const getActionDateSelector = (
  action: string | undefined,
  field: string,
  selector: Selector | undefined,
  value: unknown
): Selector | undefined => {
  const control = controlFor(action, field);
  if (!control || !selector || Object.keys(selector).length !== 1) {
    return selector;
  }
  // An existing native time selector already owns its behavior. Only legacy
  // text for the exact cv.time input_datetime field needs this enhancement.
  if (control === "time" && !("text" in selector)) return selector;
  if (!("text" in selector) && !(control in selector)) return selector;
  if (!representable(value, control)) {
    return "text" in selector ? selector : { text: {} };
  }
  if (control in selector) return selector;
  if (control === "date") return { date: {} };
  if (control === "datetime") return { datetime: {} };
  return { time: {} };
};
