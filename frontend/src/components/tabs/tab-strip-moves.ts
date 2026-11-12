import type { StripSegment, TabGroup } from "../../common/tabs/tab-groups";
import { reorderSegments, segmentKey } from "../../common/tabs/tab-groups";
import { moveTabId } from "../tab-order";

/**
 * Pure planning of every move in the tab strip: dragging a tab or a group,
 * the keyboard moves, and moving a tab into or out of a group. A plan works
 * on the strip's visible segments and says what the visible order, the
 * groups and the pinned region become. `applyChange` then merges that into
 * the saved lists, so tabs the person closed keep their saved place.
 */

export interface StripChange {
  kind: "reorder" | "join" | "leave" | "group";
  /** The visible tabs in their new strip order, the pinned region first. */
  visible: string[];
  /** The new groups, when a group changed. */
  groups?: TabGroup[];
  /** The new pinned list, when the pinned region changed. */
  pinned?: string[];
  tabId?: string;
  groupId?: string;
}

export const flattenSegments = (segments: readonly StripSegment[]): string[] =>
  segments.flatMap((segment) =>
    segment.kind === "tab" ? [segment.id] : segment.ids
  );

/**
 * Puts the visible tabs of `after` into the slots the visible tabs of
 * `before` held in `full`, so hidden (closed) tabs keep their own places.
 * When the two lists are not the same tabs the plain new order wins.
 */
export const mergeVisible = (
  full: readonly string[],
  before: readonly string[],
  after: readonly string[]
): string[] => {
  const known = new Set(before);
  const same =
    before.length === after.length && after.every((id) => known.has(id));
  if (!same) {
    return [...after, ...full.filter((id) => !after.includes(id))];
  }
  const queue = [...after];
  return full.map((id) => (known.has(id) ? queue.shift()! : id));
};

const segmentIndexOfTab = (
  segments: readonly StripSegment[],
  id: string
): number =>
  segments.findIndex((segment) =>
    segment.kind === "tab" ? segment.id === id : segment.ids.includes(id)
  );

/** Takes a tab out of its segment; an emptied group loses its segment. */
const withoutTab = (
  segments: readonly StripSegment[],
  id: string
): StripSegment[] =>
  segments
    .map((segment): StripSegment | undefined => {
      if (segment.kind === "tab") {
        return segment.id === id ? undefined : segment;
      }
      if (!segment.ids.includes(id)) {
        return segment;
      }
      const ids = segment.ids.filter((item) => item !== id);
      return ids.length ? ({ ...segment, ids } as StripSegment) : undefined;
    })
    .filter((segment): segment is StripSegment => !!segment);

const ungroup = (groups: readonly TabGroup[], id: string): TabGroup[] =>
  groups.map((group) => ({
    ...group,
    members: group.members.filter((member) => member !== id),
  }));

export interface MoveContext {
  groups: readonly TabGroup[];
  /** The whole saved pinned list, including pinned tabs that are closed. */
  pinned: readonly string[];
}

/** Moves a tab beside another tab, joining or leaving a group as it goes. */
export const moveTabNear = (
  segments: readonly StripSegment[],
  context: MoveContext,
  tabId: string,
  targetId: string,
  after: boolean
): StripChange | undefined => {
  if (tabId === targetId) {
    return undefined;
  }
  const fromIndex = segmentIndexOfTab(segments, tabId);
  const toIndex = segmentIndexOfTab(segments, targetId);
  if (fromIndex < 0 || toIndex < 0) {
    return undefined;
  }
  const from = segments[fromIndex];
  const to = segments[toIndex];
  if (from.kind === "pinned" || to.kind === "pinned") {
    if (from.kind !== "pinned" || to.kind !== "pinned") {
      return undefined;
    }
    const ids = moveTabId(from.ids, tabId, targetId, after);
    return {
      kind: "reorder",
      tabId,
      visible: flattenSegments(
        segments.map((segment, i) =>
          i === fromIndex ? ({ ...segment, ids } as StripSegment) : segment
        )
      ),
      pinned: mergeVisible(context.pinned, from.ids, ids),
    };
  }
  if (from.kind === "group" && to.kind === "group" && from === to) {
    const ids = moveTabId(to.ids, tabId, targetId, after);
    return {
      kind: "reorder",
      tabId,
      visible: flattenSegments(
        segments.map((segment, i) =>
          i === toIndex ? ({ ...segment, ids } as StripSegment) : segment
        )
      ),
      groups: context.groups.map((group) =>
        group.id === to.group.id
          ? { ...group, members: mergeVisible(group.members, to.ids, ids) }
          : { ...group }
      ),
    };
  }
  const rest = withoutTab(segments, tabId);
  if (to.kind === "group") {
    const index = rest.findIndex(
      (segment) => segment.kind === "group" && segment.group.id === to.group.id
    );
    const target = rest[index] as Extract<StripSegment, { kind: "group" }>;
    const at = target.ids.indexOf(targetId);
    const ids = [...target.ids];
    ids.splice(after ? at + 1 : at, 0, tabId);
    const next = rest.map((segment, i) =>
      i === index ? ({ ...segment, ids } as StripSegment) : segment
    );
    return {
      kind: "join",
      tabId,
      groupId: to.group.id,
      visible: flattenSegments(next),
      groups: context.groups.map((group) => {
        const members = group.members.filter((member) => member !== tabId);
        if (group.id === to.group.id) {
          const place = members.indexOf(targetId);
          members.splice(
            place < 0 ? members.length : after ? place + 1 : place,
            0,
            tabId
          );
        }
        return { ...group, members };
      }),
    };
  }
  const index = rest.findIndex(
    (segment) => segment.kind === "tab" && segment.id === targetId
  );
  if (index < 0) {
    return undefined;
  }
  const next = [...rest];
  next.splice(after ? index + 1 : index, 0, { kind: "tab", id: tabId });
  return {
    kind: from.kind === "group" ? "leave" : "reorder",
    tabId,
    groupId: from.kind === "group" ? from.group.id : undefined,
    visible: flattenSegments(next),
    groups: from.kind === "group" ? ungroup(context.groups, tabId) : undefined,
  };
};

/** Moves a tab into a group, at its start or its end. */
export const joinGroup = (
  segments: readonly StripSegment[],
  context: MoveContext,
  tabId: string,
  groupId: string,
  position: "start" | "end" = "start"
): StripChange | undefined => {
  const target = segments.find(
    (segment) => segment.kind === "group" && segment.group.id === groupId
  ) as Extract<StripSegment, { kind: "group" }> | undefined;
  const own = segments[segmentIndexOfTab(segments, tabId)];
  if (!target || !own || own.kind === "pinned") {
    return undefined;
  }
  const anchor =
    position === "start" ? target.ids[0] : target.ids[target.ids.length - 1];
  return moveTabNear(segments, context, tabId, anchor, position === "end");
};

/** Moves a tab out of its group to the very end of the strip. */
export const moveTabToEnd = (
  segments: readonly StripSegment[],
  context: MoveContext,
  tabId: string
): StripChange | undefined => {
  const index = segmentIndexOfTab(segments, tabId);
  const own = segments[index];
  if (!own || own.kind === "pinned") {
    return undefined;
  }
  const next = [...withoutTab(segments, tabId), { kind: "tab", id: tabId }];
  return {
    kind: own.kind === "group" ? "leave" : "reorder",
    tabId,
    groupId: own.kind === "group" ? own.group.id : undefined,
    visible: flattenSegments(next as StripSegment[]),
    groups: own.kind === "group" ? ungroup(context.groups, tabId) : undefined,
  };
};

/** Moves a whole group beside another segment. */
export const moveGroupNear = (
  segments: readonly StripSegment[],
  groupId: string,
  targetKey: string,
  after: boolean
): StripChange | undefined => {
  const key = `group:${groupId}`;
  const before = flattenSegments(segments);
  const visible = reorderSegments(segments, key, targetKey, after);
  return visible.join("\n") === before.join("\n")
    ? undefined
    : { kind: "group", visible, groupId };
};

/** The segment key a tab belongs to: its group, or itself. */
export const segmentKeyOfTab = (
  segments: readonly StripSegment[],
  tabId: string
): string | undefined => {
  const segment = segments[segmentIndexOfTab(segments, tabId)];
  return segment && segment.kind !== "pinned" ? segmentKey(segment) : undefined;
};

/** Takes a tab out of its group and puts it before or after that group. */
export const leaveGroup = (
  segments: readonly StripSegment[],
  context: MoveContext,
  tabId: string,
  forward: boolean
): StripChange | undefined => {
  const index = segmentIndexOfTab(segments, tabId);
  const own = segments[index];
  if (!own || own.kind !== "group") {
    return undefined;
  }
  const rest = withoutTab(segments, tabId);
  const groupIndex = rest.findIndex(
    (segment) => segment.kind === "group" && segment.group.id === own.group.id
  );
  const at = groupIndex < 0 ? index : forward ? groupIndex + 1 : groupIndex;
  const next = [...rest];
  next.splice(at, 0, { kind: "tab", id: tabId });
  return {
    kind: "leave",
    tabId,
    groupId: own.group.id,
    visible: flattenSegments(next),
    groups: ungroup(context.groups, tabId),
  };
};

/**
 * The keyboard move of one tab one step along the strip. Inside a group it
 * moves among the members, and past the last member it leaves the group. An
 * ungrouped tab steps over a neighbouring tab, or over a whole group.
 */
export const planKeyboardMove = (
  segments: readonly StripSegment[],
  context: MoveContext,
  tabId: string,
  forward: boolean
): StripChange | undefined => {
  const index = segmentIndexOfTab(segments, tabId);
  const own = segments[index];
  if (!own) {
    return undefined;
  }
  if (own.kind === "pinned" || own.kind === "group") {
    const at = own.ids.indexOf(tabId);
    const neighbour = own.ids[at + (forward ? 1 : -1)];
    if (neighbour) {
      return moveTabNear(segments, context, tabId, neighbour, forward);
    }
    return own.kind === "group"
      ? leaveGroup(segments, context, tabId, forward)
      : undefined;
  }
  const neighbour = segments[index + (forward ? 1 : -1)];
  if (!neighbour || neighbour.kind === "pinned") {
    return undefined;
  }
  const visible = reorderSegments(
    segments,
    `tab:${tabId}`,
    segmentKey(neighbour),
    forward
  );
  return { kind: "reorder", tabId, visible };
};

/**
 * Where the group keys send a tab: the next or previous group in strip order,
 * or out of its group when there is none further on (`groupId` is null).
 * Undefined when nothing can change, for example a pinned tab.
 */
export const groupStepTarget = (
  segments: readonly StripSegment[],
  tabId: string,
  forward: boolean
): { groupId: string | null } | undefined => {
  const index = segmentIndexOfTab(segments, tabId);
  const own = segments[index];
  if (!own || own.kind === "pinned") {
    return undefined;
  }
  const candidates = forward
    ? segments.slice(index + 1)
    : segments.slice(0, index).reverse();
  const found = candidates.find((segment) => segment.kind === "group") as
    Extract<StripSegment, { kind: "group" }> | undefined;
  if (found) {
    return { groupId: found.group.id };
  }
  return own.kind === "group" ? { groupId: null } : undefined;
};

/** The saved lists after a change: visible slots refilled, hidden tabs kept. */
export const applyChange = (input: {
  fullOrder: readonly string[];
  visibleBefore: readonly string[];
  change: StripChange;
}): { order: string[]; groups?: TabGroup[]; pinned?: string[] } => ({
  order: mergeVisible(
    input.fullOrder,
    input.visibleBefore,
    input.change.visible
  ),
  groups: input.change.groups,
  pinned: input.change.pinned,
});
