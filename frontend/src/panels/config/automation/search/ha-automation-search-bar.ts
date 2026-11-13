import {
  mdiAlertCircleOutline,
  mdiChevronDown,
  mdiChevronUp,
  mdiClose,
  mdiFormatListBulleted,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { consume } from "../../../../common/decorators/consume";
import { computeAreaName } from "../../../../common/entity/compute_area_name";
import { computeDeviceName } from "../../../../common/entity/compute_device_name";
import { computeStateName } from "../../../../common/entity/compute_state_name";
import { LanguageModeController } from "../../../../common/language-mode/language-mode-controller";
import { regexQuery, searchMatcher } from "../../../../common/regex/filter";
import "../../../../components/ha-button";
import "../../../../components/ha-checkbox";
import "../../../../components/ha-icon-button";
import "../../../../components/ha-state-icon";
import "../../../../components/ha-svg-icon";
import "../../../../components/ha-switch";
import type { HaSwitch } from "../../../../components/ha-switch";
import "../../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../../components/input/ha-input-search";
import type { HomeAssistant } from "../../../../types";
import type { EntitySummary } from "./automation-search";
import type { AutomationSearchSnapshot } from "./automation-search-context";
import { automationSearchContext } from "./automation-search-context";

type EntityGroupMode = "none" | "device" | "area";

interface EntityRow extends EntitySummary {
  name: string;
  deviceName?: string;
  areaName?: string;
}

const KEY = "ui.panel.config.automation.editor.search.";

/**
 * The search of the automation or script editor: a field with the pattern
 * workbench, the match count with Next and Previous, a switch that shows only
 * matching steps, and the list of entities the steps use, to filter by.
 *
 * It only talks to the search scope it sits in. It never changes the
 * configuration.
 */
@customElement("ha-automation-search-bar")
export class HaAutomationSearchBar extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state()
  @consume({ context: automationSearchContext, subscribe: true })
  private _search?: AutomationSearchSnapshot;

  @state() private _entitiesOpen = false;

  @state() private _entityQuery = "";

  @state() private _group: EntityGroupMode = "none";

  private _lang = new LanguageModeController(this);

  private _resizeObserver?: ResizeObserver;

  private _offsetTarget?: HTMLElement;

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.hass.localize, `${KEY}${key}`, values);
  }

  public connectedCallback() {
    super.connectedCallback();
    // Rows scroll to just below this sticky bar. Its height changes with the
    // options and the match count, so the rows are told the real height.
    this._offsetTarget =
      this.parentElement ??
      ((this.getRootNode() as ShadowRoot).host as HTMLElement | undefined);
    this._resizeObserver = new ResizeObserver(() => this._publishOffset());
    this._resizeObserver.observe(this);
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._resizeObserver?.disconnect();
    this._resizeObserver = undefined;
    this._offsetTarget?.style.removeProperty("--ha-automation-sticky-offset");
    this._offsetTarget = undefined;
  }

  private _publishOffset() {
    // The bar's own height plus the gap under it and a little room.
    this._offsetTarget?.style.setProperty(
      "--ha-automation-sticky-offset",
      `${this.offsetHeight + 24}px`
    );
  }

  protected render() {
    const search = this._search;
    if (!search?.hasSteps) {
      return nothing;
    }
    const total = search.matches.length;
    const filterCount = search.entityFilter.length;
    return html`
      <div class="bar" role="search" aria-label=${this._t("title")}>
        <div class="row">
          <ha-input-search
            class="field"
            appearance="outlined"
            .placeholder=${this._t("placeholder")}
            .accessibleLabel=${this._t("label")}
            .value=${search.query}
            @input=${this._queryChanged}
            @keydown=${this._fieldKeydown}
          ></ha-input-search>
          ${
            search.active
              ? html`<div class="nav">
                  ${this._renderCount(search)}
                  <ha-icon-button
                    .label=${this._t("previous")}
                    .path=${mdiChevronUp}
                    .disabled=${!total}
                    @click=${this._previous}
                  ></ha-icon-button>
                  <ha-icon-button
                    .label=${this._t("next")}
                    .path=${mdiChevronDown}
                    .disabled=${!total}
                    @click=${this._next}
                  ></ha-icon-button>
                  <ha-icon-button
                    .label=${this._t("clear")}
                    .path=${mdiClose}
                    @click=${this._clear}
                  ></ha-icon-button>
                </div>`
              : nothing
          }
        </div>
        ${this._renderPatternError(search)}
        <div class="row options">
          <ha-switch
            .checked=${search.onlyMatching}
            title=${this._t("only_matching_hint")}
            @change=${this._onlyMatchingChanged}
            >${this._t("only_matching")}</ha-switch
          >
          ${
            search.entities.length
              ? html`<ha-button
                  appearance=${filterCount ? "filled" : "outlined"}
                  size="s"
                  aria-expanded=${this._entitiesOpen ? "true" : "false"}
                  aria-controls="entity-panel"
                  @click=${this._toggleEntities}
                >
                  <ha-svg-icon
                    slot="start"
                    .path=${mdiFormatListBulleted}
                  ></ha-svg-icon>
                  ${
                    filterCount
                      ? this._t("entities_count", { count: filterCount })
                      : this._t("entities")
                  }
                </ha-button>`
              : nothing
          }
        </div>
        ${this._renderFilterChips(search)}
        ${
          this._entitiesOpen && search.entities.length
            ? this._renderEntityPanel(search)
            : nothing
        }
        <div class="visually-hidden" role="status" aria-live="polite">
          ${this._announcement(search)}
        </div>
      </div>
    `;
  }

  private _renderCount(search: AutomationSearchSnapshot) {
    if (!search.active || search.error) {
      return nothing;
    }
    const total = search.matches.length;
    return html`<span class="count" aria-hidden="true"
      >${
        total
          ? this._t("count", {
              current: search.currentIndex + 1,
              total,
            })
          : this._t("no_matches")
      }</span
    >`;
  }

  private _renderPatternError(search: AutomationSearchSnapshot) {
    if (!search.error) {
      return nothing;
    }
    const reason = this.hass.localize(
      `ui.regex.filter_error.${search.error}` as any
    );
    return html`<p class="error">
      <ha-svg-icon .path=${mdiAlertCircleOutline}></ha-svg-icon>
      ${this._t("pattern_error", { reason })}
    </p>`;
  }

  private _announcement(search: AutomationSearchSnapshot): string {
    if (!search.active) {
      return "";
    }
    if (search.error) {
      return this._t("pattern_error", {
        reason: this.hass.localize(
          `ui.regex.filter_error.${search.error}` as any
        ),
      });
    }
    if (!search.matches.length) {
      return this._t("announce_none");
    }
    return this._t("announce_match", {
      current: search.currentIndex + 1,
      total: search.matches.length,
      title: search.current?.title ?? "",
    });
  }

  private _entityName(entityId: string): string {
    const stateObj = this.hass.states[entityId];
    return stateObj ? computeStateName(stateObj) : entityId;
  }

  private _renderFilterChips(search: AutomationSearchSnapshot) {
    if (!search.entityFilter.length) {
      return nothing;
    }
    return html`<div
      class="chips"
      aria-label=${this._t("filter_summary", {
        count: search.entityFilter.length,
      })}
    >
      ${search.entityFilter.map((entityId) => {
        const name = this._entityName(entityId);
        return html`<span class="chip">
          <span class="chip-text">${name}</span>
          <ha-icon-button
            .label=${this._t("filter_remove", { name })}
            .path=${mdiClose}
            data-entity=${entityId}
            @click=${this._removeChip}
          ></ha-icon-button>
        </span>`;
      })}
    </div>`;
  }

  private _rows(search: AutomationSearchSnapshot): EntityRow[] {
    const { hass } = this;
    return search.entities.map((entity) => {
      const entry = hass.entities[entity.entityId];
      const device = entry?.device_id
        ? hass.devices[entry.device_id]
        : undefined;
      const area =
        (entry?.area_id ?? device?.area_id)
          ? hass.areas[(entry?.area_id ?? device?.area_id)!]
          : undefined;
      return {
        ...entity,
        name: this._entityName(entity.entityId),
        deviceName: device ? computeDeviceName(device) : undefined,
        areaName: area ? computeAreaName(area) : undefined,
      };
    });
  }

  private _renderEntityPanel(search: AutomationSearchSnapshot) {
    const matcher = searchMatcher(this._entityQuery);
    const queryError = regexQuery(this._entityQuery)?.error;
    const rows = this._rows(search).filter((row) =>
      matcher(row.entityId, row.name, row.deviceName, row.areaName)
    );
    return html`<div
      id="entity-panel"
      class="panel"
      role="group"
      aria-label=${this._t("entities_title")}
    >
      <p class="hint">${this._t("entities_hint")}</p>
      <ha-input-search
        class="entity-field"
        appearance="outlined"
        .placeholder=${this._t("entities_search")}
        .accessibleLabel=${this._t("entities_search")}
        .value=${this._entityQuery}
        .patternSamples=${search.entities.map((entity) => entity.entityId)}
        @input=${this._entityQueryChanged}
      ></ha-input-search>
      ${
        queryError
          ? html`<p class="error">
              <ha-svg-icon .path=${mdiAlertCircleOutline}></ha-svg-icon>
              ${this.hass.localize(`ui.regex.filter_error.${queryError}` as any)}
            </p>`
          : nothing
      }
      <div class="groups" role="group" aria-label=${this._t("group_label")}>
        ${(["none", "device", "area"] as const).map(
          (mode) =>
            html`<ha-button
              size="s"
              appearance=${this._group === mode ? "filled" : "plain"}
              aria-pressed=${this._group === mode ? "true" : "false"}
              data-mode=${mode}
              @click=${this._groupClicked}
              >${this._t(`group_${mode}`)}</ha-button
            >`
        )}
      </div>
      ${
        rows.length
          ? this._renderGroups(search, rows)
          : html`<p class="hint">${this._t("entities_no_results")}</p>`
      }
      ${
        search.entityFilter.length
          ? html`<ha-button
              size="s"
              appearance="plain"
              @click=${this._clearEntityFilter}
              >${this._t("filter_clear")}</ha-button
            >`
          : nothing
      }
    </div>`;
  }

  private _renderGroups(search: AutomationSearchSnapshot, rows: EntityRow[]) {
    if (this._group === "none") {
      return html`<ul class="entities">
        ${rows.map((row) => this._renderEntity(search, row))}
      </ul>`;
    }
    const groups = new Map<string, EntityRow[]>();
    for (const row of rows) {
      const name =
        (this._group === "device" ? row.deviceName : row.areaName) ??
        this._t(this._group === "device" ? "no_device" : "no_area");
      const list = groups.get(name);
      if (list) {
        list.push(row);
      } else {
        groups.set(name, [row]);
      }
    }
    return html`${[...groups.entries()].map(
      ([name, list]) =>
        html`<section class="group">
          <h4>${name}</h4>
          <ul class="entities">
            ${list.map((row) => this._renderEntity(search, row))}
          </ul>
        </section>`
    )}`;
  }

  private _renderEntity(
    search: AutomationSearchSnapshot,
    row: EntityRow
  ): TemplateResult {
    const stateObj = this.hass.states[row.entityId];
    const badges = [this._t("steps_using", { count: row.count })];
    if (row.fromTemplateOnly) {
      badges.push(this._t("from_template"));
    }
    if (row.missing) {
      badges.push(this._t("not_found"));
    }
    return html`<li>
      <ha-checkbox
        .checked=${search.entityFilter.includes(row.entityId)}
        data-entity=${row.entityId}
        @change=${this._entityChecked}
      >
        <span class="entity">
          ${
            stateObj
              ? html`<ha-state-icon .stateObj=${stateObj}></ha-state-icon>`
              : html`<ha-svg-icon
                  class="missing-icon"
                  .path=${mdiAlertCircleOutline}
                ></ha-svg-icon>`
          }
          <span class="entity-text">
            <span class="entity-name">${row.name}</span>
            <span class="entity-id">${row.entityId}</span>
            <span class=${classMap({ badges: true, missing: row.missing })}
              >${badges.join(" · ")}</span
            >
          </span>
        </span>
      </ha-checkbox>
    </li>`;
  }

  private _queryChanged(ev: Event) {
    this._search?.setQuery((ev.target as HaInputSearch).value ?? "");
  }

  private _entityQueryChanged(ev: Event) {
    this._entityQuery = (ev.target as HaInputSearch).value ?? "";
  }

  private _fieldKeydown(ev: KeyboardEvent) {
    if (ev.key === "Enter") {
      ev.preventDefault();
      if (ev.shiftKey) {
        this._previous();
      } else {
        this._next();
      }
    } else if (ev.key === "Escape" && this._search?.active) {
      ev.stopPropagation();
      this._clear();
    }
  }

  private _next() {
    this._search?.next();
  }

  private _previous() {
    this._search?.previous();
  }

  private _clear() {
    this._search?.clear();
  }

  private _onlyMatchingChanged(ev: Event) {
    this._search?.setOnlyMatching((ev.currentTarget as HaSwitch).checked);
  }

  private _toggleEntities() {
    this._entitiesOpen = !this._entitiesOpen;
  }

  private _toggleEntity(entityId: string, checked: boolean) {
    const search = this._search;
    if (!search) {
      return;
    }
    const without = search.entityFilter.filter((id) => id !== entityId);
    search.setEntityFilter(checked ? [...without, entityId] : without);
  }

  private _removeChip(ev: Event) {
    this._toggleEntity(
      (ev.currentTarget as HTMLElement).dataset.entity!,
      false
    );
  }

  private _groupClicked(ev: Event) {
    this._group = (ev.currentTarget as HTMLElement).dataset
      .mode as EntityGroupMode;
  }

  private _entityChecked(ev: Event) {
    const box = ev.currentTarget as HTMLInputElement;
    this._toggleEntity(box.dataset.entity!, box.checked);
  }

  private _clearEntityFilter() {
    this._search?.setEntityFilter([]);
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
      position: sticky;
      inset-block-start: 0;
      z-index: 4;
      margin-block-end: var(--ha-space-4);
    }
    .bar {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
      padding: var(--ha-space-3);
      border-radius: var(--ha-border-radius-3xl, 28px);
      background: var(
        --ha-color-surface-container,
        var(--card-background-color)
      );
      border: 1px solid var(--divider-color);
      box-sizing: border-box;
      max-width: 100%;
      max-height: calc(100vh - 160px);
      overflow-y: auto;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2);
    }
    .field {
      flex: 1 1 240px;
      min-width: 0;
      --ha-input-search-border-radius: var(--ha-border-radius-pill);
    }
    .nav {
      display: flex;
      align-items: center;
      gap: var(--ha-space-1);
      flex: 0 1 auto;
      flex-wrap: wrap;
    }
    .count {
      font-size: var(--ha-font-size-s, 0.875rem);
      color: var(--secondary-text-color);
      padding-inline: var(--ha-space-2);
      white-space: nowrap;
    }
    .options {
      justify-content: space-between;
    }
    ha-switch {
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      --ha-switch-min-touch-size: 44px;
    }
    ha-button {
      --ha-button-height: 44px;
    }
    ha-icon-button {
      --ha-icon-button-size: 44px;
    }
    .error {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      margin: 0;
      color: var(--error-color);
      font-size: var(--ha-font-size-s, 0.875rem);
    }
    .hint {
      margin: 0;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 0.875rem);
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
    }
    .chip {
      display: inline-flex;
      align-items: center;
      max-width: 100%;
      padding-inline-start: var(--ha-space-3);
      border-radius: var(--ha-border-radius-pill);
      background: var(
        --ha-color-fill-primary-quiet-resting,
        var(--secondary-background-color)
      );
    }
    .chip-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    .panel {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
      padding-block-start: var(--ha-space-2);
      border-block-start: 1px solid var(--divider-color);
    }
    .groups {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-1);
    }
    .entities {
      list-style: none;
      margin: 0;
      padding: 0;
      max-height: min(40vh, 360px);
      overflow-y: auto;
    }
    .group h4 {
      margin: var(--ha-space-2) 0 var(--ha-space-1);
      font-size: var(--ha-font-size-s, 0.875rem);
      color: var(--secondary-text-color);
    }
    ha-checkbox {
      display: block;
      --ha-checkbox-min-touch-size: 44px;
    }
    .entity {
      line-height: var(--ha-line-height-normal, 1.4);
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      min-width: 0;
    }
    .entity-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .entity-name,
    .entity-id {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .entity-id,
    .badges {
      font-size: var(--ha-font-size-s, 0.875rem);
      color: var(--secondary-text-color);
    }
    .badges.missing,
    .missing-icon {
      color: var(--error-color);
    }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
      border: 0;
    }
    @media (max-width: 420px) {
      .nav {
        flex: 1 1 100%;
        justify-content: flex-end;
      }
      .field {
        flex-basis: 100%;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-search-bar": HaAutomationSearchBar;
  }
}
