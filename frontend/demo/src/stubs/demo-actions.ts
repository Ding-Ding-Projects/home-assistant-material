import { ensureArray } from "../../../src/common/array/ensure-array";
import { encodeWav } from "../../../src/common/converter/audio";
import type { MediaPlayerItem } from "../../../src/data/media-player";
import type { Action, ServiceAction } from "../../../src/data/script";
import type { MockHomeAssistant } from "../../../src/fake_data/provide_hass";
import { showToast } from "../../../src/util/toast";
import {
  demoAutomations,
  selectedDemo,
  selectedDemoConfig,
} from "../configs/demo-configs";

const commonOptions = [
  "preferred_bitrate",
  "preferred_format",
  "preferred_sample_bytes",
  "preferred_sample_channels",
  "preferred_sample_rate",
];

const demoEngines = new Map([
  ["tts.demo_voice", { keys: ["voice", "speed"], language: "en-US" }],
  ["tts.demo_voice_secondary", { keys: ["voice", "pitch"], language: "en-US" }],
]);

export const mockDemoActions = (hass: MockHomeAssistant, host: HTMLElement) => {
  let sampleUrl: string | undefined;
  const sample: MediaPlayerItem = {
    title: "Synthetic sample tone",
    media_content_id: "media-source://demo/sample-tone.wav",
    media_content_type: "audio/wav",
    media_class: "music",
    can_play: true,
    can_expand: false,
    can_search: false,
  };
  const browse = ({ media_content_id }: { media_content_id?: string }) => {
    if (media_content_id === sample.media_content_id) return sample;
    if (media_content_id && media_content_id !== "media-source://demo") {
      throw { code: "not_found", message: "Demo media folder not found." };
    }
    return {
      title: "Demo media samples",
      media_content_id: "media-source://demo",
      media_content_type: "directory",
      media_class: "directory",
      can_play: false,
      can_expand: true,
      can_search: false,
      children: [sample],
    };
  };
  hass.mockWS("media_source/browse_media", browse);
  hass.mockWS("media_player/browse_media", browse);
  hass.mockWS("media_source/resolve_media", ({ media_content_id }) => {
    if (media_content_id !== sample.media_content_id) {
      throw { code: "not_found", message: "Demo media sample not found." };
    }
    if (!sampleUrl) {
      const sampleRate = 8000;
      const samples = Float32Array.from(
        { length: sampleRate },
        (_unused, frame) =>
          Math.sin((2 * Math.PI * 440 * frame) / sampleRate) *
          Math.min(0.18, frame / 800, (sampleRate - frame) / 800)
      );
      const wav = encodeWav([samples], sampleRate);
      sampleUrl = URL.createObjectURL(
        new Blob([wav.slice().buffer], { type: "audio/wav" })
      );
    }
    return {
      url: sampleUrl,
      mime_type: "audio/wav",
    };
  });
  hass.mockService("media_player", "play_media", (data, target, current) => {
    const media = data?.media ?? data;
    if (media?.media_content_id !== sample.media_content_id) {
      throw {
        code: "not_found",
        message: "Choose a bundled demo media sample.",
      };
    }
    const ids = ensureArray(target?.entity_id ?? data?.entity_id) ?? [];
    for (const id of ids) {
      if (id !== "media_player.kitchen_nest_audio") continue;
      current.mockEntities[id]?.update({
        state: "playing",
        attributes: {
          ...current.states[id].attributes,
          media_title: sample.title,
          media_content_id: sample.media_content_id,
          media_content_type: sample.media_content_type,
          media_position: 0,
          media_duration: 1,
        },
      });
    }
    showToast(host, { message: "Simulated playback: Synthetic sample tone." });
  });
  hass.mockService(
    "media_player",
    "media_next_track",
    (data, target, current) => {
      const ids = ensureArray(target?.entity_id ?? data?.entity_id) ?? [];
      for (const id of ids) {
        if (id !== "media_player.kitchen_nest_audio") continue;
        current.mockEntities[id]?.update({
          state: "idle",
          attributes: { ...current.states[id].attributes, media_position: 1 },
        });
      }
      showToast(host, {
        message: "Simulated next track: sample queue finished.",
      });
    }
  );
  hass.mockWS("tts/engine/options", ({ engine_id, language }) => {
    const engine = demoEngines.get(engine_id);
    if (!engine) {
      throw { code: "not_found", message: "Demo speech engine not found." };
    }
    return {
      supported_options: engine.keys,
      common_options: commonOptions,
      effective_language:
        !language || language === engine.language ? engine.language : null,
    };
  });
  hass.mockWS("tts/engine/voices", ({ engine_id, language }) => ({
    voices:
      demoEngines.get(engine_id)?.language === language
        ? [{ voice_id: "demo-neutral", name: "Demo neutral" }]
        : null,
  }));
  hass.mockService("tts", "speak", (data) => {
    const message = typeof data?.message === "string" ? data.message : "";
    showToast(host, { message: `Simulated speech: ${message}` });
  });
  hass.mockService("scene", "apply", (data, _target, current) => {
    const entities = data?.entities;
    if (!entities || typeof entities !== "object") {
      return;
    }
    for (const [id, value] of Object.entries(entities)) {
      const existing = current.states[id];
      const attributes =
        value && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : undefined;
      const state = typeof value === "string" ? value : attributes?.state;
      if (existing && typeof state === "string") {
        current.mockEntities[id]?.update({
          state,
          attributes,
        });
      }
    }
    showToast(host, { message: "Scene applied to sample entities." });
  });
  hass.mockService("automation", "trigger", async (data, target, current) => {
    const ids = ensureArray(data?.entity_id ?? target?.entity_id) ?? [];
    const automations = demoAutomations(selectedDemo, await selectedDemoConfig);
    for (const id of ids) {
      const configId = current.states[id]?.attributes.id;
      const automation = automations.find(
        ({ config }) => config.id === configId
      );
      const steps: Action | Action[] = automation?.config.actions ?? [];
      for (const action of Array.isArray(steps) ? steps : [steps]) {
        const service = action as ServiceAction;
        if (
          service.action === "media_player.play_media" ||
          service.action === "media_player.media_next_track"
        ) {
          // Each action must finish before the next simulated action starts.
          // eslint-disable-next-line no-await-in-loop
          await current.callService(
            "media_player",
            service.action.split(".")[1],
            service.data,
            service.target
          );
        } else if (service.action === "tts.speak") {
          // Each action must finish before the next simulated action starts.
          // eslint-disable-next-line no-await-in-loop
          await current.callService(
            "tts",
            "speak",
            service.data,
            service.target
          );
        } else if (service.action === "scene.apply") {
          // Each action must finish before the next simulated action starts.
          // eslint-disable-next-line no-await-in-loop
          await current.callService(
            "scene",
            "apply",
            service.data,
            service.target
          );
        }
      }
      // Record the trigger only after its ordered actions finish.
      // eslint-disable-next-line no-await-in-loop
      await current.mockEntities[id]?.handleService(
        "automation",
        "trigger",
        {}
      );
    }
  });
};
