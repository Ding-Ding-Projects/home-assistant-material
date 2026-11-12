import type { LockStore } from "../../common/locks/element-locks";
import type { TabAppearanceStore } from "../../common/tabs/tab-appearance-store";
import type {
  ClosePlan,
  ClosePlanKind,
  PlanTab,
} from "../../common/tabs/tab-close-plans";
import {
  planEdgeClose,
  planTextClose,
} from "../../common/tabs/tab-close-plans";
import type { StripSegment, TabGroup } from "../../common/tabs/tab-groups";
import { layoutStrip } from "../../common/tabs/tab-groups";
import { tabLockState } from "../../common/tabs/tab-locks";
import type { GroupMove } from "../tabs/tab-group-actions";
import { planGroupMove } from "../tabs/tab-group-actions";
import { cleanIds } from "../../common/tabs/tab-validate";
import type { TabMenuState, TabMenuStore } from "../tabs/tab-menu-actions";
import type { TabMoveKind } from "../tabs/tab-menu-entries";
import {
  applyChange,
  flattenSegments,
  mergeVisible,
  moveTabNear,
  planEdgeMove,
  planKeyboardMove,
} from "../tabs/tab-strip-moves";
import type { SectionMove, SectionTabsState } from "./section-tabs-model";
import {
  dropSection,
  moveSection,
  orderSections,
  visibleSections,
} from "./section-tabs-model";

/**
 * What the sections of a settings surface need from the shared tab model, as
 * pure functions: the name of the strip the shared stores know the surface by,
 * the layout with groups, moves that respect groups, the plans for hiding many
 * sections at once and the state the shared tab menu entries are built from.
 *
 * The saved choices of a surface stay in the `sectionTabs` store (order,
 * pinned, hidden). Groups, per-tab looks and locks live in the shared stores
 * under the surface name from {@link sectionSurface}, so the shared group
 * picker, group editor, appearance editor and lock prompt work on them without
 * any change. "Closing" a section means hiding it from the row.
 */

/** What every section strip's name in the shared tab stores starts with. */
export const SECTION_SURFACE_PREFIX = "section:";

/** The longest strip name the shared stores keep. */
export const SURFACE_NAME_LIMIT = 80;

const hash = (text: string): string => {
  let value = 7;
  for (let index = 0; index < text.length; index++) {
    value = (value * 31 + text.charCodeAt(index)) % 4294967291;
  }
  return value.toString(16).padStart(8, "0");
};

/**
 * The strip name of a settings surface: `section:` and the route it is
 * mounted on. A long route is cut and ends with a short hash, so two routes
 * never share a name and the name is never mistaken for the main strip.
 */
export const sectionSurface = (route: string | undefined): string => {
  const clean = String(route ?? "").replace(/\s+/g, "");
  const name = `${SECTION_SURFACE_PREFIX}${clean || "root"}`;
  return name.length <= SURFACE_NAME_LIMIT
    ? name
    : `${name.slice(0, SURFACE_NAME_LIMIT - 9)}~${hash(name)}`;
};

export const isSectionSurface = (surface: string | undefined): boolean =>
  typeof surface === "string" && surface.startsWith(SECTION_SURFACE_PREFIX);

export interface SectionLayoutInput {
  /** Every section path of the surface, in page order. */
  paths: readonly string[];
  state: SectionTabsState;
  groups: readonly TabGroup[];
  activePath?: string;
}

export interface SectionLayout {
  /** Every section, pinned first, as the row orders them. */
  ordered: string[];
  /** The sections the row shows: not hidden, and the open one. */
  shown: string[];
  /** The pinned sections in the order the row shows them. */
  pinned: string[];
  /** The row of the shown sections: pinned region, groups and loose tabs. */
  segments: StripSegment[];
  /** Every section in layout order, hidden ones in their own places. */
  all: string[];
  /** At least one group has a section of this surface in it. */
  hasGroups: boolean;
}

/** The row with groups. Pinned sections never sit in a group. */
export const sectionLayout = (input: SectionLayoutInput): SectionLayout => {
  const { paths, state, groups, activePath } = input;
  const ordered = orderSections(
    paths.map((path) => ({ path })),
    state
  ).map((item) => item.path);
  const shown = visibleSections(
    ordered.map((path) => ({ path })),
    state,
    activePath
  ).map((item) => item.path);
  const pinned = ordered.filter((path) => state.pinned.includes(path));
  const hasGroups = groups.some((group) =>
    group.members.some((member) => paths.includes(member))
  );
  const segments = layoutStrip({
    visible: shown,
    order: ordered,
    pinned,
    groups,
  });
  const all = flattenSegments(
    layoutStrip({ visible: ordered, order: ordered, pinned, groups })
  );
  return { ordered, shown, pinned, segments, all, hasGroups };
};

export interface SectionMoveOutcome {
  state: SectionTabsState;
  groups: TabGroup[];
  moved: boolean;
  /** Refused because it would cross the pinned edge. */
  blocked: boolean;
  /** 1-based place among the shown sections after the move. */
  position: number;
  total: number;
}

const shownCount = (
  paths: readonly string[],
  state: SectionTabsState,
  activePath: string | undefined,
  tabId: string
): { position: number; total: number } => {
  const shown = visibleSections(
    orderSections(
      paths.map((path) => ({ path })),
      state
    ),
    state,
    activePath
  );
  return {
    position: shown.findIndex((item) => item.path === tabId) + 1,
    total: shown.length,
  };
};

/**
 * Moves one section a step or to the edge of its region. Without groups this
 * is the plain move of the section model. With groups the planner of the wide
 * strip is used: a move stays inside a group, leaves it past its last member
 * and steps over a whole group.
 */
export const moveSectionTab = (
  input: SectionLayoutInput & { tabId: string; kind: SectionMove }
): SectionMoveOutcome => {
  const { paths, state, groups, activePath, tabId, kind } = input;
  const layout = sectionLayout(input);
  const plain = moveSection(paths, state, tabId, kind);
  if (!layout.hasGroups) {
    return {
      state: plain.state,
      groups: [...groups],
      moved: plain.moved,
      blocked: plain.blocked,
      ...shownCount(paths, plain.state, activePath, tabId),
    };
  }
  const context = { groups, pinned: layout.pinned };
  const change =
    kind === "earlier" || kind === "later"
      ? planKeyboardMove(layout.segments, context, tabId, kind === "later")
      : planEdgeMove(layout.segments, context, tabId, kind);
  if (!change) {
    return {
      state,
      groups: [...groups],
      moved: false,
      blocked: plain.blocked,
      ...shownCount(paths, state, activePath, tabId),
    };
  }
  const result = applyChange({
    fullOrder: layout.all,
    visibleBefore: flattenSegments(layout.segments),
    change,
  });
  return {
    state: {
      ...state,
      order: result.order,
      pinned: result.pinned ?? state.pinned,
    },
    groups: result.groups ?? [...groups],
    moved: true,
    blocked: false,
    position: change.visible.indexOf(tabId) + 1,
    total: change.visible.length,
  };
};

/** Which of the four moves would change something for a section. */
export const sectionMovesAvailable = (
  input: SectionLayoutInput & { tabId: string }
): Record<TabMoveKind, boolean> => {
  const can = (kind: SectionMove) => moveSectionTab({ ...input, kind }).moved;
  return {
    earlier: can("earlier"),
    later: can("later"),
    start: can("start"),
    end: can("end"),
  };
};

/**
 * A drag of one section beside another. Beside a section of a group it joins
 * that group; out of a group beside a loose section it leaves. Refused across
 * the pinned edge.
 */
export const dropSectionTab = (
  input: SectionLayoutInput & { from: string; to: string; after: boolean }
): SectionMoveOutcome => {
  const { paths, state, groups, activePath, from, to, after } = input;
  const layout = sectionLayout(input);
  if (!layout.hasGroups) {
    const result = dropSection(paths, state, from, to, after);
    return {
      state: result.state,
      groups: [...groups],
      moved: result.moved,
      blocked: result.blocked,
      ...shownCount(paths, result.state, activePath, from),
    };
  }
  const crossesPin = state.pinned.includes(from) !== state.pinned.includes(to);
  const change = crossesPin
    ? undefined
    : moveTabNear(
        layout.segments,
        { groups, pinned: layout.pinned },
        from,
        to,
        after
      );
  if (!change) {
    return {
      state,
      groups: [...groups],
      moved: false,
      blocked: crossesPin,
      ...shownCount(paths, state, activePath, from),
    };
  }
  const result = applyChange({
    fullOrder: layout.all,
    visibleBefore: flattenSegments(layout.segments),
    change,
  });
  return {
    state: {
      ...state,
      order: result.order,
      pinned: result.pinned ?? state.pinned,
    },
    groups: result.groups ?? [...groups],
    moved: true,
    blocked: false,
    position: change.visible.indexOf(from) + 1,
    total: change.visible.length,
  };
};

/** The saved order after moving a whole group, or undefined when it cannot. */
export const moveSectionGroup = (
  input: SectionLayoutInput & {
    groupId: string;
    move: GroupMove;
    rtl?: boolean;
  }
): SectionTabsState | undefined => {
  const layout = sectionLayout(input);
  const order = planGroupMove(
    layout.segments,
    input.groupId,
    input.move,
    input.rtl
  );
  if (!order) {
    return undefined;
  }
  return {
    ...input.state,
    order: mergeVisible(layout.all, flattenSegments(layout.segments), order),
  };
};

// ---- Hiding many sections ----

export interface SectionPlanInput extends SectionLayoutInput {
  /** The visible label of every section. */
  labels: Readonly<Record<string, string>>;
  locks: Pick<LockStore, "locked">;
  surface: string;
}

/** The sections as the close plans want them, in layout order. */
export const sectionPlanTabs = (input: SectionPlanInput): PlanTab[] => {
  const layout = sectionLayout(input);
  return layout.all.map((id) => ({
    id,
    label: input.labels[id] ?? id,
    open: layout.shown.includes(id),
    current: id === input.activePath,
    pinned: layout.pinned.includes(id),
    locked: tabLockState(input.locks, input.surface, id, input.groups).locked,
  }));
};

/**
 * What hiding would do: containing or not containing a text, every other
 * section, or the sections before or after one. The open section, pinned and
 * locked sections are never hidden. An empty text or a pattern that cannot be
 * used hides nothing.
 */
export const planSectionHide = (
  input: SectionPlanInput,
  kind: ClosePlanKind,
  query: string,
  targetId?: string
): ClosePlan => {
  const tabs = sectionPlanTabs(input);
  return kind === "containing" || kind === "not_containing"
    ? planTextClose(tabs, query, kind)
    : planEdgeClose(tabs, targetId ?? "", kind);
};

/**
 * What hiding the sections of one group would do. The open section, pinned
 * and locked sections of the group stay, with the reason.
 */
export const planSectionGroupHide = (
  input: SectionPlanInput,
  groupId: string
): ClosePlan => {
  const members = new Set(
    input.groups.find((group) => group.id === groupId)?.members ?? []
  );
  const ids: string[] = [];
  const kept: ClosePlan["protected"] = [];
  sectionPlanTabs(input)
    .filter((tab) => members.has(tab.id) && tab.open)
    .forEach((tab) => {
      const reasons: ClosePlan["protected"][number]["reasons"] = [];
      if (tab.current) {
        reasons.push("current");
      }
      if (tab.pinned) {
        reasons.push("pinned");
      }
      if (tab.locked) {
        reasons.push("locked");
      }
      if (reasons.length) {
        kept.push({ id: tab.id, reasons });
      } else {
        ids.push(tab.id);
      }
    });
  return { kind: "others", ids, protected: kept };
};

/** Hides sections; the open one is never hidden. */
export const hideSections = (
  state: SectionTabsState,
  ids: readonly string[],
  activePath: string | undefined
): { state: SectionTabsState; hidden: string[] } => {
  const hidden = [
    ...new Set(
      ids.filter((id) => id !== activePath && !state.hidden.includes(id))
    ),
  ];
  return hidden.length
    ? { state: { ...state, hidden: [...state.hidden, ...hidden] }, hidden }
    : { state, hidden: [] };
};

/** Brings back sections hidden before, for Undo. */
export const restoreSections = (
  state: SectionTabsState,
  ids: readonly string[]
): SectionTabsState => ({
  ...state,
  hidden: state.hidden.filter((id) => !ids.includes(id)),
});

// ---- The saved lists of one surface, for the shared menu actions ----

/**
 * The lists the shared tab menu actions read and write, taken from one
 * surface's entry of the `sectionTabs` store instead of the wide strip's keys:
 * hidden sections are the closed tabs. `read` and `write` are the surface's own
 * state, so nothing here can reach the wide strip's storage keys.
 */
export const sectionMenuStore = (
  read: () => SectionTabsState,
  write: (next: SectionTabsState) => void
): TabMenuStore => ({
  readClosed: () => [...read().hidden],
  writeClosed: (ids) => write({ ...read(), hidden: cleanIds([...ids]) }),
  readOrder: () => [...read().order],
  writeOrder: (ids) => write({ ...read(), order: cleanIds([...ids]) }),
  readPinned: () => [...read().pinned],
  writePinned: (ids) => write({ ...read(), pinned: cleanIds([...ids]) }),
});

// ---- The state the shared menu entries are made from ----

export interface SectionSnapshot extends SectionLayoutInput {
  surface: string;
  /** The visible label of every section, before a custom look. */
  labels: Readonly<Record<string, string>>;
  locks: Pick<LockStore, "locked">;
  appearance: TabAppearanceStore;
}

/**
 * The same shape the wide strip's menu reads, filled from one surface:
 * "closed" tabs are the hidden sections, so the shared entry list and the
 * close plans apply unchanged.
 */
export const sectionMenuState = (snap: SectionSnapshot): TabMenuState => {
  const layout = sectionLayout(snap);
  const labels: Record<string, string> = {};
  const locks: TabMenuState["locks"] = {};
  const look = snap.appearance[snap.surface] ?? {};
  layout.all.forEach((id) => {
    labels[id] = look[id]?.label || snap.labels[id] || id;
    const state = tabLockState(snap.locks, snap.surface, id, snap.groups);
    locks[id] = {
      locked: state.locked,
      byGroup: state.locked && !state.reasons.includes("tab"),
    };
  });
  const planTabs = sectionPlanTabs({ ...snap, labels });
  return {
    surface: snap.surface,
    ordered: layout.all,
    open: layout.all.filter((id) => layout.shown.includes(id)),
    closed: layout.all.filter((id) => !layout.shown.includes(id)),
    pinned: layout.pinned,
    groups: [...snap.groups],
    labels,
    planTabs,
    appearance: snap.appearance,
    locks,
  };
};
