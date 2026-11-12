import { getStorage } from "../decorators/storage";
import {
  cleanIds,
  cleanName,
  cleanSurface,
  isPlainObject,
  isSafeKey,
  surfaceEntries,
  LIST_LIMIT,
} from "./tab-validate";

/**
 * Tab groups: named, coloured sets of tabs that sit together in a strip.
 *
 * Rules the model keeps:
 * - A tab is in at most one group.
 * - A pinned tab is never in a group: the pinned region is its own region
 *   and a group never splits it. Pinning a grouped tab takes it out.
 * - A group takes the place of its first member in the saved page order.
 *   Reordering groups and tabs works on that one list of "segments".
 * - Members of tabs that are not on offer are kept, so a page that returns
 *   is still in its group.
 */

export const GROUPS_STORAGE_KEY = "pageTabsGroups";

export const GROUP_LIMIT = 100;

export const GROUP_COLOURS = [
  "grey",
  "blue",
  "green",
  "red",
  "yellow",
  "orange",
  "purple",
  "pink",
  "teal",
] as const;

export type GroupColour = (typeof GROUP_COLOURS)[number] | `#${string}`;

export const DEFAULT_GROUP_COLOUR: GroupColour = "blue";

export interface TabGroup {
  id: string;
  name: string;
  colour: GroupColour;
  collapsed: boolean;
  /** Tab ids in the order they sit in the group. */
  members: string[];
}

/** Stored shape: strip name to its groups, in creation order. */
export type GroupStore = Record<string, TabGroup[]>;

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const cleanColour = (raw: unknown): GroupColour | undefined => {
  if (typeof raw !== "string") {
    return undefined;
  }
  if ((GROUP_COLOURS as readonly string[]).includes(raw)) {
    return raw as GroupColour;
  }
  return HEX.test(raw) ? (raw.toLowerCase() as GroupColour) : undefined;
};

export const normalizeGroups = (raw: unknown): TabGroup[] => {
  if (!Array.isArray(raw)) {
    return [];
  }
  const groups: TabGroup[] = [];
  const ids = new Set<string>();
  const claimed = new Set<string>();
  for (const entry of raw) {
    if (!isPlainObject(entry) || !isSafeKey(entry.id) || ids.has(entry.id)) {
      continue;
    }
    ids.add(entry.id);
    // A tab belongs to the first group that names it.
    const members = cleanIds(entry.members).filter((id) => !claimed.has(id));
    members.forEach((id) => claimed.add(id));
    groups.push({
      id: entry.id,
      name: cleanName(entry.name) ?? "",
      colour: cleanColour(entry.colour) ?? DEFAULT_GROUP_COLOUR,
      collapsed: entry.collapsed === true,
      members,
    });
    if (groups.length >= GROUP_LIMIT) {
      break;
    }
  }
  return groups;
};

export const normalizeGroupStore = (raw: unknown): GroupStore => {
  const store: GroupStore = {};
  surfaceEntries(raw).forEach(([surface, groups]) => {
    const list = normalizeGroups(groups);
    if (list.length) {
      store[surface] = list;
    }
  });
  return store;
};

const nextGroupId = (groups: readonly TabGroup[]): string => {
  let n = groups.length + 1;
  while (groups.some((group) => group.id === `g${n}`)) {
    n++;
  }
  return `g${n}`;
};

export interface NewGroup {
  name?: string;
  colour?: GroupColour;
  /** Tabs that start in the group; pinned ones are refused. */
  members?: string[];
}

/**
 * Creates a group. Its tabs leave their earlier groups. Returns the new
 * list and the new group's id; `id` is empty when the limit is reached.
 * `pinned` lists tabs that cannot be members.
 */
export const createGroup = (
  groups: readonly TabGroup[],
  input: NewGroup = {},
  pinned: readonly string[] = []
): { groups: TabGroup[]; id: string } => {
  if (groups.length >= GROUP_LIMIT) {
    return { groups: [...groups], id: "" };
  }
  const id = nextGroupId(groups);
  const members = cleanIds(input.members).filter(
    (tab) => !pinned.includes(tab)
  );
  const taken = new Set(members);
  const next = groups.map((group) => ({
    ...group,
    members: group.members.filter((tab) => !taken.has(tab)),
  }));
  next.push({
    id,
    name: cleanName(input.name) ?? "",
    colour: cleanColour(input.colour) ?? DEFAULT_GROUP_COLOUR,
    collapsed: false,
    members,
  });
  return { groups: next, id };
};

const update = (
  groups: readonly TabGroup[],
  id: string,
  change: (group: TabGroup) => TabGroup
): TabGroup[] =>
  groups.map((group) => (group.id === id ? change(group) : { ...group }));

/** Renames a group; an empty or unusable name is refused. */
export const renameGroup = (
  groups: readonly TabGroup[],
  id: string,
  name: string
): TabGroup[] => {
  const clean = cleanName(name);
  return clean === undefined
    ? [...groups]
    : update(groups, id, (group) => ({ ...group, name: clean }));
};

export const recolourGroup = (
  groups: readonly TabGroup[],
  id: string,
  colour: string
): TabGroup[] => {
  const clean = cleanColour(colour);
  return clean === undefined
    ? [...groups]
    : update(groups, id, (group) => ({ ...group, colour: clean }));
};

export const setGroupCollapsed = (
  groups: readonly TabGroup[],
  id: string,
  collapsed: boolean
): TabGroup[] => update(groups, id, (group) => ({ ...group, collapsed }));

export const toggleGroupCollapsed = (
  groups: readonly TabGroup[],
  id: string
): TabGroup[] =>
  update(groups, id, (group) => ({ ...group, collapsed: !group.collapsed }));

/** Removes a group. Its tabs stay in the strip, outside any group. */
export const removeGroup = (
  groups: readonly TabGroup[],
  id: string
): TabGroup[] => groups.filter((group) => group.id !== id);

export const groupOf = (
  groups: readonly TabGroup[],
  tabId: string
): TabGroup | undefined =>
  groups.find((group) => group.members.includes(tabId));

/**
 * Moves a tab into a group, out of every group (`groupId` is `null`), or
 * between groups. A pinned tab cannot join a group, so nothing changes.
 * `index` places it inside the group; the default is the end.
 */
export const moveTabToGroup = (
  groups: readonly TabGroup[],
  tabId: string,
  groupId: string | null,
  options: { pinned?: readonly string[]; index?: number } = {}
): TabGroup[] => {
  if (!isSafeKey(tabId)) {
    return [...groups];
  }
  if (groupId !== null) {
    if (
      options.pinned?.includes(tabId) ||
      !groups.some((group) => group.id === groupId)
    ) {
      return [...groups];
    }
  }
  return groups.map((group) => {
    const members = group.members.filter((id) => id !== tabId);
    if (group.id === groupId) {
      const at =
        options.index === undefined
          ? members.length
          : Math.max(0, Math.min(options.index, members.length));
      members.splice(at, 0, tabId);
    }
    return { ...group, members };
  });
};

/** Takes tabs out of every group, for example when they are pinned. */
export const ungroupTabs = (
  groups: readonly TabGroup[],
  tabIds: readonly string[]
): TabGroup[] =>
  groups.map((group) => ({
    ...group,
    members: group.members.filter((id) => !tabIds.includes(id)),
  }));

/** Drops tabs that will never return, such as a removed custom page. */
export const forgetTabs = ungroupTabs;

/** A place in the strip: the pinned region, one group or one ungrouped tab. */
export type StripSegment =
  | { kind: "pinned"; ids: string[] }
  | { kind: "group"; group: TabGroup; ids: string[] }
  | { kind: "tab"; id: string };

export const segmentKey = (segment: StripSegment): string =>
  segment.kind === "pinned"
    ? "pinned"
    : segment.kind === "group"
      ? `group:${segment.group.id}`
      : `tab:${segment.id}`;

/**
 * Lays out the strip: the pinned region first, then, following the saved
 * page order, each ungrouped tab and each group (at the place of its first
 * member). A group lists only the tabs in `visible`, in its own order, and
 * a group without a visible member has no segment. Pinned tabs are never
 * placed in a group, even if stale data lists them as members.
 *
 * `collapsed` is read from the group; a collapsed group still lists its ids
 * so a search can reveal a tab without changing the saved preference.
 */
export const layoutStrip = (input: {
  /** Tabs to show, already closed ones removed. */
  visible: readonly string[];
  order: readonly string[];
  pinned: readonly string[];
  groups: readonly TabGroup[];
}): StripSegment[] => {
  const { visible, order, pinned, groups } = input;
  const present = new Set(visible);
  const pinnedIds = pinned.filter((id) => present.has(id));
  const pinnedSet = new Set(pinnedIds);
  const membership = new Map<string, TabGroup>();
  groups.forEach((group) =>
    group.members.forEach((id) => {
      if (!pinnedSet.has(id) && !membership.has(id)) {
        membership.set(id, group);
      }
    })
  );
  const rank = (id: string, natural: number) => {
    const index = order.indexOf(id);
    return index === -1 ? order.length + natural : index;
  };
  const rest = visible
    .map((id, natural) => ({ id, rank: rank(id, natural) }))
    .filter((entry) => !pinnedSet.has(entry.id))
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.id);
  const segments: StripSegment[] = [];
  if (pinnedIds.length) {
    segments.push({ kind: "pinned", ids: pinnedIds });
  }
  const emitted = new Set<string>();
  rest.forEach((id) => {
    const group = membership.get(id);
    if (!group) {
      segments.push({ kind: "tab", id });
    } else if (!emitted.has(group.id)) {
      emitted.add(group.id);
      segments.push({
        kind: "group",
        group,
        ids: group.members.filter(
          (member) => present.has(member) && membership.get(member) === group
        ),
      });
    }
  });
  return segments;
};

/**
 * The saved page order after moving one segment (an ungrouped tab or a
 * whole group) next to another. The pinned region is not a movable
 * segment. The result lists every tab of the layout, so it can be saved as
 * `pageTabsOrder` and gives the same layout after a restart.
 */
export const reorderSegments = (
  segments: readonly StripSegment[],
  fromKey: string,
  toKey: string,
  after: boolean
): string[] => {
  const movable = segments.filter((segment) => segment.kind !== "pinned");
  const keys = movable.map(segmentKey);
  const pinnedIds = segments.flatMap((segment) =>
    segment.kind === "pinned" ? segment.ids : []
  );
  let list = movable;
  if (fromKey !== toKey && keys.includes(fromKey) && keys.includes(toKey)) {
    const moving = movable.find((segment) => segmentKey(segment) === fromKey)!;
    const rest = movable.filter((segment) => segment !== moving);
    const at = rest.findIndex((segment) => segmentKey(segment) === toKey);
    rest.splice(after ? at + 1 : at, 0, moving);
    list = rest;
  }
  return [
    ...pinnedIds,
    ...list.flatMap((segment) =>
      segment.kind === "group"
        ? segment.ids
        : segment.kind === "tab"
          ? [segment.id]
          : []
    ),
  ];
};

/**
 * Whether a tab sits in a group that is collapsed, so a strip shows it
 * only when a search reveals it.
 */
export const isHiddenByCollapse = (
  groups: readonly TabGroup[],
  tabId: string
): boolean => groupOf(groups, tabId)?.collapsed === true;

export const readGroups = (surface?: string): TabGroup[] =>
  normalizeGroupStore(getStorage().getValue(GROUPS_STORAGE_KEY))[
    cleanSurface(surface)
  ] ?? [];

export const writeGroups = (
  surface: string | undefined,
  groups: readonly TabGroup[]
): void => {
  const store = normalizeGroupStore(getStorage().getValue(GROUPS_STORAGE_KEY));
  const key = cleanSurface(surface);
  const list = normalizeGroups([...groups]).slice(0, LIST_LIMIT);
  if (list.length) {
    store[key] = list;
  } else {
    delete store[key];
  }
  getStorage().setValue(GROUPS_STORAGE_KEY, store);
};
