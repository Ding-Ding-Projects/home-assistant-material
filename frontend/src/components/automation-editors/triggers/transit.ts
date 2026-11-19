import type { AutomationEditorMap } from "../types";
import { choice, entry, L, stepperField, textField } from "../helpers";

/** Tailored editors for the TTC transit triggers. */
export const TRIGGER_EDITORS_TRANSIT: AutomationEditorMap = {
  "ttc.route_delayed": entry(
    "trigger",
    "ttc.route_delayed",
    "home",
    null,
    (ctx) => [textField(ctx, "route", L("ttc__route"))],
    []
  ),
  "ttc.route_resumed": entry(
    "trigger",
    "ttc.route_resumed",
    "home",
    null,
    (ctx) => [textField(ctx, "route", L("ttc__route"))],
    []
  ),
  "ttc.departure_within": entry(
    "trigger",
    "ttc.departure_within",
    "home",
    null,
    (ctx) => [
      textField(ctx, "stop", L("ttc__stop")),
      textField(ctx, "route", L("ttc__route")),
      stepperField(ctx, "minutes", L("ttc__minutes"), 0, 90, 1),
    ],
    []
  ),
  "ttc.time_to_leave": entry(
    "trigger",
    "ttc.time_to_leave",
    "home",
    null,
    (ctx) => [
      textField(ctx, "stop", L("ttc__stop")),
      textField(ctx, "route", L("ttc__route")),
      stepperField(ctx, "walk_minutes", L("ttc__walk_minutes"), 0, 90, 1),
    ],
    []
  ),
  "ttc.lift_changed": entry(
    "trigger",
    "ttc.lift_changed",
    "home",
    null,
    (ctx) => [
      textField(ctx, "station", L("ttc__station")),
      choice(
        ctx,
        "kind",
        L("ttc__lift_kind"),
        ["any", "elevator", "escalator"],
        "ttc__lift_kind__"
      ),
      choice(
        ctx,
        "change",
        L("ttc__change"),
        ["out", "back", "any"],
        "ttc__change__"
      ),
    ],
    []
  ),
  "ttc.new_alert": entry(
    "trigger",
    "ttc.new_alert",
    "home",
    null,
    (ctx) => [
      choice(
        ctx,
        "kind",
        L("ttc__alert_kind"),
        ["any", "route", "elevator", "escalator", "general"],
        "ttc__alert_kind__"
      ),
    ],
    []
  ),
};
