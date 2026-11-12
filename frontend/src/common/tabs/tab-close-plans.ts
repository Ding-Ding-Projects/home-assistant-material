import { regexQuery, searchMatcher } from "../regex/filter";

/**
 * Plans for closing many tabs at once, with a preview.
 *
 * A plan only says what would happen: which tabs close, which are protected
 * and why, and how the text was read. Nothing here closes a tab. The older
 * `planBulkClose` in `bulk-close.ts` stays for callers that already use it;
 * these plans are stricter:
 *
 * - Text is matched against the visible label only. The address is looked at
 *   only when `includeAddress` is set, for the catalog's address search.
 * - The tab in use is never closed. Pinned and locked tabs are protected
 *   unless the person asks for them with `includePinned` or `includeLocked`.
 * - An empty search or a pattern that cannot be used closes nothing.
 */

export interface PlanTab {
  id: string;
  /** The visible label or title. */
  label: string;
  open: boolean;
  /** The tab the person is on. */
  current: boolean;
  pinned?: boolean;
  locked?: boolean;
  /** The address, used only when `includeAddress` is set. */
  address?: string;
}

export type ProtectReason = "current" | "pinned" | "locked";

export interface ProtectedTab {
  id: string;
  reasons: ProtectReason[];
}

export type ClosePlanKind =
  "containing" | "not_containing" | "others" | "to_start" | "to_end";

export interface PlanOptions {
  includePinned?: boolean;
  includeLocked?: boolean;
  includeAddress?: boolean;
}

export interface ClosePlan {
  kind: ClosePlanKind;
  /** Tabs that would close, in strip order. */
  ids: string[];
  /** Tabs the plan would have closed but keeps, with the reasons. */
  protected: ProtectedTab[];
  /**
   * Why nothing can close: no search text, a pattern that cannot be used, or
   * a target tab that is not in the strip.
   */
  blocked?: "empty" | "invalid" | "unknown_tab";
  /** How the text was read, for the preview note; absent for edge plans. */
  matchMode?: "text" | "pattern";
}

const reasonsFor = (tab: PlanTab, options: PlanOptions): ProtectReason[] => {
  const reasons: ProtectReason[] = [];
  if (tab.current) {
    reasons.push("current");
  }
  if (tab.pinned && !options.includePinned) {
    reasons.push("pinned");
  }
  if (tab.locked && !options.includeLocked) {
    reasons.push("locked");
  }
  return reasons;
};

const split = (
  kind: ClosePlanKind,
  candidates: readonly PlanTab[],
  options: PlanOptions
): Pick<ClosePlan, "kind" | "ids" | "protected"> => {
  const ids: string[] = [];
  const kept: ProtectedTab[] = [];
  candidates.forEach((tab) => {
    const reasons = reasonsFor(tab, options);
    if (reasons.length) {
      kept.push({ id: tab.id, reasons });
    } else {
      ids.push(tab.id);
    }
  });
  return { kind, ids, protected: kept };
};

/**
 * "Close tabs containing text" and "Close tabs not containing text".
 * `query` is plain text or a `/pattern/flags` text, as in every search field.
 */
export const planTextClose = (
  tabs: readonly PlanTab[],
  query: string,
  mode: "containing" | "not_containing",
  options: PlanOptions = {}
): ClosePlan => {
  const empty = { kind: mode, ids: [], protected: [] };
  if (!query.trim()) {
    return { ...empty, blocked: "empty" };
  }
  const compiled = regexQuery(query);
  if (compiled?.error) {
    return { ...empty, blocked: "invalid" };
  }
  const matches = searchMatcher(query);
  const wanted = mode === "containing";
  const candidates = tabs.filter(
    (tab) =>
      tab.open &&
      (options.includeAddress
        ? matches(tab.label, tab.address)
        : matches(tab.label)) === wanted
  );
  return {
    ...split(mode, candidates, options),
    matchMode: compiled ? "pattern" : "text",
  };
};

/** The open tabs on one side of a tab, or all others, for the edge plans. */
const edgeCandidates = (
  tabs: readonly PlanTab[],
  targetId: string,
  kind: "others" | "to_start" | "to_end"
): PlanTab[] | undefined => {
  const index = tabs.findIndex((tab) => tab.id === targetId);
  if (index === -1) {
    return undefined;
  }
  return tabs.filter(
    (tab, position) =>
      tab.open &&
      tab.id !== targetId &&
      (kind === "others" ||
        (kind === "to_start" ? position < index : position > index))
  );
};

/**
 * "Close other tabs", "Close tabs to the left" and "Close tabs to the
 * right". `tabs` is in strip order. In a right-to-left strip, pass the
 * kind that matches the screen: `to_start` is always the start of the list.
 */
export const planEdgeClose = (
  tabs: readonly PlanTab[],
  targetId: string,
  kind: "others" | "to_start" | "to_end",
  options: PlanOptions = {}
): ClosePlan => {
  const candidates = edgeCandidates(tabs, targetId, kind);
  if (!candidates) {
    return { kind, ids: [], protected: [], blocked: "unknown_tab" };
  }
  return split(kind, candidates, options);
};

export interface CloseReport {
  /** Tabs of the plan that closed. */
  closed: string[];
  /** Tabs of the plan that are still open, to report one by one. */
  failed: string[];
}

/** Compares a plan with the tabs still open afterwards. */
export const reportClose = (
  plan: Pick<ClosePlan, "ids">,
  openAfter: readonly string[]
): CloseReport => {
  const open = new Set(openAfter);
  return {
    closed: plan.ids.filter((id) => !open.has(id)),
    failed: plan.ids.filter((id) => open.has(id)),
  };
};

/** Whether a tab id in the preview is protected, for marking it in a list. */
export const protectionOf = (
  plan: Pick<ClosePlan, "protected">,
  id: string
): ProtectReason[] =>
  plan.protected.find((item) => item.id === id)?.reasons ?? [];
