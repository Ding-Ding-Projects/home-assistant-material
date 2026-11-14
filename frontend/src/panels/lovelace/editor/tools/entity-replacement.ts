import type { LovelaceConfig } from "../../../../data/lovelace/config/types";
import { replaceEntity } from "../dashboard-tools";

/** A read-only replacement review tied to the configuration the user saw. */
export interface EntityReplacementReview {
  baseline: string;
  from: string;
  to: string;
  count: number;
}

export const reviewEntityReplacement = (
  config: LovelaceConfig,
  from: string,
  to: string
): EntityReplacementReview => ({
  baseline: JSON.stringify(config),
  from,
  to,
  count: from === to ? 0 : replaceEntity(config, from, to).count,
});

/** Refuse a stale local review instead of silently expanding its impact. */
export const applyEntityReplacementReview = (
  config: LovelaceConfig,
  review: EntityReplacementReview
): LovelaceConfig | undefined =>
  JSON.stringify(config) === review.baseline
    ? replaceEntity(config, review.from, review.to).config
    : undefined;
