import { getPersonalPreferences } from "../preferences/personal-preferences";
import type { SpeechLanguage } from "./narration";
import {
  nameFromPath,
  narratorSilence,
  pickVoice,
  SPEECH_LANG_TAG,
  selectSpeech,
} from "./narration";

/**
 * The spoken narrator. It reads the name of the control that gets the
 * keyboard focus or is activated, with the browser's own speech synthesis:
 * no audio file and no network request. It is off until it is turned on, and
 * it follows the sound switch, low stimulation and quiet hours.
 *
 * A new name replaces the one being spoken, and the same name is not
 * repeated within a second, so a click that also moves the focus is read
 * once and nothing piles up.
 */

/** The same text is not spoken again within this time. */
export const REPEAT_WINDOW_MS = 1000;

const synthesis = (): SpeechSynthesis | undefined =>
  typeof window !== "undefined" && "speechSynthesis" in window
    ? window.speechSynthesis
    : undefined;

export const speechAvailable = (): boolean => !!synthesis();

export const listVoices = (): SpeechSynthesisVoice[] =>
  synthesis()?.getVoices() ?? [];

/** Calls back when the list of voices becomes known or changes. */
export const onVoicesChanged = (callback: () => void): (() => void) => {
  const synth = synthesis();
  if (!synth) {
    return () => undefined;
  }
  synth.addEventListener("voiceschanged", callback);
  return () => synth.removeEventListener("voiceschanged", callback);
};

class Narrator {
  private _enabled = false;

  private _lastText = "";

  private _lastAt = 0;

  public setEnabled(enabled: boolean) {
    if (enabled === this._enabled) {
      return;
    }
    this._enabled = enabled;
    if (enabled) {
      window.addEventListener("focusin", this._focusIn, true);
      window.addEventListener("click", this._click, true);
    } else {
      window.removeEventListener("focusin", this._focusIn, true);
      window.removeEventListener("click", this._click, true);
      synthesis()?.cancel();
    }
  }

  private _focusIn = (ev: FocusEvent) => {
    this.say(nameFromPath(ev.composedPath(), 4));
  };

  private _click = (ev: MouseEvent) => {
    this.say(nameFromPath(ev.composedPath()));
  };

  /** Speaks a name now, when the choices allow it. Returns true if it began. */
  public say(text: string, force = false): boolean {
    if (!text) {
      return false;
    }
    const prefs = getPersonalPreferences();
    if (narratorSilence(prefs)) {
      return false;
    }
    const now = Date.now();
    if (
      !force &&
      text === this._lastText &&
      now - this._lastAt < REPEAT_WINDOW_MS
    ) {
      return false;
    }
    const synth = synthesis();
    if (!synth) {
      return false;
    }
    const parts = selectSpeech(text, prefs.narratorSpeakIn);
    if (!parts.length) {
      return false;
    }
    try {
      const voices = synth.getVoices();
      const utterances: SpeechSynthesisUtterance[] = [];
      parts.forEach((part) => {
        // Only a voice that runs on this device is used. With none, this
        // part stays silent instead of falling back to the engine default,
        // which may be a network voice.
        const voice = pickVoice(
          voices,
          part.language,
          part.language === "yue"
            ? prefs.narratorVoiceCantonese
            : prefs.narratorVoiceEnglish
        );
        if (!voice) {
          return;
        }
        const utterance = new SpeechSynthesisUtterance(part.text);
        utterance.voice = voice;
        utterance.lang = voice.lang || SPEECH_LANG_TAG[part.language];
        utterance.rate = prefs.narratorRate;
        utterance.pitch = prefs.narratorPitch;
        utterances.push(utterance);
      });
      if (!utterances.length) {
        return false;
      }
      this._lastText = text;
      this._lastAt = now;
      synth.cancel();
      utterances.forEach((utterance) => synth.speak(utterance));
      return true;
    } catch (_err) {
      return false;
    }
  }

  /** Speaks a sample even while the narrator is off. */
  public sample(text: string): boolean {
    return this.say(text, true);
  }
}

export const narrator = new Narrator();

export const voiceFor = (
  language: SpeechLanguage,
  preferredUri: string
): SpeechSynthesisVoice | undefined =>
  pickVoice(listVoices(), language, preferredUri);
