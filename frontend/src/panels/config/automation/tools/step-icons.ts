import {
  mdiBellOutline,
  mdiCallSplit,
  mdiCodeBraces,
  mdiCog,
  mdiFlashOutline,
  mdiMotionPlayOutline,
  mdiPalette,
  mdiPlayCircleOutline,
  mdiRepeat,
  mdiShieldCheckOutline,
  mdiStopCircleOutline,
  mdiTimerSand,
  mdiTransitConnection,
  mdiSourceBranch,
  mdiFormatListNumbered,
  mdiDevices,
} from "@mdi/js";
import type { StepKind } from "./step-model";

const ICONS: Record<StepKind, string> = {
  trigger: mdiFlashOutline,
  condition: mdiShieldCheckOutline,
  service: mdiPlayCircleOutline,
  choose: mdiCallSplit,
  if: mdiSourceBranch,
  repeat: mdiRepeat,
  sequence: mdiFormatListNumbered,
  parallel: mdiTransitConnection,
  delay: mdiTimerSand,
  wait_template: mdiTimerSand,
  wait_for_trigger: mdiMotionPlayOutline,
  event: mdiBellOutline,
  variables: mdiCodeBraces,
  stop: mdiStopCircleOutline,
  device: mdiDevices,
  scene: mdiPalette,
  other: mdiCog,
};

export const stepKindIcon = (kind: StepKind): string => ICONS[kind];

/** Like `stepKindIcon`, for a kind name that may not be one of ours. */
export const iconForKindName = (kind: string): string =>
  (ICONS as Record<string, string>)[kind] ?? ICONS.other;
