/** Lossless adapters for action fields with compact or exclusive wire formats. */
export type ActionFieldAdapterKind = "calendar-offset" | "wilight-trigger";
export interface CalendarOffset {
  unit: "days" | "weeks";
  amount: number;
}
export interface WiLightTrigger {
  weekdays: string[];
  time: string;
  active: boolean;
}
export const WILIGHT_WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export const decodeCalendarOffset = (
  value: unknown
): CalendarOffset | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    {return undefined;}
  const entries = Object.entries(value);
  if (entries.length !== 1) return undefined;
  const [unit, amount] = entries[0];
  if (
    (unit !== "days" && unit !== "weeks") ||
    typeof amount !== "number" ||
    !Number.isSafeInteger(amount) ||
    amount < 0
  )
    {return undefined;}
  return { unit, amount };
};
export const encodeCalendarOffset = (
  value: CalendarOffset
): Record<string, number> | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const result = { [value.unit]: value.amount };
  return decodeCalendarOffset(result) ? result : undefined;
};
export const decodeWiLightTrigger = (
  value: unknown
): WiLightTrigger | undefined => {
  if (typeof value !== "string" || !/^[0-9]{8}$/.test(value)) return undefined;
  const mask = Number(value.slice(0, 3));
  const hour = Number(value.slice(3, 5));
  const minute = Number(value.slice(5, 7));
  const active = Number(value[7]);
  if (mask > 127 || hour > 23 || minute > 59 || active > 1) return undefined;
  return {
    weekdays: WILIGHT_WEEKDAYS.filter(
      (_day, bit) => Math.floor(mask / 2 ** bit) % 2 === 1
    ),
    time: `${value.slice(3, 5)}:${value.slice(5, 7)}`,
    active: active === 1,
  };
};
export const encodeWiLightTrigger = (
  value: WiLightTrigger
): string | undefined => {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray(value.weekdays) ||
    value.weekdays.some(
      (day) =>
        !WILIGHT_WEEKDAYS.includes(day as (typeof WILIGHT_WEEKDAYS)[number])
    ) ||
    typeof value.active !== "boolean" ||
    !/^(?:[01][0-9]|2[0-3]):[0-5][0-9](?::00)?$/.test(value.time)
  )
    {return undefined;}
  const mask = WILIGHT_WEEKDAYS.reduce(
    (sum, day, bit) => sum + (value.weekdays.includes(day) ? 2 ** bit : 0),
    0
  );
  return `${String(mask).padStart(3, "0")}${value.time.slice(0, 5).replace(":", "")}${value.active ? "1" : "0"}`;
};
/** Unknown, templated, or noncanonical existing values keep their original editor. */
export const actionFieldAdapterKind = (
  action: string | undefined,
  field: string,
  value: unknown
): ActionFieldAdapterKind | undefined => {
  if (
    action === "calendar.create_event" &&
    field === "in" &&
    (value === undefined || decodeCalendarOffset(value))
  )
    {return "calendar-offset";}
  if (
    action === "wilight.set_trigger" &&
    field === "trigger" &&
    (value === undefined || decodeWiLightTrigger(value))
  )
    {return "wilight-trigger";}
  return undefined;
};
