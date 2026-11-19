import type { ReactiveController, ReactiveControllerHost } from "lit";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { LanguageMode } from "../preferences/personal-preferences";
import { subscribePersonalPreferences } from "../preferences/personal-preferences";
import {
  type Localize,
  type PartText,
  composeForMode,
  currentLanguageMode,
  modeText,
  textParts,
} from "./language-mode";

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
    try {
      this._unsub = subscribePersonalPreferences((prefs) => {
        if (prefs.languageMode !== this._mode) {
          this._mode = prefs.languageMode;
          this._host.requestUpdate();
        }
      });
    } catch (_err) {
      // Storage is unavailable: the mode stays English.
      this._unsub = undefined;
    }
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

  /**
   * A sentence made of several strings, built once per language and joined for
   * the mode, so no language ends up inside the other one's sentence.
   */
  public compose(
    localize: Localize,
    build: (part: PartText) => string,
    separator?: string
  ): string {
    return composeForMode(localize, build, this._mode, separator);
  }

  /** A localize function whose strings follow the mode, for markup that already calls one. */
  public localizer(localize: Localize): Localize {
    return (key, values) => modeText(localize, key, values, this._mode);
  }

  private _cached?: { source: Localize; mode: LanguageMode; fn: Localize };

  /**
   * Like `localizer`, but gives back the same function until the source or
   * the mode changes. Memoized helpers that take a localize function then
   * run again only when the mode really changes.
   */
  public cachedLocalizer<T extends Localize>(localize: T): T {
    let cached = this._cached;
    if (!cached || cached.source !== localize || cached.mode !== this._mode) {
      cached = {
        source: localize,
        mode: this._mode,
        fn: this.localizer(localize),
      };
      this._cached = cached;
    }
    return cached.fn as T;
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
