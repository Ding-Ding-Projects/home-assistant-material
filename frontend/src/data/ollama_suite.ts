import type { HomeAssistant } from "../types";

export interface OllamaServer {
  entry_id: string;
  title: string;
  /** Address without credentials, query or fragment. */
  address: string;
  /** Config entry state, such as `loaded` or `setup_retry`. */
  state: string;
  disabled: boolean;
  reachable: boolean;
  version: string | null;
  /** A plain error code when a loaded server did not answer. */
  error: string | null;
}

export interface OllamaModelDetails {
  family: string | null;
  families: (string | null)[];
  format: string | null;
  parameter_size: string | null;
  quantization_level: string | null;
}

export interface OllamaModel extends OllamaModelDetails {
  name: string | null;
  digest: string | null;
  size: number | null;
  modified_at: string | null;
}

export interface OllamaModelList {
  models: OllamaModel[];
  total: number;
  truncated: boolean;
}

export interface OllamaRunningModel extends OllamaModelDetails {
  name: string | null;
  digest: string | null;
  size: number | null;
  size_vram: number | null;
  context_length: number | null;
  expires_at: string | null;
}

export interface OllamaRunning {
  running: OllamaRunningModel[];
  memory_used: number;
  memory_gpu: number;
}

export interface OllamaModelInfo extends OllamaModelDetails {
  name: string;
  modified_at: string | null;
  capabilities: (string | null)[];
  parameters: string | null;
  template: string | null;
  license: string | null;
  info: Record<string, string | number | boolean>;
}

export const fetchOllamaServers = (hass: HomeAssistant) =>
  hass.callWS<{ servers: OllamaServer[] }>({ type: "ollama_suite/servers" });

export const fetchOllamaModels = (hass: HomeAssistant, entryId: string) =>
  hass.callWS<OllamaModelList>({
    type: "ollama_suite/models",
    entry_id: entryId,
  });

export const fetchOllamaRunning = (hass: HomeAssistant, entryId: string) =>
  hass.callWS<OllamaRunning>({
    type: "ollama_suite/running",
    entry_id: entryId,
  });

export const fetchOllamaModelInfo = (
  hass: HomeAssistant,
  entryId: string,
  model: string
) =>
  hass.callWS<OllamaModelInfo>({
    type: "ollama_suite/show",
    entry_id: entryId,
    model,
  });

/** The same rule the server applies: `name`, `name:tag` or `namespace/name[:tag]`. */
const PULL_NAME =
  /^(?:[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9._-]*)$/;
const PULL_TAG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export const isValidPullName = (name: string): boolean => {
  if (!name || name.length > 256) {
    return false;
  }
  const [base, ...rest] = name.split(":");
  if (rest.length > 1) {
    return false;
  }
  if (rest.length === 1 && !PULL_TAG.test(rest[0])) {
    return false;
  }
  return PULL_NAME.test(base);
};

export interface OllamaPullEvent {
  state: "progress" | "done" | "error";
  /** The server's own words for the step, such as `pulling manifest`. */
  status?: string;
  digest?: string | null;
  /** Bytes of the layer being fetched, when the server knows them. */
  total?: number | null;
  completed?: number | null;
  /** A plain error code when the state is `error`. */
  code?: string;
}

/** Starts a download. Call the returned function to cancel it. */
export const pullOllamaModel = (
  hass: HomeAssistant,
  entryId: string,
  model: string,
  callback: (event: OllamaPullEvent) => void
): Promise<() => Promise<void>> =>
  hass.connection.subscribeMessage<OllamaPullEvent>(callback, {
    type: "ollama_suite/pull",
    entry_id: entryId,
    model,
  });

export const deleteOllamaModel = (
  hass: HomeAssistant,
  entryId: string,
  model: string
) =>
  hass.callWS<{ model: string; freed: number | null }>({
    type: "ollama_suite/delete",
    entry_id: entryId,
    model,
  });

export const unloadOllamaModel = (
  hass: HomeAssistant,
  entryId: string,
  model: string
) =>
  hass.callWS<{ model: string }>({
    type: "ollama_suite/unload",
    entry_id: entryId,
    model,
  });
