/**
 * Pure logic for the first-run setup: password rules, the step rail state, the
 * live preview of regional choices and the review summary. Nothing here reads
 * the page, stores anything or touches the server, so it can be tested alone.
 * No function here ever returns, logs or labels a password.
 */

export const PASSWORD_MIN_LENGTH = 8;

/**
 * The message a failed request carries, or undefined when it carries none (a
 * dropped network connection has no body). Reads the server body, an error
 * message or a plain string, in that order, and never throws.
 */
export const errorText = (err: unknown): string | undefined => {
  const pick = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim() ? value : undefined;
  if (typeof err === "string") {
    return pick(err);
  }
  if (err && typeof err === "object") {
    const { body, message } = err as { body?: unknown; message?: unknown };
    if (body && typeof body === "object") {
      const fromBody = pick((body as { message?: unknown }).message);
      if (fromBody) {
        return fromBody;
      }
    }
    return pick(message);
  }
  return undefined;
};

export type PasswordStrength = "empty" | "weak" | "fair" | "strong";

export interface PasswordReport {
  length: number;
  /** The wording key suffix for the strength, never the password itself. */
  strength: PasswordStrength;
  /** Share of the strength bar to fill, 0 to 1. */
  score: number;
  longEnough: boolean;
  /** True once the confirmation has been typed. */
  confirmTouched: boolean;
  matches: boolean;
}

/**
 * Rates a password by length and by how many kinds of characters it mixes.
 * This is advice shown as text, not a rule the server enforces.
 */
export const reportPassword = (
  password: string,
  confirm: string
): PasswordReport => {
  const length = [...password].length;
  if (length === 0) {
    return {
      length,
      strength: "empty",
      score: 0,
      longEnough: false,
      confirmTouched: confirm.length > 0,
      matches: confirm.length === 0,
    };
  }
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) =>
    re.test(password)
  ).length;
  const repeated = /^(.)\1+$/.test(password);
  let points = Math.min(length, 16) / 4 + kinds;
  if (repeated) {
    points = 1;
  }
  let strength: PasswordStrength = "weak";
  if (length >= PASSWORD_MIN_LENGTH && points >= 5) {
    strength = "strong";
  } else if (length >= PASSWORD_MIN_LENGTH && points >= 3.5) {
    strength = "fair";
  }
  return {
    length,
    strength,
    score: strength === "strong" ? 1 : strength === "fair" ? 0.6 : 0.25,
    longEnough: length >= PASSWORD_MIN_LENGTH,
    confirmTouched: confirm.length > 0,
    matches: password === confirm,
  };
};

/** The username rule of the server: no spaces and no capital letters. */
export const USERNAME_INVALID = /\s|[A-Z]/;

export interface AccountFieldErrors {
  name?: "required";
  username?: "required" | "not_normalized";
  password?: "too_short";
  password_confirm?: "not_match";
}

/** Live errors for the account fields. A field never touched shows none. */
export const accountErrors = (
  values: {
    name: string;
    username: string;
    password: string;
    password_confirm: string;
  },
  touched: Partial<Record<keyof AccountFieldErrors, boolean>>
): AccountFieldErrors => {
  const errors: AccountFieldErrors = {};
  if (touched.name && !values.name.trim()) {
    errors.name = "required";
  }
  if (touched.username) {
    if (!values.username) {
      errors.username = "required";
    } else if (USERNAME_INVALID.test(values.username)) {
      errors.username = "not_normalized";
    }
  }
  if (
    touched.password &&
    values.password &&
    [...values.password].length < PASSWORD_MIN_LENGTH
  ) {
    errors.password = "too_short";
  }
  if (
    touched.password_confirm &&
    values.password_confirm &&
    values.password !== values.password_confirm
  ) {
    errors.password_confirm = "not_match";
  }
  return errors;
};

/** Whether the account can be created. The server makes the final call. */
export const accountComplete = (values: {
  name: string;
  username: string;
  password: string;
  password_confirm: string;
}): boolean =>
  Boolean(
    values.name.trim() &&
    values.username &&
    !USERNAME_INVALID.test(values.username) &&
    values.password &&
    values.password === values.password_confirm
  );

export type RailState = "done" | "current" | "todo";

export interface RailItem {
  step: string;
  state: RailState;
  /** Whether choosing the item can take the person back to it. */
  reachable: boolean;
}

/**
 * Builds the step rail. A finished step can only be reopened when the server
 * accepts a change to it; otherwise it is shown as done and read only.
 */
export const buildRail = (
  steps: { step: string; done: boolean }[],
  reopenable: ReadonlySet<string> = new Set()
): RailItem[] => {
  const current = steps.findIndex((step) => !step.done);
  return steps.map((step, index) => {
    const state: RailState = step.done
      ? "done"
      : index === current
        ? "current"
        : "todo";
    return {
      step: step.step,
      state,
      reachable: state === "done" && reopenable.has(step.step),
    };
  });
};

/** Share of the bar to fill when `finished` of `total` steps are done. */
export const railProgress = (finished: number, total: number): number =>
  total <= 0 ? 0 : Math.max(0, Math.min(1, finished / total));

export type UnitSystemChoice = "metric" | "us_customary";

/** The unit system a country usually uses. The person can change it. */
export const defaultUnitSystem = (country: string | undefined) =>
  country && ["US", "MM", "LR"].includes(country) ? "us_customary" : "metric";

export interface RegionPreview {
  date: string;
  time: string;
  number: string;
  temperature: string;
  distance: string;
  currency: string;
}

/**
 * Shows how dates, numbers, temperatures and money will look for the choices.
 * Anything the browser cannot format is returned as an empty string.
 */
export const previewRegion = (
  options: {
    language: string;
    timeZone: string;
    unitSystem: UnitSystemChoice;
    currency: string | undefined;
  },
  now: Date = new Date(Date.UTC(2026, 10, 9, 14, 30))
): RegionPreview => {
  const safe = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch (_err) {
      return fallback;
    }
  };
  const { language, timeZone, unitSystem, currency } = options;
  const us = unitSystem === "us_customary";
  return {
    date: safe(
      () =>
        new Intl.DateTimeFormat(language, {
          dateStyle: "full",
          timeZone,
        }).format(now),
      ""
    ),
    time: safe(
      () =>
        new Intl.DateTimeFormat(language, {
          timeStyle: "short",
          timeZone,
        }).format(now),
      ""
    ),
    number: safe(() => new Intl.NumberFormat(language).format(1234567.89), ""),
    temperature: safe(
      () =>
        `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(
          us ? 71.6 : 22
        )} ${us ? "°F" : "°C"}`,
      ""
    ),
    distance: safe(
      () =>
        `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(
          us ? 6.2 : 10
        )} ${us ? "mi" : "km"}`,
      ""
    ),
    currency: currency
      ? safe(
          () =>
            new Intl.NumberFormat(language, {
              style: "currency",
              currency,
            }).format(1234.5),
          ""
        )
      : "",
  };
};

export interface ReviewRow {
  key:
    | "name"
    | "username"
    | "location"
    | "country"
    | "language"
    | "units"
    | "time_zone";
  value: string;
}

/**
 * The rows of the review. Only values that are safe to show appear; the
 * password is not part of the input at all.
 */
export const buildReview = (input: {
  name?: string;
  username?: string;
  location?: [number, number];
  country?: string;
  language?: string;
  unitSystem?: string;
  currency?: string;
  timeZone?: string;
}): ReviewRow[] => {
  const rows: ReviewRow[] = [];
  const add = (key: ReviewRow["key"], value: string | undefined) => {
    if (value) {
      rows.push({ key, value });
    }
  };
  add("name", input.name);
  add("username", input.username);
  add(
    "location",
    input.location
      ? `${input.location[0].toFixed(3)}, ${input.location[1].toFixed(3)}`
      : undefined
  );
  add("country", input.country);
  add("language", input.language);
  add(
    "units",
    [input.unitSystem, input.currency].filter(Boolean).join(" · ") || undefined
  );
  add("time_zone", input.timeZone);
  return rows;
};
