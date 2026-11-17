import {
  compact,
  L,
  notice,
  selector,
  slider,
  stepper,
  temporal,
  textBox,
  tiles,
  toggle,
} from "../quick-helpers";
import type { DomainEditor, QuickContext, QuickControl } from "../quick-types";
import { NOTIFY_CHIPS } from "./media";

const noFields = () => [];

const note =
  (name: string, tone: "caution" | "info" = "info") =>
  (): QuickControl[] => [
    notice(name, L(`${tone === "caution" ? "caution" : "note"}_${name}`), tone),
  ];

const nameBox = (ctx: QuickContext) =>
  compact([textBox(ctx, "name", L("item_name"))]);

const LOG_LEVELS = ["critical", "fatal", "error", "warning", "info", "debug"];

const levelOptions = (ctx: QuickContext): string[] => {
  const options = ctx.fields.level?.selector?.select?.options;
  return Array.isArray(options) && options.length
    ? options.map((item: any) =>
        typeof item === "string" ? item : String(item.value)
      )
    : LOG_LEVELS;
};

const keepDays = (ctx: QuickContext) =>
  slider(ctx, "keep_days", L("keep_days"), 0, 365, 1, { unit: "d" });

export const SYSTEM_EDITORS: Record<string, DomainEditor> = {
  homeassistant: {
    siblings: ["turn_on", "turn_off", "toggle", "update_entity"],
    cautions: {
      restart: L("caution_restart"),
      stop: L("caution_stop"),
      reload_all: L("caution_reload_all"),
    },
    controls: {
      turn_on: noFields,
      turn_off: noFields,
      toggle: noFields,
      update_entity: noFields,
      restart: noFields,
      stop: noFields,
      check_config: noFields,
      reload_core_config: noFields,
      reload_custom_templates: noFields,
      reload_all: noFields,
      reload_config_entry: noFields,
      save_persistent_states: note("save_persistent_states"),
      set_location: (ctx) =>
        compact([
          stepper(ctx, "latitude", L("latitude"), -90, 90, 0.0001, "°"),
          stepper(ctx, "longitude", L("longitude"), -180, 180, 0.0001, "°"),
          stepper(ctx, "elevation", L("elevation"), -500, 9000, 1, "m"),
          notice("set_location", L("note_set_location")),
        ]),
    },
  },
  persistent_notification: {
    siblings: ["create", "dismiss", "dismiss_all"],
    cautions: { dismiss_all: L("caution_dismiss_all") },
    controls: {
      create: (ctx) =>
        compact([
          textBox(ctx, "title", L("title")),
          textBox(ctx, "message", L("message"), {
            multiline: true,
            showCount: true,
            chips: NOTIFY_CHIPS,
          }),
          textBox(ctx, "notification_id", L("notification_id")),
        ]),
      dismiss: (ctx) =>
        compact([textBox(ctx, "notification_id", L("notification_id"))]),
      dismiss_all: noFields,
    },
  },
  logbook: {
    siblings: ["log"],
    controls: {
      log: (ctx) =>
        compact([
          textBox(ctx, "name", L("item_name")),
          textBox(ctx, "message", L("message"), {
            multiline: true,
            showCount: true,
            chips: NOTIFY_CHIPS,
          }),
          textBox(ctx, "domain", L("domain")),
        ]),
    },
  },
  system_log: {
    siblings: ["write", "clear"],
    cautions: { clear: L("caution_system_log_clear") },
    controls: {
      write: (ctx) =>
        compact([
          textBox(ctx, "message", L("message"), {
            multiline: true,
            showCount: true,
            chips: NOTIFY_CHIPS,
          }),
          tiles(ctx, "level", L("level"), levelOptions(ctx)),
          textBox(ctx, "logger", L("logger")),
        ]),
      clear: noFields,
    },
  },
  recorder: {
    siblings: [
      "purge",
      "purge_entities",
      "disable",
      "enable",
      "get_statistics",
    ],
    cautions: {
      purge: L("caution_purge"),
      purge_entities: L("caution_purge"),
      disable: L("caution_recorder_disable"),
    },
    controls: {
      purge: (ctx) =>
        compact([
          keepDays(ctx),
          toggle(ctx, "repack", L("repack")),
          toggle(ctx, "apply_filter", L("apply_filter")),
        ]),
      purge_entities: (ctx) => compact([keepDays(ctx)]),
      disable: noFields,
      enable: noFields,
      get_statistics: (ctx) =>
        compact([
          temporal(ctx, "start_time", L("start_time"), "datetime"),
          temporal(ctx, "end_time", L("end_time"), "datetime"),
          tiles(ctx, "period", L("period"), [
            "5minute",
            "hour",
            "day",
            "week",
            "month",
          ]),
        ]),
    },
  },
  backup: {
    siblings: ["create", "create_automatic"],
    controls: {
      create: note("backup_create"),
      create_automatic: note("backup_create"),
    },
  },
  shopping_list: {
    siblings: [
      "add_item",
      "remove_item",
      "complete_item",
      "incomplete_item",
      "complete_all",
      "incomplete_all",
      "clear_completed_items",
      "sort",
    ],
    cautions: { clear_completed_items: L("caution_shopping_clear") },
    controls: {
      add_item: nameBox,
      remove_item: nameBox,
      complete_item: nameBox,
      incomplete_item: nameBox,
      complete_all: noFields,
      incomplete_all: noFields,
      clear_completed_items: noFields,
      sort: (ctx) => compact([toggle(ctx, "reverse", L("reverse"))]),
    },
  },
  frontend: {
    siblings: ["set_theme", "reload_themes"],
    controls: {
      set_theme: (ctx) =>
        compact([
          selector(ctx, "name", L("theme"), { theme: {} }, "other"),
          selector(ctx, "name_dark", L("theme_dark"), { theme: {} }, "other"),
        ]),
      reload_themes: noFields,
    },
  },
};
