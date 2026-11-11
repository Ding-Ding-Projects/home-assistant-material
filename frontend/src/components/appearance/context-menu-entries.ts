/**
 * Entries of the element menu that belong to the thing that was clicked.
 *
 * Two steps, so the decisions can be tested without a page:
 *
 * 1. `findTarget` walks up from the clicked element to the closest ancestor
 *    that says what it is (an entity row or card, a device row, an area row,
 *    an interface link) and returns that as plain data.
 * 2. `resolveContextEntries` turns that data, plus facts about the home, into
 *    the extra entries. It reads nothing from the page and changes nothing.
 *
 * Only data the elements already carry is read: the `data-entity-id`,
 * `data-entity`, `data-device-id` and `data-area-id` attributes, and the
 * `stateObj`, `config.entity`, `entityId`, `entity` and `href` properties.
 */

/** What a clicked element says it stands for. */
export interface ContextTarget {
  entityId?: string;
  deviceId?: string;
  areaId?: string;
  /** An interface link carried as a property, not as an anchor. */
  href?: string;
}

/** The parts of an element this module reads. */
export interface ReadableElement {
  dataset?: Record<string, string | undefined>;
  stateObj?: unknown;
  config?: unknown;
  entityId?: unknown;
  entity?: unknown;
  href?: unknown;
}

export type ContextEntryId =
  | "open_details"
  | "turn_on"
  | "turn_off"
  | "copy_entity_id"
  | "rename"
  | "hide"
  | "open_device"
  | "copy_device_id"
  | "open_area"
  | "copy_area_id"
  | "open_new_tab";

export interface ContextEntry {
  id: ContextEntryId;
  /** The translation key under `ui.appearance_editor`. */
  labelKey: string;
  /** The name shown in the label, for entries that act on the home. */
  name?: string;
  /** What the entry works on: an id, or an internal path. */
  value: string;
}

/** What the home says about the target. All of it is optional. */
export interface ContextFacts {
  /** The state of the entity, when it has one. */
  state?: { state: string };
  /** The name to show for the entity. */
  entityName?: string;
  /** Whether the entity's domain has services that switch it on and off. */
  canToggle?: boolean;
  /** Whether the entity is in the registry, and whether it is hidden. */
  registry?: { hidden?: boolean };
  /** Whether the person may change settings. */
  isAdmin?: boolean;
  deviceName?: string;
  areaName?: string;
  /** The address of the page, to tell an internal link from another. */
  origin?: string;
}

const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;

const asEntityId = (value: unknown): string | undefined =>
  typeof value === "string" && ENTITY_ID.test(value) ? value : undefined;

const asId = (value: unknown): string | undefined =>
  typeof value === "string" && /^[\w-]{1,64}$/.test(value) ? value : undefined;

const entityIdOf = (element: ReadableElement): string | undefined => {
  const stateObj = element.stateObj as { entity_id?: unknown } | undefined;
  const config = element.config as { entity?: unknown } | undefined;
  return (
    asEntityId(element.dataset?.entityId) ??
    asEntityId(element.dataset?.entity) ??
    asEntityId(stateObj?.entity_id) ??
    asEntityId(config?.entity) ??
    asEntityId(element.entityId) ??
    asEntityId(element.entity)
  );
};

/** What one element says it stands for, or nothing. */
export const readTarget = (
  element: ReadableElement
): ContextTarget | undefined => {
  const target: ContextTarget = {};
  const entityId = entityIdOf(element);
  const deviceId = asId(element.dataset?.deviceId);
  const areaId = asId(element.dataset?.areaId);
  if (entityId) {
    target.entityId = entityId;
  }
  if (deviceId) {
    target.deviceId = deviceId;
  }
  if (areaId) {
    target.areaId = areaId;
  }
  if (typeof element.href === "string" && element.href) {
    target.href = element.href;
  }
  return Object.keys(target).length ? target : undefined;
};

/**
 * The target of the closest ancestor that has one. The walk stops at a
 * boundary (a whole page or dialog), so a page's own id is never taken for
 * what was clicked inside it.
 */
export const findTarget = <T extends ReadableElement>(
  start: T | undefined,
  parentOf: (element: T) => T | undefined,
  isBoundary: (element: T) => boolean,
  maxDepth = 30
): ContextTarget | undefined => {
  let node = start;
  for (let depth = 0; node && depth < maxDepth; depth++) {
    if (isBoundary(node)) {
      return undefined;
    }
    const target = readTarget(node);
    if (target) {
      return target;
    }
    node = parentOf(node);
  }
  return undefined;
};

/**
 * The path of a link that stays inside this interface, or nothing for a link
 * that leaves it.
 */
export const internalPath = (
  href: string,
  origin: string
): string | undefined => {
  if (!href || href.startsWith("#")) {
    return undefined;
  }
  try {
    const url = new URL(href, origin);
    if (url.origin !== new URL(origin).origin) {
      return undefined;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch (_err) {
    return undefined;
  }
};

/**
 * The turn-on or turn-off entry that the state allows. Only the plain on and
 * off states count: a cover, a lock or a climate device has other states that
 * "on" and "off" would misname.
 */
const toggleEntry = (
  state: { state: string } | undefined,
  canToggle: boolean | undefined,
  name: string,
  entityId: string
): ContextEntry | undefined => {
  if (!state || !canToggle) {
    return undefined;
  }
  if (state.state === "on") {
    return {
      id: "turn_off",
      labelKey: "menu_entity_turn_off",
      name,
      value: entityId,
    };
  }
  if (state.state === "off") {
    return {
      id: "turn_on",
      labelKey: "menu_entity_turn_on",
      name,
      value: entityId,
    };
  }
  return undefined;
};

/** The extra entries for what was clicked, in the order they are shown. */
export const resolveContextEntries = (
  target: ContextTarget | undefined,
  facts: ContextFacts
): ContextEntry[] => {
  if (!target) {
    return [];
  }
  const entries: ContextEntry[] = [];
  const { entityId } = target;
  // An entity the home does not know is not offered anything: it is gone, or
  // the element only looked like one.
  if (entityId && (facts.state || facts.registry)) {
    const name = facts.entityName || entityId;
    if (facts.state) {
      entries.push({
        id: "open_details",
        labelKey: "menu_entity_details",
        value: entityId,
      });
      const toggle = toggleEntry(facts.state, facts.canToggle, name, entityId);
      if (toggle) {
        entries.push(toggle);
      }
    }
    entries.push({
      id: "copy_entity_id",
      labelKey: "menu_entity_copy_id",
      value: entityId,
    });
    if (facts.registry && facts.isAdmin) {
      entries.push({
        id: "rename",
        labelKey: "menu_entity_rename",
        name,
        value: entityId,
      });
      if (!facts.registry.hidden) {
        entries.push({
          id: "hide",
          labelKey: "menu_entity_hide",
          name,
          value: entityId,
        });
      }
    }
  }
  if (target.deviceId && facts.deviceName !== undefined) {
    entries.push(
      {
        id: "open_device",
        labelKey: "menu_device_details",
        name: facts.deviceName,
        value: target.deviceId,
      },
      {
        id: "copy_device_id",
        labelKey: "menu_device_copy_id",
        value: target.deviceId,
      }
    );
  }
  if (target.areaId && facts.areaName !== undefined) {
    entries.push(
      {
        id: "open_area",
        labelKey: "menu_area_details",
        name: facts.areaName,
        value: target.areaId,
      },
      {
        id: "copy_area_id",
        labelKey: "menu_area_copy_id",
        value: target.areaId,
      }
    );
  }
  if (target.href && facts.origin) {
    const path = internalPath(target.href, facts.origin);
    if (path) {
      entries.push({
        id: "open_new_tab",
        labelKey: "menu_open_new_tab",
        value: path,
      });
    }
  }
  return entries;
};
