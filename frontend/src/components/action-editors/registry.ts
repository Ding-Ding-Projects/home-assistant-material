import { DOMAIN_EDITORS, splitAction } from "./descriptors";

/**
 * Which rich editor edits which automation element. Service actions resolve
 * by domain and service; every other action, trigger and condition type is
 * listed here with the element that renders its visual form, so a coverage
 * test can fail when a type has none.
 */

export const QUICK_CONTROLS_TAG = "ha-action-quick-controls";
export const OPTIONS_EDITOR_TAG = "ha-automation-options-editor";

export interface ResolvedActionEditor {
  /** `tailored` has a per-domain editor; `form` is the generic rich form. */
  kind: "tailored" | "form";
  element: typeof QUICK_CONTROLS_TAG;
  domain: string;
  service: string;
}

export const resolveActionEditor = (
  action: string | undefined
): ResolvedActionEditor | undefined => {
  if (!action || !action.includes(".")) return undefined;
  const [domain, service] = splitAction(action);
  if (!domain || !service) return undefined;
  const editor = DOMAIN_EDITORS[domain];
  const tailored =
    editor !== undefined &&
    (service in editor.controls ||
      "*" in editor.controls ||
      (editor.siblings ?? []).includes(service));
  return {
    kind: tailored ? "tailored" : "form",
    element: QUICK_CONTROLS_TAG,
    domain,
    service,
  };
};

export const TAILORED_DOMAINS = Object.keys(DOMAIN_EDITORS);

/**
 * Whether one service has its own builder. Sibling tiles alone do not count:
 * every service of every entity domain must be listed with its controls, even
 * when the list is empty because the service takes no data.
 */
export const hasTailoredService = (
  domain: string,
  service: string
): boolean => {
  const editor = DOMAIN_EDITORS[domain];
  return (
    editor !== undefined &&
    (service in editor.controls || "*" in editor.controls)
  );
};

/** Element tag that renders the visual form of each action type. */
export const ACTION_TYPE_EDITORS: Record<string, string> = {
  choose: "ha-automation-action-choose",
  condition: "ha-automation-action-condition",
  delay: "ha-automation-action-delay",
  device_id: "ha-automation-action-device_id",
  event: "ha-automation-action-event",
  if: "ha-automation-action-if",
  parallel: "ha-automation-action-parallel",
  repeat: "ha-automation-action-repeat",
  sequence: "ha-automation-action-sequence",
  service: "ha-automation-action-service",
  set_conversation_response: "ha-automation-action-set_conversation_response",
  stop: "ha-automation-action-stop",
  variables: "ha-automation-action-variables",
  wait_for_trigger: "ha-automation-action-wait_for_trigger",
  wait_template: "ha-automation-action-wait_template",
};

export const TRIGGER_TYPE_EDITORS: Record<string, string> = {
  calendar: "ha-automation-trigger-calendar",
  conversation: "ha-automation-trigger-conversation",
  device: "ha-automation-trigger-device",
  event: "ha-automation-trigger-event",
  geo_location: "ha-automation-trigger-geo_location",
  homeassistant: "ha-automation-trigger-homeassistant",
  list: "ha-automation-trigger-list",
  numeric_state: "ha-automation-trigger-numeric_state",
  persistent_notification: "ha-automation-trigger-persistent_notification",
  platform: "ha-automation-trigger-platform",
  state: "ha-automation-trigger-state",
  sun: "ha-automation-trigger-sun",
  tag: "ha-automation-trigger-tag",
  template: "ha-automation-trigger-template",
  time: "ha-automation-trigger-time",
  time_pattern: "ha-automation-trigger-time_pattern",
  webhook: "ha-automation-trigger-webhook",
  zone: "ha-automation-trigger-zone",
};

export const CONDITION_TYPE_EDITORS: Record<string, string> = {
  and: "ha-automation-condition-and",
  device: "ha-automation-condition-device",
  logical: "ha-automation-condition-logical",
  not: "ha-automation-condition-not",
  numeric_state: "ha-automation-condition-numeric_state",
  or: "ha-automation-condition-or",
  platform: "ha-automation-condition-platform",
  state: "ha-automation-condition-state",
  sun: "ha-automation-condition-sun",
  template: "ha-automation-condition-template",
  time: "ha-automation-condition-time",
  trigger: "ha-automation-condition-trigger",
  zone: "ha-automation-condition-zone",
};
