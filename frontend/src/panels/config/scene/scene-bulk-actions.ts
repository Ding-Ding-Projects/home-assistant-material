import type {
  BulkPreview,
  BulkPreviewItem,
} from "../../../components/bulk/bulk-selection";
import { hiddenSelectedCount } from "../../../components/bulk/bulk-selection";

/** What the bulk actions need to know about one scene. */
export interface BulkScene {
  entityId: string;
  name: string;
  /** False for a scene defined in YAML, which cannot be deleted here. */
  editable: boolean;
  /** True when the scene has no state to apply, for example it is unavailable. */
  unavailable?: boolean;
}

export type SceneBulkActionId = "apply" | "delete";

export type SkipReason = "yaml" | "unavailable" | "not_found";

export interface SkippedScene {
  entityId: string;
  name: string;
  reason: SkipReason;
}

export interface BulkPlan {
  /** The scenes the action will really touch, in selection order. */
  actionable: BulkScene[];
  /** The selected scenes the action leaves alone, each with its reason. */
  skipped: SkippedScene[];
}

export type BulkLocalize = (
  key: string,
  values?: Record<string, string | number>
) => string;

const PREFIX = "ui.panel.config.scene.picker.bulk";

/**
 * Sorts a selection into the scenes an action can handle and the ones it must
 * skip. Nothing is dropped without being listed: a selected scene that no
 * longer exists is reported as not found.
 */
export const planSceneBulkAction = (
  action: SceneBulkActionId,
  scenes: BulkScene[],
  selected: string[]
): BulkPlan => {
  const byId = new Map(scenes.map((scene) => [scene.entityId, scene]));
  const plan: BulkPlan = { actionable: [], skipped: [] };
  for (const entityId of selected) {
    const scene = byId.get(entityId);
    if (!scene) {
      plan.skipped.push({ entityId, name: entityId, reason: "not_found" });
    } else if (action === "delete" && !scene.editable) {
      plan.skipped.push({ entityId, name: scene.name, reason: "yaml" });
    } else if (action === "apply" && scene.unavailable) {
      plan.skipped.push({ entityId, name: scene.name, reason: "unavailable" });
    } else {
      plan.actionable.push(scene);
    }
  }
  return plan;
};

/** How many selected scenes the search or filters hide right now. */
export const hiddenSceneSelection = (
  visibleIds: string[],
  selected: string[]
): number => hiddenSelectedCount(visibleIds, selected);

/**
 * The preview the bulk bar shows before an action runs: one line for every
 * selected scene, those that will change and those that are skipped with the
 * reason. Applying says that real devices change.
 */
export const buildSceneBulkPreview = (
  action: SceneBulkActionId,
  scenes: BulkScene[],
  selected: string[],
  localize: BulkLocalize
): BulkPreview => {
  const plan = planSceneBulkAction(action, scenes, selected);
  const items: BulkPreviewItem[] = [
    ...plan.actionable.map((scene): BulkPreviewItem => ({
      kind: "change",
      text: localize(`${PREFIX}.preview_${action}_item`, {
        name: scene.name,
      }),
    })),
    ...plan.skipped.map((skipped): BulkPreviewItem => ({
      kind: "skip",
      text: localize(`${PREFIX}.skip_${skipped.reason}`, {
        name: skipped.name,
      }),
    })),
  ];
  const count = plan.actionable.length;
  return {
    title: localize(`${PREFIX}.preview_${action}_title`, { count }),
    items,
    changeCount: count,
    confirmLabel: localize(`${PREFIX}.confirm_${action}`, { count }),
    note: localize(`${PREFIX}.note_${action}`),
  };
};

export interface SceneFailure {
  entityId: string;
  name: string;
  message: string;
}

export interface BulkOutcome {
  succeeded: string[];
  failed: SceneFailure[];
}

const messageOf = (reason: unknown): string => {
  if (typeof reason === "string") {
    return reason;
  }
  if (reason && typeof reason === "object") {
    const { message, code } = reason as { message?: unknown; code?: unknown };
    if (typeof message === "string" && message) {
      return message;
    }
    if (typeof code === "string" && code) {
      return code;
    }
  }
  return "";
};

/**
 * Pairs the settled results of a bulk call with the scenes they were made for,
 * so every failure is reported by scene name.
 */
export const summarizeBulkResults = (
  scenes: BulkScene[],
  results: PromiseSettledResult<unknown>[]
): BulkOutcome => {
  const outcome: BulkOutcome = { succeeded: [], failed: [] };
  results.forEach((result, index) => {
    const scene = scenes[index];
    if (!scene) {
      return;
    }
    if (result.status === "fulfilled") {
      outcome.succeeded.push(scene.entityId);
    } else {
      outcome.failed.push({
        entityId: scene.entityId,
        name: scene.name,
        message: messageOf(result.reason),
      });
    }
  });
  return outcome;
};

/**
 * The selection after an action: the rows that failed stay selected so they
 * can be tried again, and rows that were left out of the action keep their
 * state. Rows that succeeded are released.
 */
export const selectionAfterBulk = (
  selected: string[],
  outcome: BulkOutcome
): string[] => {
  const done = new Set(outcome.succeeded);
  return selected.filter((entityId) => !done.has(entityId));
};

/** The lines of the failure report, one per scene, in the order they failed. */
export const failureLines = (
  failures: SceneFailure[],
  localize: BulkLocalize
): string[] =>
  failures.map((failure) =>
    failure.message
      ? localize(`${PREFIX}.failed_line`, {
          name: failure.name,
          reason: failure.message,
        })
      : localize(`${PREFIX}.failed_line_unknown`, { name: failure.name })
  );
