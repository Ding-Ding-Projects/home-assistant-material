import type { AutomationEditorMap } from "../types";
import {
  entry,
  L,
  behavior,
  holdFor,
  threshold,
  deviceField,
  entityField,
} from "../helpers";
import * as T from "../thresholds";

/** Generated from the trigger descriptions of the media integrations: one entry per `domain.trigger`. */
export const TRIGGER_EDITORS_MEDIA: AutomationEditorMap = {
  "assist_satellite.idle": entry(
    "trigger",
    "assist_satellite.idle",
    "media",
    { entity: { domain: "assist_satellite" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "assist_satellite.listening": entry(
    "trigger",
    "assist_satellite.listening",
    "media",
    { entity: { domain: "assist_satellite" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "assist_satellite.processing": entry(
    "trigger",
    "assist_satellite.processing",
    "media",
    { entity: { domain: "assist_satellite" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "assist_satellite.responding": entry(
    "trigger",
    "assist_satellite.responding",
    "media",
    { entity: { domain: "assist_satellite" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "media_player.muted": entry(
    "trigger",
    "media_player.muted",
    "media",
    { entity: { domain: "media_player" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "media_player.unmuted": entry(
    "trigger",
    "media_player.unmuted",
    "media",
    { entity: { domain: "media_player" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "media_player.paused_playing": entry(
    "trigger",
    "media_player.paused_playing",
    "media",
    { entity: { domain: "media_player" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "media_player.started_playing": entry(
    "trigger",
    "media_player.started_playing",
    "media",
    { entity: { domain: "media_player" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "media_player.stopped_playing": entry(
    "trigger",
    "media_player.stopped_playing",
    "media",
    { entity: { domain: "media_player" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "media_player.turned_off": entry(
    "trigger",
    "media_player.turned_off",
    "media",
    { entity: { domain: "media_player" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "media_player.turned_on": entry(
    "trigger",
    "media_player.turned_on",
    "media",
    { entity: { domain: "media_player" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "media_player.volume_changed": entry(
    "trigger",
    "media_player.volume_changed",
    "media",
    { entity: { domain: "media_player" } },
    (ctx) => [threshold(ctx, T.lightNumberChanged)],
    []
  ),
  "media_player.volume_crossed_threshold": entry(
    "trigger",
    "media_player.volume_crossed_threshold",
    "media",
    { entity: { domain: "media_player" } },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.lightNumberCrossed),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "remote.turned_off": entry(
    "trigger",
    "remote.turned_off",
    "media",
    { entity: { domain: "remote" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "remote.turned_on": entry(
    "trigger",
    "remote.turned_on",
    "media",
    { entity: { domain: "remote" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "webostv.turn_on": entry(
    "trigger",
    "webostv.turn_on",
    "media",
    null,
    (ctx) => [
      deviceField(ctx, "device_id", L("webostv__device_id"), "webostv"),
      entityField(
        ctx,
        "entity_id",
        L("webostv__entity_id"),
        { domain: "media_player", integration: "webostv" },
        true
      ),
    ],
    ["device_id", "entity_id"]
  ),
};
