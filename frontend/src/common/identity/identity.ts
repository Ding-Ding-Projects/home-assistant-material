/**
 * The name and logo a person chooses for this app in this browser.
 *
 * Only what the interface shows changes: the rail header, the tab title and
 * the About page. Files, updates, diagnostics, the web app manifest and the
 * legal notes keep the product's own name.
 */
import {
  limitCombiningMarks,
  stripHiddenCharacters,
} from "../string/hidden-characters";

export const PRODUCT_NAME = "Home Assistant Material";

export const IDENTITY_STORAGE_KEY = "ha-material-identity";
export const IDENTITY_CHANGED_EVENT = "ha-identity-changed";

export const NAME_MAX_LENGTH = 40;
export const SHORT_NAME_MAX_LENGTH = 12;
/** A stored picture may not be larger than this, measured in bytes. */
export const LOGO_MAX_BYTES = 200 * 1024;
/** A picture that is picked may not be larger than this before resizing. */
export const LOGO_SOURCE_MAX_BYTES = 8 * 1024 * 1024;
export const LOGO_SIZE = 192;
/** A picked picture may not have more pixels than this when it is drawn. */
export const LOGO_SOURCE_MAX_PIXELS = 24_000_000;
/** At most this many combining marks are kept after a letter in a name. */
const MAX_COMBINING_MARKS = 2;

export const LOGO_MARKS = ["house", "heart", "network", "bulb"] as const;
export type LogoMark = (typeof LOGO_MARKS)[number];

export const LOGO_ACCENTS = ["tonal", "white", "outline"] as const;
export type LogoAccent = (typeof LOGO_ACCENTS)[number];

export const LOGO_FITS = ["fill", "inside"] as const;
export type LogoFit = (typeof LOGO_FITS)[number];

/** No scripts can travel in these types, unlike a vector picture. */
export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type IdentityLogo =
  { kind: "mark"; mark: LogoMark } | { kind: "image"; dataUrl: string };

export interface Identity {
  name?: string;
  shortName?: string;
  logo?: IdentityLogo;
  accent?: LogoAccent;
}

const clip = (text: string, max: number): string =>
  Array.from(text).slice(0, max).join("");

/**
 * Collapses white space and applies the limit. Control characters below 32 become
 * spaces. Direction overrides, zero-width and other hidden characters are
 * removed, and a letter keeps only a few combining marks. A name that holds
 * nothing visible is empty.
 */
export const normalizeName = (value: string, max = NAME_MAX_LENGTH): string => {
  const spaced = Array.from(value)
    .map((char) => {
      const code = char.codePointAt(0)!;
      return code < 32 || code === 127 ? " " : char;
    })
    .join("");
  const visible = limitCombiningMarks(
    stripHiddenCharacters(spaced),
    MAX_COMBINING_MARKS
  )
    .replace(/\s+/g, " ")
    .trim();
  return /[^\p{M}\s]/u.test(visible) ? clip(visible, max) : "";
};

export const isAllowedImageType = (type: string): boolean =>
  (ALLOWED_IMAGE_TYPES as readonly string[]).includes(type.toLowerCase());

/** The picture type a file really is, from its first bytes, if allowed. */
export const imageTypeFromBytes = (bytes: Uint8Array): string | undefined => {
  const starts = (...values: number[]) =>
    values.every((value, index) => bytes[index] === value);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
    return "image/png";
  }
  if (starts(0xff, 0xd8, 0xff)) {
    return "image/jpeg";
  }
  if (
    starts(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return undefined;
};

/** True when a picture's size in pixels is within what may be drawn. */
export const isWithinPixelCap = (width: number, height: number): boolean =>
  width > 0 && height > 0 && width * height <= LOGO_SOURCE_MAX_PIXELS;

const DATA_URL =
  /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

/** The size in bytes of the data inside a base64 data URL, or -1. */
export const dataUrlBytes = (url: string): number => {
  const match = DATA_URL.exec(url);
  if (!match) {
    return -1;
  }
  const data = match[1];
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - padding;
};

/** True when a stored picture is an allowed type and small enough. */
export const isAcceptableLogoUrl = (url: unknown): url is string => {
  if (typeof url !== "string") {
    return false;
  }
  const bytes = dataUrlBytes(url);
  if (bytes <= 0 || bytes > LOGO_MAX_BYTES) {
    return false;
  }
  // The first bytes must be the type the URL says it is.
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+)/.exec(
    url
  );
  if (!match) {
    return false;
  }
  try {
    const head = atob(match[2].slice(0, 16));
    const bytesHead = Uint8Array.from(head, (char) => char.charCodeAt(0));
    return imageTypeFromBytes(bytesHead) === match[1];
  } catch (_err: any) {
    return false;
  }
};

export interface CropRect {
  /** The part of the picture that is drawn. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Where it is drawn on a square canvas of `size`. */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

/**
 * Works out how a picture lands on a square logo. "fill" crops the picture
 * to a square around the focus point (0 to 1 on each axis); "inside" draws
 * the whole picture, centred, with the background showing around it.
 */
export const cropRect = (
  width: number,
  height: number,
  fit: LogoFit,
  focus: { x: number; y: number },
  size = LOGO_SIZE
): CropRect => {
  if (fit === "inside") {
    const scale = size / Math.max(width, height);
    const dw = Math.max(1, Math.round(width * scale));
    const dh = Math.max(1, Math.round(height * scale));
    return {
      sx: 0,
      sy: 0,
      sw: width,
      sh: height,
      dx: Math.round((size - dw) / 2),
      dy: Math.round((size - dh) / 2),
      dw,
      dh,
    };
  }
  const side = Math.min(width, height);
  const fx = clamp(focus.x, 0, 1);
  const fy = clamp(focus.y, 0, 1);
  return {
    sx: Math.round(clamp(fx * width - side / 2, 0, width - side)),
    sy: Math.round(clamp(fy * height - side / 2, 0, height - side)),
    sw: side,
    sh: side,
    dx: 0,
    dy: 0,
    dw: size,
    dh: size,
  };
};

/** Reads whatever was stored and keeps only what is valid. */
export const sanitizeIdentity = (raw: unknown): Identity => {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const data = raw as Record<string, unknown>;
  const identity: Identity = {};
  if (typeof data.name === "string") {
    const name = normalizeName(data.name);
    if (name) {
      identity.name = name;
    }
  }
  if (typeof data.shortName === "string") {
    const shortName = normalizeName(data.shortName, SHORT_NAME_MAX_LENGTH);
    if (shortName) {
      identity.shortName = shortName;
    }
  }
  const logo = data.logo as Record<string, unknown> | undefined;
  if (logo && typeof logo === "object") {
    if (
      logo.kind === "mark" &&
      (LOGO_MARKS as readonly unknown[]).includes(logo.mark)
    ) {
      identity.logo = { kind: "mark", mark: logo.mark as LogoMark };
    } else if (logo.kind === "image" && isAcceptableLogoUrl(logo.dataUrl)) {
      identity.logo = { kind: "image", dataUrl: logo.dataUrl };
    }
  }
  if ((LOGO_ACCENTS as readonly unknown[]).includes(data.accent)) {
    identity.accent = data.accent as LogoAccent;
  }
  return identity;
};

/** True when no field of the identity is set. */
export const isEmptyIdentity = (identity: Identity): boolean =>
  Object.keys(identity).length === 0;

/** The key under which the shared identity is stored in system data. */
export const SHARED_IDENTITY_KEY = "identity";

let sharedIdentity: Identity = {};

/** What this browser itself stored, ignoring any shared value. */
export const readLocalIdentity = (): Identity => {
  try {
    const stored = window.localStorage.getItem(IDENTITY_STORAGE_KEY);
    return stored ? sanitizeIdentity(JSON.parse(stored)) : {};
  } catch (_err: any) {
    return {};
  }
};

/** The identity stored for everyone, as last received from the server. */
export const readSharedIdentity = (): Identity => sharedIdentity;

/**
 * The identity in effect: this browser's own choice when it has one,
 * otherwise the one stored for everyone.
 */
export const readIdentity = (): Identity => {
  const local = readLocalIdentity();
  return isEmptyIdentity(local) ? sharedIdentity : local;
};

const announce = () => {
  window.dispatchEvent(new CustomEvent(IDENTITY_CHANGED_EVENT));
};

// Another tab of this browser may change the stored identity. Tell this tab,
// so nothing keeps showing the old name until a reload.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (ev: StorageEvent) => {
    if (ev.key === IDENTITY_STORAGE_KEY || ev.key === null) {
      announce();
    }
  });
}

/**
 * Takes the value received from system data. Another administrator wrote it,
 * so it is validated exactly like a locally stored value.
 */
export const setSharedIdentity = (raw: unknown): void => {
  const clean = sanitizeIdentity(raw);
  if (JSON.stringify(clean) === JSON.stringify(sharedIdentity)) {
    return;
  }
  sharedIdentity = clean;
  announce();
};

/** Saves the identity. Returns false when the browser refuses the write. */
export const writeIdentity = (identity: Identity): boolean => {
  const clean = sanitizeIdentity(identity);
  try {
    if (Object.keys(clean).length) {
      window.localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(clean));
    } else {
      window.localStorage.removeItem(IDENTITY_STORAGE_KEY);
    }
  } catch (_err: any) {
    return false;
  }
  announce();
  return true;
};

export const resetIdentity = (): boolean => writeIdentity({});

/** The name shown in the interface: the chosen one or the given fallback. */
export const displayName = (
  identity: Identity,
  fallback = PRODUCT_NAME
): string => identity.name || fallback;

/** The text after the page name in the tab title. */
export const tabTitleSuffix = (): string =>
  readIdentity().name || "Home Assistant";
