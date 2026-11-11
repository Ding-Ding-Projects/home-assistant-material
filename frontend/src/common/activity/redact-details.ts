import { isSecretName } from "../secret-fields";

/**
 * Hides anything in a technical message that may be a credential, before the
 * text is copied or shown. It errs toward hiding: a false positive hides a
 * harmless value, a false negative would leak one.
 */

export const REDACTED = "[hidden]";

/** Longer input is cut, which keeps every pass linear and fast. */
export const REDACT_MAX_LENGTH = 4000;

// scheme://user:password@host, keeping the scheme and host. The credentials
// may themselves contain "@", so everything up to the last "@" before the
// first slash is hidden.
const URL_CREDENTIALS = /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/]*@/gi;

// "Authorization: Bearer abc", "Cookie: a=b", and similar header lines,
// including folded continuation lines that start with whitespace.
const HEADER_LINE =
  /\b(authorization|proxy-authorization|cookie|set-cookie|x-api-key)\s*[:=]\s*[^\r\n]+(?:\r?\n[ \t]+[^\r\n]*)*/gi;

// "Bearer abc.def" anywhere.
const BEARER = /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;

// Three dot separated base64url parts, the shape of a signed token.
const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g;

// The start of "key=value", "key: value" and "key": "value". The left
// boundary stops the scan from restarting inside a long word.
const KEY_START = /(?<![A-Za-z0-9_.-])(["']?)([A-Za-z0-9_.-]+)\1(\s*[:=]\s*)/g;

// A long unbroken run that looks like a key or a token.
const LONG_RUN =
  /(?<![A-Za-z0-9_+/=-])(?=[A-Za-z0-9_+/=-]*\d)(?=[A-Za-z0-9_+/=-]*[A-Za-z])[A-Za-z0-9_+/=-]{32,}/g;

/** Where the value that starts at `start` ends. */
const valueEnd = (text: string, start: number, keyStart: number): number => {
  const first = text[start];
  if (first === '"' || first === "'") {
    let i = start + 1;
    while (i < text.length && text[i] !== "\r" && text[i] !== "\n") {
      if (text[i] === "\\") {
        i += 2;
        continue;
      }
      if (text[i] === first) {
        return i + 1;
      }
      i++;
    }
    return Math.min(i, text.length);
  }
  const before = keyStart > 0 ? text[keyStart - 1] : "";
  const inQuery = before === "?" || before === "&";
  let i = start;
  while (i < text.length && text[i] !== "\r" && text[i] !== "\n") {
    if (inQuery && (text[i] === "&" || /\s/.test(text[i]))) {
      break;
    }
    i++;
  }
  return i;
};

// A secret key hides its whole value: to the end of the line, or in a query
// string to the next "&".
const hideSecretValues = (text: string): string => {
  const re = new RegExp(KEY_START.source, "g");
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!isSecretName(m[2])) {
      continue;
    }
    const valueStart = m.index + m[0].length;
    const end = valueEnd(text, valueStart, m.index);
    if (end <= valueStart) {
      continue;
    }
    out += text.slice(last, valueStart) + REDACTED;
    last = end;
    re.lastIndex = end;
  }
  return out + text.slice(last);
};

export const redactDetails = (text: string): string =>
  hideSecretValues(
    (text.length > REDACT_MAX_LENGTH
      ? `${text.slice(0, REDACT_MAX_LENGTH)}…`
      : text
    )
      .replace(URL_CREDENTIALS, `$1${REDACTED}@`)
      .replace(HEADER_LINE, (_m, name: string) => `${name}: ${REDACTED}`)
      .replace(BEARER, `Bearer ${REDACTED}`)
      .replace(JWT, REDACTED)
  ).replace(LONG_RUN, REDACTED);
