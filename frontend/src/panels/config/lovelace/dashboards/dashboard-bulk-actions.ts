import type {
  BulkPreview,
  BulkPreviewItem,
} from "../../../../components/bulk/bulk-selection";

/**
 * The rules behind the bulk bar on the Dashboards list, kept free of any
 * element so they can be checked on their own: which selected rows an action
 * changes, which it leaves alone and why, the preview that says so, and a
 * runner that carries on when one request fails.
 */

export type DashboardBulkActionId = "show" | "hide" | "delete";

export type DashboardSkipReason = "default" | "built_in" | "not_editable";

/** One row of the list, as far as the bulk actions need to know it. */
export interface BulkDashboardRow {
  url_path: string;
  title: string;
  show_in_sidebar: boolean;
  mode: string;
  type: "built_in" | "user_created";
  /** The dashboard the instance opens first. */
  default: boolean;
  /** The id the dashboard update call needs; built-in pages have none. */
  id?: string;
}

export interface DashboardBulkPlan {
  action: DashboardBulkActionId;
  /** Rows the action really changes. */
  change: BulkDashboardRow[];
  /** Rows that already are the way the action would leave them. */
  same: BulkDashboardRow[];
  /** Rows the action leaves alone, each with the reason. */
  skipped: { row: BulkDashboardRow; reason: DashboardSkipReason }[];
  /** Ticked rows the search or a filter hides; they are never changed. */
  hiddenCount: number;
}

export type BulkLocalize = (
  key: string,
  values?: Record<string, string | number>
) => string;

const PREFIX = "ui.panel.config.lovelace.dashboards.bulk";

/**
 * Why a row cannot be changed at all, or undefined when it can. The default
 * dashboard cannot be hidden or deleted, built-in pages are not dashboards
 * that the dashboard calls know, and a dashboard set up in YAML is read only.
 */
export const dashboardSkipReason = (
  row: BulkDashboardRow
): DashboardSkipReason | undefined => {
  if (row.default) {
    return "default";
  }
  if (row.type === "built_in" || !row.id) {
    return "built_in";
  }
  if (row.mode !== "storage") {
    return "not_editable";
  }
  return undefined;
};

/**
 * Splits the ticked rows for an action. Only rows the list shows are looked
 * at: a ticked row that a search or filter hides is counted in `hiddenCount`
 * and left out of every other group.
 */
export const planDashboardBulkAction = (
  action: DashboardBulkActionId,
  selectedRows: BulkDashboardRow[],
  visibleUrlPaths: ReadonlySet<string> | string[]
): DashboardBulkPlan => {
  const visible =
    visibleUrlPaths instanceof Set ? visibleUrlPaths : new Set(visibleUrlPaths);
  const plan: DashboardBulkPlan = {
    action,
    change: [],
    same: [],
    skipped: [],
    hiddenCount: 0,
  };
  for (const row of selectedRows) {
    if (!visible.has(row.url_path)) {
      plan.hiddenCount += 1;
      continue;
    }
    const reason = dashboardSkipReason(row);
    if (reason) {
      plan.skipped.push({ row, reason });
    } else if (
      (action === "show" && row.show_in_sidebar) ||
      (action === "hide" && !row.show_in_sidebar)
    ) {
      plan.same.push(row);
    } else {
      plan.change.push(row);
    }
  }
  return plan;
};

/** The preview the bar shows before anything runs. */
export const buildDashboardBulkPreview = (
  plan: DashboardBulkPlan,
  localize: BulkLocalize,
  keepsHistory: boolean
): BulkPreview => {
  const items: BulkPreviewItem[] = [];
  const changeKey = {
    show: "will_show",
    hide: "will_hide",
    delete: "will_delete",
  }[plan.action];
  for (const row of plan.change) {
    items.push({
      kind: "change",
      text: localize(`${PREFIX}.${changeKey}`, {
        title: row.title,
        path: row.url_path,
      }),
    });
  }
  for (const row of plan.same) {
    items.push({
      kind: "same",
      text: localize(
        `${PREFIX}.${plan.action === "show" ? "already_shown" : "already_hidden"}`,
        { title: row.title }
      ),
    });
  }
  for (const { row, reason } of plan.skipped) {
    items.push({
      kind: "skip",
      text: localize(`${PREFIX}.skip_${reason}`, { title: row.title }),
    });
  }
  const notes: string[] = [];
  if (plan.action === "delete" && keepsHistory) {
    notes.push(localize(`${PREFIX}.history_kept`));
  }
  if (plan.hiddenCount > 0) {
    notes.push(localize(`${PREFIX}.hidden_left`, { count: plan.hiddenCount }));
  }
  return {
    title: localize(`${PREFIX}.preview_${plan.action}`, {
      count: plan.change.length,
    }),
    items,
    changeCount: plan.change.length,
    confirmLabel: localize(`${PREFIX}.confirm_${plan.action}`, {
      count: plan.change.length,
    }),
    note: notes.length ? notes.join(" ") : undefined,
  };
};

export interface BulkRunResult<T> {
  succeeded: T[];
  failed: { item: T; message: string }[];
}

/**
 * Runs one request for each row and waits for all of them. A request that
 * fails never stops the others; it is listed with its message instead.
 */
export const runBulkRequests = async <T>(
  items: T[],
  run: (item: T) => Promise<unknown>
): Promise<BulkRunResult<T>> => {
  const results = await Promise.allSettled(items.map((item) => run(item)));
  const outcome: BulkRunResult<T> = { succeeded: [], failed: [] };
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      outcome.succeeded.push(items[index]);
      return;
    }
    const reason = result.reason as
      { message?: string; code?: string } | string | undefined;
    outcome.failed.push({
      item: items[index],
      message:
        typeof reason === "string"
          ? reason
          : (reason?.message ?? reason?.code ?? ""),
    });
  });
  return outcome;
};
