import {
  anyEntity,
  attrList,
  attrNumber,
  choice,
  claim,
  compact,
  duration,
  L,
  notice,
  selector,
  slider,
  stateOf,
  stepper,
  temporal,
  textBox,
  toggle,
} from "../quick-helpers";
import type { DomainEditor, QuickContext, QuickControl } from "../quick-types";

const noFields = () => [];

const numericEntity = (ctx: QuickContext): QuickControl[] => {
  const attrs = stateOf(ctx);
  const min = attrNumber(ctx, "min", Number(attrs.min ?? 0), "min");
  const max = attrNumber(ctx, "max", Number(attrs.max ?? 100), "max");
  const step = attrNumber(ctx, "step", Number(attrs.step ?? 1), "min");
  const unit = attrs.unit_of_measurement;
  return compact([
    // A stepper with a slider below it, bounded by the entity's own limits.
    stepper(ctx, "value", L("value"), min, max, step, unit),
  ]);
};

const selectEntity = (ctx: QuickContext): QuickControl[] =>
  compact([choice(ctx, "option", L("option"), attrList(ctx, "options"))]);

const cycleSwitch = (ctx: QuickContext): QuickControl[] =>
  compact([toggle(ctx, "cycle", L("cycle"))]);

const textEntity = (ctx: QuickContext): QuickControl[] =>
  compact([
    textBox(ctx, "value", L("value"), {
      showCount: true,
      maxLength: attrNumber(ctx, "max", 0, "max") || undefined,
    }),
  ]);

const selectSiblings = [
  "select_option",
  "select_first",
  "select_last",
  "select_next",
  "select_previous",
];

const selectControls = {
  select_option: selectEntity,
  select_first: noFields,
  select_last: noFields,
  select_next: cycleSwitch,
  select_previous: cycleSwitch,
};

export const HELPER_EDITORS: Record<string, DomainEditor> = {
  number: { siblings: ["set_value"], controls: { set_value: numericEntity } },
  input_number: {
    siblings: ["set_value", "increment", "decrement"],
    controls: {
      set_value: numericEntity,
      increment: noFields,
      decrement: noFields,
    },
  },
  select: { siblings: selectSiblings, controls: selectControls },
  input_select: {
    siblings: selectSiblings,
    controls: {
      ...selectControls,
      set_options: (ctx) => [
        ...(claim(ctx, "options")
          ? [notice("set_options", L("note_set_options"))]
          : []),
      ],
    },
  },
  input_datetime: {
    controls: {
      set_datetime: (ctx) => {
        const hasDate = anyEntity(ctx, (e) => e.attributes.has_date !== false);
        const hasTime = anyEntity(ctx, (e) => e.attributes.has_time !== false);
        return compact([
          hasDate && hasTime
            ? temporal(ctx, "datetime", L("datetime"), "datetime")
            : undefined,
          hasDate && !hasTime
            ? temporal(ctx, "date", L("date"), "date")
            : undefined,
          hasTime && !hasDate
            ? temporal(ctx, "time", L("time"), "time")
            : undefined,
        ]);
      },
    },
  },
  date: {
    siblings: ["set_value"],
    controls: {
      set_value: (ctx) => compact([temporal(ctx, "date", L("date"), "date")]),
    },
  },
  time: {
    siblings: ["set_value"],
    controls: {
      set_value: (ctx) => compact([temporal(ctx, "time", L("time"), "time")]),
    },
  },
  datetime: {
    siblings: ["set_value"],
    controls: {
      set_value: (ctx) =>
        compact([temporal(ctx, "datetime", L("datetime"), "datetime")]),
    },
  },
  input_text: { controls: { set_value: textEntity } },
  text: { controls: { set_value: textEntity } },
  button: { siblings: ["press"], controls: { press: noFields } },
  input_button: { siblings: ["press"], controls: { press: noFields } },
  timer: {
    siblings: ["start", "pause", "cancel", "finish", "change"],
    controls: {
      start: (ctx) =>
        compact([duration(ctx, "duration", L("duration"), "hms")]),
      change: (ctx) =>
        compact([duration(ctx, "duration", L("duration"), "hms")]),
      pause: noFields,
      cancel: noFields,
      finish: noFields,
    },
  },
  counter: {
    siblings: ["increment", "decrement", "reset", "set_value"],
    controls: {
      set_value: (ctx) =>
        compact([stepper(ctx, "value", L("value"), -1000000, 1000000, 1)]),
      increment: noFields,
      decrement: noFields,
      reset: noFields,
    },
  },
  schedule: {
    siblings: ["get_schedule"],
    controls: {
      get_schedule: () => [notice("get_schedule", L("note_get_schedule"))],
    },
  },
  group: {
    siblings: ["set", "remove", "reload"],
    controls: {
      set: (ctx) =>
        compact([
          textBox(ctx, "object_id", L("object_id")),
          textBox(ctx, "name", L("name")),
          selector(ctx, "icon", L("icon"), { icon: {} }, "icon"),
          selector(
            ctx,
            "entities",
            L("entities"),
            { entity: { multiple: true } },
            "entity"
          ),
          selector(
            ctx,
            "add_entities",
            L("add_entities"),
            { entity: { multiple: true } },
            "entity"
          ),
          selector(
            ctx,
            "remove_entities",
            L("remove_entities"),
            { entity: { multiple: true } },
            "entity"
          ),
          toggle(ctx, "all", L("all")),
        ]),
      remove: () => [notice("group_remove", L("note_group_remove"))],
      reload: noFields,
    },
  },
  person: { siblings: ["reload"], controls: { reload: noFields } },
  zone: { siblings: ["reload"], controls: { reload: noFields } },
  device_tracker: {
    siblings: ["see"],
    controls: {
      see: (ctx) =>
        compact([
          textBox(ctx, "dev_id", L("dev_id")),
          textBox(ctx, "host_name", L("host_name")),
          textBox(ctx, "mac", L("mac")),
          textBox(ctx, "location_name", L("location_name")),
          slider(ctx, "gps_accuracy", L("gps_accuracy"), 0, 1000, 1, {
            unit: "m",
          }),
          slider(ctx, "battery", L("battery"), 0, 100, 1, { unit: "%" }),
        ]),
    },
  },
};
