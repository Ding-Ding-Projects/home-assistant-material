import { showHiddenCharacterCodes } from "../../../common/string/hidden-characters";

/** Why an address cannot be shown as a plain host. */
export type AddressProblem =
  "unreadable" | "non_ascii" | "too_long" | "control_characters" | "odd_form";

export interface AddressHost {
  /** What is shown first, safe to display. */
  host: string;
  problem?: AddressProblem;
}

/** Longest host shown whole. A longer one shows its start and its end. */
export const HOST_DISPLAY_MAX = 60;
/** The longest host name there can be. A longer one is not a real host. */
export const HOST_LIMIT = 253;

const HEAD = 20;
const TAIL = 36;

/** Schemes a browser reads with the same rules for slashes and backslashes. */
const SPECIAL_SCHEMES = new Set(["http", "https", "ws", "wss", "ftp", "file"]);

const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
// Slashes or backslashes where an authority would start, with or without a
// scheme in front.
const HAS_AUTHORITY = /^(?:[a-z][a-z0-9+.-]*:)?[\\/]{2}/i;
// The only form that is written the ordinary way.
const STRICT_AUTHORITY = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;
// eslint-disable-next-line no-control-regex
const NOT_ASCII = /[^\u0000-\u007f]/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f]/;
// eslint-disable-next-line no-control-regex
const EDGE_STRIP = /^[\u0000- ]+|[\u0000- ]+$/g;
const FALLBACK_BASE = "https://homeassistant.invalid/";

/** The origin a relative address would be read against. */
const pageBase = (): string => {
  const origin = (globalThis as { location?: { origin?: string } }).location
    ?.origin;
  return origin && origin !== "null" && /^https?:\/\//i.test(origin)
    ? `${origin}/`
    : FALLBACK_BASE;
};

export interface NormalizedAddress {
  /** The text as a browser reads it, before it looks at the scheme or host. */
  value: string;
  /** True when the raw text held a control character, such as a tab. */
  hadControl: boolean;
}

/**
 * Applies the first steps of a browser's address parser: leading and trailing
 * control characters and spaces are dropped, and tab, carriage return and
 * line feed are deleted wherever they are. Every check on an address must
 * run on this value, never on the raw text, or `java<TAB>script:` and
 * `https://ha.local<TAB>.evil.com` read as something else than the browser
 * will go to. Escaping for display happens only after the check.
 */
export const normalizeAddress = (raw: string): NormalizedAddress => ({
  value: raw.replace(EDGE_STRIP, "").replace(/[\t\n\r]/g, ""),
  hadControl: CONTROL.test(raw),
});

const shorten = (host: string): string =>
  host.length > HOST_DISPLAY_MAX
    ? `${host.slice(0, HEAD)}…${host.slice(host.length - TAIL)}`
    : host;

/**
 * True when an address stays on this site: it starts with a single slash and
 * a browser resolves it to this origin. Everything else is outside, and so is
 * anything that held a control character or a template, because in doubt the
 * person should look.
 */
export const isOutsideAddress = (
  raw: string,
  base: string = pageBase()
): boolean => {
  const { value, hadControl } = normalizeAddress(raw);
  if (hadControl || /\{[{%#]/.test(value) || !/^\/(?![\\/])/.test(value)) {
    return true;
  }
  try {
    return new URL(value, base).origin !== new URL(base).origin;
  } catch (_err) {
    return true;
  }
};

/**
 * The host a browser would go to for an address, in the form it uses for
 * its own checks. The whole address is parsed by the same parser a browser
 * uses, against the page's own origin, so a tab, a backslash, a missing
 * slash or an `@` cannot make the summary name another place. An address
 * that cannot be parsed, a host that is not plain ASCII, a host that is too
 * long to be real, an address with a control character in it and an address
 * written without the usual two slashes are reported as problems, never
 * guessed at.
 */
export const hostOf = (
  address: string,
  base: string = pageBase()
): AddressHost => {
  const { value, hadControl } = normalizeAddress(address);
  const scheme = SCHEME.exec(value)?.[1]?.toLowerCase();
  const network =
    HAS_AUTHORITY.test(value) ||
    (scheme !== undefined && SPECIAL_SCHEMES.has(scheme));
  if (!network) {
    return {
      host: scheme ? `${scheme}:` : shorten(showHiddenCharacterCodes(value)),
      ...(hadControl ? { problem: "control_characters" as const } : {}),
    };
  }
  const authorityText = /^(?:[a-z][a-z0-9+.-]*:)?[\\/]{2}([^\\/?#]*)/i.exec(
    value
  )?.[1];
  let parsed: URL;
  try {
    parsed = new URL(value, base);
  } catch (_err) {
    return {
      host: shorten(showHiddenCharacterCodes(authorityText ?? value)),
      problem: "unreadable",
    };
  }
  const host = parsed.host;
  if (!host) {
    return { host: showHiddenCharacterCodes(value), problem: "unreadable" };
  }
  const written =
    authorityText ?? value.replace(SCHEME, "").split(/[\\/?#]/, 1)[0];
  const original = written.slice(written.lastIndexOf("@") + 1);
  let problem: AddressProblem | undefined;
  if (hadControl) {
    problem = "control_characters";
  } else if (!STRICT_AUTHORITY.test(value)) {
    problem = "odd_form";
  } else if (host.length > HOST_LIMIT) {
    problem = "too_long";
  } else if (
    NOT_ASCII.test(original) ||
    parsed.hostname.split(".").some((label) => label.startsWith("xn--"))
  ) {
    problem = "non_ascii";
  }
  return { host: shorten(host), ...(problem ? { problem } : {}) };
};
