import type { LovelaceConfig } from "../../../../data/lovelace/config/types";
import type { CardPath } from "../dashboard-tools";
import { outline } from "../dashboard-tools";

/**
 * Entity inspector: every entity the dashboard's cards refer to, the cards
 * that use it, and whether it exists and is available right now. It is
 * computed only from the configuration and the entity states.
 */

export type EntityStatus = "ok" | "unavailable" | "missing";

export interface EntityUse {
  path: CardPath;
  type: string;
  label: string;
  viewTitle: string;
}

export interface EntityRow {
  entityId: string;
  status: EntityStatus;
  /** The state text for an entity that exists. */
  state?: string;
  uses: EntityUse[];
}

const STATUS_ORDER: Record<EntityStatus, number> = {
  missing: 0,
  unavailable: 1,
  ok: 2,
};

/** Rows for every entity, broken ones first, then by entity ID. */
export const inspectEntities = (
  config: LovelaceConfig,
  states: Record<string, { state: string } | undefined>
): EntityRow[] => {
  const rows = new Map<string, EntityRow>();
  outline(config).forEach((view) =>
    view.sections.forEach((section) =>
      section.cards.forEach((card) => {
        // A top-level card already lists the entities of the cards inside it.
        if (!card.selectable) {
          return;
        }
        card.entities.forEach((entityId) => {
          let row = rows.get(entityId);
          if (!row) {
            const state = states[entityId];
            row = {
              entityId,
              status: !state
                ? "missing"
                : state.state === "unavailable"
                  ? "unavailable"
                  : "ok",
              state: state?.state,
              uses: [],
            };
            rows.set(entityId, row);
          }
          row.uses.push({
            path: card.path,
            type: card.type,
            label: card.label,
            viewTitle: view.title,
          });
        });
      })
    )
  );
  return [...rows.values()].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      a.entityId.localeCompare(b.entityId)
  );
};
