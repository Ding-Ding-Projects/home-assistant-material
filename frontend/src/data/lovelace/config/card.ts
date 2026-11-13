import type { VisibilityCondition } from "../../../panels/lovelace/common/validate-condition";
import type {
  LovelaceGridOptions,
  LovelaceLayoutOptions,
} from "../../../panels/lovelace/types";

export interface GestureFeedbackConfig {
  tap?: string;
  hold?: string;
  double_tap?: string;
}

export interface LovelaceCardConfig {
  index?: number;
  view_index?: number;
  view_layout?: any;
  /** @deprecated Use `grid_options` instead */
  layout_options?: LovelaceLayoutOptions;
  grid_options?: LovelaceGridOptions;
  type: string;
  [key: string]: any;
  visibility?: VisibilityCondition[];
  /**
   * When these conditions are met the card is shown but cannot be operated.
   * Presentation only: it does not limit what a person can do elsewhere.
   */
  view_only?: VisibilityCondition[];
  /** Brief feedback animation per gesture: none, scale, ripple or glow. */
  gesture_feedback?: GestureFeedbackConfig;
  disabled?: boolean;
}
