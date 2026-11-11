import type {
  BulkPreview,
  BulkPreviewItem,
} from "../../../components/bulk/bulk-selection";

/**
 * The rules behind the bulk actions of the blueprints table, kept free of any
 * element so they can be checked on their own.
 *
 * Delete: the backend refuses to delete a blueprint that automations or
 * scripts still use, so those are skipped and the preview says how many users
 * each one has.
 *
 * Re-import: only blueprints that already have a source address qualify, and
 * each one is fetched from its own saved address and from nowhere else.
 */

export type BulkLocalize = (
  key: string,
  values?: Record<string, string | number>
) => string;

export interface BulkBlueprintItem {
  /** The id of the table row, `<domain>/<path>`. */
  fullpath: string;
  type: "automation" | "script";
  path: string;
  /** What the table shows; the file name when the blueprint cannot be read. */
  name: string;
  /** The file exists but could not be loaded. */
  error: boolean;
  /** The address the blueprint was imported from, when it has one. */
  sourceUrl?: string;
  usageAutomations: number;
  usageScripts: number;
}

export type BlueprintSkipReason = "in_use" | "no_source" | "error";

export interface SkippedBlueprint {
  item: BulkBlueprintItem;
  reason: BlueprintSkipReason;
  /** For "in_use": how many automations and scripts use it. */
  users: number;
}

export interface BlueprintBulkPlan {
  /** The blueprints the action will really change. */
  run: BulkBlueprintItem[];
  skipped: SkippedBlueprint[];
}

export const blueprintUsers = (item: BulkBlueprintItem): number =>
  item.usageAutomations + item.usageScripts;

/** Trimmed source address, or undefined when there is none. */
export const blueprintSourceAddress = (
  item: BulkBlueprintItem
): string | undefined => {
  return item.sourceUrl?.trim() || undefined;
};

/** Blueprints still used by automations or scripts are skipped. */
export const planBlueprintDelete = (
  items: BulkBlueprintItem[]
): BlueprintBulkPlan => {
  const plan: BlueprintBulkPlan = { run: [], skipped: [] };
  items.forEach((item) => {
    const users = blueprintUsers(item);
    if (users > 0) {
      plan.skipped.push({ item, reason: "in_use", users });
    } else {
      plan.run.push(item);
    }
  });
  return plan;
};

/**
 * Blueprints that cannot be loaded, or that have no source address, are
 * skipped, each with its reason.
 */
export const planBlueprintReImport = (
  items: BulkBlueprintItem[]
): BlueprintBulkPlan => {
  const plan: BlueprintBulkPlan = { run: [], skipped: [] };
  items.forEach((item) => {
    if (item.error) {
      plan.skipped.push({ item, reason: "error", users: 0 });
    } else if (!blueprintSourceAddress(item)) {
      plan.skipped.push({ item, reason: "no_source", users: 0 });
    } else {
      plan.run.push(item);
    }
  });
  return plan;
};

const NAME_LIMIT = 3;

const namesLine = (items: BulkBlueprintItem[]): string => {
  const names = items.slice(0, NAME_LIMIT).map((item) => item.name);
  return `${names.join(", ")}${items.length > NAME_LIMIT ? "…" : ""}`;
};

const skippedItem = (
  localize: BulkLocalize,
  skipped: SkippedBlueprint
): BulkPreviewItem => {
  const name = skipped.item.name;
  switch (skipped.reason) {
    case "in_use":
      return {
        kind: "skip",
        text: localize("ui.panel.config.blueprint.overview.bulk_skip_in_use", {
          name,
          count: skipped.users,
        }),
      };
    case "no_source":
      return {
        kind: "skip",
        text: localize(
          "ui.panel.config.blueprint.overview.bulk_skip_no_source",
          { name }
        ),
      };
    default:
      return {
        kind: "skip",
        text: localize("ui.panel.config.blueprint.overview.bulk_skip_error", {
          name,
        }),
      };
  }
};

/** What deleting the selected blueprints will do, shown before it is asked. */
export const blueprintDeletePreview = (
  localize: BulkLocalize,
  items: BulkBlueprintItem[],
  hiddenCount = 0
): BulkPreview => {
  const plan = planBlueprintDelete(items);
  const lines: BulkPreviewItem[] = [];
  if (plan.run.length) {
    lines.push({
      kind: "change",
      text: `${localize("ui.panel.config.blueprint.overview.bulk_delete_will", {
        count: plan.run.length,
      })}: ${namesLine(plan.run)}`,
    });
  }
  plan.skipped.forEach((skipped) => lines.push(skippedItem(localize, skipped)));
  if (hiddenCount > 0) {
    lines.push({
      kind: "same",
      text: localize("ui.bulk.preview_hidden", { count: hiddenCount }),
    });
  }
  return {
    title: localize("ui.panel.config.blueprint.overview.bulk_delete_title", {
      count: items.length,
    }),
    items: lines,
    changeCount: plan.run.length,
    confirmLabel: localize("ui.common.delete"),
    note: localize("ui.panel.config.blueprint.overview.bulk_delete_note"),
  };
};

/**
 * What re-importing the selected blueprints will do. Every line names the
 * address the blueprint is fetched from, which is the one it already has.
 */
export const blueprintReImportPreview = (
  localize: BulkLocalize,
  items: BulkBlueprintItem[],
  hiddenCount = 0
): BulkPreview => {
  const plan = planBlueprintReImport(items);
  const lines: BulkPreviewItem[] = plan.run.map((item) => ({
    kind: "change",
    text: localize("ui.panel.config.blueprint.overview.bulk_reimport_will", {
      name: item.name,
      url: blueprintSourceAddress(item)!,
    }),
  }));
  plan.skipped.forEach((skipped) => lines.push(skippedItem(localize, skipped)));
  if (hiddenCount > 0) {
    lines.push({
      kind: "same",
      text: localize("ui.bulk.preview_hidden", { count: hiddenCount }),
    });
  }
  return {
    title: localize("ui.panel.config.blueprint.overview.bulk_reimport_title", {
      count: items.length,
    }),
    items: lines,
    changeCount: plan.run.length,
    confirmLabel: localize(
      "ui.panel.config.blueprint.overview.re_import_confirm_action"
    ),
    note: localize("ui.panel.config.blueprint.overview.bulk_reimport_note"),
  };
};

export interface BlueprintBulkResult {
  succeeded: BulkBlueprintItem[];
  failed: { item: BulkBlueprintItem; message?: string }[];
  skipped: SkippedBlueprint[];
}

/** Pairs each planned blueprint with what became of its request. */
export const summarizeBlueprintResults = (
  plan: BlueprintBulkPlan,
  results: PromiseSettledResult<unknown>[]
): BlueprintBulkResult => {
  const summary: BlueprintBulkResult = {
    succeeded: [],
    failed: [],
    skipped: plan.skipped,
  };
  plan.run.forEach((item, index) => {
    const result = results[index];
    if (result?.status === "fulfilled") {
      summary.succeeded.push(item);
    } else {
      const reason = result?.status === "rejected" ? result.reason : undefined;
      summary.failed.push({
        item,
        message:
          typeof reason?.message === "string" ? reason.message : undefined,
      });
    }
  });
  return summary;
};

/** One line that tells how the action ended. */
export const blueprintResultLine = (
  localize: BulkLocalize,
  summary: BlueprintBulkResult,
  kind: "delete" | "reimport"
): string => {
  const parts = [
    localize(`ui.panel.config.blueprint.overview.bulk_${kind}_done`, {
      count: summary.succeeded.length,
    }),
  ];
  if (summary.skipped.length) {
    parts.push(
      localize("ui.panel.config.blueprint.overview.bulk_result_skipped", {
        count: summary.skipped.length,
      })
    );
  }
  if (summary.failed.length) {
    parts.push(
      localize("ui.panel.config.blueprint.overview.bulk_result_failed", {
        count: summary.failed.length,
      })
    );
  }
  return parts.join(" ");
};

export interface BlueprintReImportDeps {
  importFn: (url: string) => Promise<{ raw_data: string }>;
  saveFn: (
    item: BulkBlueprintItem,
    raw: string,
    url: string
  ) => Promise<unknown>;
}

/**
 * Fetches each planned blueprint from its own saved address, then saves it
 * over the local copy. The only address ever passed to `importFn` is the one
 * the blueprint already holds.
 */
export const reImportBlueprints = (
  plan: BlueprintBulkPlan,
  deps: BlueprintReImportDeps
): Promise<PromiseSettledResult<unknown>[]> =>
  Promise.allSettled(
    plan.run.map(async (item) => {
      const url = blueprintSourceAddress(item)!;
      const imported = await deps.importFn(url);
      await deps.saveFn(item, imported.raw_data, url);
    })
  );
