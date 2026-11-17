import { HELPER_DOMAINS } from "../../helpers/const";

/** Maximum depth walked into a config, so a cyclic object cannot hang. */
const MAX_DEPTH = 40;

const DOMAIN_PATTERN = HELPER_DOMAINS.join("|");

/**
 * An entity id of a helper domain. It must not be glued to a longer word or
 * to another dotted name, so "my_timer.x" and "a.timer.x" do not match.
 */
const HELPER_ID_REGEX = new RegExp(
  `(?<![a-z0-9_.])(?:${DOMAIN_PATTERN})\\.[a-z0-9_]+(?![a-z0-9_])`,
  "g"
);

/**
 * Lists the helper entities an automation or script config refers to, in the
 * order they first appear. Entity ids are found in plain fields, in lists of
 * ids and inside templates. Because a service such as `timer.start` looks the
 * same as an entity id, pass `isKnown` to keep only ids that really exist.
 */
export const collectHelperEntityIds = (
  config: unknown,
  isKnown?: (entityId: string) => boolean
): string[] => {
  const found = new Set<string>();
  const visit = (value: unknown, depth: number): void => {
    if (depth > MAX_DEPTH || value === null || value === undefined) {
      return;
    }
    if (typeof value === "string") {
      for (const match of value.matchAll(HELPER_ID_REGEX)) {
        if (!isKnown || isKnown(match[0])) {
          found.add(match[0]);
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach((item) =>
        visit(item, depth + 1)
      );
    }
  };
  visit(config, 0);
  return [...found];
};

/** The domain of a helper entity id, or undefined when it is not a helper. */
export const helperDomainOf = (
  entityId: string
): (typeof HELPER_DOMAINS)[number] | undefined => {
  const domain = entityId.split(".", 1)[0];
  return (HELPER_DOMAINS as readonly string[]).includes(domain)
    ? (domain as (typeof HELPER_DOMAINS)[number])
    : undefined;
};

/**
 * A condition that tests a helper's current state, for the "Use in this
 * automation" shortcut after a helper was created.
 */
export const conditionForHelper = (
  entityId: string
): Record<string, unknown> => {
  const domain = helperDomainOf(entityId);
  if (domain === "input_boolean") {
    return { condition: "state", entity_id: entityId, state: "on" };
  }
  if (domain === "input_number" || domain === "counter") {
    return { condition: "numeric_state", entity_id: entityId, above: 0 };
  }
  return { condition: "state", entity_id: entityId, state: "" };
};
