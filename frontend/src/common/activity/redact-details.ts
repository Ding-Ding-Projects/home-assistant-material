import { isSecretName } from "../secret-fields";

/**
 * Hides anything in a technical message that may be a credential, before the
 * text is copied or shown. It errs toward hiding: a false positive hides a
 * harmless value, a false negative would leak one.
 */

export const REDACTED = "[hidden]";

// scheme://user:password@host, keeping the scheme and host.
const URL_CREDENTIALS = /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+(?::[^\s/@]*)?@/gi;

// "Authorization: Bearer abc", "Cookie: a=b", and similar header lines.
const HEADER_LINE =
  /\b(authorization|proxy-authorization|cookie|set-cookie|x-api-key)\s*[:=]\s*[^\r\n]+/gi;

// "Bearer abc.def" anywhere.
const BEARER = /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;

// Three dot separated base64url parts, the shape of a signed token.
const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g;

// key=value, key: value and "key": "value" where the key names a secret.
const KEY_VALUE =
  /(["']?)([A-Za-z0-9_.-]+)\1(\s*[:=]\s*)("[^"\r\n]*"|'[^'\r\n]*'|[^\s,;&}"']+)/g;

// A long unbroken run that looks like a key or a token.
const LONG_RUN =
  /\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b/g;

export const redactDetails = (text: string): string =>
  text
    .replace(URL_CREDENTIALS, `$1${REDACTED}@`)
    .replace(HEADER_LINE, (_m, name: string) => `${name}: ${REDACTED}`)
    .replace(BEARER, `Bearer ${REDACTED}`)
    .replace(JWT, REDACTED)
    .replace(
      KEY_VALUE,
      (match, quote: string, key: string, sep: string, _value: string) =>
        isSecretName(key) ? `${quote}${key}${quote}${sep}${REDACTED}` : match
    )
    .replace(LONG_RUN, REDACTED);
