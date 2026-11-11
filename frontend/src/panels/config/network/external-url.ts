// An instance can learn its external address from the hosted cloud service
// instead of from a configured external URL. That address is not the
// person's own setting, so the form must not present it as one and must not
// write it into the configuration on save.

export interface KnownNetworkUrls {
  external?: string | null;
  cloud?: string | null;
}

export const isExternalUrlFromCloud = (
  urls: KnownNetworkUrls | undefined,
  configuredExternalUrl: string | null | undefined
): boolean =>
  !configuredExternalUrl &&
  !!urls?.cloud &&
  !!urls.external &&
  urls.cloud === urls.external;

// What the external address field holds when the form opens.
export const initialExternalUrl = (
  urls: KnownNetworkUrls | undefined,
  configuredExternalUrl: string | null | undefined
): string =>
  isExternalUrlFromCloud(urls, configuredExternalUrl)
    ? ""
    : (urls?.external ?? "");

export interface UrlSaveInput {
  externalUrl: string;
  internalUrl: string;
  customExternal: boolean;
  customInternal: boolean;
  // An external URL is stored in the configuration right now
  externalConfigured: boolean;
}

// The fields to write. An empty external field that was never configured is
// left out entirely, so saving other fields changes nothing about it.
export const buildUrlSavePayload = (
  input: UrlSaveInput
): { external_url?: string | null; internal_url: string | null } => {
  const payload: { external_url?: string | null; internal_url: string | null } =
    {
      internal_url: input.customInternal ? input.internalUrl || null : null,
    };
  if (input.customExternal) {
    if (input.externalUrl || input.externalConfigured) {
      payload.external_url = input.externalUrl || null;
    }
  } else {
    payload.external_url = null;
  }
  return payload;
};
