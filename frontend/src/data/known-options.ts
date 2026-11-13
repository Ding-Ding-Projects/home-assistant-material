import {
  collectUsedElsewhere,
  declaredOptions,
} from "../common/object-editor/known-options";
import type {
  KnownChoice,
  KnownOption,
} from "../common/object-editor/known-options";
import type { HomeAssistant } from "../types";
import { fetchAutomationFileConfig } from "./automation";
import { fetchScriptFileConfig } from "./script";
import { getTTSEngine, getTTSEngineOptions, listTTSVoices } from "./tts";

/** What the editor knows about where it sits. */
export interface KnownOptionsContext {
  /** The action, such as "tts.speak". */
  action?: string;
  /** The field that holds the dictionary, such as "options". */
  field?: string;
  /** The entities the action targets. */
  entityIds?: string[];
  /** The language chosen in the same action, if any. */
  language?: string;
}

export interface DeclaredOptionsResult {
  options: KnownOption[];
  /** Every key the integration accepts, declared or common to all engines. */
  acceptedKeys: string[];
}

const MAX_ENGINES = 5;

const normalizeLanguage = (language: string): string =>
  language.toLowerCase().replace("_", "-");

/** The engine language that best fits a language such as "en" or "en-US". */
const pickLanguage = (
  supported: string[],
  wanted: string
): string | undefined => {
  const target = normalizeLanguage(wanted);
  const exact = supported.find((item) => normalizeLanguage(item) === target);
  if (exact) {
    return exact;
  }
  const base = target.split("-")[0];
  return supported.find(
    (item) => normalizeLanguage(item).split("-")[0] === base
  );
};

const loadVoices = async (
  hass: HomeAssistant,
  engineId: string,
  language: string
): Promise<KnownChoice[] | undefined> => {
  try {
    const { provider } = await getTTSEngine(hass.callWS, engineId);
    const match = pickLanguage(provider.supported_languages ?? [], language);
    if (!match) {
      return undefined;
    }
    const { voices } = await listTTSVoices(hass.callWS, engineId, match);
    return voices?.length
      ? voices.map((voice) => ({ value: voice.voice_id, label: voice.name }))
      : undefined;
  } catch (_err) {
    return undefined;
  }
};

/**
 * What the integration behind the action declares, or undefined when it
 * declares nothing that can be read. Speech engines declare their options.
 */
export const loadDeclaredOptions = async (
  hass: HomeAssistant,
  context: KnownOptionsContext
): Promise<DeclaredOptionsResult | undefined> => {
  if (context.action !== "tts.speak" || context.field !== "options") {
    return undefined;
  }
  const engines = (context.entityIds ?? [])
    .filter((id) => id.startsWith("tts."))
    .slice(0, MAX_ENGINES);
  if (!engines.length) {
    return undefined;
  }

  const options: KnownOption[] = [];
  const accepted = new Set<string>();
  for (const engineId of engines) {
    let result;
    try {
      // eslint-disable-next-line no-await-in-loop
      result = await getTTSEngineOptions(hass.callWS, engineId);
    } catch (_err) {
      // One engine that cannot answer makes the whole list unreliable.
      return undefined;
    }
    result.common_options.forEach((key) => accepted.add(key));
    const keys = result.supported_options;
    keys.forEach((key) => accepted.add(key));
    const choices: Record<string, KnownChoice[]> = {};
    if (keys.includes("voice")) {
      // eslint-disable-next-line no-await-in-loop
      const voices = await loadVoices(
        hass,
        engineId,
        context.language || hass.language
      );
      if (voices) {
        choices.voice = voices;
      }
    }
    options.push(
      ...declaredOptions({
        keys,
        defaults: result.default_options,
        choices,
      })
    );
  }
  return { options, acceptedKeys: [...accepted] };
};

const USAGE_TTL_MS = 5 * 60 * 1000;
const MAX_CONFIGS = 300;
let usageCache: { at: number; promise: Promise<unknown[]> } | undefined;

/** Every stored automation and script config, loaded once and kept briefly. */
const loadAllConfigs = (hass: HomeAssistant): Promise<unknown[]> => {
  if (usageCache && Date.now() - usageCache.at < USAGE_TTL_MS) {
    return usageCache.promise;
  }
  const loaders: (() => Promise<unknown>)[] = [];
  for (const state of Object.values(hass.states)) {
    if (state.entity_id.startsWith("automation.") && state.attributes.id) {
      const id = String(state.attributes.id);
      loaders.push(() => fetchAutomationFileConfig(hass, id));
    } else if (state.entity_id.startsWith("script.")) {
      const objectId = state.entity_id.slice("script.".length);
      loaders.push(() => fetchScriptFileConfig(hass, objectId));
    }
  }
  const queue = loaders.slice(0, MAX_CONFIGS);
  const configs: unknown[] = [];
  const worker = async () => {
    for (let load = queue.shift(); load; load = queue.shift()) {
      try {
        // eslint-disable-next-line no-await-in-loop
        configs.push(await load());
      } catch (_err) {
        // A config that cannot be read adds nothing.
      }
    }
  };
  const promise = Promise.all([worker(), worker(), worker(), worker()]).then(
    () => configs
  );
  usageCache = { at: Date.now(), promise };
  return promise;
};

/** The keys other automations and scripts use for the same action and field. */
export const loadUsedElsewhere = async (
  hass: HomeAssistant,
  context: KnownOptionsContext
): Promise<KnownOption[]> => {
  if (!context.action || !context.field) {
    return [];
  }
  const configs = await loadAllConfigs(hass);
  const platforms = new Set(
    (context.entityIds ?? [])
      .map((id) => hass.entities[id]?.platform)
      .filter((platform): platform is string => Boolean(platform))
  );
  return collectUsedElsewhere(configs, {
    action: context.action,
    field: context.field,
    stepFilter: platforms.size
      ? (ids) =>
          ids.some((id) => {
            const platform = hass.entities[id]?.platform;
            return platform !== undefined && platforms.has(platform);
          })
      : undefined,
  });
};
