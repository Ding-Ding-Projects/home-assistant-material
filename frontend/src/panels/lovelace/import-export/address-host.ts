import { showHiddenCharacterCodes } from "../../../common/string/hidden-characters";

/** Why an address cannot be shown as a plain host. */
export type AddressProblem = "unreadable" | "non_ascii" | "too_long";

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

const SCHEME_ONLY = /^\s*([a-z][a-z0-9+.-]*):(?![\\/]{2})/i;
const HAS_AUTHORITY = /^\s*(?:[a-z][a-z0-9+.-]*:)?[\\/]{2}/i;
// eslint-disable-next-line no-control-regex
const NOT_ASCII = /[^\u0000-\u007f]/;

const shorten = (host: string): string =>
  host.length > HOST_DISPLAY_MAX
    ? `${host.slice(0, HEAD)}…${host.slice(host.length - TAIL)}`
    : host;

/**
 * The host a browser would go to for an address, in the form it uses for
 * its own checks. The host comes from the same parser a browser uses, so a
 * backslash or an `@` cannot make the summary name another place. An address
 * that cannot be parsed, a host that is not plain ASCII and a host that is
 * too long to be real are reported as problems, never guessed at.
 */
export const hostOf = (address: string): AddressHost => {
  if (!HAS_AUTHORITY.test(address)) {
    const scheme = SCHEME_ONLY.exec(address)?.[1];
    return {
      host: scheme
        ? `${scheme}:`
        : shorten(showHiddenCharacterCodes(address.trim())),
    };
  }
  const trimmed = address.trim();
  const withScheme = /^[\\/]{2}/.test(trimmed) ? `https:${trimmed}` : trimmed;
  const authorityText = /^[a-z][a-z0-9+.-]*:[\\/]{2}([^\\/?#]*)/i.exec(
    withScheme
  )?.[1];
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch (_err) {
    return {
      host: shorten(showHiddenCharacterCodes(authorityText ?? trimmed)),
      problem: "unreadable",
    };
  }
  const host = parsed.host;
  if (!host) {
    return { host: showHiddenCharacterCodes(trimmed), problem: "unreadable" };
  }
  const original = authorityText?.slice(authorityText.lastIndexOf("@") + 1);
  let problem: AddressProblem | undefined;
  if (host.length > HOST_LIMIT) {
    problem = "too_long";
  } else if (
    (original !== undefined && NOT_ASCII.test(original)) ||
    parsed.hostname.split(".").some((label) => label.startsWith("xn--"))
  ) {
    problem = "non_ascii";
  }
  return { host: shorten(host), ...(problem ? { problem } : {}) };
};
