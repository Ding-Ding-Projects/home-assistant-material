/**
 * Shared detection and masking of values that may be secrets.
 *
 * A value that may be a secret must never reach a summary, a preview, a draft
 * in browser storage, a label, a log or a live region. Every rule here errs
 * toward masking: a false positive only hides a value, a false negative leaks
 * it.
 */

type Loose = Record<string, any>;

/** Autocomplete hints that mark a field as holding a secret. */
const SECRET_AUTOCOMPLETE = new Set([
  "current-password",
  "new-password",
  "one-time-code",
]);

/**
 * Parts of a name that mark a secret wherever they appear inside the name
 * once separators are removed, for example `clientsecret` or `access_token`.
 */
const SECRET_SUBSTRINGS = [
  "password",
  "passwd",
  "passphrase",
  "passcode",
  "passkey",
  "secret",
  "token",
  "credential",
  "apikey",
  "accesskey",
  "authkey",
  "privatekey",
  "signingkey",
  "encryptionkey",
  "sharedkey",
  "bearer",
  "cookie",
  "mnemonic",
];

/**
 * Whole words of a name that mark a secret. Whole words keep `keypad_name`
 * and `mapping` unmasked while `key`, `pin`, `psk`, `otp` and `code` are.
 * `code` is wide on purpose (`country_code` is masked too): hiding a harmless
 * value costs nothing, showing an access code does.
 */
const SECRET_WORDS = new Set([
  "pass",
  "pwd",
  "pw",
  "key",
  "keys",
  "pin",
  "pins",
  "psk",
  "otp",
  "totp",
  "hotp",
  "mfa",
  "2fa",
  "code",
  "codes",
  "auth",
  "authorization",
  "cred",
  "creds",
  "private",
  "seed",
  "salt",
  "signature",
  "jwt",
  "session",
  "sid",
]);

const nameWords = (name: string): string[] =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** True when the name of a field or key suggests that it holds a secret. */
export const isSecretName = (name: unknown): boolean => {
  if (typeof name !== "string" || name === "") {
    return false;
  }
  const joined = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (SECRET_SUBSTRINGS.some((part) => joined.includes(part))) {
    return true;
  }
  return nameWords(name).some((word) => SECRET_WORDS.has(word));
};

/** True when an autocomplete hint (possibly several words) marks a secret. */
export const isSecretAutocomplete = (value: unknown): boolean =>
  typeof value === "string" &&
  value
    .toLowerCase()
    .split(/\s+/)
    .some((word) => SECRET_AUTOCOMPLETE.has(word));

/** True when a selector describes a password-like text input. */
export const isSecretSelector = (selector?: Loose | null): boolean => {
  const text = selector?.text;
  if (text === undefined || text === null || typeof text !== "object") {
    return false;
  }
  return text.type === "password" || isSecretAutocomplete(text.autocomplete);
};

/** Any field description a form can hand out, reduced to what matters here. */
export interface SecretFieldLike {
  name?: string;
  type?: string;
  format?: string;
  autocomplete?: string;
  selector?: Loose | null;
}

/** True when the field is secret by its name, selector, format or hints. */
export const isSecretFieldLike = (field: SecretFieldLike): boolean =>
  isSecretName(field.name) ||
  isSecretSelector(field.selector) ||
  field.format === "password" ||
  isSecretAutocomplete(field.autocomplete);

const KEY_LINE =
  /^(\s*(?:-\s+)*)(?:"([^"]+)"|'([^']+)'|([^\s:#'"{}[\],&*!|>%@`-][^:#]*?))\s*:(?=\s|$)(.*)$/;

const INLINE_PAIR =
  /((?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_.-]+))\s*:\s*)("(?:[^"\\]|\\.)*"|'[^']*'|[^\s,{}[\]][^,}\]]*)/g;

const indentOf = (line: string): number =>
  line.length - line.trimStart().length;

/**
 * Masks inline mappings such as `parent: {password: x, b: 1}`. Only the part
 * from the first bracket on is looked at.
 */
const maskInline = (
  line: string,
  isSecret: (key: string) => boolean,
  mask: string
): string => {
  const start = line.search(/[{[]/);
  if (start < 0) {
    return line;
  }
  return (
    line.slice(0, start) +
    line
      .slice(start)
      .replace(
        INLINE_PAIR,
        (
          match,
          head: string,
          quoted1?: string,
          quoted2?: string,
          bare?: string
        ) => {
          const key = quoted1 ?? quoted2 ?? bare ?? "";
          return isSecret(key) ? `${head}${mask}` : match;
        }
      )
  );
};

/**
 * Hides the value of every secret key of a YAML text, by key path rather than
 * by line. The whole indented block under a secret key is replaced, so lists,
 * folded multi-line values, block scalars and nested mappings do not leak. A
 * key is secret when its name passes `isSecretName` or is in `extraKeys`.
 * Values inside single-line flow mappings are masked too; a flow collection
 * that spans several lines is not parsed, so keep secrets out of those.
 */
export const maskYamlSecrets = (
  yaml: string,
  mask: string,
  extraKeys: Iterable<string> = []
): string => {
  const extra = new Set(extraKeys);
  const isSecret = (key: string): boolean =>
    extra.has(key) || isSecretName(key);
  const lines = yaml.split(/\r?\n/);
  const out: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line.trimStart().startsWith("#")) {
      out.push(line);
      continue;
    }
    const match = KEY_LINE.exec(line);
    const key = match
      ? (match[2] ?? match[3] ?? match[4]?.trim() ?? "")
      : undefined;
    if (!match || key === undefined || !isSecret(key)) {
      out.push(maskInline(line, isSecret, mask));
      continue;
    }
    const keyColumn = match[1].length;
    let end = index;
    for (let next = index + 1; next < lines.length; next++) {
      const candidate = lines[next];
      const trimmed = candidate.trim();
      if (trimmed === "") {
        continue;
      }
      const indent = indentOf(candidate);
      if (
        indent > keyColumn ||
        (indent === keyColumn && /^-(\s|$)/.test(trimmed))
      ) {
        end = next;
      } else {
        break;
      }
    }
    if (end === index && match[5].trim() === "") {
      out.push(line);
      continue;
    }
    out.push(`${line.slice(0, line.length - match[5].length)} ${mask}`);
    index = end;
  }
  return out.join("\n");
};

/**
 * Copy of a value with every secret-keyed entry removed, however deep, and
 * the dotted paths that were removed. Used before anything is written to
 * browser storage.
 */
export const stripSecretValues = <T>(
  value: T,
  isSecret: (key: string) => boolean = isSecretName
): { data: T; removed: string[] } => {
  const removed: string[] = [];
  const walk = (node: unknown, path: string[]): unknown => {
    if (Array.isArray(node)) {
      return node.map((item, position) =>
        walk(item, [...path, String(position)])
      );
    }
    if (node !== null && typeof node === "object") {
      const result: Loose = {};
      for (const [key, child] of Object.entries(node as Loose)) {
        if (isSecret(key)) {
          if (child !== undefined && child !== null && child !== "") {
            removed.push([...path, key].join("."));
          }
          continue;
        }
        result[key] = walk(child, [...path, key]);
      }
      return result;
    }
    return node;
  };
  return { data: walk(value, []) as T, removed };
};

/** Copy of a value with the content of every secret-keyed entry replaced. */
export const maskSecretValues = <T>(
  value: T,
  mask: string,
  isSecret: (key: string) => boolean = isSecretName
): T => {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return node.map(walk);
    }
    if (node !== null && typeof node === "object") {
      const result: Loose = {};
      for (const [key, child] of Object.entries(node as Loose)) {
        result[key] = isSecret(key) ? mask : walk(child);
      }
      return result;
    }
    return node;
  };
  return walk(value) as T;
};
