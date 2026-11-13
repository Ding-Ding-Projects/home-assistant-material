/**
 * Default dashboards per kind of device. The administrator picks one
 * dashboard for everyone (`default_panel` in the shared frontend settings) and
 * may add an override for phones, tablets, desktops and wall panels. Which
 * kind a device is gets decided locally in the browser, so nothing about the
 * device is sent anywhere. A person's own choice always wins over all of it.
 */

export const DEVICE_KINDS = [
  "phone",
  "tablet",
  "desktop",
  "wall_panel",
] as const;

export type DeviceKind = (typeof DEVICE_KINDS)[number];

/** One optional dashboard path per kind of device. */
export type DefaultPanelOverrides = Partial<Record<DeviceKind, string>>;

// The same width breakpoints the "Screen" visibility condition uses:
// mobile below 768 px, tablet from 768 px, desktop from 1024 px.
export const TABLET_MIN_WIDTH = 768;
export const DESKTOP_MIN_WIDTH = 1024;

/**
 * The kind of device for a window width. A wall panel is a device that has the
 * wall panel settings switched on in this browser; width does not decide it.
 */
export const computeDeviceKind = (
  width: number,
  wallPanelOn: boolean
): DeviceKind => {
  if (wallPanelOn) {
    return "wall_panel";
  }
  if (width >= DESKTOP_MIN_WIDTH) {
    return "desktop";
  }
  if (width >= TABLET_MIN_WIDTH) {
    return "tablet";
  }
  return "phone";
};

/** The stored overrides without anything that is not a kind and a path. */
export const normalizeOverrides = (raw: unknown): DefaultPanelOverrides => {
  const result: DefaultPanelOverrides = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return result;
  }
  for (const kind of DEVICE_KINDS) {
    const value = (raw as Record<string, unknown>)[kind];
    if (typeof value === "string" && value) {
      result[kind] = value;
    }
  }
  return result;
};

/**
 * The dashboard that opens by default. The person's own choice wins, then the
 * override for this kind of device, then the dashboard for everyone. An
 * override that points at a dashboard that does not exist (when the list of
 * known dashboards is given) is ignored, so a deleted dashboard never leaves a
 * device on an error page.
 */
export const pickDefaultPanel = (options: {
  personal?: string;
  everyone?: string;
  overrides?: unknown;
  kind: DeviceKind;
  knownPanels?: Record<string, unknown>;
}): string | undefined => {
  if (options.personal) {
    return options.personal;
  }
  const override = normalizeOverrides(options.overrides)[options.kind];
  if (
    override &&
    (!options.knownPanels ||
      Object.prototype.hasOwnProperty.call(options.knownPanels, override))
  ) {
    return override;
  }
  return options.everyone || undefined;
};

/** A copy of the overrides with one kind set; an empty path clears it. */
export const setOverride = (
  overrides: unknown,
  kind: DeviceKind,
  urlPath: string | undefined
): DefaultPanelOverrides => {
  const next = { ...normalizeOverrides(overrides) };
  if (urlPath) {
    next[kind] = urlPath;
  } else {
    delete next[kind];
  }
  return next;
};
