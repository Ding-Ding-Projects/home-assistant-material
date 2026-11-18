import { compact, L, slider, toggle } from "../../quick-helpers";
import type { DomainEditor, QuickContext } from "../../quick-types";

/**
 * Tailored editors for AC Defender. The entity is the target of the
 * action, so only the hours and the follow-the-sibling choice are drawn here.
 * Labels live under `ac_defender__<field>`.
 */

const lab = (name: string) => L(`ac_defender__${name}`);

const hours = (ctx: QuickContext) =>
  slider(ctx, "hours", lab("hours"), 0.25, 24, 0.25, { unit: "h" });

const sibling = (ctx: QuickContext) =>
  toggle(ctx, "also_sibling", lab("also_sibling"));

export const INTEGRATION_EDITORS_AC_DEFENDER: Record<string, DomainEditor> = {
  ac_defender: {
    siblings: ["pause", "stop_everything", "defend_again"],
    cautions: {},
    controls: {
      pause: (ctx) => compact([hours(ctx), sibling(ctx)]),
      stop_everything: (ctx) => compact([sibling(ctx)]),
      defend_again: (ctx) => compact([sibling(ctx)]),
    },
  },
};
