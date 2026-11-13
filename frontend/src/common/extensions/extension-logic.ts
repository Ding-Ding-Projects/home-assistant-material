/**
 * Pure rules for the extension manager. An extension here is what the
 * product really lets someone add to the interface: a dashboard resource
 * (a script, stylesheet or page the dashboards load) or a custom panel
 * (a page set up in the server configuration). Nothing is fetched to look
 * inside them: what is said about an extension comes from its type and its
 * address alone.
 */

export type ExtensionKind = "resource" | "panel";

/** What a person agreed to, for one extension at one address. */
export interface ExtensionConsent {
  /** `resource:<id>` or `panel:<url path>`. */
  key: string;
  /** The address that was agreed to. */
  url: string;
  /** The name of the person who agreed. */
  by: string;
  /** When, as an ISO date and time. */
  at: string;
}

/** The storage key of the consents, saved with the person's other settings. */
export const EXTENSION_CONSENTS_KEY = "extensionConsents";

export const extensionKey = (kind: ExtensionKind, id: string): string =>
  `${kind}:${id}`;

/**
 * What a consent record says about an extension now: allowed at this
 * address, allowed at another address (so the address changed), or nothing
 * recorded.
 */
export type ConsentStatus = "allowed" | "changed" | "none";

export const consentStatus = (
  consents: readonly ExtensionConsent[],
  key: string,
  url: string
): ConsentStatus => {
  const found = consents.find((consent) => consent.key === key);
  if (!found) {
    return "none";
  }
  return found.url === url ? "allowed" : "changed";
};

/** The list with this consent in place of an earlier one for the same extension. */
export const withConsent = (
  consents: readonly ExtensionConsent[],
  consent: ExtensionConsent
): ExtensionConsent[] => [
  ...consents.filter((item) => item.key !== consent.key),
  consent,
];

export const withoutConsent = (
  consents: readonly ExtensionConsent[],
  key: string
): ExtensionConsent[] => consents.filter((item) => item.key !== key);

/** Keeps only well formed records from whatever the storage held. */
export const readConsents = (value: unknown): ExtensionConsent[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is ExtensionConsent =>
      !!item &&
      typeof item.key === "string" &&
      typeof item.url === "string" &&
      typeof item.by === "string" &&
      typeof item.at === "string"
  );
};

/** What an extension can do, in the words the interface uses. */
export type ExtensionAbility =
  | "runs_code"
  | "uses_session"
  | "restyle"
  | "markup"
  | "framed"
  | "external_trusted";

const CODE_TYPES = new Set(["module", "js", "html"]);

/** What a dashboard resource of this type can do once the interface loads it. */
export const resourceAbilities = (type: string): ExtensionAbility[] =>
  CODE_TYPES.has(type)
    ? type === "html"
      ? ["markup", "runs_code", "uses_session"]
      : ["runs_code", "uses_session"]
    : ["restyle"];

export interface PanelFacts {
  embed_iframe: boolean;
  trust_external: boolean;
}

/** What a custom panel can do: shown in a frame, or running in the interface. */
export const panelAbilities = (panel: PanelFacts): ExtensionAbility[] => {
  const abilities: ExtensionAbility[] = panel.embed_iframe
    ? ["framed"]
    : ["runs_code", "uses_session"];
  if (panel.trust_external) {
    abilities.push("external_trusted");
  }
  return abilities;
};

export type SourceKind = "same_server" | "other_server" | "unknown";

export interface SourceFacts {
  kind: SourceKind;
  /** The host the address names, when it names one. */
  host?: string;
}

/** Where an address points, compared with the server the interface came from. */
export const sourceOf = (url: string, ownHost: string): SourceFacts => {
  try {
    const parsed = new URL(url, `https://${ownHost}`);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { kind: "unknown" };
    }
    return parsed.host === ownHost
      ? { kind: "same_server", host: parsed.host }
      : { kind: "other_server", host: parsed.host };
  } catch (_err) {
    return { kind: "unknown" };
  }
};

/** A short name for an address: the file name without version query or extension. */
export const extensionTitle = (url: string): string => {
  const path = url.split(/[?#]/)[0];
  const last = path.split("/").filter(Boolean).pop() ?? url;
  const name = last.replace(/\.(m?js|css|html?)$/i, "");
  return name || url;
};
