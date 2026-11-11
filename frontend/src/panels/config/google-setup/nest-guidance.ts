import type { GoogleClientParse } from "../../../data/google_setup";
import {
  googleRedirectUri,
  parseGoogleClientJson,
} from "../../../data/google_setup";

/**
 * Guidance for registering Google Nest (Device Access). Everything here is
 * plain data and pure functions. Nothing is sent anywhere: the outside
 * addresses are shown as text for the person to copy, never opened.
 */

export type NestStepId =
  | "create_project"
  | "enable_api"
  | "device_access"
  | "project_id"
  | "redirect"
  | "oauth_client";

export interface NestStep {
  id: NestStepId;
  /** An outside page to copy, shown as plain text. Never opened by the page. */
  address?: string;
}

export const NEST_STEPS: readonly NestStep[] = [
  {
    id: "create_project",
    address: "https://console.cloud.google.com/projectcreate",
  },
  {
    id: "enable_api",
    address:
      "https://console.cloud.google.com/apis/library/smartdevicemanagement.googleapis.com",
  },
  {
    id: "device_access",
    address: "https://console.nest.google.com/device-access",
  },
  { id: "project_id" },
  { id: "redirect" },
  {
    id: "oauth_client",
    address: "https://console.cloud.google.com/apis/credentials",
  },
];

export const NEST_STEP_IDS: readonly NestStepId[] = NEST_STEPS.map(
  (step) => step.id
);

export const NEST_CHECKLIST_KEY = "ha-google-nest-checklist";

/** A Device Access project ID is a UUID, for example 1b2c3d4e-... */
const NEST_PROJECT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type NestProjectIdState = "empty" | "valid" | "invalid";

export const validateNestProjectId = (value: string): NestProjectIdState => {
  const text = value.trim();
  if (!text) {
    return "empty";
  }
  return NEST_PROJECT_ID_PATTERN.test(text) ? "valid" : "invalid";
};

/**
 * The redirect address this instance needs, built from the page's origin.
 * Returns an empty string when the origin is not an http or https origin.
 */
export const nestRedirectUri = (origin: string, myLink = false): string => {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch (_err) {
    return "";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "";
  }
  return googleRedirectUri(myLink, parsed.origin);
};

/** How many known steps are ticked. Unknown and repeated ids do not count. */
export const nestProgress = (
  ticked: Iterable<string>
): { done: number; total: number } => {
  const known = new Set<string>(NEST_STEP_IDS);
  const seen = new Set<string>();
  for (const id of ticked) {
    if (known.has(id)) {
      seen.add(id);
    }
  }
  return { done: seen.size, total: NEST_STEP_IDS.length };
};

export const serializeNestChecklist = (ticked: Iterable<string>): string => {
  const set = new Set(ticked);
  return JSON.stringify(NEST_STEP_IDS.filter((id) => set.has(id)));
};

export const restoreNestChecklist = (raw: string | null): Set<NestStepId> => {
  if (!raw) {
    return new Set();
  }
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) {
      return new Set();
    }
    return new Set(NEST_STEP_IDS.filter((id) => data.includes(id)));
  } catch (_err) {
    return new Set();
  }
};

/** Checks a pasted client file with the same parser the credential step uses. */
export const validateNestClientText = (text: string): GoogleClientParse =>
  parseGoogleClientJson(text);
