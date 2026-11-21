import { mdiContentCopy, mdiOpenInNew, mdiPencil } from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { formatDateTimeWithSeconds } from "../../common/datetime/format_date_time";
import { formatTimeWithSeconds } from "../../common/datetime/format_time";
import { computeDeviceName } from "../../common/entity/compute_device_name";
import { modeText } from "../../common/language-mode/language-mode";
import { statesToolUrl } from "../../common/url/states-tool-query-params";
import { copyToClipboard } from "../../common/util/copy-clipboard";
import type { ExtEntityRegistryEntry } from "../../data/entity/entity_registry";
import { getExtendedEntityRegistryEntry } from "../../data/entity/entity_registry";
import {
  ATTRIBUTES_SHOWN_FIRST,
  entityDetailsCopyText,
  formatDetailValue,
  isLongValue,
  isStillSetByHand,
  orderAttributeKeys,
  setEntityStateByHand,
  valueKind,
  withAttribute,
} from "../../data/entity-details";
import { domainToName } from "../../data/integration";
import { showEntitySetStateDialog } from "../../dialogs/entity-set-state/show-dialog-entity-set-state";
import { showConfirmationDialog } from "../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../types";
import { showToast } from "../../util/toast";
import "../ha-alert";
import "../ha-button";
import "../ha-icon-button";
import "../ha-svg-icon";
import {
  detailsStyles,
  detailsText,
  playDetailsOpen,
} from "./ha-more-details-facts";

interface SetByHand {
  contextId?: string;
  at: Date;
}

/**
 * "Show more details" for one entity, in place: who it is, its raw state with
 * exact times, every attribute and, for administrators, the registry facts.
 * Administrators can set the state or an attribute by hand after the app's
 * two-key confirmation; the device is not told, which the panel says plainly.
 * The surrounding row owns the toggle that shows and hides this panel.
 */
@customElement("ha-entity-more-details")
export class HaEntityMoreDetails extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public entityId?: string;

  @state() private _registry?: ExtEntityRegistryEntry | null;

  @state() private _allAttributes = false;

  @state() private _openValues = new Set<string>();

  @state() private _setByHand?: SetByHand;

  @state() private _editError?: string;

  private _registryFor?: string;

  private _t(key: string, values?: Record<string, string | number>): string {
    return detailsText(this.hass, key, values);
  }

  protected willUpdate(changed: PropertyValues<this>) {
    if (changed.has("entityId") && changed.get("entityId") !== undefined) {
      this._allAttributes = false;
      this._openValues = new Set();
      this._setByHand = undefined;
      this._editError = undefined;
    }
    if (
      this.hass &&
      this.entityId &&
      this.hass.user?.is_admin &&
      this._registryFor !== this.entityId
    ) {
      this._loadRegistry(this.entityId);
    }
  }

  @query(".details") private _details?: HTMLElement;

  protected firstUpdated() {
    playDetailsOpen(this._details);
  }

  private async _loadRegistry(entityId: string) {
    this._registryFor = entityId;
    this._registry = undefined;
    try {
      const entry = await getExtendedEntityRegistryEntry(this.hass, entityId);
      if (this._registryFor === entityId) {
        this._registry = entry;
      }
    } catch (_err) {
      // Entities without a unique ID are not in the registry.
      if (this._registryFor === entityId) {
        this._registry = null;
      }
    }
  }

  private _time(iso: string | undefined): string | undefined {
    if (!iso) {
      return undefined;
    }
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? iso
      : formatDateTimeWithSeconds(date, this.hass.locale, this.hass.config);
  }

  protected render() {
    if (!this.hass || !this.entityId) {
      return nothing;
    }
    const stateObj = this.hass.states[this.entityId] as HassEntity | undefined;
    if (!stateObj) {
      return html`<div class="details" role="region">
        <p class="empty">${this._t("missing")}</p>
      </div>`;
    }
    const isAdmin = !!this.hass.user?.is_admin;
    const display = this.hass.entities[this.entityId];
    const registry = this._registry ?? undefined;
    const deviceId = registry?.device_id ?? display?.device_id;
    const device = deviceId ? this.hass.devices[deviceId] : undefined;
    const areaId =
      registry?.area_id ?? display?.area_id ?? device?.area_id ?? undefined;
    const area = areaId ? this.hass.areas[areaId] : undefined;
    const platform = registry?.platform ?? display?.platform;
    const labels = registry?.labels ?? display?.labels ?? [];
    const lastReported = (stateObj as HassEntity & { last_reported?: string })
      .last_reported;
    const stillByHand =
      this._setByHand && isStillSetByHand(stateObj, this._setByHand.contextId);

    return html`<div
      class="details"
      role="region"
      aria-label=${this._t("show_more")}
    >
      <h3 class="heading">${this._t("section.identity")}</h3>
      ${this._row(this._t("field.entity_id"), stateObj.entity_id, {
        mono: true,
        copy: true,
      })}
      ${
        registry?.unique_id
          ? this._row(this._t("field.unique_id"), registry.unique_id, {
              mono: true,
              copy: true,
            })
          : nothing
      }
      ${
        device
          ? this._row(
              this._t("field.device"),
              computeDeviceName(device) ?? device.id,
              {
                href: `/config/devices/device/${device.id}`,
              }
            )
          : nothing
      }
      ${
        platform
          ? this._row(
              this._t("field.integration"),
              domainToName(this.hass.localize, platform)
            )
          : nothing
      }
      ${area ? this._row(this._t("field.area"), area.name) : nothing}
      ${
        labels.length
          ? this._row(this._t("field.labels"), labels.join(", "), {
              mono: true,
            })
          : nothing
      }
      ${
        registry?.original_name
          ? this._row(this._t("field.platform_name"), registry.original_name)
          : nothing
      }

      <h3 class="heading">${this._t("section.state")}</h3>
      ${this._row(this._t("field.state"), stateObj.state, {
        mono: true,
        copy: true,
        edit: isAdmin ? { label: this._t("edit_state") } : undefined,
        note:
          stillByHand && this._setByHand
            ? this._t("set_by_hand", {
                time: formatTimeWithSeconds(
                  this._setByHand.at,
                  this.hass.locale,
                  this.hass.config
                ),
              })
            : undefined,
      })}
      ${this._row(this._t("field.last_changed"), this._time(stateObj.last_changed))}
      ${this._row(this._t("field.last_updated"), this._time(stateObj.last_updated))}
      ${
        lastReported
          ? this._row(this._t("field.last_reported"), this._time(lastReported))
          : nothing
      }
      ${this._renderAttributes(stateObj, isAdmin)}
      ${isAdmin && registry ? this._renderRegistry(registry) : nothing}
      ${
        isAdmin
          ? html`<ha-alert alert-type="warning" class="warning"
              >${this._t("warning")}</ha-alert
            >`
          : nothing
      }
      ${
        this._editError
          ? html`<ha-alert alert-type="error">${this._editError}</ha-alert>`
          : nothing
      }
      <div class="actions">
        <ha-button appearance="outlined" @click=${this._copyAll}>
          <ha-svg-icon slot="start" .path=${mdiContentCopy}></ha-svg-icon>
          ${this._t("copy_everything")}
        </ha-button>
        ${
          isAdmin
            ? html`<ha-button
                appearance="outlined"
                href=${statesToolUrl(this.entityId)}
              >
                <ha-svg-icon slot="start" .path=${mdiOpenInNew}></ha-svg-icon>
                ${this._t("open_tools")}
              </ha-button>`
            : nothing
        }
      </div>
    </div>`;
  }

  private _renderAttributes(stateObj: HassEntity, isAdmin: boolean) {
    const attributes = stateObj.attributes as Record<string, unknown>;
    const keys = orderAttributeKeys(attributes);
    const shown = this._allAttributes
      ? keys
      : keys.slice(0, ATTRIBUTES_SHOWN_FIRST);
    const hidden = keys.length - shown.length;
    return html`
      <h3 class="heading">
        ${this._t("section.attributes", { count: keys.length })}
      </h3>
      ${
        keys.length
          ? nothing
          : html`<p class="empty">${this._t("no_attributes")}</p>`
      }
      ${shown.map((key) =>
        this._row(key, formatDetailValue(attributes[key]), {
          mono: true,
          monoLabel: true,
          fold: true,
          edit: isAdmin
            ? {
                label: this._t("edit_attribute", { name: key }),
                attribute: key,
              }
            : undefined,
        })
      )}
      ${
        hidden > 0
          ? html`<ha-button
              class="more"
              appearance="plain"
              @click=${this._showAllAttributes}
              >${this._t("show_other", { count: hidden })}</ha-button
            >`
          : this._allAttributes && keys.length > ATTRIBUTES_SHOWN_FIRST
            ? html`<ha-button
                class="more"
                appearance="plain"
                @click=${this._showFewerAttributes}
                >${this._t("show_fewer_attributes")}</ha-button
              >`
            : nothing
      }
    `;
  }

  private _renderRegistry(registry: ExtEntityRegistryEntry) {
    const notSet = this._t("not_set");
    return html`
      <h3 class="heading">${this._t("section.registry")}</h3>
      ${this._row(
        this._t("field.disabled_by"),
        registry.disabled_by ?? notSet,
        {
          mono: !!registry.disabled_by,
        }
      )}
      ${this._row(this._t("field.hidden_by"), registry.hidden_by ?? notSet, {
        mono: !!registry.hidden_by,
      })}
      ${this._row(
        this._t("field.entity_category"),
        registry.entity_category ?? notSet,
        { mono: !!registry.entity_category }
      )}
      ${this._row(
        this._t("field.device_class"),
        registry.device_class ?? registry.original_device_class ?? notSet,
        { mono: !!(registry.device_class ?? registry.original_device_class) }
      )}
    `;
  }

  private _row(
    label: string,
    value: string | undefined,
    options: {
      mono?: boolean;
      monoLabel?: boolean;
      copy?: boolean;
      fold?: boolean;
      href?: string;
      note?: string;
      edit?: { label: string; attribute?: string };
    } = {}
  ) {
    if (value === undefined) {
      return nothing;
    }
    const foldable = !!options.fold && isLongValue(value);
    const unfolded = this._openValues.has(label);
    return html`<div class="row">
      <span
        class=${classMap({ label: true, "mono-label": !!options.monoLabel })}
        >${label}</span
      >
      <div class="cell">
        <span
          class=${classMap({
            value: true,
            mono: !!options.mono,
            folded: foldable && !unfolded,
          })}
          >${
            options.href ? html`<a href=${options.href}>${value}</a>` : value
          }</span
        >${
          options.note
            ? html`<span class="note">${options.note}</span>`
            : nothing
        }${
          foldable
            ? html`<ha-button
                class="unfold"
                appearance="plain"
                data-key=${label}
                @click=${this._toggleValue}
                >${this._t(
                  unfolded ? "collapse_value" : "expand_value"
                )}</ha-button
              >`
            : nothing
        }
      </div>
      <div class="row-tools">
        ${
          options.copy
            ? html`<ha-icon-button
                .path=${mdiContentCopy}
                .label=${this._t("copy_value", { name: label })}
                data-value=${value}
                @click=${this._copyOne}
              ></ha-icon-button>`
            : nothing
        }
        ${
          options.edit
            ? html`<ha-icon-button
                .path=${mdiPencil}
                .label=${options.edit.label}
                data-attribute=${options.edit.attribute ?? ""}
                @click=${this._editClicked}
              ></ha-icon-button>`
            : nothing
        }
      </div>
    </div>`;
  }

  private _showAllAttributes() {
    this._allAttributes = true;
  }

  private _showFewerAttributes() {
    this._allAttributes = false;
  }

  private _toggleValue(ev: Event) {
    const key = (ev.currentTarget as HTMLElement).dataset.key;
    if (key === undefined) {
      return;
    }
    const next = new Set(this._openValues);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    this._openValues = next;
  }

  private async _copyOne(ev: Event) {
    await this._copy((ev.currentTarget as HTMLElement).dataset.value ?? "");
  }

  private async _copyAll() {
    const stateObj = this.entityId
      ? this.hass.states[this.entityId]
      : undefined;
    if (!stateObj) {
      return;
    }
    const display = this.hass.entities[stateObj.entity_id];
    const registry = this._registry ?? undefined;
    const deviceId = registry?.device_id ?? display?.device_id ?? undefined;
    const device = deviceId ? this.hass.devices[deviceId] : undefined;
    await this._copy(
      entityDetailsCopyText({
        stateObj,
        uniqueId: registry?.unique_id,
        deviceId,
        deviceName: device ? computeDeviceName(device) : undefined,
        platform: registry?.platform ?? display?.platform,
        areaId: registry?.area_id ?? display?.area_id ?? device?.area_id,
        labels: registry?.labels ?? display?.labels,
      })
    );
  }

  private async _copy(text: string) {
    await copyToClipboard(text);
    showToast(this, {
      message: modeText(this.hass.localize, "ui.common.copied_clipboard"),
    });
  }

  private async _editClicked(ev: Event) {
    const entityId = this.entityId;
    if (!entityId || !this.hass.user?.is_admin) {
      return;
    }
    const attribute =
      (ev.currentTarget as HTMLElement).dataset.attribute || undefined;
    const stateObj = this.hass.states[entityId];
    if (!stateObj) {
      return;
    }
    const name = this.hass.formatEntityName(stateObj) || entityId;
    const current = attribute
      ? (stateObj.attributes as Record<string, unknown>)[attribute]
      : stateObj.state;
    const result = await showEntitySetStateDialog(this, {
      title: attribute
        ? this._t("edit.title_attribute", { attribute, name })
        : this._t("edit.title_state", { name }),
      value: current,
      kind: attribute ? valueKind(current) : "text",
    });
    if (!result) {
      return;
    }
    const confirmed = await showConfirmationDialog(this, {
      title: this._t("edit.confirm_title"),
      text: this._t("warning"),
      confirmText: this._t("edit.confirm_button"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    // Read the entity again: it may have reported while the dialogs were open.
    const latest = this.hass.states[entityId];
    if (!latest) {
      return;
    }
    const attributes = latest.attributes as Record<string, unknown>;
    this._editError = undefined;
    try {
      const written = await setEntityStateByHand(
        this.hass,
        entityId,
        attribute ? latest.state : String(result.value),
        attribute
          ? withAttribute(attributes, attribute, result.value)
          : attributes
      );
      this._setByHand = { contextId: written?.context?.id, at: new Date() };
    } catch (err: any) {
      this._editError = this._t("edit.failed", {
        error: err?.body?.message || err?.message || String(err),
      });
    }
  }

  static styles = [
    detailsStyles,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .details {
        padding: var(--ha-space-1) 0 var(--ha-space-2);
      }
      .heading {
        font-size: var(--ha-font-size-s, 12px);
      }
      .mono-label {
        font-family: var(--ha-font-family-code, ui-monospace, monospace);
      }
      .empty {
        margin: var(--ha-space-2) 0;
        color: var(--secondary-text-color);
      }
      .cell {
        flex: 1;
        min-width: 0;
        padding-bottom: var(--ha-space-1);
      }
      .cell .value {
        display: block;
        padding-bottom: 0;
      }
      .unfold {
        display: block;
        margin-top: var(--ha-space-1);
      }
      .warning,
      ha-alert {
        display: block;
        margin-top: var(--ha-space-3);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-entity-more-details": HaEntityMoreDetails;
  }
}
