import type { SelectorType } from "../../data/selector";
import type {
  HaFormFloatSchema,
  HaFormIntegerSchema,
  HaFormSchema,
  HaFormStringSchema,
} from "./types";

/**
 * Field kinds a config, options, reauthentication, reconfigure or sub-entry
 * flow can send, and the control the form draws for each.
 *
 * The backend serialises plain voluptuous types to `string`, `integer`,
 * `float`, `boolean`, `select`, `multi_select`, `positive_time_period_dict`,
 * `constant` and `expandable`. Every other field is a selector object. The
 * frontend dialogs additionally use `grid`, `divider` and `optional_actions`.
 *
 * `FORM_FIELD_CONTROLS` is a hand-written list so that a new field kind
 * without a rich control is noticed by the test that compares it with the
 * inventory of kinds the flows send.
 */
export const FORM_FIELD_CONTROLS = {
  string:
    "ha-input (masked with a toggle, keyboard type and autocomplete from the field name)",
  integer:
    "slider with a number box when a range is known, otherwise a number box with step buttons",
  float: "decimal number box with unit and range hints from the field name",
  boolean: "switch with the description beside it",
  select: "tiles up to five options, a searchable list above that",
  multi_select: "chips with an add menu, a checkbox group when there are few",
  positive_time_period_dict: "duration input",
  constant: "read-only value",
  expandable: "collapsible card with a count of filled fields",
  grid: "responsive grid of fields",
  divider: "divider",
  optional_actions: "optional section toggles",
} as const;

export type HaFormFieldKind = keyof typeof FORM_FIELD_CONTROLS;

/**
 * Selector types and how each is presented. Typed against the complete
 * selector union, so adding a selector without listing it here fails the type
 * check.
 */
export const SELECTOR_CONTROLS: Record<SelectorType, string> = {
  action: "action editor",
  addon: "add-on picker",
  app: "app picker",
  area: "area picker",
  areas_display: "areas display editor",
  assist_pipeline: "assistant picker",
  attribute: "attribute picker",
  automation_behavior: "behavior tiles",
  backup_location: "backup location picker",
  boolean: "switch",
  button_toggle: "segmented buttons",
  choose: "choice editor",
  color_rgb: "color picker",
  color_temp: "color temperature slider",
  condition: "condition editor",
  config_entry: "integration entry picker",
  constant: "read-only value",
  conversation_agent: "conversation agent picker",
  country: "searchable country list",
  date: "date picker",
  datetime: "date and time picker",
  device: "device picker",
  device_class: "device class picker",
  duration: "duration input",
  entity: "entity picker",
  entity_name: "entity name picker",
  file: "file upload",
  floor: "floor picker",
  icon: "icon picker",
  label: "label picker",
  language: "searchable language list",
  location: "map location picker",
  media: "media picker",
  navigation: "navigation picker",
  number: "slider with number box, or number box with unit",
  numeric_threshold: "threshold editor",
  object: "structured object editor",
  period: "period picker",
  qr_code: "QR code",
  select: "tiles, list, chips or searchable list",
  selector: "selector editor",
  serial_port: "serial port picker",
  state: "state picker",
  state_class: "state class picker",
  statistic: "statistic picker",
  stt: "speech to text picker",
  target: "target picker",
  template: "template editor",
  text: "text input with type, autocomplete and masking",
  theme: "theme picker",
  time: "time picker",
  timezone: "searchable timezone list",
  trigger: "trigger editor",
  tts: "text to speech picker",
  tts_voice: "voice picker",
  ui_action: "action picker",
  ui_clock_date_format: "clock and date format picker",
  ui_color: "color picker",
  ui_state_content: "state content picker",
  ui_time_format: "time format picker",
  unit_of_measurement: "unit picker",
};

export type FieldNameKind =
  | "host"
  | "port"
  | "url"
  | "username"
  | "password"
  | "secret"
  | "email"
  | "latitude"
  | "longitude"
  | "scan_interval"
  | "timeout"
  | "mac"
  | "pin"
  | "code";

type StringInputType = "text" | "url" | "email" | "password" | "tel";

export interface FieldHint {
  kind: FieldNameKind;
  /** Native input type for a string field. */
  inputType?: StringInputType;
  /** Virtual keyboard to offer. */
  inputMode?: "text" | "url" | "email" | "numeric" | "decimal" | "tel";
  autocomplete?: string;
  /** The value is a credential: mask it and offer a show/hide toggle. */
  sensitive?: boolean;
  /** Unit drawn at the end of the field when the schema names none. */
  unit?: string;
  /** Range applied to a number field that declares none. */
  min?: number;
  max?: number;
}

const tokens = (name: string): string[] =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const has = (list: string[], ...wanted: string[]) =>
  wanted.some((word) => list.includes(word));

/**
 * Recognise what a field holds from its name, so that host, port, url,
 * username, password, api key, token, email, coordinates, intervals, timeouts,
 * mac, pin and code fields get the right keyboard, autocomplete, masking and
 * unit without every integration having to ask for them.
 */
export const getFieldHint = (
  name: string | undefined
): FieldHint | undefined => {
  if (!name) {
    return undefined;
  }
  const list = tokens(name);
  const joined = list.join("");

  if (has(list, "password", "passwd", "passphrase", "passcode")) {
    return {
      kind: "password",
      inputType: "password",
      sensitive: true,
      autocomplete: has(list, "new", "confirm", "confirmation", "repeat")
        ? "new-password"
        : "current-password",
    };
  }
  if (
    has(list, "token", "secret", "apikey") ||
    (has(list, "api") && has(list, "key")) ||
    (has(list, "access", "private", "auth") && has(list, "key"))
  ) {
    return {
      kind: "secret",
      inputType: "password",
      sensitive: true,
      autocomplete: "off",
    };
  }
  if (has(list, "pin") && list.length <= 2) {
    return {
      kind: "pin",
      inputType: "password",
      sensitive: true,
      autocomplete: "off",
    };
  }
  if (has(list, "email", "mail") && !has(list, "notify")) {
    return {
      kind: "email",
      inputType: "email",
      inputMode: "email",
      autocomplete: "email",
    };
  }
  if (
    joined === "username" ||
    joined === "user" ||
    joined === "login" ||
    (list[list.length - 1] === "username" && list.length <= 2)
  ) {
    return { kind: "username", inputType: "text", autocomplete: "username" };
  }
  if (has(list, "latitude") || joined === "lat") {
    return {
      kind: "latitude",
      inputMode: "decimal",
      unit: "°",
      min: -90,
      max: 90,
    };
  }
  if (has(list, "longitude") || joined === "lon" || joined === "lng") {
    return {
      kind: "longitude",
      inputMode: "decimal",
      unit: "°",
      min: -180,
      max: 180,
    };
  }
  if (has(list, "scan") && has(list, "interval")) {
    return { kind: "scan_interval", inputMode: "numeric", unit: "s", min: 0 };
  }
  if (has(list, "timeout")) {
    return { kind: "timeout", inputMode: "numeric", unit: "s", min: 0 };
  }
  if (list[list.length - 1] === "port" && !has(list, "serial", "usb")) {
    return { kind: "port", inputMode: "numeric", min: 0, max: 65535 };
  }
  if (has(list, "host", "hostname") || (has(list, "ip") && list.length <= 3)) {
    return {
      kind: "host",
      inputType: "text",
      inputMode: "url",
      autocomplete: "off",
    };
  }
  if (has(list, "url", "uri")) {
    return { kind: "url", inputType: "url", inputMode: "url" };
  }
  if (has(list, "mac") || joined === "macaddress") {
    return { kind: "mac", inputType: "text", autocomplete: "off" };
  }
  if (
    joined === "code" ||
    (has(list, "code") &&
      has(list, "otp", "mfa", "verification", "auth", "pin", "2fa"))
  ) {
    return {
      kind: "code",
      inputType: "text",
      autocomplete: "one-time-code",
    };
  }
  return undefined;
};

export interface StringFieldProps {
  type: StringInputType;
  passwordToggle: boolean;
  inputMode?: FieldHint["inputMode"];
  autocomplete?: string;
  suffix?: string;
}

/** What the string field should draw, with the schema winning over the name. */
export const getStringFieldProps = (
  schema: Pick<HaFormStringSchema, "name" | "format" | "autocomplete"> & {
    description?: { suffix?: string };
  }
): StringFieldProps => {
  const hint = getFieldHint(schema.name);
  let type: StringInputType = hint?.inputType ?? "text";
  if (schema.format === "email" || schema.format === "url") {
    type = schema.format;
  } else if (schema.format === "fqdnurl") {
    type = "url";
  }
  const passwordToggle = type === "password";
  return {
    type,
    passwordToggle,
    inputMode:
      hint?.inputMode ??
      (type === "email" ? "email" : type === "url" ? "url" : undefined),
    autocomplete: schema.autocomplete ?? hint?.autocomplete,
    suffix: schema.description?.suffix ?? hint?.unit,
  };
};

export type NumberPresentation = "slider" | "stepper";

export interface NumberFieldProps {
  presentation: NumberPresentation;
  min?: number;
  max?: number;
  step: number | "any";
  inputMode: "numeric" | "decimal";
  suffix?: string;
}

/** The widest range still drawn as a slider. */
export const SLIDER_MAX_RANGE = 255;

/** What an integer or float field should draw. */
export const getNumberFieldProps = (
  kind: "integer" | "float",
  schema: HaFormIntegerSchema | HaFormFloatSchema
): NumberFieldProps => {
  const hint = getFieldHint(schema.name);
  const declaredMin = "valueMin" in schema ? schema.valueMin : undefined;
  const declaredMax = "valueMax" in schema ? schema.valueMax : undefined;
  const min = declaredMin ?? hint?.min;
  const max = declaredMax ?? hint?.max;
  const bounded =
    declaredMin !== undefined &&
    declaredMax !== undefined &&
    declaredMax - declaredMin <= SLIDER_MAX_RANGE;
  return {
    presentation: kind === "integer" && bounded ? "slider" : "stepper",
    min,
    max,
    step: kind === "integer" ? 1 : "any",
    inputMode: kind === "integer" ? "numeric" : "decimal",
    suffix: schema.description?.suffix ?? hint?.unit,
  };
};

export type SelectPresentation = "tiles" | "searchable";

/** Up to this many options are drawn as tiles, more as a searchable list. */
export const SELECT_TILE_LIMIT = 5;

export const getSelectPresentation = (
  optionCount: number
): SelectPresentation =>
  optionCount <= SELECT_TILE_LIMIT ? "tiles" : "searchable";

/** Up to this many options a multi select shows every option as a chip. */
export const MULTI_SELECT_CHIP_LIMIT = 5;

/** Whether a schema entry carries a value the person fills in. */
export const isInputSchema = (item: HaFormSchema): boolean =>
  item.type !== "constant" &&
  item.type !== "divider" &&
  item.type !== "grid" &&
  item.type !== "expandable" &&
  item.type !== "optional_actions";

const isFilled = (value: unknown): boolean => {
  if (value === undefined || value === null || value === "") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
};

/** How many of the entries in a section the person has filled in. */
export const countFilledFields = (
  schema: readonly HaFormSchema[],
  data: Record<string, unknown> | undefined
): { filled: number; total: number } => {
  let filled = 0;
  let total = 0;
  for (const item of schema) {
    if (item.type === "grid" || item.type === "optional_actions") {
      const inner = countFilledFields(
        item.schema,
        item.flatten || !item.name
          ? data
          : (data?.[item.name] as Record<string, unknown> | undefined)
      );
      filled += inner.filled;
      total += inner.total;
      continue;
    }
    if (!isInputSchema(item)) {
      continue;
    }
    total++;
    if (isFilled(data?.[item.name])) {
      filled++;
    }
  }
  return { filled, total };
};

/**
 * Give a selector the presentation its field name calls for, without changing
 * the value it produces. Only fills in what the backend left out.
 */
export const enrichSelector = <T extends { selector: Record<string, any> }>(
  schema: T & { name: string }
): T["selector"] => {
  const selector = schema.selector;
  if ("text" in selector) {
    const config = selector.text ?? {};
    if (config.multiline || config.multiple) {
      return selector;
    }
    const hint = getFieldHint(schema.name);
    if (!hint) {
      return selector;
    }
    const next = { ...config };
    if (
      next.type === undefined &&
      hint.inputType &&
      hint.inputType !== "text"
    ) {
      next.type = hint.inputType;
    }
    if (next.autocomplete === undefined && hint.autocomplete) {
      next.autocomplete = hint.autocomplete;
    }
    if (next.suffix === undefined && hint.unit) {
      next.suffix = hint.unit;
    }
    return { text: next };
  }
  if ("number" in selector) {
    const config = selector.number ?? {};
    const hint = getFieldHint(schema.name);
    const next = { ...config };
    if (next.unit_of_measurement === undefined && hint?.unit) {
      next.unit_of_measurement = hint.unit;
    }
    if (
      next.mode === undefined &&
      next.min !== undefined &&
      next.max !== undefined &&
      next.max - next.min <= SLIDER_MAX_RANGE &&
      (next.step === undefined || next.step !== "any")
    ) {
      next.mode = "slider";
    }
    return { number: next };
  }
  return selector;
};
