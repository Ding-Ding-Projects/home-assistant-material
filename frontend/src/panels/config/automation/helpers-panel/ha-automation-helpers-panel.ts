import { mdiDelete, mdiPencil, mdiPlus } from "@mdi/js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-button";
import "../../../../components/ha-svg-icon";
import type { EntityRegistryEntry } from "../../../../data/entity/entity_registry";
import { subscribeEntityRegistry } from "../../../../data/entity/entity_registry";
import { HELPERS_CRUD } from "../../../../data/helpers_crud";
import { findRelated } from "../../../../data/search";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../../dialogs/generic/show-dialog-box";
import { showMoreInfoDialog } from "../../../../dialogs/more-info/show-ha-more-info-dialog";
import type { HomeAssistant } from "../../../../types";
import { HELPER_DOMAINS } from "../../helpers/const";
import type { HelperDomain } from "../../helpers/const";
import { showHelperDetailDialog } from "../../helpers/show-dialog-helper-detail";
import { showEditorToast } from "../editor-toast";
import {
  collectHelperEntityIds,
  conditionForHelper,
  helperDomainOf,
} from "./helper-references";

const PREFIX = "ui.panel.config.automation.editor.helper_panel.";

declare global {
  interface HASSDomEvents {
    "helper-use": { entityId: string; condition: Record<string, unknown> };
  }
  interface HTMLElementTagNameMap {
    "ha-automation-helpers-panel": HaAutomationHelpersPanel;
  }
}

/**
 * Helpers inside the automation and script editors: the helpers this config
 * refers to, with Create, Edit and Remove right here. It reuses the helper
 * create dialog, the entity settings dialog and the helper delete call, and
 * asks with the two-key confirmation before removing one.
 */
@customElement("ha-automation-helpers-panel")
export class HaAutomationHelpersPanel extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public config?: unknown;

  /** The entity id of the automation or script being edited, if saved. */
  @property({ attribute: "self-entity-id" }) public selfEntityId?: string;

  @property({ type: Boolean }) public disabled = false;

  @state() private _registry?: EntityRegistryEntry[];

  @state() private _picking = false;

  @state() private _busy?: string;

  @state() private _created?: string;

  private _unsub?: UnsubscribeFunc;

  public connectedCallback(): void {
    super.connectedCallback();
    this._subscribe();
  }

  public disconnectedCallback(): void {
    this._unsub?.();
    this._unsub = undefined;
    super.disconnectedCallback();
  }

  protected updated(changed: PropertyValues<this>): void {
    if (changed.has("hass") && !this._unsub && this.isConnected) {
      this._subscribe();
    }
  }

  private _subscribe() {
    if (this._unsub || !this.hass?.connection) {
      return;
    }
    this._unsub = subscribeEntityRegistry(this.hass.connection, (entries) => {
      this._registry = entries;
    }) as unknown as UnsubscribeFunc;
  }

  private _helpers(): string[] {
    return collectHelperEntityIds(this.config, (id) => !!this.hass.states[id]);
  }

  private _name(entityId: string): string {
    return this.hass.states[entityId]?.attributes.friendly_name || entityId;
  }

  protected render() {
    if (!this.hass) {
      return nothing;
    }
    const t = this.hass.localize;
    const helpers = this._helpers();
    return html`
      <section class="panel" aria-labelledby="helpers-heading">
        <h2 id="helpers-heading" class="title">${t(`${PREFIX}title`)}</h2>
        <p class="count">
          ${t(
            `${PREFIX}${helpers.length === 1 ? "count_one" : "count_other"}`,
            {
              count: helpers.length,
            }
          )}
        </p>
        ${
          helpers.length
            ? html`<ul class="list">
                ${helpers.map((id) => this._renderHelper(id))}
              </ul>`
            : html`<p class="empty">${t(`${PREFIX}empty`)}</p>`
        }
        ${this._renderCreated()}
        ${
          this.disabled
            ? nothing
            : html`<div class="make">
                <p class="make-title">${t(`${PREFIX}make_title`)}</p>
                ${
                  this._picking
                    ? html`<div class="tiles" role="group">
                        ${HELPER_DOMAINS.map(
                          (domain) =>
                            html`<ha-button
                              appearance="filled"
                              variant="neutral"
                              data-domain=${domain}
                              @click=${this._createClicked}
                              >${t(
                                `ui.panel.config.helpers.types.${domain}`
                              )}</ha-button
                            >`
                        )}
                      </div>`
                    : html`<ha-button
                        class="dashed"
                        appearance="plain"
                        @click=${this._showKinds}
                      >
                        <ha-svg-icon
                          slot="start"
                          .path=${mdiPlus}
                        ></ha-svg-icon>
                        ${t(`${PREFIX}make`)}
                      </ha-button>`
                }
              </div>`
        }
      </section>
    `;
  }

  private _renderHelper(entityId: string) {
    const t = this.hass.localize;
    const domain = helperDomainOf(entityId);
    const stateObj = this.hass.states[entityId];
    const name = this._name(entityId);
    return html`<li class="row">
      <div class="info">
        <span class="name">${name}</span>
        <span class="meta"
          >${domain ? t(`ui.panel.config.helpers.types.${domain}`) : ""} ·
          ${this.hass.formatEntityState(stateObj)}</span
        >
      </div>
      <div class="actions">
        <ha-button
          appearance="plain"
          size="small"
          aria-label=${t(`${PREFIX}edit_label`, { name })}
          data-entity=${entityId}
          @click=${this._editClicked}
        >
          <ha-svg-icon slot="start" .path=${mdiPencil}></ha-svg-icon>
          ${t(`${PREFIX}edit`)}
        </ha-button>
        ${
          this.disabled
            ? nothing
            : html`<ha-button
                appearance="plain"
                variant="danger"
                size="small"
                .disabled=${this._busy === entityId}
                aria-label=${t(`${PREFIX}remove_label`, { name })}
                data-entity=${entityId}
                @click=${this._removeClicked}
              >
                <ha-svg-icon slot="start" .path=${mdiDelete}></ha-svg-icon>
                ${t(`${PREFIX}remove`)}
              </ha-button>`
        }
      </div>
    </li>`;
  }

  private _renderCreated() {
    if (!this._created || !this.hass.states[this._created]) {
      return nothing;
    }
    const t = this.hass.localize;
    const id = this._created;
    return html`<div class="created" role="status">
      <span>${t(`${PREFIX}created`, { name: this._name(id) })}</span>
      <ha-button size="small" @click=${this._useCreated}
        >${t(`${PREFIX}use_here`)}</ha-button
      >
    </div>`;
  }

  private _showKinds() {
    this._picking = true;
  }

  private _createClicked(ev: Event) {
    this._create(
      (ev.currentTarget as HTMLElement).dataset.domain as HelperDomain
    );
  }

  private _editClicked(ev: Event) {
    this._edit((ev.currentTarget as HTMLElement).dataset.entity!);
  }

  private _removeClicked(ev: Event) {
    this._remove((ev.currentTarget as HTMLElement).dataset.entity!);
  }

  private _create(domain: HelperDomain) {
    this._picking = false;
    showHelperDetailDialog(this, {
      domain,
      dialogClosedCallback: ({ flowFinished, entityId }) => {
        if (flowFinished && entityId) {
          this._created = entityId;
        }
      },
    });
  }

  private _useCreated() {
    const entityId = this._created;
    if (!entityId) {
      return;
    }
    this._created = undefined;
    fireEvent(this, "helper-use", {
      entityId,
      condition: conditionForHelper(entityId),
    });
  }

  private _edit(entityId: string) {
    showMoreInfoDialog(this, { entityId, view: "settings" });
  }

  /** Names of the other automations and scripts that refer to the helper. */
  private async _otherUsers(entityId: string): Promise<string[]> {
    try {
      const related = await findRelated(this.hass, "entity", entityId);
      return [...(related.automation ?? []), ...(related.script ?? [])]
        .filter((id) => id !== this.selfEntityId)
        .map((id) => this._name(id));
    } catch (_err) {
      return [];
    }
  }

  private async _remove(entityId: string) {
    const t = this.hass.localize;
    const domain = helperDomainOf(entityId);
    const entry = this._registry?.find((e) => e.entity_id === entityId);
    const name = this._name(entityId);
    if (!domain || !entry?.unique_id) {
      showAlertDialog(this, {
        text: t(`${PREFIX}remove_unavailable`, { name }),
      });
      return;
    }
    this._busy = entityId;
    try {
      const others = await this._otherUsers(entityId);
      const confirmed = await showConfirmationDialog(this, {
        title: t("ui.panel.config.helpers.picker.delete_confirm_title"),
        text: others.length
          ? t(`${PREFIX}remove_used_by`, {
              name,
              users: others.join(", "),
            })
          : t("ui.panel.config.helpers.picker.delete_confirm_text", { name }),
        confirmText: t("ui.common.delete"),
        dismissText: t("ui.common.cancel"),
        destructive: true,
      });
      if (!confirmed) {
        return;
      }
      await HELPERS_CRUD[domain].delete(this.hass, entry.unique_id);
      showEditorToast(this, {
        message: t(`${PREFIX}removed`, { name }),
        duration: 4000,
      });
    } catch (err: unknown) {
      showAlertDialog(this, {
        text:
          (err as { message?: string })?.message ||
          t("ui.panel.config.helpers.picker.delete_failed"),
      });
    } finally {
      this._busy = undefined;
    }
  }

  static styles = css`
    :host {
      display: block;
    }
    .panel {
      padding: var(--ha-space-5, 20px);
      margin-bottom: var(--ha-space-4);
      border-radius: var(--ha-border-radius-3xl, 32px);
      background: var(
        --ha-color-surface-container,
        var(--card-background-color)
      );
    }
    .title {
      margin: 0;
      font-size: var(--ha-font-size-xl, 1.375rem);
      font-weight: 800;
      font-stretch: 112%;
    }
    .count,
    .empty,
    .meta {
      margin: var(--ha-space-1) 0 var(--ha-space-3);
      color: var(--secondary-text-color);
    }
    .list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-2);
      min-height: 56px;
      padding: var(--ha-space-2) var(--ha-space-4);
      border-radius: 20px;
      background: var(
        --ha-color-surface-tone-2,
        var(--secondary-background-color)
      );
    }
    .info {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .info .meta {
      margin: 0;
    }
    .name {
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-1);
    }
    ha-button {
      min-height: 48px;
    }
    .make {
      margin-top: var(--ha-space-4);
    }
    .make-title {
      margin: 0 0 var(--ha-space-2);
      font-size: var(--ha-font-size-s, 0.875rem);
      font-weight: var(--ha-font-weight-medium);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
    }
    .tiles {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
    }
    .dashed::part(base) {
      border: 2px dashed var(--divider-color);
      border-radius: 20px;
    }
    .created {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-2);
      margin-top: var(--ha-space-3);
      padding: var(--ha-space-2) var(--ha-space-4);
      border-radius: 20px;
      background: var(
        --ha-color-primary-container,
        var(--secondary-background-color)
      );
      color: var(--ha-color-on-primary-container, var(--primary-text-color));
    }
  `;
}
