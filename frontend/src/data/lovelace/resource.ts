import type { Connection } from "home-assistant-js-websocket";
import type { HomeAssistant } from "../../types";

export interface LovelaceInfo {
  resource_mode: "yaml" | "storage";
}

export interface LovelaceResource {
  id: string;
  type: "css" | "js" | "module" | "html";
  url: string;
  uploaded?: boolean;
  filename?: string;
}

export interface LovelaceResourcesMutableParams {
  res_type: LovelaceResource["type"];
  url: string;
}

export const fetchResources = (conn: Connection): Promise<LovelaceResource[]> =>
  conn.sendMessagePromise({
    type: "lovelace/resources",
  });

export const createResource = (
  hass: HomeAssistant,
  values: LovelaceResourcesMutableParams
) =>
  hass.callWS<LovelaceResource>({
    type: "lovelace/resources/create",
    ...values,
  });

export const updateResource = (
  hass: HomeAssistant,
  id: string,
  updates: Partial<LovelaceResourcesMutableParams>
) =>
  hass.callWS<LovelaceResource>({
    type: "lovelace/resources/update",
    resource_id: id,
    ...updates,
  });

export const deleteResource = (hass: HomeAssistant, id: string) =>
  hass.callWS({
    type: "lovelace/resources/delete",
    resource_id: id,
  });

export const fetchLovelaceInfo = (hass: HomeAssistant): Promise<LovelaceInfo> =>
  hass.callWS({
    type: "lovelace/info",
  });

export const RESOURCE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export type ResourceUploadValidationError =
  "upload_extension" | "upload_empty" | "upload_too_large";

/** Picking a file is local; validation must also run immediately before POST. */
export const validateResourceUpload = (
  file: Pick<File, "name" | "size">
): ResourceUploadValidationError | undefined => {
  if (!/\.(?:js|mjs|css)$/i.test(file.name)) return "upload_extension";
  if (file.size === 0) return "upload_empty";
  if (file.size > RESOURCE_UPLOAD_MAX_BYTES) return "upload_too_large";
  return undefined;
};

export const resourceUploadType = (filename: string): "css" | "module" =>
  /\.css$/i.test(filename) ? "css" : "module";

/** Preview used by the existing permission dialog, not the stored upload URL. */
export const resourceUploadConsentValues = (
  file: File
): LovelaceResourcesMutableParams => ({
  url: `/api/lovelace/resources/upload/${encodeURIComponent(file.name)}`,
  res_type: resourceUploadType(file.name),
});

export const uploadResource = async (
  hass: HomeAssistant,
  file: File
): Promise<LovelaceResource> => {
  const invalid = validateResourceUpload(file);
  if (invalid) {
    throw new Error(
      hass.localize(`ui.panel.config.lovelace.resources.detail.${invalid}`)
    );
  }
  const response = await hass.fetchWithAuth(
    `/api/lovelace/resources/upload?filename=${encodeURIComponent(file.name)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: file,
    }
  );
  if (!response.ok) {
    throw new Error(
      hass.localize("ui.panel.config.lovelace.resources.detail.upload_failed")
    );
  }
  return response.json();
};
