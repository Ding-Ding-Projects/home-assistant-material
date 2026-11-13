/**
 * Editable tree model behind the visual object editor.
 *
 * Any YAML-compatible value (dictionary, list, text, number, yes/no, empty,
 * nested) becomes a tree of nodes that a form can edit, and the tree turns
 * back into the same value. A value that goes in and comes out untouched is
 * deeply equal to the original; key order is kept as JavaScript keeps it
 * (integer-like keys such as "2" always sort first in a plain object, so that
 * single case cannot be preserved by any plain-object value).
 */

export type ObjectNodeType =
  "text" | "number" | "boolean" | "null" | "list" | "dict" | "template";

export const OBJECT_NODE_TYPES: ObjectNodeType[] = [
  "text",
  "number",
  "boolean",
  "null",
  "list",
  "dict",
  "template",
];

export interface ObjectEntry {
  id: string;
  /** The key in a dictionary. Ignored in a list. */
  key: string;
  node: ObjectNode;
}

export interface ObjectNode {
  id: string;
  type: ObjectNodeType;
  /** Raw text for text, template and number nodes. */
  text: string;
  /** Value of a yes/no node. */
  checked: boolean;
  /** Children of a list or dictionary node. */
  entries: ObjectEntry[];
}

export type ObjectErrorCode = "empty_key" | "duplicate_key" | "invalid_number";

export interface ObjectValidation {
  valid: boolean;
  /** The emitted value. Only meaningful when `valid` is true. */
  value: unknown;
  /** Entry id (key errors) or node id (number errors) to the error. */
  errors: Map<string, ObjectErrorCode>;
}

let idCounter = 0;
const nextId = (): string => {
  idCounter += 1;
  return `oe-${idCounter}`;
};

/** A string that contains template syntax is edited as a template. */
export const isTemplateString = (value: string): boolean =>
  value.includes("{{") || value.includes("{%");

export const isContainer = (node: ObjectNode): boolean =>
  node.type === "list" || node.type === "dict";

/** The empty value of a type. */
export const emptyNode = (type: ObjectNodeType): ObjectNode => ({
  id: nextId(),
  type,
  text: type === "number" ? "0" : "",
  checked: false,
  entries: [],
});

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

/**
 * Turns a value into an editable tree. Anything that is not plain data
 * (for example a date object) is shown as its text.
 */
export const nodeFromValue = (value: unknown): ObjectNode => {
  if (value === null || value === undefined) {
    return emptyNode("null");
  }
  if (typeof value === "boolean") {
    return { ...emptyNode("boolean"), checked: value };
  }
  if (typeof value === "number") {
    return { ...emptyNode("number"), text: String(value) };
  }
  if (typeof value === "string") {
    return {
      ...emptyNode(isTemplateString(value) ? "template" : "text"),
      text: value,
    };
  }
  if (Array.isArray(value)) {
    return {
      ...emptyNode("list"),
      entries: value.map((item) => ({
        id: nextId(),
        key: "",
        node: nodeFromValue(item),
      })),
    };
  }
  if (isPlainObject(value)) {
    return {
      ...emptyNode("dict"),
      entries: Object.entries(value).map(([key, item]) => ({
        id: nextId(),
        key,
        node: nodeFromValue(item),
      })),
    };
  }
  return { ...emptyNode("text"), text: String(value) };
};

/**
 * The tree for a field. An empty field (no value, null or an empty string)
 * starts as an empty dictionary, the usual shape of an object field.
 */
export const rootFromValue = (value: unknown): ObjectNode =>
  value === undefined || value === null || value === ""
    ? emptyNode("dict")
    : nodeFromValue(value);

/** Parses number text; undefined when it is not a number. */
export const parseNumberText = (text: string): number | undefined => {
  const trimmed = text.trim();
  if (trimmed === "") {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const setKey = (target: Record<string, unknown>, key: string, value: unknown) =>
  // defineProperty keeps a key such as "__proto__" an ordinary key.
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });

const collect = (
  node: ObjectNode,
  errors: Map<string, ObjectErrorCode>
): unknown => {
  switch (node.type) {
    case "text":
    case "template":
      return node.text;
    case "number": {
      const parsed = parseNumberText(node.text);
      if (parsed === undefined) {
        errors.set(node.id, "invalid_number");
      }
      return parsed ?? 0;
    }
    case "boolean":
      return node.checked;
    case "null":
      return null;
    case "list":
      return node.entries.map((entry) => collect(entry.node, errors));
    case "dict": {
      const counts = new Map<string, number>();
      node.entries.forEach((entry) =>
        counts.set(entry.key, (counts.get(entry.key) ?? 0) + 1)
      );
      const result: Record<string, unknown> = {};
      node.entries.forEach((entry) => {
        if (entry.key.trim() === "") {
          errors.set(entry.id, "empty_key");
        } else if ((counts.get(entry.key) ?? 0) > 1) {
          errors.set(entry.id, "duplicate_key");
        }
        setKey(result, entry.key, collect(entry.node, errors));
      });
      return result;
    }
    default:
      return null;
  }
};

/**
 * Builds the value and lists every error. A caller must not emit the value
 * while `valid` is false; the last valid value stays in effect.
 */
export const validateNode = (node: ObjectNode): ObjectValidation => {
  const errors = new Map<string, ObjectErrorCode>();
  const value = collect(node, errors);
  return { valid: errors.size === 0, value, errors };
};

export const countEntries = (node: ObjectNode): number => node.entries.length;

/** Checks that a text is a clean yes/no word, in either direction. */
const TRUE_WORDS = ["true", "yes", "on", "1"];
const FALSE_WORDS = ["false", "no", "off", "0"];

const textOf = (node: ObjectNode): string => {
  switch (node.type) {
    case "text":
    case "template":
    case "number":
      return node.text;
    case "boolean":
      return node.checked ? "true" : "false";
    default:
      return "";
  }
};

/**
 * Changes the type of a node and returns the new node (same id).
 *
 * Conversions that carry the value over:
 * - text or template to number when the text is a number ("5" becomes 5);
 * - text to yes/no for true, yes, on, 1 and false, no, off, 0;
 * - number to text, and yes/no to text ("true" or "false"), and to number (1 or 0);
 * - number to yes/no (anything but 0 is yes);
 * - text and template to each other, unchanged;
 * - a single value to a one-item list ("x" becomes a list holding "x");
 * - a list with exactly one plain value to that value;
 * - a dictionary to a list of its values.
 * Everything else starts from the empty value of the new type.
 */
export const convertNode = (
  node: ObjectNode,
  type: ObjectNodeType
): ObjectNode => {
  if (node.type === type) {
    return node;
  }
  const next: ObjectNode = { ...emptyNode(type), id: node.id };
  const text = textOf(node);

  if (type === "text" || type === "template") {
    if (node.type === "text" || node.type === "template") {
      next.text = node.text;
    } else if (node.type === "number" || node.type === "boolean") {
      next.text = text;
    } else if (node.type === "list" && node.entries.length === 1) {
      const only = node.entries[0].node;
      next.text = isContainer(only) ? "" : textOf(only);
    }
    return next;
  }
  if (type === "number") {
    if (node.type === "boolean") {
      next.text = node.checked ? "1" : "0";
    } else if (parseNumberText(text) !== undefined) {
      next.text = text.trim();
    } else if (node.type === "list" && node.entries.length === 1) {
      const only = textOf(node.entries[0].node);
      next.text = parseNumberText(only) === undefined ? "0" : only.trim();
    }
    return next;
  }
  if (type === "boolean") {
    const word = text.trim().toLowerCase();
    if (node.type === "number") {
      const parsed = parseNumberText(node.text);
      next.checked = parsed !== undefined && parsed !== 0;
    } else {
      next.checked = TRUE_WORDS.includes(word) && !FALSE_WORDS.includes(word);
    }
    return next;
  }
  if (type === "list") {
    if (node.type === "dict") {
      next.entries = node.entries.map((entry) => ({
        id: nextId(),
        key: "",
        node: entry.node,
      }));
    } else if (node.type !== "null") {
      next.entries = [
        { id: nextId(), key: "", node: { ...node, id: nextId() } },
      ];
    }
    return next;
  }
  // null and dict start empty.
  return next;
};

/** A key that is not used yet in a dictionary: key, key_2, key_3 and so on. */
export const uniqueKey = (entries: ObjectEntry[], base = "key"): string => {
  const used = new Set(entries.map((entry) => entry.key));
  if (!used.has(base)) {
    return base;
  }
  let counter = 2;
  while (used.has(`${base}_${counter}`)) {
    counter += 1;
  }
  return `${base}_${counter}`;
};

/** Adds a new empty text entry (with a fresh key in a dictionary). */
export const addEntry = (container: ObjectNode): ObjectEntry => {
  const entry: ObjectEntry = {
    id: nextId(),
    key: container.type === "dict" ? uniqueKey(container.entries) : "",
    node: emptyNode("text"),
  };
  container.entries.push(entry);
  return entry;
};

export const removeEntry = (container: ObjectNode, index: number): void => {
  if (index >= 0 && index < container.entries.length) {
    container.entries.splice(index, 1);
  }
};

/** Moves an entry by `delta` places. Returns false when it cannot move. */
export const moveEntry = (
  container: ObjectNode,
  index: number,
  delta: number
): boolean => {
  const target = index + delta;
  if (
    index < 0 ||
    index >= container.entries.length ||
    target < 0 ||
    target >= container.entries.length
  ) {
    return false;
  }
  const [entry] = container.entries.splice(index, 1);
  container.entries.splice(target, 0, entry);
  return true;
};

/**
 * What to hand to the field when the tree is valid. An empty top level
 * container is "no value" for an optional field.
 */
export const outputValue = (value: unknown, required: boolean): unknown => {
  if (required) {
    return value;
  }
  if (Array.isArray(value) && value.length === 0) {
    return undefined;
  }
  if (isPlainObject(value) && Object.keys(value).length === 0) {
    return undefined;
  }
  return value;
};
