import type { ReactiveControllerHost } from "lit";
import { LanguageModeController } from "../../../../common/language-mode/language-mode-controller";
import type { LocalizeKeys } from "../../../../common/translations/localize";
import type { HomeAssistant } from "../../../../types";
import { fileDownload } from "../../../../util/file_download";

const PREFIX = "ui.panel.config.integrations.transfer.";

/**
 * The export and import strings in the chosen language mode. Holding one of
 * these draws the host again when the language mode changes.
 */
export class TransferText {
  private _lang: LanguageModeController;

  constructor(
    host: ReactiveControllerHost & HTMLElement,
    private readonly _hass: () => HomeAssistant | undefined
  ) {
    this._lang = new LanguageModeController(host);
  }

  public t(key: string, values?: Record<string, string | number>): string {
    const hass = this._hass();
    if (!hass) {
      return "";
    }
    return this._lang.cachedLocalizer(hass.localize)(
      `${PREFIX}${key}` as LocalizeKeys,
      values
    );
  }
}

/** The file name a settings export is saved under. */
export const settingsFileName = (domain: string, locked: boolean): string =>
  `${domain}-settings${locked ? "-locked" : ""}.json`;

/** Save a text as a file in the browser; nothing is sent anywhere. */
export const saveTextFile = (text: string, fileName: string): void => {
  const blob = new Blob([text], { type: "application/json" });
  fileDownload(URL.createObjectURL(blob), fileName);
};
