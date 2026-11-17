import { CONDITION_EDITORS_CLIMATE } from "./conditions/climate";
import { CONDITION_EDITORS_ENVIRONMENT } from "./conditions/environment";
import { CONDITION_EDITORS_HOME } from "./conditions/home";
import { CONDITION_EDITORS_MEDIA } from "./conditions/media";
import { CONDITION_EDITORS_OPENINGS } from "./conditions/openings";
import { CONDITION_EDITORS_PRESENCE } from "./conditions/presence";
import { CONDITION_EDITORS_SYSTEM } from "./conditions/system";
import { DEVICE_ACTION_EDITORS } from "./devices/actions";
import { DEVICE_CONDITION_EDITORS } from "./devices/conditions";
import { deviceControls } from "./devices/shared";
import { DEVICE_TRIGGER_EDITORS } from "./devices/triggers";
import { TRIGGER_EDITORS_CLIMATE } from "./triggers/climate";
import { TRIGGER_EDITORS_ENVIRONMENT } from "./triggers/environment";
import { TRIGGER_EDITORS_HOME } from "./triggers/home";
import { TRIGGER_EDITORS_MEDIA } from "./triggers/media";
import { TRIGGER_EDITORS_OPENINGS } from "./triggers/openings";
import { TRIGGER_EDITORS_PRESENCE } from "./triggers/presence";
import { TRIGGER_EDITORS_SYSTEM } from "./triggers/system";
import type {
  AutomationEditorContext,
  AutomationEditorEntry,
  AutomationEditorMap,
  AutomationKind,
  DeviceAutomationKind,
  DeviceContext,
  DeviceEditorEntry,
  DeviceEditorMap,
  QuickControl,
} from "./types";
import { hiddenKeys, splitAdvanced } from "./helpers";

export type * from "./types";

export const TRIGGER_EDITORS: AutomationEditorMap = {
  ...TRIGGER_EDITORS_ENVIRONMENT,
  ...TRIGGER_EDITORS_OPENINGS,
  ...TRIGGER_EDITORS_PRESENCE,
  ...TRIGGER_EDITORS_CLIMATE,
  ...TRIGGER_EDITORS_MEDIA,
  ...TRIGGER_EDITORS_HOME,
  ...TRIGGER_EDITORS_SYSTEM,
};

export const CONDITION_EDITORS: AutomationEditorMap = {
  ...CONDITION_EDITORS_ENVIRONMENT,
  ...CONDITION_EDITORS_OPENINGS,
  ...CONDITION_EDITORS_PRESENCE,
  ...CONDITION_EDITORS_CLIMATE,
  ...CONDITION_EDITORS_MEDIA,
  ...CONDITION_EDITORS_HOME,
  ...CONDITION_EDITORS_SYSTEM,
};

export const DEVICE_EDITORS: DeviceEditorMap = {
  ...DEVICE_TRIGGER_EDITORS,
  ...DEVICE_CONDITION_EDITORS,
  ...DEVICE_ACTION_EDITORS,
};

/** The tailored editor of a platform trigger or condition, such as `light.turned_on`. */
export const resolveAutomationEditor = (
  kind: AutomationKind,
  id: string | undefined
): AutomationEditorEntry | undefined =>
  id
    ? (kind === "trigger" ? TRIGGER_EDITORS : CONDITION_EDITORS)[id]
    : undefined;

/** The tailored editor of an integration's device trigger, condition or action. */
export const resolveDeviceEditor = (
  kind: DeviceAutomationKind,
  domain: string | undefined
): DeviceEditorEntry | undefined =>
  domain ? DEVICE_EDITORS[`${domain}.${kind}`] : undefined;

export interface AutomationControlSet {
  main: QuickControl[];
  advanced: QuickControl[];
}

/** The controls to draw for one platform trigger or condition. */
export const buildAutomationControls = (
  ctx: AutomationEditorContext
): AutomationControlSet | undefined => {
  const item = resolveAutomationEditor(ctx.kind, ctx.id);
  if (!item) return undefined;
  const hidden = hiddenKeys(ctx);
  const controls = item
    .controls(ctx)
    .filter((control) => !hidden.includes(control.key));
  return splitAdvanced(item, controls);
};

/** The controls to draw for the extra fields of one device automation. */
export const buildDeviceControls = (
  ctx: DeviceContext
): QuickControl[] | undefined => {
  const item = resolveDeviceEditor(ctx.kind, ctx.domain);
  return item ? deviceControls(item, ctx) : undefined;
};
