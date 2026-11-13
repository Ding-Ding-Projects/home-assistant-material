import {
  expandCondition,
  flattenTriggerList,
  isRec,
  type Rec,
} from "./step-model";

/**
 * Changes one step of an automation through the given function. Returns a new
 * configuration and leaves the one it was given untouched, or undefined when the
 * path names no step. Paths follow the trace convention, for example
 * `action/1/then/0`.
 */
export const editStep = <T extends object>(
  config: T,
  path: string,
  change: (step: Rec) => void
): T | undefined => {
  const clone = structuredClone(config) as Rec;
  const [section, ...rest] = path.split("/");
  let target: unknown;
  if (section === "trigger") {
    const key = "triggers" in clone ? "triggers" : "trigger";
    target = flattenTriggerList(clone[key])[Number(rest[0])];
  } else if (section === "condition" || section === "action") {
    const key =
      section === "condition"
        ? "conditions" in clone
          ? "conditions"
          : "condition"
        : "actions" in clone
          ? "actions"
          : "action";
    let parent: any = clone;
    let pkey: string | number = key;
    let node: unknown = clone[key];
    for (const segment of rest) {
      if (/^\d+$/.test(segment)) {
        if (!Array.isArray(node)) {
          // A single item written without a list: make it a list of one.
          parent[pkey] = [node];
          node = parent[pkey];
        }
        parent = node;
        pkey = Number(segment);
      } else {
        parent = node;
        pkey = segment;
      }
      node =
        isRec(parent) || Array.isArray(parent)
          ? (parent as any)[pkey]
          : undefined;
      if (node === undefined) {
        return undefined;
      }
    }
    if (typeof node === "string" && section === "condition") {
      parent[pkey] = expandCondition(node);
      node = parent[pkey];
    }
    target = node;
  }
  if (!isRec(target)) {
    return undefined;
  }
  change(target);
  return clone as T;
};

export const setStepEnabled = <T extends object>(
  config: T,
  path: string,
  enabled: boolean
): T | undefined =>
  editStep(config, path, (step) => {
    if (enabled) {
      delete step.enabled;
    } else {
      step.enabled = false;
    }
  });

/** The key that marks a step as locked against accidental edits. */
export const LOCK_KEY = "editor_locked";

export const isLocked = (item: unknown): boolean =>
  isRec(item) && item[LOCK_KEY] === true;

/**
 * Locks or unlocks one step. The lock is a guard against accidental edits in the
 * editor, stored beside the step the way a note is. It is not security.
 */
export const setStepLocked = <T extends object>(
  config: T,
  path: string,
  locked: boolean
): T | undefined =>
  editStep(config, path, (step) => {
    if (locked) {
      step[LOCK_KEY] = true;
    } else {
      delete step[LOCK_KEY];
    }
  });
