import {
  expandCondition,
  flattenTriggerList,
  isRec,
  type Rec,
} from "./step-model";

/**
 * Switches one step of an automation on or off by writing or removing the
 * product's own `enabled: false` on it. Returns a new configuration and leaves
 * the one it was given untouched, or undefined when the path names no step.
 * Paths follow the trace convention, for example `action/1/then/0`.
 */
export const setStepEnabled = <T extends object>(
  config: T,
  path: string,
  enabled: boolean
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
  if (enabled) {
    delete target.enabled;
  } else {
    target.enabled = false;
  }
  return clone as T;
};
