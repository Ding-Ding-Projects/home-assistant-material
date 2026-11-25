import type { ContextType } from "@lit/context";
import type { HassEntity } from "home-assistant-js-websocket";
import { mdiFilterVariantRemove } from "@mdi/js";
import type { CSSResultGroup, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { createRef, ref } from "lit/directives/ref";
import memoizeOne from "memoize-one";
import { normalizeSearchText, searchMatcher } from "../common/regex/filter";
import { consume } from "../common/decorators/consume";
import {
  FilterPanelController,
  filterPanelStyles,
} from "../common/controllers/filter-panel-controller";
import { consumeLocalize } from "../common/decorators/consume-context-entry";
import { fireEvent } from "../common/dom/fire_event";
import { computeStateDomain } from "../common/entity/compute_state_domain";
import { stringCompare } from "../common/string/compare";
import type { LocalizeFunc } from "../common/translations/localize";
import { deepEqual } from "../common/util/deep-equal";
import {
  apiContext,
  formattersContext,
  internationalizationContext,
  statesContext,
} from "../data/context";
import type { RelatedResult } from "../data/search";
import { findRelated } from "../data/search";
import { haStyleScrollbar } from "../resources/styles";
import "./ha-expansion-panel";
import "./ha-filter-empty";
import "./ha-state-icon";
import "./input/ha-input-search";
import type { HaInputSearch } from "./input/ha-input-search";
import "./item/ha-list-item-option";
import "./list/ha-list-selectable-virtualized";
import type { HaListVirtualizedItem } from "./list/ha-list-virtualized";

interface EntityItem extends HaListVirtualizedItem {
  stateObj: HassEntity;
  name: string;
}

@customElement("ha-filter-entities")
export class HaFilterEntities extends LitElement {
  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @consume({ context: statesContext, subscribe: true })
  @state()
  private _states!: ContextType<typeof statesContext>;

  @consume({ context: formattersContext, subscribe: true })
  @state()
  private _formatters!: ContextType<typeof formattersContext>;

  @consume({ context: internationalizationContext, subscribe: true })
  @state()
  private _i18n!: ContextType<typeof internationalizationContext>;

  @consume({ context: apiContext, subscribe: true })
  private _api!: ContextType<typeof apiContext>;

  @property({ attribute: false }) public value?: string[];

  @property() public type?: keyof RelatedResult;

  @property({ type: Boolean }) public narrow = false;

  @property({ type: Boolean, reflect: true }) public expanded = false;

  @state() private _filter?: string;

  private _content = createRef<HTMLElement>();

  private _panel = new FilterPanelController(this, this._content);

  private _relatedRequestId = 0;

  public willUpdate(properties: PropertyValues<this>) {
    super.willUpdate(properties);

    if (
      properties.has("value") &&
      !deepEqual(this.value, properties.get("value"))
    ) {
      this._findRelated();
    }
  }

  protected render() {
    const entities = this._panel.showContent
      ? this._entities(
          this._states,
          this._formatters,
          this.type,
          this._filter || "",
          this._i18n.locale.language,
          this.value
        )
      : [];
    return html`
      <ha-expansion-panel
        left-chevron
        .expanded=${this.expanded}
        @expanded-changed=${this._expandedChanged}
      >
        <div slot="header" class="header">
          ${this._localize("ui.panel.config.entities.caption")}
          ${
            this.value?.length
              ? html`<div class="badge">${this.value?.length}</div>
                  <ha-icon-button
                    .path=${mdiFilterVariantRemove}
                    @click=${this._clearFilter}
                  ></ha-icon-button>`
              : nothing
          }
        </div>
      </ha-expansion-panel>
      ${
        this._panel.showContent
          ? html`
              <div class="content" ${ref(this._content)}>
                <ha-input-search
                  appearance="outlined"
                  .value=${this._filter}
                  @input=${this._handleSearchChange}
                >
                </ha-input-search>
                ${
                  this._filter && !entities.length
                    ? html`<ha-filter-empty
                        .search=${this._filter}
                        @filter-search-cleared=${this._clearSearch}
                      ></ha-filter-empty>`
                    : html`<ha-list-selectable-virtualized
                        multi
                        class="ha-scrollbar"
                        .rows=${entities}
                        .rowRenderer=${this._renderItem}
                        @ha-list-item-selected=${this._handleAdded}
                        @ha-list-item-deselected=${this._handleRemoved}
                      ></ha-list-selectable-virtualized>`
                }
              </div>
            `
          : nothing
      }
    `;
  }

  private _renderItem = (item?: EntityItem) =>
    !item
      ? nothing
      : html`<ha-list-item-option
          style="width: 100%;"
          appearance="checkbox"
          selection-position="end"
          .value=${item.stateObj.entity_id}
          .selected=${this.value?.includes(item.stateObj.entity_id) ?? false}
        >
          <ha-state-icon
            slot="start"
            .stateObj=${item.stateObj}
          ></ha-state-icon>
          <span slot="headline">${item.name}</span>
        </ha-list-item-option>`;

  private _currentEntities() {
    return this._entities(
      this._states,
      this._formatters,
      this.type,
      this._filter || "",
      this._i18n.locale.language,
      this.value
    );
  }

  private _handleAdded(ev: CustomEvent<number>) {
    const entityId = this._currentEntities()[ev.detail]?.stateObj.entity_id;
    if (entityId) {
      this.value = [...(this.value ?? []), entityId];
    }
  }

  private _handleRemoved(ev: CustomEvent<number>) {
    const entityId = this._currentEntities()[ev.detail]?.stateObj.entity_id;
    if (entityId) {
      this.value = (this.value ?? []).filter((val) => val !== entityId);
    }
  }

  private _clearSearch() {
    this._filter = undefined;
  }

  private _expandedChanged(ev) {
    this.expanded = ev.detail.expanded;
  }

  private _handleSearchChange(ev: InputEvent) {
    const target = ev.target as HaInputSearch;
    this._filter = normalizeSearchText(target.value);
  }

  private _entities = memoizeOne(
    (
      states: ContextType<typeof statesContext>,
      formatters: ContextType<typeof formattersContext>,
      type: this["type"],
      filter: string,
      language: string | undefined,
      _value
    ): EntityItem[] =>
      Object.values(states)
        .filter((stateObj) => !type || computeStateDomain(stateObj) !== type)
        .map((stateObj) => ({
          id: stateObj.entity_id,
          interactive: true,
          stateObj,
          name: formatters.formatEntityName(stateObj),
        }))
        .filter((item) =>
          searchMatcher(filter)(item.stateObj.entity_id, item.name)
        )
        .sort((a, b) => stringCompare(a.name, b.name, language))
  );

  private async _findRelated() {
    const requestId = ++this._relatedRequestId;
    const relatedPromises: Promise<RelatedResult>[] = [];

    if (!this.value?.length) {
      this.value = [];
      fireEvent(this, "data-table-filter-changed", {
        value: [],
        items: undefined,
      });
      return;
    }

    for (const entityId of this.value) {
      if (this.type) {
        relatedPromises.push(findRelated(this._api, "entity", entityId));
      }
    }

    const results = await Promise.all(relatedPromises);

    // The value changed while this lookup ran
    if (requestId !== this._relatedRequestId) {
      return;
    }

    const items = new Set<string>();
    for (const result of results) {
      if (result[this.type!]) {
        result[this.type!]!.forEach((item) => items.add(item));
      }
    }

    fireEvent(this, "data-table-filter-changed", {
      value: this.value,
      items: this.type ? items : undefined,
    });
  }

  private _clearFilter(ev) {
    ev.preventDefault();
    this.value = undefined;
    fireEvent(this, "data-table-filter-changed", {
      value: undefined,
      items: undefined,
    });
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleScrollbar,
      filterPanelStyles,
      css`
        ha-list-selectable-virtualized {
          flex: 1;
          min-height: 0;
        }
        .header {
          display: flex;
          align-items: center;
        }
        .header ha-icon-button {
          margin-inline-start: auto;
          margin-inline-end: 8px;
        }
        .badge {
          display: inline-block;
          margin-left: 8px;
          margin-inline-start: 8px;
          margin-inline-end: 0;
          min-width: 16px;
          box-sizing: border-box;
          border-radius: var(--ha-border-radius-circle);
          font-size: var(--ha-font-size-xs);
          font-weight: var(--ha-font-weight-normal);
          background-color: var(--primary-color);
          line-height: var(--ha-line-height-normal);
          text-align: center;
          padding: 0px 2px;
          color: var(--text-primary-color);
        }
        ha-input-search {
          display: block;
          padding: var(--ha-space-1) var(--ha-space-2) 0;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-filter-entities": HaFilterEntities;
  }
}
