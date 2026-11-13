import { ensureArray } from "../../../src/common/array/ensure-array";
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
        if (service.action === "tts.speak") {
          await current.callService("tts", "speak", service.data, service.target);
        } else if (service.action === "scene.apply") {
          await current.callService("scene", "apply", service.data, service.target);
        }
      }
      await current.mockEntities[id]?.handleService(
        "automation",
        "trigger",
        {}
      );
    }
  });
};
