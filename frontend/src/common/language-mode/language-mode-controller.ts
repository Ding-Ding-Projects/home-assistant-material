import type { ReactiveController, ReactiveControllerHost } from "lit";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { LanguageMode } from "../preferences/personal-preferences";
import { subscribePersonalPreferences } from "../preferences/personal-preferences";
import type { Localize } from "./language-mode";
import { currentLanguageMode, modeText, textParts } from "./language-mode";

/**
 * Re-renders its host when the language mode changes, and gives the host a
 * `text` function that follows the mode.
 *
 *   private _lang = new LanguageModeController(this);
 *   ...
 *   this._lang.text(this.hass.localize, "ui.phone.home")
 */
export class LanguageModeController implements ReactiveController {
  private _host: ReactiveControllerHost;

  private _unsub?: UnsubscribeFunc;

  private _mode: LanguageMode = currentLanguageMode();

  constructor(host: ReactiveControllerHost) {
    this._host = host;
    host.addController(this);
  }

  get mode(): LanguageMode {
    return this._mode;
  }

  hostConnected() {
    this._mode = currentLanguageMode();
    this._unsub = subscribePersonalPreferences((prefs) => {
      if (prefs.languageMode !== this._mode) {
        this._mode = prefs.languageMode;
        this._host.requestUpdate();
      }
    });
  }

  hostDisconnected() {
    this._unsub?.();
    this._unsub = undefined;
  }

  public text(
    localize: Localize,
    key: string,
    values?: Record<string, string | number>,
    separator?: string
  ): string {
    return modeText(localize, key, values, this._mode, separator);
  }

  /** The two texts apart, for layouts that put them on separate lines. */
  public parts(
    localize: Localize,
    key: string,
    values?: Record<string, string | number>
  ) {
    return textParts(localize, key, values);
  }
}
