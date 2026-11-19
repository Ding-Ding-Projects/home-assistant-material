import type { AutomationEditorMap } from "../types";
import { entry, L, textField } from "../helpers";

/** Tailored editors for the TTC transit conditions. */
export const CONDITION_EDITORS_TRANSIT: AutomationEditorMap = {
  "ttc.route_has_problem": entry(
    "condition",
    "ttc.route_has_problem",
    "home",
    null,
    (ctx) => [textField(ctx, "route", L("ttc__route"))],
    []
  ),
  "ttc.station_is_step_free": entry(
    "condition",
    "ttc.station_is_step_free",
    "home",
    null,
    (ctx) => [textField(ctx, "station", L("ttc__station"))],
    []
  ),
};
