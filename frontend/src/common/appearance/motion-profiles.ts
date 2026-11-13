import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import { getStorage } from "../decorators/storage";
import {
  subscribeSyncClaimed,
  syncCacheUsable,
} from "../instance-sync/sync-owner";

/**
 * Motion profiles: a master switch, a speed factor and, for each kind of
 * element, a duration and a curve.
 *
 * A profile is turned into theme variables that are written to the document
 * root, so every component that reads the motion tokens follows it. The
 * theme's own values are never changed: a profile that equals the theme writes
 * nothing, and a person who asks for reduced motion (system setting, the
 * accessibility tool, or low stimulation) always keeps motion off, because
 * the stylesheet this produces only applies while none of them is on.
 *
 * Everything that comes from storage is sanitised here, so a damaged value
 * can never put anything but a bounded number into a style.
 */

export const MOTION_STORAGE_KEY = "motionProfiles";

export type MotionKindId =
  | "cards"
  | "dialogs"
  | "sheets"
  | "menus"
  | "buttons"
  | "switches"
  | "lists"
  | "pages"
  | "toasts";

export type NamedCurveId = "linear" | "ease" | "soft" | "smooth" | "spring";

export type CurveId = NamedCurveId | "custom";

export type CurvePoints = [number, number, number, number];

export const NAMED_CURVE_IDS: NamedCurveId[] = [
  "linear",
  "ease",
  "soft",
  "smooth",
  "spring",
];

/** The theme's curves (smooth and spring) and the CSS keyword curves. */
export const NAMED_CURVES: Record<NamedCurveId, CurvePoints> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  soft: [0, 0, 0.58, 1],
  smooth: [0.2, 0, 0, 1],
  spring: [0.2, 1.25, 0.32, 1],
};

export const CURVE_X_MIN = 0;
export const CURVE_X_MAX = 1;
export const CURVE_Y_MIN = -0.5;
export const CURVE_Y_MAX = 1.5;

export const DURATION_MIN = 1;
export const DURATION_MAX = 4000;

export const SPEED_MIN = 0.25;
export const SPEED_MAX = 2;
export const DEFAULT_SPEED = 1;

export const PROFILE_NAME_MAX = 40;
export const MAX_CUSTOM_PROFILES = 12;

export interface MotionCurve {
  id: CurveId;
  points: CurvePoints;
}

export interface MotionKindSetting {
  /** Off makes this kind of element change at once. */
  enabled: boolean;
  /** Milliseconds, before the speed factor. */
  duration: number;
  curve: MotionCurve;
}

export interface MotionProfile {
  id: string;
  /** Empty for a built-in profile, whose name is a translation. */
  name: string;
  builtIn: boolean;
  /** Off makes all motion change at once. */
  master: boolean;
  /** 2 is twice as fast, 0.5 half as fast. */
  speed: number;
  kinds: Record<MotionKindId, MotionKindSetting>;
}

export interface MotionSettings {
  activeId: string;
  /** The person's own profiles; the built-in ones are never stored. */
  custom: MotionProfile[];
}

export interface MotionKindDefinition {
  id: MotionKindId;
  /** The theme's own duration for this kind, in milliseconds. */
  duration: number;
  /** The theme's own curve for this kind. */
  curve: NamedCurveId;
  /** False where the component fixes its own easing. */
  adjustableCurve: boolean;
  /** The variables that carry the duration. */
  durationVars: string[];
  /** The variable that carries the curve. */
  curveVar?: string;
}

export const MOTION_KINDS: MotionKindDefinition[] = [
  {
    id: "cards",
    duration: 450,
    curve: "spring",
    adjustableCurve: true,
    durationVars: ["--ha-motion-cards-duration"],
    curveVar: "--ha-motion-cards-curve",
  },
  {
    id: "dialogs",
    duration: 200,
    curve: "ease",
    adjustableCurve: false,
    durationVars: ["--ha-dialog-show-duration", "--ha-dialog-hide-duration"],
  },
  {
    id: "sheets",
    duration: 300,
    curve: "ease",
    adjustableCurve: false,
    durationVars: ["--ha-motion-sheets-duration"],
  },
  {
    id: "menus",
    duration: 250,
    curve: "spring",
    adjustableCurve: true,
    durationVars: ["--ha-motion-menus-duration"],
    curveVar: "--ha-motion-menus-curve",
  },
  {
    id: "buttons",
    duration: 250,
    curve: "spring",
    adjustableCurve: true,
    durationVars: ["--ha-motion-buttons-duration"],
    curveVar: "--ha-motion-buttons-curve",
  },
  {
    id: "switches",
    duration: 250,
    curve: "spring",
    adjustableCurve: true,
    durationVars: ["--ha-motion-switches-duration"],
    curveVar: "--ha-motion-switches-curve",
  },
  {
    id: "lists",
    duration: 150,
    curve: "soft",
    adjustableCurve: true,
    durationVars: ["--ha-motion-lists-duration"],
    curveVar: "--ha-motion-lists-curve",
  },
  {
    id: "pages",
    duration: 250,
    curve: "ease",
    adjustableCurve: true,
    durationVars: ["--ha-motion-pages-duration"],
    curveVar: "--ha-motion-pages-curve",
  },
  {
    id: "toasts",
    duration: 150,
    curve: "ease",
    adjustableCurve: true,
    durationVars: ["--ha-motion-toasts-duration"],
    curveVar: "--ha-motion-toasts-curve",
  },
];

export const MOTION_KIND_IDS: MotionKindId[] = MOTION_KINDS.map(
  (kind) => kind.id
);

export const motionKindDefinition = (id: MotionKindId): MotionKindDefinition =>
  MOTION_KINDS.find((kind) => kind.id === id)!;

/** The theme's general duration tokens, in milliseconds. */
export const THEME_DURATIONS: Record<string, number> = {
  "--ha-animation-duration-instant": 75,
  "--ha-animation-duration-fast": 150,
  "--ha-animation-duration-normal": 250,
  "--ha-animation-duration-slow": 350,
  "--ha-animation-duration-enter": 450,
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const round = (value: number, digits: number): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === "string" && value.trim() !== "") {
    value = Number(value);
  }
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
};

export const sanitizeDuration = (value: unknown, fallback: number): number => {
  const number = toNumber(value);
  return number === undefined
    ? fallback
    : Math.round(clamp(number, DURATION_MIN, DURATION_MAX));
};

export const sanitizeSpeed = (value: unknown): number => {
  const number = toNumber(value);
  return number === undefined
    ? DEFAULT_SPEED
    : round(clamp(number, SPEED_MIN, SPEED_MAX), 2);
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const clampPoint = (index: number, value: number): number =>
  index % 2 === 0
    ? round(clamp(value, CURVE_X_MIN, CURVE_X_MAX), 2)
    : round(clamp(value, CURVE_Y_MIN, CURVE_Y_MAX), 2);

export const namedCurve = (id: NamedCurveId): MotionCurve => ({
  id,
  points: [...NAMED_CURVES[id]] as CurvePoints,
});

/** A curve from four numbers, each held to its bounds. */
export const customCurve = (points: readonly unknown[]): MotionCurve => {
  const clean = [0, 1, 2, 3].map((index) =>
    clampPoint(index, toNumber(points[index]) ?? NAMED_CURVES.linear[index])
  ) as CurvePoints;
  const named = NAMED_CURVE_IDS.find((id) =>
    NAMED_CURVES[id].every((value, index) => value === clean[index])
  );
  return { id: named ?? "custom", points: clean };
};

export const sanitizeCurve = (
  value: unknown,
  fallback: NamedCurveId
): MotionCurve => {
  if (!isObject(value)) {
    return namedCurve(fallback);
  }
  if (
    typeof value.id === "string" &&
    (NAMED_CURVE_IDS as string[]).includes(value.id)
  ) {
    return namedCurve(value.id as NamedCurveId);
  }
  if (Array.isArray(value.points) && value.points.length === 4) {
    return customCurve(value.points as unknown[]);
  }
  return namedCurve(fallback);
};

export const curveToCss = (curve: MotionCurve): string =>
  `cubic-bezier(${curve.points.join(", ")})`;

export const sameCurve = (a: MotionCurve, b: MotionCurve): boolean =>
  a.points.every((value, index) => value === b.points[index]);

const defaultKinds = (): Record<MotionKindId, MotionKindSetting> => {
  const kinds = {} as Record<MotionKindId, MotionKindSetting>;
  for (const kind of MOTION_KINDS) {
    kinds[kind.id] = {
      enabled: true,
      duration: kind.duration,
      curve: namedCurve(kind.curve),
    };
  }
  return kinds;
};

/** The profile that matches the theme exactly. */
export const standardProfile = (): MotionProfile => ({
  id: "standard",
  name: "",
  builtIn: true,
  master: true,
  speed: 1,
  kinds: defaultKinds(),
});

const withCurve = (curve: NamedCurveId): MotionProfile["kinds"] => {
  const kinds = defaultKinds();
  for (const kind of MOTION_KINDS) {
    if (kind.adjustableCurve) {
      kinds[kind.id].curve = namedCurve(curve);
    }
  }
  return kinds;
};

export const BUILT_IN_PROFILES: MotionProfile[] = [
  standardProfile(),
  {
    id: "calm",
    name: "",
    builtIn: true,
    master: true,
    speed: 0.75,
    kinds: withCurve("smooth"),
  },
  {
    id: "lively",
    name: "",
    builtIn: true,
    master: true,
    speed: 1.25,
    kinds: withCurve("spring"),
  },
  {
    id: "none",
    name: "",
    builtIn: true,
    master: false,
    speed: 1,
    kinds: defaultKinds(),
  },
];

export const DEFAULT_MOTION_SETTINGS: MotionSettings = {
  activeId: "standard",
  custom: [],
};

const PROFILE_ID = /^[a-z0-9-]{1,24}$/;

const sanitizeName = (value: unknown): string =>
  typeof value === "string"
    ? value
        .replace(/\p{Cc}/gu, " ")
        .trim()
        .slice(0, PROFILE_NAME_MAX)
    : "";

/** Turns anything that was stored for one profile into a valid profile. */
export const normalizeProfile = (
  stored: unknown,
  id: string,
  name: string
): MotionProfile => {
  const source = isObject(stored) ? stored : {};
  const storedKinds = isObject(source.kinds) ? source.kinds : {};
  const kinds = {} as Record<MotionKindId, MotionKindSetting>;
  for (const kind of MOTION_KINDS) {
    const item = isObject(storedKinds[kind.id]) ? storedKinds[kind.id] : {};
    const entry = item as Record<string, unknown>;
    kinds[kind.id] = {
      enabled: entry.enabled !== false,
      duration: sanitizeDuration(entry.duration, kind.duration),
      curve: kind.adjustableCurve
        ? sanitizeCurve(entry.curve, kind.curve)
        : namedCurve(kind.curve),
    };
  }
  return {
    id,
    name,
    builtIn: false,
    master: source.master !== false,
    speed: sanitizeSpeed(source.speed),
    kinds,
  };
};

/** Turns anything that was stored into valid settings. */
export const normalizeMotionSettings = (stored?: unknown): MotionSettings => {
  let source = stored;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch (_err) {
      source = undefined;
    }
  }
  if (!isObject(source)) {
    return { activeId: "standard", custom: [] };
  }
  const custom: MotionProfile[] = [];
  const seen = new Set<string>(BUILT_IN_PROFILES.map((profile) => profile.id));
  if (Array.isArray(source.custom)) {
    for (const item of source.custom) {
      if (custom.length >= MAX_CUSTOM_PROFILES || !isObject(item)) {
        continue;
      }
      const id = typeof item.id === "string" ? item.id : "";
      if (!PROFILE_ID.test(id) || seen.has(id)) {
        continue;
      }
      seen.add(id);
      custom.push(normalizeProfile(item, id, sanitizeName(item.name)));
    }
  }
  const activeId =
    typeof source.activeId === "string" && seen.has(source.activeId)
      ? source.activeId
      : "standard";
  return { activeId, custom };
};

export const allProfiles = (settings: MotionSettings): MotionProfile[] => [
  ...BUILT_IN_PROFILES,
  ...settings.custom,
];

/** The profile in use. */
export const activeProfile = (settings: MotionSettings): MotionProfile =>
  allProfiles(settings).find((profile) => profile.id === settings.activeId) ??
  BUILT_IN_PROFILES[0];

/** True when nothing differs from the theme, so nothing has to be written. */
export const isDefaultProfile = (profile: MotionProfile): boolean =>
  profile.master &&
  profile.speed === 1 &&
  MOTION_KINDS.every((kind) => {
    const setting = profile.kinds[kind.id];
    return (
      setting.enabled &&
      setting.duration === kind.duration &&
      (!kind.adjustableCurve ||
        sameCurve(setting.curve, namedCurve(kind.curve)))
    );
  });

/**
 * The duration in milliseconds a kind of element ends up with: 1 when motion
 * is off as a whole or for that kind, otherwise the duration divided by the
 * speed factor.
 */
export const effectiveDuration = (
  profile: MotionProfile,
  id: MotionKindId
): number => {
  const setting = profile.kinds[id];
  if (!profile.master || !setting.enabled) {
    return DURATION_MIN;
  }
  return Math.round(
    clamp(setting.duration / profile.speed, DURATION_MIN, DURATION_MAX)
  );
};

/** The curve a kind of element ends up with. */
export const effectiveCurve = (
  profile: MotionProfile,
  id: MotionKindId
): MotionCurve => {
  const definition = motionKindDefinition(id);
  return definition.adjustableCurve
    ? profile.kinds[id].curve
    : namedCurve(definition.curve);
};

/**
 * The variables a profile writes on the document root. Empty for a profile
 * that equals the theme. Components read the per-kind variables with the
 * theme's own value as the fallback.
 */
export const profileToVariables = (
  profile: MotionProfile
): Record<string, string> => {
  if (isDefaultProfile(profile)) {
    return {};
  }
  const variables: Record<string, string> = {};
  if (!profile.master || profile.speed !== 1) {
    for (const [token, base] of Object.entries(THEME_DURATIONS)) {
      variables[token] = profile.master
        ? `${Math.round(clamp(base / profile.speed, DURATION_MIN, DURATION_MAX))}ms`
        : `${DURATION_MIN}ms`;
    }
  }
  for (const kind of MOTION_KINDS) {
    const setting = profile.kinds[kind.id];
    const changed =
      !profile.master ||
      !setting.enabled ||
      profile.speed !== 1 ||
      setting.duration !== kind.duration;
    if (changed) {
      for (const name of kind.durationVars) {
        variables[name] = `${effectiveDuration(profile, kind.id)}ms`;
      }
    }
    if (kind.curveVar && !sameCurve(setting.curve, namedCurve(kind.curve))) {
      variables[kind.curveVar] = curveToCss(setting.curve);
    }
  }
  return variables;
};

const GUARD = "html:not([data-a11y-reduce-motion]):not([data-low-stimulation])";

/**
 * The stylesheet text for a profile, empty when it equals the theme. It only
 * applies while the system does not ask for reduced motion and neither the
 * accessibility tool nor low stimulation is on, so those always win.
 */
export const profileToCss = (profile: MotionProfile): string => {
  const variables = profileToVariables(profile);
  const entries = Object.entries(variables);
  if (!entries.length) {
    return "";
  }
  const declarations = entries
    .map(([name, value]) => `${name}: ${value};`)
    .join(" ");
  let rules = `${GUARD} { ${declarations} }`;
  if (variables["--ha-motion-pages-duration"]) {
    const pseudo = ["group", "old", "new"]
      .map((part) => `${GUARD}::view-transition-${part}(*)`)
      .join(", ");
    rules += `\n${pseudo} { animation-duration: var(--ha-motion-pages-duration); animation-timing-function: var(--ha-motion-pages-curve, ease); }`;
  }
  return `@media (prefers-reduced-motion: no-preference) {\n${rules}\n}`;
};

export type MotionLock = "system" | "tool" | "calm";

/** Why motion stays off whatever the profile says, if it does. */
export const motionLockReason = (state: {
  systemReduced: boolean;
  toolReduced: boolean;
  lowStimulation: boolean;
}): MotionLock | undefined => {
  if (state.systemReduced) {
    return "system";
  }
  if (state.toolReduced) {
    return "tool";
  }
  if (state.lowStimulation) {
    return "calm";
  }
  return undefined;
};

/** Reads the three switches that keep motion off from this page. */
export const currentMotionLock = (): MotionLock | undefined => {
  const root = document.documentElement;
  return motionLockReason({
    systemReduced:
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
    toolReduced: root.hasAttribute("data-a11y-reduce-motion"),
    lowStimulation: root.hasAttribute("data-low-stimulation"),
  });
};

/** A fresh id for one of the person's own profiles. */
export const newProfileId = (settings: MotionSettings): string => {
  const used = new Set(allProfiles(settings).map((profile) => profile.id));
  for (let index = 1; index <= MAX_CUSTOM_PROFILES + 1; index++) {
    const id = `mine-${index}`;
    if (!used.has(id)) {
      return id;
    }
  }
  return `mine-${Date.now().toString(36)}`;
};

const cloneKinds = (kinds: MotionProfile["kinds"]): MotionProfile["kinds"] => {
  const copy = {} as MotionProfile["kinds"];
  for (const kind of MOTION_KIND_IDS) {
    copy[kind] = {
      ...kinds[kind],
      curve: {
        id: kinds[kind].curve.id,
        points: [...kinds[kind].curve.points],
      },
    };
  }
  return copy;
};

/** True when the person can keep another profile of their own. */
export const canAddProfile = (settings: MotionSettings): boolean =>
  settings.custom.length < MAX_CUSTOM_PROFILES;

/**
 * Applies an edit to the profile in use. A built-in profile is never changed:
 * the edit goes to a new profile of the person's own, which is then in use.
 */
export const editActiveProfile = (
  settings: MotionSettings,
  forkName: string,
  edit: (profile: MotionProfile) => MotionProfile
): MotionSettings => {
  const active = activeProfile(settings);
  if (!active.builtIn) {
    const edited = normalizeProfile(edit(active), active.id, active.name);
    return {
      ...settings,
      custom: settings.custom.map((profile) =>
        profile.id === active.id ? edited : profile
      ),
    };
  }
  if (!canAddProfile(settings)) {
    return settings;
  }
  const id = newProfileId(settings);
  const copy: MotionProfile = {
    ...active,
    id,
    name: sanitizeName(forkName),
    builtIn: false,
    kinds: cloneKinds(active.kinds),
  };
  const edited = normalizeProfile(edit(copy), id, copy.name);
  return { activeId: id, custom: [...settings.custom, edited] };
};

/** A copy of the profile in use, as a new profile of the person's own. */
export const copyActiveToNew = (
  settings: MotionSettings,
  name: string
): MotionSettings => {
  if (!canAddProfile(settings)) {
    return settings;
  }
  const active = activeProfile(settings);
  const id = newProfileId(settings);
  const copy = normalizeProfile(
    { ...active, kinds: cloneKinds(active.kinds) },
    id,
    sanitizeName(name)
  );
  return { activeId: id, custom: [...settings.custom, copy] };
};

export const renameProfile = (
  settings: MotionSettings,
  id: string,
  name: string
): MotionSettings => ({
  ...settings,
  custom: settings.custom.map((profile) =>
    profile.id === id ? { ...profile, name: sanitizeName(name) } : profile
  ),
});

/** Removes one of the person's own profiles; in use falls back to Standard. */
export const removeProfile = (
  settings: MotionSettings,
  id: string
): MotionSettings => ({
  activeId: settings.activeId === id ? "standard" : settings.activeId,
  custom: settings.custom.filter((profile) => profile.id !== id),
});

export const selectProfile = (
  settings: MotionSettings,
  id: string
): MotionSettings =>
  allProfiles(settings).some((profile) => profile.id === id)
    ? { ...settings, activeId: id }
    : settings;

/** Puts the profile in use back to the theme's values. */
export const resetToTheme = (settings: MotionSettings): MotionSettings => ({
  ...settings,
  activeId: "standard",
});

/** Changes one kind of element in a profile. */
export const withKind = (
  profile: MotionProfile,
  id: MotionKindId,
  patch: Partial<MotionKindSetting>
): MotionProfile => ({
  ...profile,
  kinds: { ...profile.kinds, [id]: { ...profile.kinds[id], ...patch } },
});

export const getMotionSettings = (): MotionSettings => {
  if (!syncCacheUsable()) {
    return normalizeMotionSettings(undefined);
  }
  // A damaged or blocked store must not stop the page: fall back to defaults.
  try {
    return normalizeMotionSettings(getStorage().getValue(MOTION_STORAGE_KEY));
  } catch (_err) {
    return normalizeMotionSettings(undefined);
  }
};

export const setMotionSettings = (settings: MotionSettings) => {
  getStorage().setValue(MOTION_STORAGE_KEY, normalizeMotionSettings(settings));
};

export const subscribeMotionSettings = (
  callback: (settings: MotionSettings) => void
): UnsubscribeFunc =>
  getStorage().subscribeChanges(MOTION_STORAGE_KEY, () =>
    callback(getMotionSettings())
  );

const STYLE_ID = "ha-motion-profile";

/** Writes the stylesheet for a profile into the document head. */
export const applyMotionProfile = (profile: MotionProfile) => {
  const css = profileToCss(profile);
  let style = document.getElementById(STYLE_ID);
  if (!css) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = css;
};

/**
 * Applies the stored profile now and whenever it changes, in this tab or
 * another. Returns the function that stops it.
 */
export const startMotionProfiles = (): UnsubscribeFunc => {
  const reapply = () => applyMotionProfile(activeProfile(getMotionSettings()));
  reapply();
  const stopChanges = subscribeMotionSettings((settings) =>
    applyMotionProfile(activeProfile(settings))
  );
  // The stored choice is held back until the signed-in account is known to
  // own the cache, so it is read again at that point.
  const stopClaim = subscribeSyncClaimed(reapply);
  // A value that arrives from the instance (or from another tab) is announced
  // as a storage event. The storage helper only follows keys it has already
  // read, and this key may not have been read yet, so it is followed here.
  const onStorage = (ev: StorageEvent) => {
    if (ev.key !== null && ev.key !== MOTION_STORAGE_KEY) {
      return;
    }
    applyMotionProfile(
      activeProfile(
        ev.key === null || !syncCacheUsable()
          ? normalizeMotionSettings(undefined)
          : normalizeMotionSettings(ev.newValue)
      )
    );
  };
  window.addEventListener("storage", onStorage);
  return () => {
    stopChanges();
    stopClaim();
    window.removeEventListener("storage", onStorage);
  };
};
