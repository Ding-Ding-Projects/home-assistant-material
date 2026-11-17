import type { AutomationEditorMap } from "../types";
import {
  entry,
  L,
  behavior,
  holdFor,
  threshold,
  stateChoice,
} from "../helpers";
import * as T from "../thresholds";

/** Generated from the condition descriptions of the media integrations: one entry per `domain.condition`. */
export const CONDITION_EDITORS_MEDIA: AutomationEditorMap = {
  "assist_satellite.is_idle": entry(
    "condition",
    "assist_satellite.is_idle",
    "media",
    { entity: { domain: "assist_satellite" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "assist_satellite.is_listening": entry(
    "condition",
    "assist_satellite.is_listening",
    "media",
    { entity: { domain: "assist_satellite" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "assist_satellite.is_processing": entry(
    "condition",
    "assist_satellite.is_processing",
    "media",
    { entity: { domain: "assist_satellite" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "assist_satellite.is_responding": entry(
    "condition",
    "assist_satellite.is_responding",
    "media",
    { entity: { domain: "assist_satellite" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "media_player.is_muted": entry(
    "condition",
    "media_player.is_muted",
    "media",
    { entity: { domain: "media_player" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "media_player.is_off": entry(
    "condition",
    "media_player.is_off",
    "media",
    { entity: { domain: "media_player" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "media_player.is_on": entry(
    "condition",
    "media_player.is_on",
    "media",
    { entity: { domain: "media_player" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "media_player.is_not_playing": entry(
    "condition",
    "media_player.is_not_playing",
    "media",
    { entity: { domain: "media_player" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "media_player.is_paused": entry(
    "condition",
    "media_player.is_paused",
    "media",
    { entity: { domain: "media_player" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "media_player.is_playing": entry(
    "condition",
    "media_player.is_playing",
    "media",
    { entity: { domain: "media_player" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "media_player.is_unmuted": entry(
    "condition",
    "media_player.is_unmuted",
    "media",
    { entity: { domain: "media_player" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "media_player.is_current_source": entry(
    "condition",
    "media_player.is_current_source",
    "media",
    { entity: { domain: "media_player" } },
    (ctx) => [
      behavior(ctx),
      stateChoice(ctx, "source", L("media_player__source"), "source"),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "media_player.is_volume": entry(
    "condition",
    "media_player.is_volume",
    "media",
    { entity: { domain: "media_player" } },
    (ctx) => [behavior(ctx), threshold(ctx, T.lightNumberIs), holdFor(ctx)],
    ["for"]
  ),
  "remote.is_off": entry(
    "condition",
    "remote.is_off",
    "media",
    { entity: { domain: "remote" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "remote.is_on": entry(
    "condition",
    "remote.is_on",
    "media",
    { entity: { domain: "remote" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
};
