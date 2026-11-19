import type { LocalizeFunc } from "../../../common/translations/localize";
import type { LinkedCheck, LinkedFile } from "../../../data/linked_media";
import type { HomeAssistant } from "../../../types";

const PREFIX = "ui.panel.media-browser.linked";

/** The plain reason a linked file could not be fetched. */
export const linkedFailureText = (
  localize: LocalizeFunc,
  result:
    | Pick<LinkedFile, "last_failure_reason" | "last_failure_status">
    | LinkedCheck
): string => {
  const reason =
    "last_failure_reason" in result
      ? result.last_failure_reason
      : result.reason;
  const status =
    "last_failure_reason" in result
      ? result.last_failure_status
      : result.status;
  return localize(`${PREFIX}.reason.${reason ?? "cannot_connect"}` as any, {
    status: status ?? "",
  });
};

/** Who last used a linked file: a player by its name, an action or a player. */
export const linkedUsedByText = (
  hass: HomeAssistant,
  localize: LocalizeFunc,
  usedBy: string
): string => {
  if (usedBy === "action") {
    return localize(`${PREFIX}.by_action` as any);
  }
  if (usedBy === "player") {
    return localize(`${PREFIX}.by_player` as any);
  }
  return hass.states[usedBy]?.attributes.friendly_name ?? usedBy;
};
