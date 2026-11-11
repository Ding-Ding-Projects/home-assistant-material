import type {
  BulkPreview,
  BulkPreviewItem,
} from "../../../../components/bulk/bulk-selection";
import type { LovelaceResource } from "../../../../data/lovelace/resource";

/**
 * The rules behind bulk delete on the Resources list, kept free of any
 * element so they can be checked on their own.
 */

type BulkLocalize = (
  key: string,
  values?: Record<string, string | number>
) => string;

export interface ResourceAddress {
  /** What the list names: the address itself, or only the host when outside. */
  label: string;
  /** The address points to a host other than this instance. */
  outside: boolean;
}

/** Matches an address that names a host: a scheme and `//`, or just `//`. */
const ABSOLUTE_ADDRESS = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;

/**
 * An address is outside when it names a host and that host is not the one the
 * instance is served from. A relative path, such as `/local/card.js`, is
 * always on this instance. An absolute address that cannot be read is treated
 * as outside, so it is never shown as if it were local.
 */
export const resourceAddress = (
  url: string,
  ownHost?: string
): ResourceAddress => {
  if (!ABSOLUTE_ADDRESS.test(url)) {
    return { label: url, outside: false };
  }
  try {
    const host = new URL(url, "http://placeholder.invalid").host;
    if (ownHost && host.toLowerCase() === ownHost.toLowerCase()) {
      return { label: url, outside: false };
    }
    return { label: host, outside: true };
  } catch (_err) {
    return { label: url, outside: true };
  }
};

export interface ResourceDeletePreviewInput {
  resources: LovelaceResource[];
  selectedIds: string[];
  /** How many selected rows the search or filter hides right now. */
  hiddenCount: number;
  /** The host the instance is served from, to tell outside addresses apart. */
  ownHost?: string;
  /**
   * Dashboards that load each resource, by resource id. Leave it out when the
   * page cannot tell, and the preview says so instead of guessing.
   */
  usage?: Record<string, string[]>;
}

/** What deleting the selected resources will do, shown before it is asked. */
export const buildResourceDeletePreview = (
  input: ResourceDeletePreviewInput,
  localize: BulkLocalize
): BulkPreview => {
  const selected = new Set(input.selectedIds);
  const chosen = input.resources.filter((resource) =>
    selected.has(resource.id)
  );

  const items: BulkPreviewItem[] = chosen.map((resource) => {
    const address = resourceAddress(resource.url, input.ownHost);
    return {
      kind: "change",
      text: localize(
        address.outside
          ? "ui.panel.config.lovelace.resources.bulk_preview_outside"
          : "ui.panel.config.lovelace.resources.bulk_preview_item",
        { address: address.label }
      ),
    };
  });

  if (chosen.length) {
    if (input.usage) {
      const usage = input.usage;
      chosen.forEach((resource) => {
        const dashboards = usage[resource.id] ?? [];
        if (!dashboards.length) {
          return;
        }
        const address = resourceAddress(resource.url, input.ownHost);
        items.push({
          kind: "skip",
          text: localize("ui.panel.config.lovelace.resources.bulk_in_use", {
            address: address.label,
            dashboards: dashboards.join(", "),
          }),
        });
      });
    } else {
      items.push({
        kind: "skip",
        text: localize("ui.panel.config.lovelace.resources.bulk_usage_unknown"),
      });
    }
  }

  if (input.hiddenCount > 0) {
    items.push({
      kind: "same",
      text: localize("ui.bulk.preview_hidden", { count: input.hiddenCount }),
    });
  }

  return {
    title: localize("ui.panel.config.lovelace.resources.bulk_preview_title", {
      count: chosen.length,
    }),
    items,
    changeCount: chosen.length,
    confirmLabel: localize("ui.common.delete"),
    note: localize("ui.panel.config.lovelace.resources.bulk_preview_note"),
  };
};

export interface ResourceDeleteSummary {
  deletedIds: string[];
  /** The resources that could not be deleted. They stay selected. */
  failedIds: string[];
}

/** Sorts the ids of a finished bulk delete by what happened to each. */
export const summarizeResourceDelete = (
  ids: string[],
  results: PromiseSettledResult<unknown>[]
): ResourceDeleteSummary => {
  const summary: ResourceDeleteSummary = { deletedIds: [], failedIds: [] };
  ids.forEach((id, index) => {
    if (results[index]?.status === "fulfilled") {
      summary.deletedIds.push(id);
    } else {
      summary.failedIds.push(id);
    }
  });
  return summary;
};
