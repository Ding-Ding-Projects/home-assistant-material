import type {
  QuickControl,
  QuickEntity,
  QuickFieldInfo,
  QuickOption,
  QuickValueType,
} from "../action-editors/quick-types";

/**
 * Types shared by the pure trigger, condition and device automation editors.
 * Nothing here touches the DOM. The controls an editor returns are the same
 * `QuickControl` values the action editors return, so the existing
 * `ha-action-quick-controls` element can render them unchanged.
 */

export type {
  QuickControl,
  QuickEntity,
  QuickFieldInfo,
  QuickOption,
  QuickValueType,
};

export type AutomationKind = "trigger" | "condition";

export type DeviceAutomationKind = "trigger" | "condition" | "action";

/** Navigation groups, shared by the trigger and the condition catalogue. */
export type AutomationGroup =
  | "environment"
  | "openings"
  | "presence"
  | "climate"
  | "media"
  | "home"
  | "system";

export interface AutomationEditorContext {
  kind: AutomationKind;
  /** Full id, such as `light.turned_on` or `sun.is_golden_hour`. */
  id: string;
  /** The `options` of the trigger or condition. Target is kept apart. */
  data: Record<string, unknown>;
  /**
   * Fields the backend description declares, by key. An empty object means
   * the description is unknown, and every field the editor knows is offered.
   */
  fields: Record<string, QuickFieldInfo>;
  /** The configured target, passed to selectors as their filter. */
  target?: Record<string, unknown>;
  /** Selector config of the target the description declares. */
  targetSelector?: Record<string, unknown>;
  /** Targeted entities. Empty when unknown (areas not expanded, templates). */
  entities: QuickEntity[];
  /** Number of entities the target resolves to, when known. */
  targetEntityCount?: number;
}

export type AutomationControlBuilder = (
  ctx: AutomationEditorContext
) => QuickControl[];

export interface AutomationEditorEntry {
  id: string;
  kind: AutomationKind;
  group: AutomationGroup;
  /** Target selector config from the integration's yaml, for the picker. */
  target?: Record<string, unknown> | null;
  /** Option keys that stay collapsed until asked for. */
  advanced: string[];
  controls: AutomationControlBuilder;
}

export type AutomationEditorMap = Record<string, AutomationEditorEntry>;

/** Value types for one numeric threshold. */
export interface ThresholdPreset {
  mode: "changed" | "crossed" | "is";
  number: Record<string, unknown>;
  entity: Record<string, unknown>[];
  unit?: string | string[];
}

export interface DeviceContext {
  kind: DeviceAutomationKind;
  /** Integration domain of the device automation. */
  domain: string;
  /** The `type` the person picked, when one is picked. */
  type?: string;
  data: Record<string, unknown>;
  entities: QuickEntity[];
}

/** One extra field of a device automation, and the types it applies to. */
export interface DeviceExtraField {
  key: string;
  /** Types that take the field. Empty means every type of the integration. */
  types?: string[];
  build: (ctx: DeviceContext) => QuickControl | undefined;
}

export interface DeviceEditorEntry {
  domain: string;
  kind: DeviceAutomationKind;
  /** Entity domain the device automation is bound to, when it is. */
  entityDomain?: string;
  /**
   * Where the type list comes from. `static` lists are known to the
   * integration's Python source; `device` lists are reported per device by
   * the backend and are rendered as tiles when they arrive.
   */
  typeSource: "static" | "device";
  types: string[];
  /** Whether a second `subtype` choice follows the type. */
  subtype: boolean;
  extra: DeviceExtraField[];
}

export type DeviceEditorMap = Record<string, DeviceEditorEntry>;
