import { FAST_MODE_DEFAULT_THRESHOLD } from "./automation-fast";

/**
 * How much of the automation editor a person sees: Simple hides the rarely
 * used parts behind "More", Advanced shows everything, and YAML is the code
 * view. The choice is personal and lives in this browser's storage, where the
 * settings registry syncs it to the person's other devices.
 */
export type EditorLevel = "simple" | "advanced" | "yaml";

export const EDITOR_LEVELS: readonly EditorLevel[] = [
  "simple",
  "advanced",
  "yaml",
];

export const EDITOR_LEVEL_STORAGE_KEY = "automation-editor-level";

export const FAST_MODE_STORAGE_KEY = "automation-fast-mode";

export const DEFAULT_EDITOR_LEVEL: EditorLevel = "advanced";

export const parseEditorLevel = (value: unknown): EditorLevel =>
  EDITOR_LEVELS.includes(value as EditorLevel)
    ? (value as EditorLevel)
    : DEFAULT_EDITOR_LEVEL;

/** The parts of the editor a level can hide. */
export type EditorPart =
  "search" | "status_bar" | "empty_conditions" | "tools_hint";

const SIMPLE_HIDDEN: readonly EditorPart[] = [
  "search",
  "status_bar",
  "empty_conditions",
  "tools_hint",
];

export const levelShows = (level: EditorLevel, part: EditorPart): boolean =>
  level !== "simple" || !SIMPLE_HIDDEN.includes(part);

/** The editor view a level needs. */
export const viewForLevel = (level: EditorLevel): "gui" | "yaml" =>
  level === "yaml" ? "yaml" : "gui";

/** The level that matches the editor view the person is in. */
export const levelForView = (
  view: "gui" | "yaml",
  chosen: EditorLevel
): EditorLevel =>
  view === "yaml" ? "yaml" : chosen === "yaml" ? "advanced" : chosen;

export interface FastModePreferences {
  /** Draw only what is on screen once the configuration is big. */
  enabled: boolean;
  /** Close big branches by default and show how many steps they hold. */
  foldBranches: boolean;
  /** Rows from which fast mode switches on. */
  threshold: number;
}

export const DEFAULT_FAST_MODE: FastModePreferences = {
  enabled: true,
  foldBranches: true,
  threshold: FAST_MODE_DEFAULT_THRESHOLD,
};

export const THRESHOLD_MIN = 20;
export const THRESHOLD_MAX = 5000;

/** Reads stored fast mode choices; anything unusable falls back to defaults. */
export const parseFastMode = (value: unknown): FastModePreferences => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_FAST_MODE };
  }
  const source = value as Record<string, unknown>;
  const threshold = Number(source.threshold);
  return {
    enabled:
      typeof source.enabled === "boolean"
        ? source.enabled
        : DEFAULT_FAST_MODE.enabled,
    foldBranches:
      typeof source.foldBranches === "boolean"
        ? source.foldBranches
        : DEFAULT_FAST_MODE.foldBranches,
    threshold:
      Number.isFinite(threshold) &&
      threshold >= THRESHOLD_MIN &&
      threshold <= THRESHOLD_MAX
        ? Math.round(threshold)
        : DEFAULT_FAST_MODE.threshold,
  };
};
