import type { HaFormSchema } from "../components/ha-form/types";
import type { HomeAssistant } from "../types";

/** An integration that has no setup screen but accepts options in YAML. */
export interface GuidedSetupIntegration {
  domain: string;
  name: string;
  documentation: string;
  /** Entity domains (such as `sensor`) the integration can be added to. */
  entity_domains: string[];
  /** True when the integration also has a top-level configuration. */
  has_domain_schema: boolean;
  integration_type?: string;
  iot_class?: string;
  is_built_in: boolean;
}

/** How a saved change is picked up by the running instance. */
export interface GuidedSetupApply {
  mode: "reload" | "restart";
  /** The reload action, when the integration offers one. */
  service: string | null;
}

export interface GuidedSetupEntry {
  id: string;
  domain: string;
  entity_domain: string | null;
  data: Record<string, any>;
  apply: GuidedSetupApply;
}

export interface GuidedSetupCatalog {
  integrations: GuidedSetupIntegration[];
  entries: GuidedSetupEntry[];
}

/** A form field served by the backend, ready for `ha-form`. */
export type GuidedSetupField = HaFormSchema & {
  /** Set when the field is edited as YAML because it cannot be drawn. */
  free_form?: boolean;
  label?: string;
};

export interface GuidedSetupForm {
  domain: string;
  entity_domain: string | null;
  name: string;
  documentation: string;
  /** False when the options could not be derived from the schema. */
  serializable: boolean;
  fields: GuidedSetupField[];
  reason: string | null;
  apply: GuidedSetupApply;
}

export interface GuidedSetupError {
  path: string[];
  message: string;
}

export interface GuidedSetupValidation {
  valid: boolean;
  errors: GuidedSetupError[];
  yaml: string;
}

export interface GuidedSetupSaveResult {
  saved: boolean;
  errors: GuidedSetupError[];
  entry?: GuidedSetupEntry;
}

interface Target {
  domain: string;
  entity_domain?: string | null;
}

export const fetchGuidedSetupCatalog = (hass: HomeAssistant) =>
  hass.callWS<GuidedSetupCatalog>({ type: "guided_setup/catalog" });

export const fetchGuidedSetupForm = (hass: HomeAssistant, target: Target) =>
  hass.callWS<GuidedSetupForm>({ type: "guided_setup/form", ...target });

export const validateGuidedSetup = (
  hass: HomeAssistant,
  target: Target,
  data: Record<string, any>
) =>
  hass.callWS<GuidedSetupValidation>({
    type: "guided_setup/validate",
    ...target,
    data,
  });

export const saveGuidedSetup = (
  hass: HomeAssistant,
  target: Target,
  data: Record<string, any>,
  entryId?: string
) =>
  hass.callWS<GuidedSetupSaveResult>({
    type: "guided_setup/save",
    ...target,
    data,
    entry_id: entryId,
  });

export const deleteGuidedSetupEntry = (hass: HomeAssistant, entryId: string) =>
  hass.callWS<{ apply: GuidedSetupApply }>({
    type: "guided_setup/delete",
    entry_id: entryId,
  });

/** Drops values that are empty so the written YAML holds only what was set. */
export const pruneGuidedSetupData = (
  data: Record<string, any>
): Record<string, any> =>
  Object.fromEntries(
    Object.entries(data).filter(
      ([, value]) =>
        value !== undefined &&
        value !== null &&
        value !== "" &&
        !(Array.isArray(value) && value.length === 0)
    )
  );
