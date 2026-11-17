import {
  anyEntity,
  attrList,
  choice,
  claim,
  compact,
  duration,
  hasFeature,
  L,
  notice,
  selector,
  temporal,
  textBox,
  tiles,
  toggle,
} from "../quick-helpers";
import type { DomainEditor, QuickContext, QuickControl } from "../quick-types";
import { NOTIFY_CHIPS } from "./media";

const noFields = () => [];

const codeBox = (ctx: QuickContext): QuickControl[] =>
  compact([textBox(ctx, "code", L("code"), { inputType: "password" })]);

const ALARM_SERVICES = [
  "alarm_arm_home",
  "alarm_arm_away",
  "alarm_arm_night",
  "alarm_arm_vacation",
  "alarm_arm_custom_bypass",
  "alarm_disarm",
  "alarm_trigger",
];

const descriptionBox = (ctx: QuickContext) =>
  textBox(ctx, "description", L("description"), {
    multiline: true,
    showCount: true,
    chips: NOTIFY_CHIPS,
  });

const isAllDay = (data: Record<string, unknown>) =>
  ("start_date" in data || "end_date" in data) &&
  !("start_date_time" in data || "end_date_time" in data);

const eventTimes = (ctx: QuickContext): (QuickControl | undefined)[] => {
  if (ctx.data.in !== undefined) return [];
  const allDay = isAllDay(ctx.data);
  const canSwitch = claim(ctx, "start_date") && claim(ctx, "start_date_time");
  return [
    canSwitch
      ? {
          kind: "switch",
          key: "$all_day",
          labelKey: L("all_day"),
          value: allDay,
        }
      : undefined,
    allDay
      ? temporal(ctx, "start_date", L("start_date"), "date")
      : temporal(ctx, "start_date_time", L("start_date_time"), "datetime"),
    allDay
      ? temporal(ctx, "end_date", L("end_date"), "date")
      : temporal(ctx, "end_date_time", L("end_date_time"), "datetime"),
  ];
};

const todoStatus = (ctx: QuickContext) =>
  tiles(ctx, "status", L("status"), ["needs_action", "completed"]);

const todoDates = (ctx: QuickContext) => [
  temporal(ctx, "due_date", L("due_date"), "date"),
  temporal(ctx, "due_datetime", L("due_datetime"), "datetime"),
];

const FORECAST_TYPES: [string, number][] = [
  ["hourly", 2],
  ["daily", 1],
  ["twice_daily", 4],
];

const featureSet = (ctx: QuickContext) =>
  ctx.entities.length === 0 ||
  ctx.entities.every((e) => e.attributes.supported_features === undefined);

export const HOUSE_EDITORS: Record<string, DomainEditor> = {
  lock: {
    siblings: ["lock", "unlock", "open"],
    cautions: { unlock: L("caution_unlock"), open: L("caution_unlock") },
    controls: { lock: codeBox, unlock: codeBox, open: codeBox },
  },
  alarm_control_panel: {
    siblings: ALARM_SERVICES,
    cautions: { alarm_disarm: L("caution_disarm") },
    controls: Object.fromEntries(
      ALARM_SERVICES.map((service) => [service, codeBox])
    ),
  },
  vacuum: {
    siblings: [
      "start",
      "pause",
      "return_to_base",
      "locate",
      "stop",
      "clean_spot",
      "clean_area",
    ],
    controls: {
      set_fan_speed: (ctx) =>
        compact([
          choice(
            ctx,
            "fan_speed",
            L("fan_speed"),
            attrList(ctx, "fan_speed_list")
          ),
        ]),
      send_command: (ctx) => compact([textBox(ctx, "command", L("command"))]),
      clean_area: (ctx) =>
        compact([
          selector(
            ctx,
            "cleaning_area_id",
            L("cleaning_area_id"),
            { area: { multiple: true } },
            "other"
          ),
        ]),
      start: noFields,
      pause: noFields,
      return_to_base: noFields,
      locate: noFields,
      stop: noFields,
      clean_spot: noFields,
    },
  },
  lawn_mower: {
    siblings: ["start_mowing", "pause", "dock", "stop"],
    gates: { start_mowing: 1, pause: 2, dock: 4 },
    controls: {
      start_mowing: noFields,
      pause: noFields,
      dock: noFields,
      stop: noFields,
    },
  },
  update: {
    siblings: ["install", "skip", "clear_skipped"],
    cautions: { install: L("caution_update_install") },
    controls: {
      install: (ctx) => {
        const latest = ctx.entities
          .map((e) => e.attributes.latest_version)
          .find((v) => typeof v === "string");
        return compact([
          anyEntity(ctx, (e) => hasFeature(e.attributes, 2))
            ? textBox(ctx, "version", L("version"), {
                chips: latest
                  ? [{ id: "latest_version", text: latest, replace: true }]
                  : undefined,
              })
            : undefined,
          anyEntity(ctx, (e) => hasFeature(e.attributes, 8))
            ? toggle(ctx, "backup", L("backup"))
            : undefined,
        ]);
      },
      skip: noFields,
      clear_skipped: noFields,
    },
  },
  weather: {
    siblings: ["get_forecasts"],
    controls: {
      get_forecasts: (ctx) => {
        const types = featureSet(ctx)
          ? FORECAST_TYPES.map(([name]) => name)
          : FORECAST_TYPES.filter(([, bit]) =>
              ctx.entities.some((e) => hasFeature(e.attributes, bit))
            ).map(([name]) => name);
        return compact([
          tiles(
            ctx,
            "type",
            L("forecast_type"),
            types,
            "ui.components.action-editors.forecast."
          ),
        ]);
      },
    },
  },
  calendar: {
    siblings: ["create_event", "get_events"],
    controls: {
      create_event: (ctx) =>
        compact([
          textBox(ctx, "summary", L("summary")),
          ...eventTimes(ctx),
          descriptionBox(ctx),
          textBox(ctx, "location", L("location")),
        ]),
      get_events: (ctx) =>
        compact([
          temporal(ctx, "start_date_time", L("start_date_time"), "datetime"),
          temporal(ctx, "end_date_time", L("end_date_time"), "datetime"),
          duration(ctx, "duration", L("duration"), "seconds"),
        ]),
    },
  },
  todo: {
    siblings: [
      "add_item",
      "update_item",
      "remove_item",
      "get_items",
      "remove_completed_items",
    ],
    cautions: {
      remove_item: L("caution_todo_remove"),
      remove_completed_items: L("caution_todo_remove_completed"),
    },
    controls: {
      add_item: (ctx) =>
        compact([
          textBox(ctx, "item", L("item")),
          ...todoDates(ctx),
          descriptionBox(ctx),
        ]),
      update_item: (ctx) =>
        compact([
          textBox(ctx, "rename", L("rename")),
          todoStatus(ctx),
          ...todoDates(ctx),
          descriptionBox(ctx),
        ]),
      remove_item: noFields,
      get_items: (ctx) => compact([todoStatus(ctx)]),
      remove_completed_items: noFields,
    },
  },
  automation: {
    siblings: ["turn_on", "turn_off", "toggle", "trigger", "reload"],
    controls: {
      turn_on: noFields,
      toggle: noFields,
      turn_off: (ctx) =>
        compact([toggle(ctx, "stop_actions", L("stop_actions"))]),
      trigger: (ctx) =>
        compact([
          toggle(ctx, "skip_condition", L("skip_condition")),
          notice("trigger_note", L("note_automation_trigger")),
        ]),
      reload: noFields,
    },
  },
  // Scripts are actions named `script.<id>`; their declared fields come from
  // the generic builder.
  script: { controls: { "*": noFields } },
};
