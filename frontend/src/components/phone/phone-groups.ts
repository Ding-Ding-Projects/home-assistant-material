import type { StripSegment, TabGroup } from "../../common/tabs/tab-groups";
import { layoutStrip } from "../../common/tabs/tab-groups";
import {
  applyChange,
  flattenSegments,
  moveTabNear,
} from "../tabs/tab-strip-moves";
import type { MoveKind } from "./phone-page-actions";

/**
 * The groups of the Pages sheet on a phone, as pure functions on the model of
 * the wide strip (`common/tabs/tab-groups.ts` and `tab-strip-moves.ts`). The
 * sheet lists the pinned pages first, then the groups as sections, then the
 * pages that are in no group. Every move is planned by the same planner the
 * wide strip uses and returns what the wide strip would save, so the strip and
 * the sheet always agree on the order, the pinned list and the groups.
 */

/** What the sheet lists, from the layout of the strip. */
export interface PhoneListing {
  /** The pinned pages, in the order of the pinned list. */
  pinned: string[];
  /** The groups that have a page listed, with those pages. */
  groups: { group: TabGroup; ids: string[] }[];
  /** The pages that are in no group, in strip order. */
  loose: string[];
}

export interface PhoneLayoutInput {
  /** The pages to list: the open ones, or those a search found. */
  visible: readonly string[];
  /** The saved page order. */
  order: readonly string[];
  /** The saved pinned list. */
  pinned: readonly string[];
  groups: readonly TabGroup[];
}

export const phoneSegments = (input: PhoneLayoutInput): StripSegment[] =>
  layoutStrip({
    visible: input.visible,
    order: input.order,
    pinned: input.pinned,
    groups: input.groups,
  });

/** The sheet's sections: pinned, then every group, then the loose pages. */
export const phoneListing = (input: PhoneLayoutInput): PhoneListing => {
  const listing: PhoneListing = { pinned: [], groups: [], loose: [] };
  phoneSegments(input).forEach((segment) => {
    if (segment.kind === "pinned") {
      listing.pinned.push(...segment.ids);
    } else if (segment.kind === "group") {
      listing.groups.push({ group: segment.group, ids: segment.ids });
    } else {
      listing.loose.push(segment.id);
    }
  });
  return listing;
};

/** The group a page is in, unless it is pinned: a pinned page is in none. */
export const groupIdOf = (
  groups: readonly TabGroup[],
  pinned: readonly string[],
  pageId: string
): string | undefined =>
  pinned.includes(pageId)
    ? undefined
    : groups.find((group) => group.members.includes(pageId))?.id;

/** What a move or a drop saves: the same three lists the wide strip saves. */
export interface PhoneChange {
  /** The saved page order, closed pages in their own places. */
  order: string[];
  /** The new pinned list, when the pinned region changed. */
  pinned?: string[];
  /** The new groups, when a group changed. */
  groups?: TabGroup[];
  /** 1-based place among the listed pages after the change. */
  position: number;
  total: number;
}

export interface PhoneChangeInput extends PhoneLayoutInput {
  /** Every page, open or closed, in strip order. */
  all: readonly string[];
}

const fullOrder = (input: PhoneChangeInput): string[] =>
  flattenSegments(
    layoutStrip({
      visible: input.all,
      order: input.order,
      pinned: input.pinned,
      groups: input.groups,
    })
  );

/**
 * Moves one page up, down, to the top or to the bottom of its own section:
 * the pinned pages, one group, or the pages in no group. A move never joins or
 * leaves a group (Move into group and Remove from group do that), and never
 * crosses the pinned edge. `blocked` says the page is already at that edge.
 */
export const planPhoneMove = (
  input: PhoneChangeInput,
  id: string,
  kind: MoveKind
): PhoneChange | { blocked: "at_top" | "at_bottom" } | undefined => {
  const segments = phoneSegments(input);
  const own = segments.find((segment) =>
    segment.kind === "tab" ? segment.id === id : segment.ids.includes(id)
  );
  if (!own) {
    return undefined;
  }
  const region =
    own.kind === "tab"
      ? segments.flatMap((segment) =>
          segment.kind === "tab" ? [segment.id] : []
        )
      : own.ids;
  const at = region.indexOf(id);
  const towardStart = kind === "up" || kind === "top";
  if (towardStart ? at === 0 : at === region.length - 1) {
    return { blocked: towardStart ? "at_top" : "at_bottom" };
  }
  const target =
    kind === "up"
      ? region[at - 1]
      : kind === "down"
        ? region[at + 1]
        : kind === "top"
          ? region[0]
          : region[region.length - 1];
  const change = moveTabNear(
    segments,
    { groups: input.groups, pinned: input.pinned },
    id,
    target,
    !towardStart
  );
  return change ? finish(input, segments, change) : undefined;
};

/**
 * A drop of one page beside another. Beside a page of a group it joins that
 * group, beside a page in no group it leaves its own, and across the pinned
 * edge it is refused (`blocked`).
 */
export const planPhoneDrop = (
  input: PhoneChangeInput,
  from: string,
  to: string,
  after: boolean
): PhoneChange | { blocked: true } | undefined => {
  if (input.pinned.includes(from) !== input.pinned.includes(to)) {
    return { blocked: true };
  }
  const segments = phoneSegments(input);
  const change = moveTabNear(
    segments,
    { groups: input.groups, pinned: input.pinned },
    from,
    to,
    after
  );
  return change ? finish(input, segments, change) : undefined;
};

const finish = (
  input: PhoneChangeInput,
  segments: readonly StripSegment[],
  change: NonNullable<ReturnType<typeof moveTabNear>>
): PhoneChange => {
  const result = applyChange({
    fullOrder: fullOrder(input),
    visibleBefore: flattenSegments(segments),
    change,
  });
  return {
    order: result.order,
    pinned: result.pinned,
    groups: result.groups,
    position: change.visible.indexOf(change.tabId ?? "") + 1,
    total: change.visible.length,
  };
};
