import type { Tag } from "../../../data/tag";

/**
 * The rules behind the bulk delete on the Tags table, kept free of any element
 * so they can be checked without a browser.
 */

/** An automation that has a tag trigger, reduced to what the preview needs. */
export interface TagAutomationUsage {
  /** Automation name shown in the warning. */
  name: string;
  /** Every tag id the automation listens for. */
  tagIds: string[];
}

export interface TagDeleteSelection {
  /** Selected tags that still exist and can be deleted, in the table order. */
  deletable: Tag[];
  /** Selected ids that no longer match a tag, for example already deleted. */
  skipped: string[];
}

export interface TagDeleteWarning {
  tag: Tag;
  /** Names of the automations that still trigger on this tag. */
  automations: string[];
}

export interface TagDeletePreview extends TagDeleteSelection {
  /** Deletable tags that an automation still uses. Still deletable. */
  warnings: TagDeleteWarning[];
  /** Selected tags that the search or filter hides right now. */
  hiddenCount: number;
}

export interface TagDeleteOutcome {
  deletedIds: string[];
  /** Ids whose deletion failed. These stay selected. */
  failedIds: string[];
}

/** The tag ids a trigger or a list of triggers listens for. */
const triggerTagIds = (trigger: unknown): string[] => {
  if (!trigger || typeof trigger !== "object") {
    return [];
  }
  const item = trigger as Record<string, unknown>;
  // Older configurations name the kind `platform`, newer ones `trigger`.
  if (item.trigger !== "tag" && item.platform !== "tag") {
    return [];
  }
  const value = item.tag_id;
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((id): id is string => typeof id === "string");
  }
  return [];
};

/** Every tag id the triggers of an automation configuration listen for. */
export const tagIdsInAutomationConfig = (config: unknown): string[] => {
  if (!config || typeof config !== "object") {
    return [];
  }
  const { trigger, triggers } = config as Record<string, unknown>;
  const list = [trigger, triggers].flatMap((entry) =>
    Array.isArray(entry) ? entry : entry ? [entry] : []
  );
  return [...new Set(list.flatMap(triggerTagIds))];
};

/** Which automations use which tag. */
export const tagUsageById = (
  automations: TagAutomationUsage[]
): Record<string, string[]> => {
  const usage: Record<string, string[]> = {};
  for (const automation of automations) {
    for (const tagId of automation.tagIds) {
      usage[tagId] ??= [];
      if (!usage[tagId].includes(automation.name)) {
        usage[tagId].push(automation.name);
      }
    }
  }
  return usage;
};

/** Splits the selection into tags that can be deleted and ids that cannot. */
export const splitTagSelection = (
  tags: Tag[],
  selectedIds: string[]
): TagDeleteSelection => {
  const selected = new Set(selectedIds);
  const deletable = tags.filter((tag) => selected.has(tag.id));
  const known = new Set(deletable.map((tag) => tag.id));
  return {
    deletable,
    skipped: [...new Set(selectedIds)].filter((id) => !known.has(id)),
  };
};

/**
 * What deleting the selected tags will do. A tag that an automation still
 * uses is listed as a warning but is not held back: the person decides.
 */
export const buildTagDeletePreview = (
  tags: Tag[],
  selectedIds: string[],
  usage: Record<string, string[]>,
  hiddenCount: number
): TagDeletePreview => {
  const { deletable, skipped } = splitTagSelection(tags, selectedIds);
  return {
    deletable,
    skipped,
    warnings: deletable
      .filter((tag) => (usage[tag.id]?.length ?? 0) > 0)
      .map((tag) => ({ tag, automations: usage[tag.id] })),
    hiddenCount: Math.max(0, hiddenCount),
  };
};

/**
 * Reads the results of the delete calls, in the order the ids were sent. A
 * failed tag is reported and stays selected; nothing else is touched.
 */
export const summarizeTagDelete = (
  ids: string[],
  results: PromiseSettledResult<unknown>[]
): TagDeleteOutcome => {
  const deletedIds: string[] = [];
  const failedIds: string[] = [];
  ids.forEach((id, index) => {
    if (results[index]?.status === "fulfilled") {
      deletedIds.push(id);
    } else {
      failedIds.push(id);
    }
  });
  return { deletedIds, failedIds };
};

/** A tag's display name, falling back to its id. */
export const tagDisplayName = (tag: Tag): string => tag.name || tag.id;

/** At most `limit` names joined with commas, then an ellipsis. */
export const shortNameList = (names: string[], limit = 3): string => {
  const shown = names.slice(0, limit).join(", ");
  return names.length > limit ? `${shown}…` : shown;
};
