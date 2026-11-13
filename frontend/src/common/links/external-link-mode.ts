import { getStorage } from "../decorators/storage";

/**
 * Where a link to an address outside this instance opens. The product itself
 * never fetches an outside address; this only decides what happens when the
 * person activates a link they can see. The choice is stored for the person
 * and saved on the instance with their other settings.
 */

export const EXTERNAL_LINK_STORAGE_KEY = "externalLinkMode";

export const EXTERNAL_LINK_MODES = ["same_tab", "new_tab", "ask"] as const;

export type ExternalLinkMode = (typeof EXTERNAL_LINK_MODES)[number];

export const DEFAULT_EXTERNAL_LINK_MODE: ExternalLinkMode = "new_tab";

export const normalizeExternalLinkMode = (raw: unknown): ExternalLinkMode =>
  (EXTERNAL_LINK_MODES as readonly unknown[]).includes(raw)
    ? (raw as ExternalLinkMode)
    : DEFAULT_EXTERNAL_LINK_MODE;

export const readExternalLinkMode = (): ExternalLinkMode => {
  try {
    return normalizeExternalLinkMode(
      getStorage().getValue(EXTERNAL_LINK_STORAGE_KEY)
    );
  } catch (_err) {
    return DEFAULT_EXTERNAL_LINK_MODE;
  }
};

/** Saves the choice; false when browser storage refused it. */
export const writeExternalLinkMode = (mode: ExternalLinkMode): boolean => {
  try {
    getStorage().setValue(
      EXTERNAL_LINK_STORAGE_KEY,
      mode === DEFAULT_EXTERNAL_LINK_MODE ? undefined : mode
    );
    return true;
  } catch (_err) {
    return false;
  }
};

export const subscribeExternalLinkMode = (
  callback: (mode: ExternalLinkMode) => void
): (() => void) =>
  getStorage().subscribeChanges(EXTERNAL_LINK_STORAGE_KEY, (_old, value) =>
    callback(normalizeExternalLinkMode(value))
  );

/** What a click on a link should do. */
export type LinkAction =
  | { type: "default" }
  | { type: "open"; target: "_blank" | "_self"; url: string }
  | { type: "ask"; url: string };

export interface LinkInfo {
  /** The absolute address of the link. */
  href: string;
  /** The origin of this page. */
  origin: string;
  /** The link's own target attribute. */
  target: string;
  /** True for a link that downloads a file. */
  download: boolean;
  /** The link's own rel attribute. */
  rel: string | null;
}

/**
 * The address of a link that leaves this instance, or undefined for every
 * other link: this origin, other schemes (mailto, tel, the mobile app
 * scheme), downloads and links marked as the page's own business with
 * rel="external" handled elsewhere.
 */
export const outsideAddress = (info: LinkInfo): string | undefined => {
  if (info.download) {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(info.href);
  } catch (_err) {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return undefined;
  }
  if (url.origin === info.origin) {
    return undefined;
  }
  return url.href;
};

/**
 * Decides what to do with a click on a link. With the default choice a link
 * that already asks for a new tab keeps doing so and nothing is intercepted.
 */
export const decideLinkAction = (
  mode: ExternalLinkMode,
  info: LinkInfo
): LinkAction => {
  const url = outsideAddress(info);
  if (!url) {
    return { type: "default" };
  }
  if (mode === "ask") {
    return { type: "ask", url };
  }
  const target = mode === "same_tab" ? "_self" : "_blank";
  if (mode === "new_tab" && info.target === "_blank") {
    return { type: "default" };
  }
  if (mode === "same_tab" && (info.target === "" || info.target === "_self")) {
    return { type: "default" };
  }
  return { type: "open", target, url };
};
