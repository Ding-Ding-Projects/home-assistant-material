// Rules shared by the text-to-speech and speech-to-text pickers for which
// engines are offered. An engine that comes from the hosted cloud service is
// never offered as a new choice, but it must stay selectable while it is the
// saved value, otherwise the picker would show an empty field for a working
// configuration and the next save could silently replace it.

export const LEGACY_CLOUD_ENGINE_ID = "cloud";

export interface EngineOptionInput {
  engine_id: string;
  name?: string;
  deprecated?: boolean;
  supported_languages?: string[];
}

export interface EngineOption {
  engine: EngineOptionInput;
  // True when the engine is only listed because it is the saved value.
  keptForCurrentValue: boolean;
}

export const isCloudEngine = (
  engineId: string,
  cloudEngineId?: string
): boolean =>
  engineId === LEGACY_CLOUD_ENGINE_ID ||
  (cloudEngineId !== undefined && engineId === cloudEngineId);

export const listOfferedEngines = (
  engines: EngineOptionInput[],
  currentValue: string | undefined,
  cloudEngineId: string | undefined,
  hideDeprecated: boolean
): EngineOption[] => {
  const result: EngineOption[] = [];
  for (const engine of engines) {
    const isCurrent =
      currentValue !== undefined && engine.engine_id === currentValue;
    if (isCloudEngine(engine.engine_id, cloudEngineId)) {
      if (isCurrent) {
        result.push({ engine, keptForCurrentValue: true });
      }
      continue;
    }
    if (hideDeprecated && engine.deprecated && !isCurrent) {
      continue;
    }
    result.push({ engine, keptForCurrentValue: false });
  }
  return result;
};
