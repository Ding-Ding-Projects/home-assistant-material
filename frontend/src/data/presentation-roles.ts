import type { Connection } from "home-assistant-js-websocket";
import { ensureArray } from "../common/array/ensure-array";
import type { VisibilityCondition } from "../panels/lovelace/common/validate-condition";
import type { DefaultPanelOverrides } from "./default-panel-overrides";
import type { PresentationRole } from "./frontend";
import { fetchFrontendSystemData, saveFrontendSystemData } from "./frontend";

/**
 * Presentation roles: named groups of people that decide what the interface
 * shows. The server only knows administrators and ordinary users and does not
 * limit what an ordinary user's session can read or call, so a role can hide
 * things from the interface but can never keep a person out of them.
 */

export type { PresentationRole };

/** How a role applies to one dashboard, view or card. */
export type RoleRule = "hide" | "none" | "custom";

const isRole = (value: unknown): value is PresentationRole => {
  const role = value as PresentationRole | undefined;
  return (
    !!role &&
    typeof role === "object" &&
    typeof role.id === "string" &&
    role.id !== "" &&
    typeof role.name === "string"
  );
};

/** The stored roles without anything malformed; never throws. */
export const normalizeRoles = (raw: unknown): PresentationRole[] => {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  const roles: PresentationRole[] = [];
  for (const entry of raw) {
    if (isRole(entry) && !seen.has(entry.id)) {
      seen.add(entry.id);
      roles.push({
        id: entry.id,
        name: entry.name,
        users: Array.isArray(entry.users)
          ? [...new Set(entry.users.filter((u) => typeof u === "string"))]
          : [],
      });
    }
  }
  return roles;
};

/** Whether the user is in at least one of the named roles. */
export const isUserInRoles = (
  rawRoles: unknown,
  userId: string | undefined,
  roleIds: string[] | undefined
): boolean => {
  if (!userId || !Array.isArray(roleIds) || !roleIds.length) {
    return false;
  }
  return normalizeRoles(rawRoles).some(
    (role) => roleIds.includes(role.id) && role.users.includes(userId)
  );
};

/** The ids of every role a user is in. */
export const roleIdsOfUser = (
  rawRoles: unknown,
  userId: string | undefined
): string[] =>
  userId
    ? normalizeRoles(rawRoles)
        .filter((role) => role.users.includes(userId))
        .map((role) => role.id)
    : [];

/** A role id made from the name that no existing role uses. */
export const makeRoleId = (name: string, existing: PresentationRole[]) => {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "_")
      .replace(/^_+|_+$/g, "") || "role";
  const used = new Set(existing.map((role) => role.id));
  let id = base;
  for (let i = 2; used.has(id); i++) {
    id = `${base}_${i}`;
  }
  return id;
};

export const addRole = (
  roles: PresentationRole[],
  name: string
): PresentationRole[] => {
  const trimmed = name.trim();
  if (!trimmed) {
    return roles;
  }
  return [
    ...roles,
    { id: makeRoleId(trimmed, roles), name: trimmed, users: [] },
  ];
};

export const renameRole = (
  roles: PresentationRole[],
  id: string,
  name: string
): PresentationRole[] => {
  const trimmed = name.trim();
  return trimmed
    ? roles.map((role) => (role.id === id ? { ...role, name: trimmed } : role))
    : roles;
};

export const removeRole = (
  roles: PresentationRole[],
  id: string
): PresentationRole[] => roles.filter((role) => role.id !== id);

export const setRoleUsers = (
  roles: PresentationRole[],
  id: string,
  users: string[]
): PresentationRole[] =>
  roles.map((role) =>
    role.id === id ? { ...role, users: [...new Set(users)] } : role
  );

// ---- Rules on conditions ---------------------------------------------------

const roleLeaf = (roleId: string): VisibilityCondition => ({
  condition: "role",
  roles: [roleId],
});

/** `not` of one role: the browser hides the element for people in the role. */
const hideRoleCondition = (roleId: string): VisibilityCondition => ({
  condition: "not",
  conditions: [roleLeaf(roleId)],
});

/** The few fields these checks read, whatever the condition type is. */
interface LooseCondition {
  condition?: string;
  enabled?: unknown;
  roles?: string[];
  users?: string[];
  conditions?: LooseCondition | LooseCondition[];
}

const loose = (condition: VisibilityCondition): LooseCondition =>
  condition as unknown as LooseCondition;

const hiddenRoleOf = (condition: VisibilityCondition): string | undefined => {
  const c = loose(condition);
  if (c.condition !== "not" || c.enabled === false) {
    return undefined;
  }
  const children = ensureArray(c.conditions) ?? [];
  if (children.length !== 1) {
    return undefined;
  }
  const child = children[0];
  return child.condition === "role" && child.roles?.length === 1
    ? child.roles[0]
    : undefined;
};

const mentionsRole = (condition: LooseCondition, roleId: string): boolean => {
  if (condition.condition === "role") {
    return !!condition.roles?.includes(roleId);
  }
  return (ensureArray(condition.conditions) ?? []).some((child) =>
    mentionsRole(child, roleId)
  );
};

/**
 * How a role applies: `hide` when the list holds exactly the one-tap hide for
 * the role, `custom` when the role is used some other way (for example "show
 * only to"), otherwise `none`.
 */
export const roleRule = (
  conditions: VisibilityCondition[] | undefined,
  roleId: string
): RoleRule => {
  const list = conditions ?? [];
  if (list.some((c) => hiddenRoleOf(c) === roleId)) {
    return "hide";
  }
  return list.some((c) => mentionsRole(loose(c), roleId)) ? "custom" : "none";
};

/**
 * A copy of the conditions with the one-tap hide for a role turned on or off.
 * Every other condition is kept as it is.
 */
export const setRoleHidden = (
  conditions: VisibilityCondition[] | undefined,
  roleId: string,
  hidden: boolean
): VisibilityCondition[] => {
  const rest = (conditions ?? []).filter((c) => hiddenRoleOf(c) !== roleId);
  return hidden ? [...rest, hideRoleCondition(roleId)] : rest;
};

// ---- View only ---------------------------------------------------------------

/** What a role gets for one card: hidden, view only, or full use. */
export type RoleLevel = "hide" | "view" | "use";

/**
 * Whether the list marks the role as view only: a list entry that is exactly
 * the role condition for this one role.
 */
export const isRoleViewOnly = (
  viewOnly: VisibilityCondition[] | undefined,
  roleId: string
): boolean =>
  (viewOnly ?? []).some((c) => {
    const l = loose(c);
    return (
      l.condition === "role" &&
      l.enabled !== false &&
      l.roles?.length === 1 &&
      l.roles[0] === roleId
    );
  });

/**
 * A copy of the view-only conditions with the role turned on or off. Every
 * other entry is kept. The list never holds the role twice.
 */
export const setRoleViewOnly = (
  viewOnly: VisibilityCondition[] | undefined,
  roleId: string,
  on: boolean
): VisibilityCondition[] => {
  const rest = (viewOnly ?? []).filter((c) => {
    const l = loose(c);
    return !(
      l.condition === "role" &&
      l.roles?.length === 1 &&
      l.roles[0] === roleId
    );
  });
  return on ? [...rest, roleLeaf(roleId)] : rest;
};

/** The level a role has for a card, from its visibility and view-only lists. */
export const roleLevel = (
  visibility: VisibilityCondition[] | undefined,
  viewOnly: VisibilityCondition[] | undefined,
  roleId: string
): RoleLevel | "custom" => {
  const rule = roleRule(visibility, roleId);
  if (rule === "custom") {
    return "custom";
  }
  if (rule === "hide") {
    return "hide";
  }
  return isRoleViewOnly(viewOnly, roleId) ? "view" : "use";
};

/**
 * The visibility and view-only lists after one role is moved to a level.
 * Hide adds the one-tap hide and clears view only; View clears the hide and
 * adds view only; Use clears both.
 */
export const setRoleLevel = (
  visibility: VisibilityCondition[] | undefined,
  viewOnly: VisibilityCondition[] | undefined,
  roleId: string,
  level: RoleLevel
): { visibility: VisibilityCondition[]; view_only: VisibilityCondition[] } => ({
  visibility: setRoleHidden(visibility, roleId, level === "hide"),
  view_only: setRoleViewOnly(viewOnly, roleId, level === "view"),
});

// ---- Who can see this ------------------------------------------------------

/** true / false when known from the person alone, undefined when it depends on more. */
export type PersonResult = boolean | undefined;

const andOf = (values: PersonResult[]): PersonResult => {
  let unknown = false;
  for (const value of values) {
    if (value === false) return false;
    if (value === undefined) unknown = true;
  }
  return unknown ? undefined : true;
};

const orOf = (values: PersonResult[]): PersonResult => {
  let unknown = false;
  for (const value of values) {
    if (value === true) return true;
    if (value === undefined) unknown = true;
  }
  return unknown ? undefined : false;
};

/**
 * Whether one person sees something with these conditions, using only what
 * the person decides: role and user conditions. Anything that depends on the
 * moment or the device (time, screen size, entity states) is unknown here.
 */
export const evaluateForPerson = (
  conditions: VisibilityCondition[] | undefined,
  userId: string,
  roles: PresentationRole[]
): PersonResult => {
  const evaluate = (condition: LooseCondition): PersonResult => {
    if (!condition.condition) {
      return undefined;
    }
    if (condition.enabled === false) {
      return true;
    }
    switch (condition.condition) {
      case "role":
        return isUserInRoles(roles, userId, condition.roles);
      case "user":
        return !!condition.users?.includes(userId);
      case "and":
      case "or":
      case "not": {
        const children = (ensureArray(condition.conditions) ?? []).filter(
          (child) => child.enabled !== false
        );
        if (condition.conditions === undefined) {
          return true;
        }
        if (condition.condition === "or") {
          return orOf(children.map(evaluate));
        }
        const all = andOf(children.map(evaluate));
        if (condition.condition === "not") {
          return all === undefined ? undefined : !all;
        }
        return all;
      }
      default:
        return undefined;
    }
  };
  return andOf((conditions ?? []).map((c) => evaluate(loose(c))));
};

export interface RoleVisibility {
  role: PresentationRole;
  /** `yes` for every member, `no` for none, `some` for a mix, `depends` when it also depends on time, screen or states. */
  sees: "yes" | "no" | "some" | "depends" | "empty";
}

/** What each role sees with these conditions, from the real conditions. */
export const visibilityByRole = (
  conditions: VisibilityCondition[] | undefined,
  roles: PresentationRole[]
): RoleVisibility[] =>
  roles.map((role) => {
    if (!role.users.length) {
      return { role, sees: "empty" as const };
    }
    const results = role.users.map((userId) =>
      evaluateForPerson(conditions, userId, roles)
    );
    if (results.includes(undefined)) {
      return { role, sees: "depends" as const };
    }
    if (results.every((r) => r === true)) {
      return { role, sees: "yes" as const };
    }
    if (results.every((r) => r === false)) {
      return { role, sees: "no" as const };
    }
    return { role, sees: "some" as const };
  });

// ---- Saving ----------------------------------------------------------------

/**
 * Saves the roles into the shared frontend settings. The stored value is read
 * first so a change made elsewhere is kept. No roles removes the key.
 */
export const savePresentationRoles = async (
  conn: Connection,
  roles: PresentationRole[]
): Promise<void> => {
  const stored = (await fetchFrontendSystemData(conn, "core")) ?? {};
  const { presentation_roles: _old, ...rest } = stored;
  await saveFrontendSystemData(
    conn,
    "core",
    roles.length ? { ...rest, presentation_roles: roles } : rest
  );
};

/** Saves one kind-of-device override; an empty path clears it. */
export const saveDefaultPanelSettings = async (
  conn: Connection,
  everyone: string | undefined,
  overrides: DefaultPanelOverrides
): Promise<void> => {
  const stored = (await fetchFrontendSystemData(conn, "core")) ?? {};
  const { default_panel: _a, default_panel_overrides: _b, ...rest } = stored;
  await saveFrontendSystemData(conn, "core", {
    ...rest,
    ...(everyone ? { default_panel: everyone } : {}),
    ...(Object.keys(overrides).length
      ? { default_panel_overrides: overrides }
      : {}),
  });
};
