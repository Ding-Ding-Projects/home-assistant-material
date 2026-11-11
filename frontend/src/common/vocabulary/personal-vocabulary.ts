/**
 * Personal wording: a person's own JSON file that renames things in the
 * interface their way.
 *
 * The file is chosen by the person, read and checked in full in this browser,
 * and applied only to interface text. Nothing is sent anywhere. Only the
 * checked entries are cached; the file's name, path and dates are not kept.
 * A file that fails any check changes nothing.
 *
 * File format, version 1:
 *
 * ```json
 * { "schemaVersion": 1, "entries": { "shipped wording": "your wording" } }
 * ```
 */

export const VOCABULARY_STORAGE_KEY = "personalVocabulary";

export const VOCABULARY_CHANGED_EVENT = "personal-vocabulary-changed";

export const VOCABULARY_LIMITS = {
  /** Largest file accepted, in bytes (256 KiB). */
  bytes: 262144,
  /** Deepest nesting of objects and lists. */
  depth: 8,
  /** Longest key, in characters. */
  key: 160,
  /** Longest value, in characters. */
  value: 1000,
};

export type VocabularyError =
  | "too_large"
  | "not_utf8"
  | "malformed"
  | "too_deep"
  | "duplicate_key"
  | "unsafe_key"
  | "unknown_field"
  | "unsupported_version"
  | "bad_entries"
  | "bad_key"
  | "bad_value"
  | "control_character";

export type VocabularyResult =
  | { ok: true; entries: Record<string, string>; count: number }
  | { ok: false; error: VocabularyError };

const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

// Any C0 or C1 control character. Tabs and line breaks are refused too: a
// label is a single line.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

const fail = (error: VocabularyError): VocabularyResult => ({
  ok: false,
  error,
});

/**
 * Walks JSON text that is already known to be well formed and reports the
 * two things `JSON.parse` hides: how deep it nests, and whether an object
 * names the same key twice.
 */
const scanStructure = (text: string): { depth: number; duplicate: boolean } => {
  let depth = 0;
  let maxDepth = 0;
  let duplicate = false;
  // One entry per open container: the keys seen so far for an object,
  // `undefined` for a list.
  const stack: (Set<string> | undefined)[] = [];
  let expectKey = false;
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '"') {
      let end = index + 1;
      while (text[end] !== '"') {
        end += text[end] === "\\" ? 2 : 1;
      }
      if (expectKey) {
        const key = JSON.parse(text.slice(index, end + 1)) as string;
        const keys = stack[stack.length - 1]!;
        if (keys.has(key)) {
          duplicate = true;
        }
        keys.add(key);
        expectKey = false;
      }
      index = end + 1;
      continue;
    }
    if (char === "{" || char === "[") {
      depth++;
      maxDepth = Math.max(maxDepth, depth);
      stack.push(char === "{" ? new Set() : undefined);
      expectKey = char === "{";
    } else if (char === "}" || char === "]") {
      depth--;
      stack.pop();
      expectKey = false;
    } else if (char === ",") {
      expectKey = stack[stack.length - 1] !== undefined;
    }
    index++;
  }
  return { depth: maxDepth, duplicate };
};

/**
 * Checks a wording file in full. Accepts the file's bytes, or text that has
 * already been decoded (the cached copy).
 */
export const parsePersonalVocabulary = (
  input: Uint8Array | string
): VocabularyResult => {
  let text: string;
  if (typeof input === "string") {
    if (input.length > VOCABULARY_LIMITS.bytes) {
      return fail("too_large");
    }
    text = input;
  } else {
    if (input.byteLength > VOCABULARY_LIMITS.bytes) {
      return fail("too_large");
    }
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(input);
    } catch (_err) {
      return fail("not_utf8");
    }
  }
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (_err) {
    return fail("malformed");
  }
  const structure = scanStructure(text);
  if (structure.depth > VOCABULARY_LIMITS.depth) {
    return fail("too_deep");
  }
  if (structure.duplicate) {
    return fail("duplicate_key");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return fail("malformed");
  }
  const root = parsed as Record<string, unknown>;
  const fields = Object.keys(root);
  if (fields.some((field) => UNSAFE_KEYS.has(field))) {
    return fail("unsafe_key");
  }
  if (
    fields.some((field) => field !== "schemaVersion" && field !== "entries")
  ) {
    return fail("unknown_field");
  }
  if (root.schemaVersion !== 1) {
    return fail("unsupported_version");
  }
  const rawEntries = root.entries;
  if (
    !rawEntries ||
    typeof rawEntries !== "object" ||
    Array.isArray(rawEntries)
  ) {
    return fail("bad_entries");
  }
  const entries: Record<string, string> = Object.create(null);
  let count = 0;
  for (const [key, value] of Object.entries(rawEntries)) {
    if (UNSAFE_KEYS.has(key)) {
      return fail("unsafe_key");
    }
    if (!key.trim() || key.length > VOCABULARY_LIMITS.key) {
      return fail("bad_key");
    }
    if (typeof value !== "string" || value.length > VOCABULARY_LIMITS.value) {
      return fail("bad_value");
    }
    if (CONTROL.test(key) || CONTROL.test(value)) {
      return fail("control_character");
    }
    entries[key] = value;
    count++;
  }
  return { ok: true, entries, count };
};

// ---- Replacing ----

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

const escapeForRegExp = (text: string) =>
  text.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");

/**
 * Builds the function that rewrites one piece of interface text.
 *
 * The longest key wins, case matters, and a key only matches whole words.
 * A key that starts with a small letter also matches the same words with a
 * capital first letter, as at the start of a label, and its replacement
 * then starts with a capital too; a key the file spells with a capital
 * keeps its own entry.
 * Text that looks like an address, a path or an identifier is left alone:
 * a key touching `_`, `/`, `\` or `@`, or sitting inside `word.word`, is
 * not replaced.
 */
export const buildVocabularyReplacer = (
  entries: Record<string, string>
): ((text: string) => string) => {
  const all: Record<string, string> = Object.create(null);
  for (const [key, value] of Object.entries(entries)) {
    all[key] = value;
  }
  for (const [key, value] of Object.entries(entries)) {
    const first = key[0];
    const upper = first.toLocaleUpperCase();
    if (first === upper || first.toLocaleLowerCase() !== first) {
      continue;
    }
    const capital = upper + key.slice(1);
    if (!(capital in all)) {
      const lead = value[0] ?? "";
      const small =
        lead.toLocaleLowerCase() === lead && lead.toLocaleUpperCase() !== lead;
      all[capital] = small ? lead.toLocaleUpperCase() + value.slice(1) : value;
    }
  }
  const keys = Object.keys(all).sort((a, b) => b.length - a.length);
  if (!keys.length) {
    return (text) => text;
  }
  const pattern = new RegExp(keys.map(escapeForRegExp).join("|"), "g");
  const literalBefore = /[_/\\@.]/;
  const literalAfter = /[_/\\@]/;
  return (text) => {
    if (!text) {
      return text;
    }
    return text.replace(pattern, (match: string, offset: number) => {
      const before = offset > 0 ? text[offset - 1] : "";
      const after = text[offset + match.length] ?? "";
      const afterNext = text[offset + match.length + 1] ?? "";
      if (
        (before &&
          (LETTER_OR_DIGIT.test(before) || literalBefore.test(before))) ||
        (after && (LETTER_OR_DIGIT.test(after) || literalAfter.test(after))) ||
        (after === "." && LETTER_OR_DIGIT.test(afterNext)) ||
        (after === ":" && afterNext === "/")
      ) {
        return match;
      }
      return all[match] ?? match;
    });
  };
};

// ---- The wording in use ----

const MEMO_LIMIT = 4000;

let active:
  | {
      count: number;
      entries: Record<string, string>;
      replace: (text: string) => string;
    }
  | undefined;

let memo = new Map<string, string>();

const activate = (entries: Record<string, string> | undefined) => {
  memo = new Map();
  const count = entries ? Object.keys(entries).length : 0;
  active =
    entries && count
      ? { count, entries, replace: buildVocabularyReplacer(entries) }
      : undefined;
};

/** How many entries are in use, or 0 when the shipped wording shows. */
export const activeVocabularyCount = (): number => active?.count ?? 0;

/**
 * The value the wording in use gives for exactly this key, or undefined when
 * nothing is loaded, the key is absent, or its value is blank.
 */
export const activeVocabularyEntry = (key: string): string | undefined => {
  const value = active?.entries[key];
  return value && value.trim() ? value : undefined;
};

/** Rewrites interface text with the wording in use. */
export const applyPersonalVocabulary = (text: string): string => {
  // Text with rich values (links, icons) arrives as parts, not as a string.
  if (!active || !text || typeof text !== "string") {
    return text;
  }
  const known = memo.get(text);
  if (known !== undefined) {
    return known;
  }
  const result = active.replace(text);
  if (memo.size >= MEMO_LIMIT) {
    memo = new Map();
  }
  memo.set(text, result);
  return result;
};

const announce = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(VOCABULARY_CHANGED_EVENT));
  }
};

/**
 * Checks a file and, only if every check passes, puts its wording in use and
 * caches it. On failure nothing changes.
 */
export const loadPersonalVocabulary = (input: Uint8Array): VocabularyResult => {
  const result = parsePersonalVocabulary(input);
  if (!result.ok) {
    return result;
  }
  try {
    window.localStorage.setItem(
      VOCABULARY_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, entries: result.entries })
    );
  } catch (_err) {
    // Without storage the wording still applies until the page is closed.
  }
  activate(result.entries);
  announce();
  return result;
};

/** Removes the cached copy and returns every label to the shipped wording. */
export const clearPersonalVocabulary = (): void => {
  try {
    window.localStorage.removeItem(VOCABULARY_STORAGE_KEY);
  } catch (_err) {
    // Nothing was stored.
  }
  activate(undefined);
  announce();
};

/**
 * Puts the cached wording in use. A cached copy that no longer passes the
 * checks is removed and the shipped wording shows.
 */
export const restorePersonalVocabulary = (): void => {
  let cached: string | null;
  try {
    cached = window.localStorage.getItem(VOCABULARY_STORAGE_KEY);
  } catch (_err) {
    cached = null;
  }
  if (!cached) {
    activate(undefined);
    return;
  }
  const result = parsePersonalVocabulary(cached);
  if (result.ok) {
    activate(result.entries);
    return;
  }
  activate(undefined);
  try {
    window.localStorage.removeItem(VOCABULARY_STORAGE_KEY);
  } catch (_err) {
    // Nothing to remove.
  }
};

if (typeof window !== "undefined") {
  restorePersonalVocabulary();
}
