import { hasTemplate } from "../../../common/string/has-template";
import {
  attrList,
  choice,
  claim,
  compact,
  dictionary,
  duration,
  entityTiles,
  L,
  notice,
  optionField,
  selector,
  slider,
  stepper,
  textBox,
  tiles,
  toggle,
} from "../quick-helpers";
import type {
  DomainEditor,
  QuickContext,
  QuickControl,
  QuickOptionField,
} from "../quick-types";

export const NOTIFY_CHIPS = [
  { id: "time", text: "{{ now().strftime('%H:%M') }}" },
  { id: "date", text: "{{ now().strftime('%Y-%m-%d') }}" },
  { id: "state", text: "{{ states('sensor.example') }}" },
  { id: "trigger_entity", text: "{{ trigger.to_state.name }}" },
];

const messageBox = (
  ctx: QuickContext,
  key: string,
  extra: Partial<Extract<QuickControl, { kind: "text" }>> = {}
) =>
  textBox(ctx, key, L(key), {
    multiline: true,
    showCount: true,
    chips: NOTIFY_CHIPS,
    ...extra,
  });

const mediaSelector = (ctx: QuickContext, key: string) =>
  selector(ctx, key, L(key), { media: {} }, "media");

const preannounce = (ctx: QuickContext): QuickControl[] =>
  compact([
    toggle(ctx, "preannounce", L("preannounce")),
    ctx.data.preannounce === true || ctx.data.preannounce_media_id !== undefined
      ? mediaSelector(ctx, "preannounce_media_id")
      : undefined,
  ]);

const engineFor = (ctx: QuickContext) =>
  ctx.entities.length ? ctx.engines?.[ctx.entities[0].entity_id] : undefined;

const ttsControls =
  (speakerKey: string | undefined) =>
  (ctx: QuickContext): QuickControl[] => {
    const engine = engineFor(ctx);
    const engineId = ctx.entities[0]?.entity_id;
    const languages = engine?.languages ?? [];
    const language = ctx.data.language;
    const known: QuickOptionField[] = [
      ...(engine?.options ?? []).map((name) =>
        optionField(name, name === "voice" ? "voice" : "text")
      ),
      ...(engine?.commonOptions ?? [])
        .filter((name) => !(engine?.options ?? []).includes(name))
        .map((name) => optionField(name, "text")),
    ];
    const options = dictionary(ctx, "options");
    // The speak service's object selector resolves typed options across targets.
    // Legacy say services still use the quick editor for provider-specific data.
    const optionsControl: QuickControl | undefined =
      ctx.action !== "tts.speak" && claim(ctx, "options") && options !== null
        ? {
            kind: "options",
            key: "options",
            labelKey: L("options"),
            fields: known,
            value: options,
            context: {
              language: typeof language === "string" ? language : undefined,
              engineId,
            },
          }
        : undefined;
    return compact([
      speakerKey
        ? entityTiles(ctx, speakerKey, L("speakers"), "media_player", true)
        : undefined,
      messageBox(ctx, "message"),
      languages.length
        ? selector(
            ctx,
            "language",
            L("language"),
            { language: { languages, native_name: true } },
            "language"
          )
        : textBox(ctx, "language", L("language")),
      optionsControl,
      toggle(ctx, "cache", L("cache")),
      speakerKey && claim(ctx, "message")
        ? {
            kind: "run",
            key: "$run",
            labelKey: L("play_test"),
            noteKey: L("play_test_note"),
          }
        : undefined,
    ]);
  };

const mediaTransport = [
  "media_play_pause",
  "media_play",
  "media_pause",
  "media_stop",
  "media_previous_track",
  "media_next_track",
];

const noFields = () => [];

const aiTaskControls = (ctx: QuickContext): QuickControl[] =>
  compact([
    textBox(ctx, "task_name", L("task_name")),
    textBox(ctx, "instructions", L("instructions"), {
      multiline: true,
      showCount: true,
    }),
    mediaSelector(ctx, "attachments"),
  ]);

const COMMAND_CHIPS = [
  "power",
  "volume_up",
  "volume_down",
  "mute",
  "channel_up",
  "channel_down",
  "home",
  "back",
  "ok",
  "up",
  "down",
  "left",
  "right",
  "menu",
  "play",
  "pause",
].map((name) => ({ id: `command_${name}`, text: name, replace: true }));

const commandBox = (ctx: QuickContext): QuickControl | undefined => {
  const value = ctx.data.command;
  if (Array.isArray(value) || hasTemplate(value)) return undefined;
  return textBox(ctx, "command", L("command"), { chips: COMMAND_CHIPS });
};

export const MEDIA_EDITORS: Record<string, DomainEditor> = {
  media_player: {
    siblings: [...mediaTransport, "turn_on", "turn_off", "toggle"],
    controls: {
      turn_on: noFields,
      turn_off: noFields,
      toggle: noFields,
      volume_up: noFields,
      volume_down: noFields,
      media_play_pause: noFields,
      media_play: noFields,
      media_pause: noFields,
      media_stop: noFields,
      media_next_track: noFields,
      media_previous_track: noFields,
      clear_playlist: noFields,
      volume_set: (ctx) =>
        compact([
          slider(ctx, "volume_level", L("volume_level"), 0, 1, 0.01, {
            scale: 100,
            unit: "%",
          }),
        ]),
      volume_mute: (ctx) =>
        compact([toggle(ctx, "is_volume_muted", L("is_volume_muted"))]),
      select_source: (ctx) =>
        compact([
          choice(ctx, "source", L("source"), attrList(ctx, "source_list")),
        ]),
      select_sound_mode: (ctx) =>
        compact([
          choice(
            ctx,
            "sound_mode",
            L("sound_mode"),
            attrList(ctx, "sound_mode_list")
          ),
        ]),
      media_seek: (ctx) => {
        const length = Math.max(
          0,
          ...ctx.entities.map((e) => Number(e.attributes.media_duration) || 0)
        );
        return compact([
          stepper(
            ctx,
            "seek_position",
            L("seek_position"),
            0,
            length || 86400,
            1,
            "s"
          ),
        ]);
      },
      shuffle_set: (ctx) => compact([toggle(ctx, "shuffle", L("shuffle"))]),
      repeat_set: (ctx) =>
        compact([tiles(ctx, "repeat", L("repeat"), ["off", "all", "one"])]),
      play_media: (ctx) =>
        compact([
          tiles(ctx, "enqueue", L("enqueue"), [
            "play",
            "next",
            "add",
            "replace",
          ]),
          toggle(ctx, "announce", L("announce")),
        ]),
      // Plain text fields keep their text selectors, which also own legacy
      // media values and templates.
      browse_media: noFields,
      search_media: noFields,
      join: (ctx) =>
        compact([
          entityTiles(
            ctx,
            "group_members",
            L("group_members"),
            "media_player",
            true
          ),
        ]),
      unjoin: noFields,
    },
  },
  camera: {
    siblings: ["turn_on", "turn_off", "snapshot", "record", "play_stream"],
    controls: {
      turn_on: noFields,
      turn_off: noFields,
      enable_motion_detection: noFields,
      disable_motion_detection: noFields,
      snapshot: (ctx) =>
        compact([
          textBox(ctx, "filename", L("filename")),
          claim(ctx, "filename")
            ? notice("snapshot_where", L("note_snapshot_where"))
            : undefined,
        ]),
      record: (ctx) =>
        compact([
          textBox(ctx, "filename", L("filename")),
          duration(ctx, "duration", L("duration"), "seconds"),
          duration(ctx, "lookback", L("lookback"), "seconds"),
          claim(ctx, "filename")
            ? notice("record_where", L("note_snapshot_where"))
            : undefined,
        ]),
      play_stream: (ctx) =>
        compact([
          entityTiles(ctx, "media_player", L("player"), "media_player", true),
          tiles(ctx, "format", L("format"), ["hls"]),
        ]),
    },
  },
  image: {
    controls: {
      snapshot: (ctx) =>
        compact([
          textBox(ctx, "filename", L("filename")),
          claim(ctx, "filename")
            ? notice("snapshot_where", L("note_snapshot_where"))
            : undefined,
        ]),
    },
  },
  image_processing: { siblings: ["scan"], controls: { scan: noFields } },
  remote: {
    siblings: [
      "turn_on",
      "turn_off",
      "toggle",
      "send_command",
      "learn_command",
      "delete_command",
    ],
    cautions: { delete_command: L("caution_delete_command") },
    controls: {
      turn_on: (ctx) =>
        compact([
          choice(
            ctx,
            "activity",
            L("activity"),
            attrList(ctx, "activity_list")
          ),
        ]),
      turn_off: noFields,
      toggle: noFields,
      send_command: (ctx) =>
        compact([
          textBox(ctx, "device", L("device")),
          commandBox(ctx),
          stepper(ctx, "num_repeats", L("num_repeats"), 1, 100, 1),
          duration(ctx, "delay_secs", L("delay_secs"), "seconds"),
          duration(ctx, "hold_secs", L("hold_secs"), "seconds"),
        ]),
      learn_command: (ctx) =>
        compact([
          textBox(ctx, "device", L("device")),
          commandBox(ctx),
          tiles(ctx, "command_type", L("command_type"), ["ir", "rf"]),
          toggle(ctx, "alternative", L("alternative")),
          duration(ctx, "timeout", L("timeout"), "seconds"),
        ]),
      delete_command: (ctx) =>
        compact([textBox(ctx, "device", L("device")), commandBox(ctx)]),
    },
  },
  tts: {
    siblings: ["speak", "say", "clear_cache"],
    cautions: { clear_cache: L("caution_clear_cache") },
    controls: {
      clear_cache: noFields,
      speak: ttsControls("media_player_entity_id"),
      say: ttsControls(undefined),
    },
  },
  assist_satellite: {
    siblings: ["announce", "start_conversation", "ask_question"],
    controls: {
      announce: (ctx) =>
        compact([
          messageBox(ctx, "message"),
          mediaSelector(ctx, "media_id"),
          ...preannounce(ctx),
        ]),
      start_conversation: (ctx) =>
        compact([
          messageBox(ctx, "start_message"),
          mediaSelector(ctx, "start_media_id"),
          textBox(ctx, "extra_system_prompt", L("extra_system_prompt"), {
            multiline: true,
            showCount: true,
          }),
          ...preannounce(ctx),
        ]),
      ask_question: (ctx) =>
        compact([
          messageBox(ctx, "question"),
          mediaSelector(ctx, "question_media_id"),
          ...preannounce(ctx),
        ]),
    },
  },
  conversation: {
    siblings: ["process", "reload"],
    controls: {
      process: (ctx) =>
        compact([
          messageBox(ctx, "text"),
          selector(
            ctx,
            "language",
            L("language"),
            { language: { native_name: true } },
            "language"
          ),
          selector(
            ctx,
            "agent_id",
            L("agent_id"),
            { conversation_agent: {} },
            "agent"
          ),
          textBox(ctx, "conversation_id", L("conversation_id")),
        ]),
      reload: (ctx) =>
        compact([
          selector(
            ctx,
            "language",
            L("language"),
            { language: { native_name: true } },
            "language"
          ),
          selector(
            ctx,
            "agent_id",
            L("agent_id"),
            { conversation_agent: {} },
            "agent"
          ),
        ]),
    },
  },
  notify: {
    controls: {
      "*": (ctx) =>
        compact([
          textBox(ctx, "title", L("title")),
          messageBox(ctx, "message"),
        ]),
    },
  },
  ai_task: {
    siblings: ["generate_data", "generate_image", "evaluate", "clear_images"],
    controls: {
      generate_data: (ctx) => aiTaskControls(ctx),
      generate_image: (ctx) => aiTaskControls(ctx),
      evaluate: (ctx) => aiTaskControls(ctx),
      clear_images: (ctx) =>
        compact([slider(ctx, "days", L("days"), 1, 365, 1)]),
    },
  },
};
