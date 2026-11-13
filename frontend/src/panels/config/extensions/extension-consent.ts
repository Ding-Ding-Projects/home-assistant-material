import type { TemplateResult } from "lit";
import { html } from "lit";
import type {
  LovelaceResource,
  LovelaceResourcesMutableParams,
} from "../../../data/lovelace/resource";
import type {
  ExtensionAbility,
  ExtensionConsent,
} from "../../../common/extensions/extension-logic";
import {
  EXTENSION_CONSENTS_KEY,
  extensionKey,
  readConsents,
  resourceAbilities,
  sourceOf,
  withConsent,
} from "../../../common/extensions/extension-logic";
import {
  safeGetStored,
  safeSetStored,
} from "../../../common/preferences/safe-storage";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../../types";

export const loadExtensionConsents = (): ExtensionConsent[] =>
  readConsents(safeGetStored<unknown>(EXTENSION_CONSENTS_KEY));

/** Records that the signed in person agreed to this extension at this address. */
export const recordExtensionConsent = (
  hass: HomeAssistant,
  key: string,
  url: string
): ExtensionConsent[] => {
  const next = withConsent(loadExtensionConsents(), {
    key,
    url,
    by:
      hass.user?.name ??
      hass.localize("ui.panel.config.extensions.unknown_person"),
    at: new Date().toISOString(),
  });
  safeSetStored(EXTENSION_CONSENTS_KEY, next);
  return next;
};

export interface ConsentRequest {
  url: string;
  abilities: ExtensionAbility[];
  /** The address before, when the person is changing it. */
  previousUrl?: string;
}

/** The plain-words list of what an extension can do and where it comes from. */
export const renderExtensionFacts = (
  hass: HomeAssistant,
  url: string,
  abilities: ExtensionAbility[]
): TemplateResult => {
  const source = sourceOf(url, location.host);
  return html`<ul>
    ${abilities.map(
      (ability) =>
        html`<li>
          ${hass.localize(`ui.panel.config.extensions.abilities.${ability}`)}
        </li>`
    )}
    <li>
      ${
        source.kind === "other_server"
          ? hass.localize("ui.panel.config.extensions.source.other_server", {
              host: source.host ?? "",
            })
          : source.kind === "same_server"
            ? hass.localize("ui.panel.config.extensions.source.same_server")
            : hass.localize("ui.panel.config.extensions.source.unknown")
      }
    </li>
  </ul>`;
};

/**
 * Asks before an extension is added, or before its address changes, what it
 * will be able to do. The caller records the consent once the extension
 * exists (a new one has no identity before that) and stops when it is declined.
 */
export const requestExtensionConsent = async (
  element: HTMLElement,
  hass: HomeAssistant,
  request: ConsentRequest
): Promise<boolean> => {
  const changing = request.previousUrl !== undefined;
  const allowed = await showConfirmationDialog(element, {
    title: hass.localize(
      changing
        ? "ui.panel.config.extensions.consent.title_changed"
        : "ui.panel.config.extensions.consent.title_new"
    ),
    text: html`<p>${request.url}</p>
      ${
        changing
          ? html`<p>
              ${hass.localize("ui.panel.config.extensions.consent.was", {
                url: request.previousUrl,
              })}
            </p>`
          : ""
      }
      <p>${hass.localize("ui.panel.config.extensions.consent.can")}</p>
      ${renderExtensionFacts(hass, request.url, request.abilities)}
      <p>${hass.localize("ui.panel.config.extensions.consent.trust")}</p>`,
    confirmText: hass.localize("ui.panel.config.extensions.consent.allow"),
    dismissText: hass.localize("ui.panel.config.extensions.consent.deny"),
  });
  return allowed;
};

/**
 * The gate every save of a dashboard resource goes through: a new resource,
 * and an existing one whose address or type changes, need the person's
 * consent first. A resource saved with nothing changed is let through.
 * Throws when the person declines, so the form that called shows the reason.
 */
export const consentBeforeResourceSave = async (
  element: HTMLElement,
  hass: HomeAssistant,
  values: Partial<LovelaceResourcesMutableParams>,
  previous?: LovelaceResource
): Promise<void> => {
  const url = values.url ?? previous?.url;
  const type = values.res_type ?? previous?.type;
  if (!url || !type) {
    return;
  }
  if (previous && previous.url === url && previous.type === type) {
    return;
  }
  const allowed = await requestExtensionConsent(element, hass, {
    url,
    abilities: resourceAbilities(type),
    previousUrl: previous?.url,
  });
  if (!allowed) {
    throw new Error(
      hass.localize("ui.panel.config.extensions.consent.declined")
    );
  }
};

/** Records the consent for a resource that was just saved. */
export const recordResourceConsent = (
  hass: HomeAssistant,
  resource: LovelaceResource
): void => {
  recordExtensionConsent(
    hass,
    extensionKey("resource", resource.id),
    resource.url
  );
};
