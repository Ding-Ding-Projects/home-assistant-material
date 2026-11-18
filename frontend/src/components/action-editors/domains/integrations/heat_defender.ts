import { compact, L, slider, toggle } from "../../quick-helpers";
import type { DomainEditor, QuickContext } from "../../quick-types";

/**
 * Tailored editors for Heat Defender. The entity is the target of the
 * action, so only the hours and the follow-the-sibling choice are drawn here.
 * Labels live under `heat_defender__<field>`.
 */

const lab = (name: string) => L(`heat_defender__${name}`);

const hours = (ctx: QuickContext) =>
  slider(ctx, "hours", lab("hours"), 0.25, 24, 0.25, { unit: "h" });

const sibling = (ctx: QuickContext) =>
  toggle(ctx, "also_sibling", lab("also_sibling"));

export const INTEGRATION_EDITORS_HEAT_DEFENDER: Record<string, DomainEditor> = {
  heat_defender: {
    siblings: ["pause", "stop_everything", "defend_again", "let_it_heat"],
    cautions: {},
    controls: {
      pause: (ctx) => compact([hours(ctx), sibling(ctx)]),
      stop_everything: (ctx) => compact([sibling(ctx)]),
      defend_again: (ctx) => compact([sibling(ctx)]),
      let_it_heat: (ctx) => compact([hours(ctx), sibling(ctx)]),
    },
  },
};
