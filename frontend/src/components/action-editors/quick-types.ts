/**
 * Types shared by the pure action-editor descriptors. Nothing here touches
 * the DOM.
 */

export interface QuickEntity {
  entity_id: string;
  state?: string;
  attributes: Record<string, any>;
}

export interface QuickFieldInfo {
  selector?: Record<string, any> | null;
  default?: unknown;
  required?: boolean;
}

export interface QuickOption {
  value: string;
  labelKey?: string;
  label?: string;
}

export interface QuickColor {
  id: string;
  rgb: [number, number, number];
}

/** Facts about a speech engine that only the backend can report. */
export interface QuickEngineInfo {
  languages?: string[];
  /** Option names the engine declares, such as `voice`. */
  options?: string[];
  /** Audio hints every engine accepts. */
  commonOptions?: string[];
}

/**
 * The kind of value a control edits. A value of a kind listed in
 * `REQUIRED_COMPONENT` must be rendered by that kind's own component.
 */
export type QuickValueType =
  | "color"
  | "color_temp"
  | "duration"
  | "time"
  | "date"
  | "datetime"
  | "icon"
  | "entity"
  | "location"
  | "media"
  | "language"
  | "voice"
  | "agent"
  | "list"
  | "object"
  | "other";

export interface ControlBase {
  key: string;
  /** Translation key of the label, used when the service has no field name. */
  labelKey: string;
}

export interface QuickOptionField {
  name: string;
  type: "voice" | "text" | "number" | "list";
  labelKey?: string;
  options?: QuickOption[];
}

export type QuickControl =
  | (ControlBase & {
      kind: "slider";
      min: number;
      max: number;
      step: number;
      /** Multiplier for the displayed numeral (0.01 steps shown as percent). */
      scale?: number;
      unit?: string;
      value?: number;
    })
  | (ControlBase & {
      kind: "stepper";
      min: number;
      max: number;
      step: number;
      unit?: string;
      value?: number;
    })
  | (ControlBase & {
      kind: "tiles";
      options: QuickOption[];
      value?: string;
    })
  | (ControlBase & {
      kind: "swatches";
      colors: QuickColor[];
      value?: number[];
    })
  | (ControlBase & {
      kind: "color";
      /**
       * Colour model the stored value uses. `hex` is text such as
       * `RRGGBBAA`; its value here is [r, g, b, alpha].
       */
      space: "rgb" | "hs" | "xy" | "rgbw" | "rgbww" | "hex";
      value?: number[];
      swatches: boolean;
    })
  | (ControlBase & {
      kind: "switch";
      value?: boolean;
      /**
       * The service only accepts `true` (a constant flag). Switching it off
       * removes the key instead of writing `false`.
       */
      constant?: boolean;
    })
  | (ControlBase & {
      kind: "text";
      multiline?: boolean;
      inputType?: string;
      value?: string | number | boolean;
      chips?: { id: string; text: string; replace?: boolean }[];
      /** Show a live character count under the box. */
      showCount?: boolean;
      maxLength?: number;
    })
  | (ControlBase & {
      kind: "time" | "date" | "datetime";
      value?: string;
    })
  | (ControlBase & {
      kind: "duration";
      /** Number of seconds, or a `H:MM:SS` text, as the service stores it. */
      format: "seconds" | "hms";
      value?: number | string;
      enableMillisecond?: boolean;
    })
  | (ControlBase & {
      /** One of the tree's own selectors, rendered by `ha-selector`. */
      kind: "selector";
      selector: Record<string, any>;
      valueType: QuickValueType;
      value?: unknown;
      /** Extra selector context, such as the speech language. */
      context?: Record<string, unknown>;
    })
  | (ControlBase & {
      /** Entity tiles for a short list, plus the entity picker for the rest. */
      kind: "entities";
      domain: string;
      multiple: boolean;
      value?: string | string[];
    })
  | (ControlBase & {
      /** Known engine options as controls, plus the free name and value list. */
      kind: "options";
      fields: QuickOptionField[];
      value?: Record<string, unknown>;
      /** Selector context for the voice list, such as the speech engine. */
      context?: Record<string, unknown>;
    })
  | (ControlBase & {
      /** Runs the action once, only when pressed. */
      kind: "run";
      noteKey: string;
    })
  | {
      kind: "services";
      key: "$action";
      labelKey: string;
      options: { value: string }[];
      value: string;
    }
  | {
      kind: "notice";
      key: string;
      labelKey: string;
      tone: "caution" | "info";
    };

export interface QuickContext {
  /** Full action name, such as `light.turn_on`. */
  action: string;
  data: Record<string, unknown>;
  /** Fields the service declares, by key (top level only). */
  fields: Record<string, QuickFieldInfo>;
  /** Services that exist in the action's domain. */
  domainServices: string[];
  /** Targeted entities. Empty when unknown (areas not expanded, templates). */
  entities: QuickEntity[];
  /** Engine facts the owner loaded from the backend, by entity id. */
  engines?: Record<string, QuickEngineInfo>;
  /** The owner's linked media files by name, never with their address. */
  linkedFiles?: { id: string; name: string }[];
}

export type ServiceBuilders = Record<
  string,
  (ctx: QuickContext) => QuickControl[]
>;

export interface DomainEditor {
  /** Sibling services shown as one row of action tiles. */
  siblings?: string[];
  /** Services whose use deserves a visible caution. */
  cautions?: Record<string, string>;
  /**
   * Supported-feature bit a service needs. A sibling tile is hidden when
   * every targeted entity reports its features and none has the bit.
   */
  gates?: Record<string, number>;
  controls: ServiceBuilders;
}
