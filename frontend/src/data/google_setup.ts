import type { HomeAssistant } from "../types";

/** The Google APIs the integrations use, with their Service Usage names. */
export const GOOGLE_APIS = [
  { id: "drive", service: "drive.googleapis.com" },
  { id: "calendar", service: "calendar-json.googleapis.com" },
  { id: "gmail", service: "gmail.googleapis.com" },
  { id: "sheets", service: "sheets.googleapis.com" },
  { id: "tasks", service: "tasks.googleapis.com" },
  { id: "photos", service: "photoslibrary.googleapis.com" },
  { id: "youtube", service: "youtube.googleapis.com" },
  { id: "nest", service: "smartdevicemanagement.googleapis.com" },
  { id: "assistant", service: "embeddedassistant.googleapis.com" },
  { id: "pubsub", service: "pubsub.googleapis.com" },
] as const;

export type GoogleApiId = (typeof GOOGLE_APIS)[number]["id"];

/** Integration domains that sign in with a Google OAuth client. */
export const GOOGLE_DOMAINS = [
  "google",
  "google_drive",
  "google_mail",
  "google_sheets",
  "google_tasks",
  "google_photos",
  "youtube",
  "nest",
  "google_assistant_sdk",
] as const;

export const GOOGLE_CREDENTIALS_URL =
  "https://console.cloud.google.com/apis/credentials";

export const googleEnableApiUrl = (service: string): string =>
  `https://console.cloud.google.com/flows/enableapi?apiid=${encodeURIComponent(service)}`;

export interface GoogleSetupStatus {
  apis: { id: string; service: string }[];
  /** Google integration domains present in this build. */
  domains: string[];
  /** True when the My Home Assistant redirect is used. */
  my_link: boolean;
}

export interface GoogleApiResult {
  id: string;
  service: string;
  state: "enabled" | "error";
  reason?: string;
}

export interface GoogleEnableResult {
  project_id: string;
  apis: GoogleApiResult[];
}

export const fetchGoogleSetupStatus = (hass: HomeAssistant) =>
  hass.callWS<GoogleSetupStatus>({ type: "google_setup/status" });

/** The key is sent once for this call and never kept by the interface. */
export const enableGoogleApis = (
  hass: HomeAssistant,
  serviceAccountKey: string,
  apis?: string[]
) =>
  hass.callWS<GoogleEnableResult>({
    type: "google_setup/enable_apis",
    service_account_key: serviceAccountKey,
    ...(apis ? { apis } : {}),
  });

export type GoogleClientError =
  | "too_large"
  | "invalid_json"
  | "not_a_client"
  | "missing_client_id"
  | "client_id_shape"
  | "missing_client_secret";

export type GoogleClientParse =
  | {
      ok: true;
      kind: "web" | "installed";
      clientId: string;
      clientSecret: string;
      redirectUris: string[];
    }
  | { ok: false; error: GoogleClientError };

const MAX_CLIENT_FILE = 20000;

/** Check the shape of a downloaded Google OAuth client file. */
export const parseGoogleClientJson = (text: string): GoogleClientParse => {
  if (text.length > MAX_CLIENT_FILE) {
    return { ok: false, error: "too_large" };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (_err) {
    return { ok: false, error: "invalid_json" };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, error: "not_a_client" };
  }
  const record = data as Record<string, unknown>;
  const kind =
    "web" in record ? "web" : "installed" in record ? "installed" : "";
  const inner = kind ? record[kind] : undefined;
  if (kind === "" || typeof inner !== "object" || inner === null) {
    return { ok: false, error: "not_a_client" };
  }
  const client = inner as Record<string, unknown>;
  const clientId =
    typeof client.client_id === "string" ? client.client_id.trim() : "";
  const clientSecret =
    typeof client.client_secret === "string" ? client.client_secret.trim() : "";
  if (!clientId) {
    return { ok: false, error: "missing_client_id" };
  }
  if (!clientId.endsWith(".apps.googleusercontent.com")) {
    return { ok: false, error: "client_id_shape" };
  }
  if (!clientSecret) {
    return { ok: false, error: "missing_client_secret" };
  }
  const redirectUris = Array.isArray(client.redirect_uris)
    ? client.redirect_uris.filter(
        (uri): uri is string => typeof uri === "string"
      )
    : [];
  return {
    ok: true,
    kind,
    clientId,
    clientSecret,
    redirectUris,
  };
};

export const MY_REDIRECT_URI = "https://my.home-assistant.io/redirect/oauth";

/**
 * The address Google must be told to send people back to. It matches how the
 * OAuth flow computes it: the My Home Assistant address when that integration
 * is loaded, otherwise this instance's own callback.
 */
export const googleRedirectUri = (myLink: boolean, origin: string): string =>
  myLink ? MY_REDIRECT_URI : `${origin}/auth/external/callback`;

export type GoogleSetupStep =
  "helper" | "client" | "credentials" | "integrations";

export const GOOGLE_SETUP_STEPS: GoogleSetupStep[] = [
  "helper",
  "client",
  "credentials",
  "integrations",
];

/** What may be remembered between visits. It never holds a key or secret. */
export interface GoogleSetupDraft {
  step: GoogleSetupStep;
  helperSkipped: boolean;
  clientId: string;
  nestProjectId: string;
}

export const GOOGLE_SETUP_DRAFT_KEY = "google_setup_draft";

export const emptyDraft = (): GoogleSetupDraft => ({
  step: "helper",
  helperSkipped: false,
  clientId: "",
  nestProjectId: "",
});

/** Serialize only the allowed, non-secret fields. */
export const serializeDraft = (draft: GoogleSetupDraft): string =>
  JSON.stringify({
    step: draft.step,
    helperSkipped: draft.helperSkipped,
    clientId: draft.clientId,
    nestProjectId: draft.nestProjectId,
  });

/** Read a stored draft, dropping anything unknown or malformed. */
export const restoreDraft = (
  raw: string | null | undefined
): GoogleSetupDraft => {
  const draft = emptyDraft();
  if (!raw) {
    return draft;
  }
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (GOOGLE_SETUP_STEPS.includes(data.step as GoogleSetupStep)) {
      draft.step = data.step as GoogleSetupStep;
    }
    draft.helperSkipped = data.helperSkipped === true;
    if (typeof data.clientId === "string") {
      draft.clientId = data.clientId.slice(0, 200);
    }
    if (typeof data.nestProjectId === "string") {
      draft.nestProjectId = data.nestProjectId.slice(0, 200);
    }
  } catch (_err) {
    return emptyDraft();
  }
  return draft;
};
