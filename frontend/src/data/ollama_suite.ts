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
