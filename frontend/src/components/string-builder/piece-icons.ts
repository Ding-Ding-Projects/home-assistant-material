import {
  mdiCalendarClock,
  mdiCodeBraces,
  mdiCounter,
  mdiFormatText,
  mdiNumeric,
  mdiSourceBranch,
  mdiTagText,
  mdiTagOutline,
  mdiTimerSand,
  mdiTune,
} from "@mdi/js";
import type { PieceKind } from "../../common/string-builder/types";

export const PIECE_ICONS: Record<PieceKind, string> = {
  text: mdiFormatText,
  state: mdiTune,
  attribute: mdiTagOutline,
  name: mdiTagText,
  datetime: mdiCalendarClock,
  elapsed: mdiTimerSand,
  number: mdiNumeric,
  condition: mdiSourceBranch,
  count: mdiCounter,
  raw: mdiCodeBraces,
};
