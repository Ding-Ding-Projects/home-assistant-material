/**
 * Helpers for the output view of the backup progress card: hiding anything
 * that looks like a credential, and keeping only lines written since the
 * operation started.
 */

const MASK = "•••";

const SENSITIVE_NAMES =
  "password|passwd|passphrase|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|authorization|auth|credential|signature|sig|x-amz-[a-z-]+|encryption[_-]?key|key";

// name=value, name: value, "name": "value"
const NAMED_VALUE = new RegExp(
  `((?:${SENSITIVE_NAMES})["']?\\s*[:=]\\s*["']?)(?:Bearer\\s+|Basic\\s+)?[^\\s"',;&)}\\]]+`,
  "gi"
);

const AUTH_SCHEME = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{6,}/gi;

// Any web address with a query string: signed addresses keep their secrets
// there, so the whole query is hidden.
const URL_QUERY = /(https?:\/\/[^\s?#"'<>]+)\?[^\s"'<>]*/gi;

const URL_CREDENTIALS = /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi;

const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g;

// Encryption keys and emergency kit keys are written as groups of characters
const KEY_GROUPS = /\b[A-Z0-9]{4}(?:-[A-Z0-9]{4}){5,}\b/g;

// Long unbroken runs of hex or base64 text, for example API keys and hashes
const LONG_SECRET = /\b(?=[A-Za-z0-9+/_-]*\d)[A-Za-z0-9+/_-]{32,}={0,2}/g;

export const maskSensitive = (line: string): string =>
  line
    .replace(URL_CREDENTIALS, `$1${MASK}@`)
    .replace(URL_QUERY, `$1?${MASK}`)
    .replace(JWT, MASK)
    .replace(AUTH_SCHEME, `$1 ${MASK}`)
    .replace(NAMED_VALUE, `$1${MASK}`)
    .replace(KEY_GROUPS, MASK)
    .replace(LONG_SECRET, MASK);

const LINE_TIMESTAMP =
  // eslint-disable-next-line no-control-regex
  /^\s*(?:\x1b\[[0-9;]*m)*(\d{2}|\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2}:\d{2})/;

/** Sortable "YYYY-MM-DD HH:MM:SS" in the given time zone (UTC when omitted). */
export const wallClock = (ms: number, timeZone = "UTC"): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone,
  }).formatToParts(new Date(ms));
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}:${get("second")}`;
};

export const lineTimestamp = (line: string): string | undefined => {
  const match = LINE_TIMESTAMP.exec(line);
  if (!match) {
    return undefined;
  }
  const year = match[1].length === 2 ? `20${match[1]}` : match[1];
  return `${year}-${match[2]}-${match[3]} ${match[4]}`;
};

/**
 * Keep the lines written at or after `since` (a wall-clock string from
 * `wallClock`). A line without its own time, such as a traceback line,
 * follows the line before it.
 */
export const filterLinesSince = (lines: string[], since: string): string[] => {
  const kept: string[] = [];
  let keeping = false;
  for (const line of lines) {
    const stamp = lineTimestamp(line);
    if (stamp !== undefined) {
      keeping = stamp >= since;
    }
    if (keeping) {
      kept.push(line);
    }
  }
  return kept;
};

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

export const cleanLogLine = (line: string): string =>
  maskSensitive(line.replace(ANSI, "").replace(/\r$/, ""));

/**
 * The reason a location's upload failed, taken from the line the backup
 * component writes when that happens ("Upload failed for <location>: ...").
 * Undefined when no such line was seen.
 */
export const findUploadFailureReason = (
  lines: string[],
  agentId: string
): string | undefined => {
  for (let i = lines.length - 1; i >= 0; i--) {
    const index = lines[i].indexOf(`for ${agentId}: `);
    if (
      index !== -1 &&
      /(Upload failed|Unexpected error)/.test(lines[i].slice(0, index + 4))
    ) {
      const reason = lines[i].slice(index + `for ${agentId}: `.length).trim();
      return reason || undefined;
    }
  }
  return undefined;
};

export const MAX_LOG_LINES = 300;

/** Add lines to a bounded list, skipping lines that are already present. */
export const appendLogLines = (
  existing: string[],
  incoming: string[],
  max = MAX_LOG_LINES
): string[] => {
  const seen = new Set(existing);
  const added = incoming.filter((line) => line && !seen.has(line));
  return added.length ? [...existing, ...added].slice(-max) : existing;
};
