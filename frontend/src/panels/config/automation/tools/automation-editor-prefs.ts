import type { ReactiveController, ReactiveControllerHost } from "lit";
import { getStorage } from "../../../../common/decorators/storage";
import {
  safeGetStored,
  safeSetStored,
} from "../../../../common/preferences/safe-storage";
import { isFastModeActive } from "./automation-fast";
import type {
  EditorLevel,
  FastModePreferences,
} from "./automation-editor-level";
import {
  EDITOR_LEVEL_STORAGE_KEY,
  FAST_MODE_STORAGE_KEY,
  parseEditorLevel,
  parseFastMode,
} from "./automation-editor-level";

/**
 * The editor level and fast mode choices of this person, shared by every list
 * and row of the automation editor. Rows read it while they render, and a
 * controller asks them to render again when a choice or the size of the
 * configuration changes whether fast mode is on.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

let level: EditorLevel = parseEditorLevel(
  safeGetStored<unknown>(EDITOR_LEVEL_STORAGE_KEY)
);
let fast: FastModePreferences = parseFastMode(
  safeGetStored<unknown>(FAST_MODE_STORAGE_KEY)
);
let configRows = 0;
let watching = false;

const notify = () => listeners.forEach((listener) => listener());

const watchStorage = () => {
  if (watching) {
    return;
  }
  watching = true;
  try {
    getStorage().subscribeChanges(EDITOR_LEVEL_STORAGE_KEY, (_old, value) => {
      level = parseEditorLevel(value);
      notify();
    });
    getStorage().subscribeChanges(FAST_MODE_STORAGE_KEY, (_old, value) => {
      fast = parseFastMode(value);
      notify();
    });
  } catch (_err) {
    // Storage is unavailable; the choices then last for this page only.
  }
};

export const getEditorLevel = (): EditorLevel => level;

export const setEditorLevel = (next: EditorLevel): void => {
  if (next === level) {
    return;
  }
  level = next;
  safeSetStored(EDITOR_LEVEL_STORAGE_KEY, next);
  notify();
};

export const getFastModePreferences = (): FastModePreferences => fast;

export const setFastModePreferences = (
  next: Partial<FastModePreferences>
): void => {
  fast = parseFastMode({ ...fast, ...next });
  safeSetStored(FAST_MODE_STORAGE_KEY, fast);
  notify();
};

/** Tells the editor how many rows the open configuration holds. */
export const setConfigRowCount = (rows: number): void => {
  const before = isFastActive();
  configRows = rows;
  if (before !== isFastActive()) {
    notify();
  }
};

export const getConfigRowCount = (): number => configRows;

/** True while fast mode is on for the configuration that is open. */
export const isFastActive = (): boolean =>
  isFastModeActive(configRows, fast.enabled, fast.threshold);

/** Asks every row and list that reads these choices to render again. */
export const notifyEditorPrefsChanged = (): void => notify();

export const subscribeEditorPrefs = (listener: Listener): (() => void) => {
  watchStorage();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Renders the host again when the editor level or fast mode changes. */
export class EditorPrefsController implements ReactiveController {
  private _unsubscribe?: () => void;

  constructor(private _host: ReactiveControllerHost) {
    _host.addController(this);
  }

  hostConnected() {
    this._unsubscribe = subscribeEditorPrefs(() => this._host.requestUpdate());
  }

  hostDisconnected() {
    this._unsubscribe?.();
    this._unsubscribe = undefined;
  }
}
