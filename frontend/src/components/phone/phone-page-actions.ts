import { planBulkClose } from "../../common/tabs/bulk-close";
import type { BulkCloseMode } from "../../common/tabs/bulk-close";
import { isMoveAcrossBlocked, moveTabId } from "../tab-order";

/**
 * Decisions of the Pages sheet on a phone, kept free of the DOM so they can be
 * tested: which actions a page offers, what each one would change, and what a
 * bulk close would close and keep.
 *
 * Locks, groups and the look of a page are part of it: `PhonePage.locked`
 * protects a page from every close, `PhonePage.groupId` keeps a move inside
 * the page's own group, and `pageActions` offers lock, group and appearance
 * entries when the caller turns those features on. The planners that write the
 * order, the pinned list and the groups the way the wide strip does are in
 * `phone-groups.ts`.
 */

/** A page as the sheet sees it, listed in the order the person gave. */
export interface PhonePage {
  id: string;
  title: string;
  /** False while the person has closed it. */
  open: boolean;
  pinned: boolean;
  /** A locked page is never closed in bulk, and never by swiping. */
  locked: boolean;
  /** The group the page is in; a pinned page is never in a group. */
  groupId?: string;
}

export type PageActionId =
  | "pin"
  | "unpin"
  | "lock"
  | "unlock"
  | "move_into_group"
  | "remove_from_group"
  | "edit_appearance"
  | "close"
  | "close_others"
  | "close_above"
  | "close_below"
  | "move_up"
  | "move_down"
  | "move_top"
  | "move_bottom";

export type HeaderActionId =
  | "open_every"
  | "bulk_contain"
  | "bulk_not_contain"
  | "close_others"
  | "add_media";

/** Why an action is not available, or why a page was kept. */
export type ActionReason =
  "pinned" | "locked" | "current" | "nothing_to_close" | "at_top" | "at_bottom";

export interface ActionEntry<T extends string> {
  id: T;
  enabled: boolean;
  /** Set when `enabled` is false. */
  reason?: ActionReason;
  /** True for actions that close pages. */
  destructive?: boolean;
}

export interface KeptPage {
  id: string;
  title: string;
  reason: ActionReason;
}

export interface ClosePlan {
  /** Open pages that would close, in the order shown. */
  ids: string[];
  /** Pages that match but are protected, and why. */
  kept: KeptPage[];
}

export type CloseKind = "close" | "others" | "above" | "below";

const keepReason = (
  page: PhonePage,
  currentId: string | undefined,
  includeCurrent: boolean
): ActionReason | undefined => {
  if (page.pinned) {
    return "pinned";
  }
  if (page.locked) {
    return "locked";
  }
  if (includeCurrent && page.id === currentId) {
    return "current";
  }
  return undefined;
};

/**
 * Which open pages one of the Close actions would close. Pinned and locked
 * pages are never closed by the "others", "above" and "below" actions and are
 * returned in `kept`; the page you are on is kept by those three as well.
 * Closing a single page closes just that page unless it is pinned or locked.
 */
export const planClose = (
  pages: readonly PhonePage[],
  id: string,
  kind: CloseKind,
  currentId?: string
): ClosePlan => {
  const index = pages.findIndex((page) => page.id === id);
  if (index === -1) {
    return { ids: [], kept: [] };
  }
  if (kind === "close") {
    const reason = keepReason(pages[index], currentId, false);
    return reason
      ? {
          ids: [],
          kept: [{ id, title: pages[index].title, reason }],
        }
      : { ids: pages[index].open ? [id] : [], kept: [] };
  }
  const inScope = pages.filter(
    (page, i) =>
      page.open &&
      i !== index &&
      (kind === "others" || (kind === "above" ? i < index : i > index))
  );
  const ids: string[] = [];
  const kept: KeptPage[] = [];
  for (const page of inScope) {
    const reason = keepReason(page, currentId, true);
    if (reason) {
      kept.push({ id: page.id, title: page.title, reason });
    } else {
      ids.push(page.id);
    }
  }
  return { ids, kept };
};

/**
 * The open pages of the same section as `id`, in order: the pinned pages, the
 * pages of one group, or the pages in no group.
 */
const sameGroupOpen = (pages: readonly PhonePage[], id: string) => {
  const page = pages.find((p) => p.id === id);
  return page
    ? pages.filter(
        (p) => p.open && p.pinned === page.pinned && p.groupId === page.groupId
      )
    : [];
};

export type MoveKind = "up" | "down" | "top" | "bottom";

export interface MovePlan {
  /** The new order of every page id, when the move changes anything. */
  order?: string[];
  /** Set when the page is already as far as it can go. */
  blocked?: "at_top" | "at_bottom";
  /** 1-based place among the open pages after the move. */
  position?: number;
  total?: number;
}

/**
 * Moves a page up, down, to the top or to the bottom of its own group.
 * Pinned pages move among pinned pages only and the others among the others,
 * and a page never moves over a page the person has closed.
 */
export const planMove = (
  pages: readonly PhonePage[],
  id: string,
  kind: MoveKind
): MovePlan => {
  const group = sameGroupOpen(pages, id);
  const at = group.findIndex((page) => page.id === id);
  if (at === -1) {
    return {};
  }
  const towardStart = kind === "up" || kind === "top";
  if (towardStart ? at === 0 : at === group.length - 1) {
    return { blocked: towardStart ? "at_top" : "at_bottom" };
  }
  const target =
    kind === "up"
      ? group[at - 1]
      : kind === "down"
        ? group[at + 1]
        : kind === "top"
          ? group[0]
          : group[group.length - 1];
  const ids = pages.map((page) => page.id);
  const order = moveTabId(ids, id, target.id, !towardStart);
  const open = order.filter((pageId) =>
    pages.some((page) => page.id === pageId && page.open)
  );
  return { order, position: open.indexOf(id) + 1, total: open.length };
};

/**
 * Whether the drop mark shows before or after the card under the pointer.
 * A single column compares the vertical position, a grid the horizontal one,
 * which flips in a right-to-left layout.
 */
export const dropAfter = (
  pointer: { x: number; y: number },
  rect: { left: number; top: number; width: number; height: number },
  singleColumn: boolean,
  rtl: boolean
): boolean => {
  if (singleColumn) {
    return pointer.y > rect.top + rect.height / 2;
  }
  const afterInX = pointer.x > rect.left + rect.width / 2;
  return rtl ? !afterInX : afterInX;
};

export interface DropPlan {
  order?: string[];
  /** True when the move would cross between pinned and unpinned pages. */
  blocked?: boolean;
}

/** A drag and drop of one page beside another. */
export const planDrop = (
  pages: readonly PhonePage[],
  from: string,
  to: string,
  after: boolean
): DropPlan => {
  const pinned = pages.filter((page) => page.pinned).map((page) => page.id);
  if (isMoveAcrossBlocked(pinned, from, to)) {
    return { blocked: true };
  }
  const ids = pages.map((page) => page.id);
  const order = moveTabId(ids, from, to, after);
  return order.join("\n") === ids.join("\n") ? {} : { order };
};

/** Which optional groups of entries the per-page sheet offers. */
export interface PageActionFeatures {
  /** Lock page and Unlock page. */
  locks?: boolean;
  /** Move into group and Remove from group. */
  groups?: boolean;
  /** Edit appearance. */
  appearance?: boolean;
}

/** The actions the per-page sheet offers for one page, in display order. */
export const pageActions = (
  pages: readonly PhonePage[],
  id: string,
  currentId?: string,
  features: PageActionFeatures = {}
): ActionEntry<PageActionId>[] => {
  const page = pages.find((p) => p.id === id);
  if (!page) {
    return [];
  }
  const closeReason = keepReason(page, currentId, false);
  const closing = (kind: CloseKind): ActionEntry<PageActionId>["enabled"] =>
    planClose(pages, id, kind, currentId).ids.length > 0;
  const move = (kind: MoveKind) => planMove(pages, id, kind).blocked;
  const entry = (
    actionId: PageActionId,
    enabled: boolean,
    reason?: ActionReason,
    destructive = false
  ): ActionEntry<PageActionId> => ({
    id: actionId,
    enabled,
    reason: enabled ? undefined : reason,
    destructive: destructive || undefined,
  });
  const optional: ActionEntry<PageActionId>[] = [];
  if (features.locks) {
    optional.push(entry(page.locked ? "unlock" : "lock", true));
  }
  if (features.groups) {
    // A pinned page never joins a group; pinning takes a page out of its group.
    optional.push(
      entry("move_into_group", !page.pinned, "pinned"),
      ...(page.groupId ? [entry("remove_from_group", true)] : [])
    );
  }
  if (features.appearance) {
    optional.push(entry("edit_appearance", true));
  }
  return [
    entry(page.pinned ? "unpin" : "pin", true),
    ...optional,
    entry("close", !closeReason, closeReason, true),
    entry("close_others", closing("others"), "nothing_to_close", true),
    entry("close_above", closing("above"), "nothing_to_close", true),
    entry("close_below", closing("below"), "nothing_to_close", true),
    entry("move_up", !move("up"), "at_top"),
    entry("move_down", !move("down"), "at_bottom"),
    entry("move_top", !move("top"), "at_top"),
    entry("move_bottom", !move("bottom"), "at_bottom"),
  ];
};

/**
 * The entries of the sheet's header menu. "Open every page" is only there
 * while a page is closed.
 */
export const headerActions = (
  pages: readonly PhonePage[],
  currentId?: string,
  canAddMedia = false
): ActionEntry<HeaderActionId>[] => {
  const entries: ActionEntry<HeaderActionId>[] = [];
  if (pages.some((page) => !page.open)) {
    entries.push({ id: "open_every", enabled: true });
  }
  const anyOpen = pages.some((page) => page.open);
  const others = pages.filter(
    (page) => page.open && page.id !== currentId && !page.pinned && !page.locked
  ).length;
  const closing = (
    id: HeaderActionId,
    enabled: boolean
  ): ActionEntry<HeaderActionId> => ({
    id,
    enabled,
    reason: enabled ? undefined : "nothing_to_close",
    destructive: true,
  });
  entries.push(
    closing("bulk_contain", anyOpen),
    closing("bulk_not_contain", anyOpen),
    closing("close_others", others > 0)
  );
  // A phone has no drag and drop, so adding media is offered here.
  if (canAddMedia) {
    entries.push({ id: "add_media", enabled: true });
  }
  return entries;
};

export interface BulkPreview extends ClosePlan {
  /** Why nothing can close: no text, or a pattern that cannot be used. */
  blocked?: "empty" | "invalid";
}

/**
 * What "Close pages containing text" and "Close pages not containing text"
 * would do. The text is matched against the visible title only, never the
 * address. An empty text or an unusable pattern closes nothing. Open pages
 * that match but are pinned, locked or the current page are listed in `kept`.
 */
export const planTitleBulkClose = (
  pages: readonly PhonePage[],
  query: string,
  mode: BulkCloseMode,
  currentId?: string
): BulkPreview => {
  const plan = planBulkClose(
    pages.map((page) => ({
      id: page.id,
      texts: [page.title],
      open: page.open,
      current: false,
    })),
    query,
    mode
  );
  if (plan.blocked) {
    return { ids: [], kept: [], blocked: plan.blocked };
  }
  const ids: string[] = [];
  const kept: KeptPage[] = [];
  for (const id of plan.ids) {
    const page = pages.find((p) => p.id === id)!;
    const reason = keepReason(page, currentId, true);
    if (reason) {
      kept.push({ id, title: page.title, reason });
    } else {
      ids.push(id);
    }
  }
  return { ids, kept };
};
