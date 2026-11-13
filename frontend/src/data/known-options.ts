import { ensureArray } from "../common/array/ensure-array";
import { isValidEntityId } from "../common/entity/valid_entity_id";
import { declaredOptions } from "../common/object-editor/known-options";
import type {
  KnownChoice,
  KnownOption,
} from "../common/object-editor/known-options";
import { hasTemplate } from "../common/string/has-template";
import type { HomeAssistant } from "../types";
import { explainTarget, targetEntitiesAfterExclude } from "./target";
import type { HassServiceTargetWithExclude } from "./target";
import { getTTSEngineOptions, listTTSVoices } from "./tts";

/** The action and target of a dictionary field. */
export interface KnownOptionsContext {
  action?: string;
  field?: string;
  target?: HassServiceTargetWithExclude;
  /** Explicit entity IDs, including a legacy service-data target. */
  entityIds?: string[];
  language?: string;
}

export interface DeclaredOptionsResult {
  options: KnownOption[];
  /** Option keys accepted by every resolved engine, including common keys. */
  acceptedKeys: string[];
}

const MAX_ENGINES = 5;
const MAX_OPTION_KEYS = 128;

const explicitIds = (ids: string | string[]): string[] =>
  ensureArray(ids).flatMap((value) =>
    value.split(",").map((id) => id.trim().toLowerCase())
  );

const resolveEngines = async (
  hass: HomeAssistant,
  context: KnownOptionsContext
): Promise<string[]> => {
  const { target } = context;
  const rawIds = target?.entity_id ?? context.entityIds;
  const ids = rawIds === undefined ? [] : explicitIds(rawIds);
  if (ids.some((id) => !isValidEntityId(id))) {
    return [];
  }
  if (
    ids.every((id) => id.startsWith("tts.")) &&
    (!target || Object.keys(target).every((key) => key === "entity_id"))
  ) {
    return ids;
  }
  if (hasTemplate(target)) {
    return [];
  }

  const explanation = await explainTarget(hass.callWS, {
    ...target,
    ...(ids.length ? { entity_id: ids } : {}),
  });
  if (explanation.includes.some((item) => !item.entities.length)) {
    return [];
  }
  return Object.values(targetEntitiesAfterExclude(explanation))
    .flat()
    .filter((id) => id.startsWith("tts."));
};

const sharedValues = (sets: string[][]): string[] =>
  [...new Set(sets[0])].filter((value) =>
    sets.every((values) => values.includes(value))
  );

const isOptionKeyList = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length <= MAX_OPTION_KEYS &&
  value.every(
    (key) => typeof key === "string" && key.length > 0 && key.length <= 128
  );

const loadVoices = async (
  hass: HomeAssistant,
  engineId: string,
  language: string | null | undefined
): Promise<KnownChoice[]> => {
  if (!language) {
    return [];
  }
  try {
    const { voices } = await listTTSVoices(hass.callWS, engineId, language);
    return (
      voices?.map((voice) => ({ value: voice.voice_id, label: voice.name })) ??
      []
    );
  } catch (_err) {
    return [];
  }
};

/** Loads metadata only for a TTS Options field with a complete target. */
export const loadDeclaredOptions = async (
  hass: HomeAssistant,
  context: KnownOptionsContext
): Promise<DeclaredOptionsResult | undefined> => {
  if (
    context.action !== "tts.speak" ||
    context.field !== "options" ||
    hass.user?.is_admin === false
  ) {
    return undefined;
  }

  try {
    const engines = [...new Set(await resolveEngines(hass, context))];
    if (!engines.length || engines.length > MAX_ENGINES) {
      return undefined;
    }
    const language = context.language;
    const isDynamicLanguage = hasTemplate(language);
    const results = await Promise.all(
      engines.map((engineId) =>
        getTTSEngineOptions(
          hass.callWS,
          engineId,
          isDynamicLanguage ? undefined : language
        )
      )
    );
    if (
      results.some(
        (result) =>
          !isOptionKeyList(result.supported_options) ||
          !isOptionKeyList(result.common_options)
      )
    ) {
      return undefined;
    }

    const keys = sharedValues(
      results.map((result) => result.supported_options)
    );
    const acceptedKeys = sharedValues(
      results.map((result) => [
        ...result.supported_options,
        ...result.common_options,
      ])
    );
    if (
      !keys.includes("voice") ||
      isDynamicLanguage ||
      results.some(
        (result) =>
          !result.effective_language ||
          (language && language !== result.effective_language)
      )
    ) {
      return { options: declaredOptions({ keys }), acceptedKeys };
    }
    const voiceLists = await Promise.all(
      results.map((result, index) =>
        loadVoices(hass, engines[index], result.effective_language)
      )
    );
    const voiceIds = new Set(
      sharedValues(voiceLists.map((list) => list.map((voice) => voice.value)))
    );
    const voice = [
      ...new Map(voiceLists[0].map((item) => [item.value, item])).values(),
    ]
      .filter((item) => voiceIds.has(item.value))
      .map((item) =>
        voiceLists.every((list) =>
          list.some(
            (choice) =>
              choice.value === item.value && choice.label === item.label
          )
        )
          ? item
          : { value: item.value }
      );
    return {
      options: declaredOptions({ keys, choices: { voice } }),
      acceptedKeys,
    };
  } catch (_err) {
    // One missing result leaves support across the target unknown.
    return undefined;
  }
};
