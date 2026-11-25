import type { ContextType } from "@lit/context";
import { mdiFilterVariantRemove } from "@mdi/js";
import type { CSSResultGroup, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { createRef, ref } from "lit/directives/ref";
import memoizeOne from "memoize-one";
import { normalizeSearchText, searchMatcher } from "../common/regex/filter";
import {
  FilterPanelController,
  filterPanelStyles,
} from "../common/controllers/filter-panel-controller";
import { consume } from "../common/decorators/consume";
import { consumeLocalize } from "../common/decorators/consume-context-entry";
import type { LocalizeFunc } from "../common/translations/localize";
import { fireEvent } from "../common/dom/fire_event";
import { deepEqual } from "../common/util/deep-equal";
import type { Blueprint, Blueprints } from "../data/blueprint";
import { fetchBlueprints } from "../data/blueprint";
import { apiContext } from "../data/context";
import type { RelatedResult } from "../data/search";
import { findRelated } from "../data/search";
import { haStyleScrollbar } from "../resources/styles";
import "./ha-expansion-panel";
import "./ha-filter-empty";
import "./ha-filter-hidden-count";
import "./ha-icon-button";
import "./input/ha-input-search";
import type { HaInputSearch } from "./input/ha-input-search";
import "./item/ha-list-item-option";
import type { HaListItemOption } from "./item/ha-list-item-option";
import "./list/ha-list-selectable";
import type { HaListSelectable } from "./list/ha-list-selectable";

@customElement("ha-filter-blueprints")
export class HaFilterBlueprints extends LitElement {
  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @consume({ context: apiContext, subscribe: true })
  private _api!: ContextType<typeof apiContext>;

  @property({ attribute: false }) public value?: string[];

  @property() public type?: "automation" | "script";

  @property({ type: Boolean }) public narrow = false;

  @property({ type: Boolean, reflect: true }) public expanded = false;

  @state() private _blueprints?: Blueprints;

  @state() private _filter?: string;

  @query("ha-list-selectable") private _list?: HaListSelectable;

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
    return html`
      <ha-expansion-panel
        left-chevron
        .expanded=${this.expanded}
        @expanded-changed=${this._expandedChanged}
      >
        <div slot="header" class="header">
          ${this._localize("ui.panel.config.blueprint.caption")}
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
                ${
                  this._blueprints
                    ? this._renderList(this._blueprints)
                    : html`<ha-filter-empty mode="loading"></ha-filter-empty>`
                }
              </div>
            `
          : nothing
      }
    `;
  }

  // The blueprints that can be chosen (those that loaded without an error),
  // and the ones the search shows. The search only hides blueprints.
  private _usable = memoizeOne(
    (blueprints: Blueprints): [string, Blueprint][] =>
      Object.entries(blueprints).filter(
        (entry): entry is [string, Blueprint] => !("error" in entry[1])
      )
  );

  private _shown = memoizeOne(
    (usable: [string, Blueprint][], filter: string | undefined) => {
      const matches = searchMatcher(filter);
      return usable.filter(([id, blueprint]) =>
        matches(blueprint.metadata.name, id)
      );
    }
  );

  private _renderList(blueprints: Blueprints) {
    const usable = this._usable(blueprints);
    const shown = this._shown(usable, this._filter);
    const noMatch = !!this._filter && !!usable.length && !shown.length;
    return html`
      <ha-input-search
        appearance="outlined"
        .value=${this._filter}
        @input=${this._handleSearchChange}
      ></ha-input-search>
      <ha-list-selectable
        class="ha-scrollbar"
        ?hidden=${noMatch}
        multi
        controlled
        aria-label=${this._localize("ui.panel.config.blueprint.caption")}
        @ha-list-item-selected=${this._blueprintToggled}
        @ha-list-item-deselected=${this._blueprintToggled}
      >
        ${shown.map(
          ([id, blueprint]) =>
            html`<ha-list-item-option
              appearance="checkbox"
              selection-position="end"
              .value=${id}
              .selected=${(this.value || []).includes(id)}
            >
              <span slot="headline">${blueprint.metadata.name || id}</span>
            </ha-list-item-option>`
        )}
      </ha-list-selectable>
      ${
        noMatch
          ? html`<ha-filter-empty
              .search=${this._filter}
              @filter-search-cleared=${this._clearSearch}
            ></ha-filter-empty>`
          : html`<ha-filter-hidden-count
              .hiddenCount=${usable.length - shown.length}
              .total=${usable.length}
            ></ha-filter-hidden-count>`
      }
    `;
  }

  private _handleSearchChange(ev: InputEvent) {
    this._filter = normalizeSearchText((ev.target as HaInputSearch).value);
  }

  protected async firstUpdated() {
    if (!this.type) {
      return;
    }
    this._blueprints = await fetchBlueprints(this._api.callWS, this.type);
  }

  private _expandedChanged(ev) {
    this.expanded = ev.detail.expanded;
  }

  private _blueprintToggled(ev: CustomEvent<number>) {
    const option = this._list?.items[ev.detail] as HaListItemOption | undefined;
    const blueprintId = option?.value;
    if (!blueprintId) {
      return;
    }

    // Blueprints chosen earlier that the search hides stay chosen.
    const value = new Set(this.value || []);
    if (!value.delete(blueprintId)) {
      value.add(blueprintId);
    }

    if (!value.size) {
      fireEvent(this, "data-table-filter-changed", {
        value: [],
        items: undefined,
      });
      this.value = [];
      return;
    }

    this.value = [...value];
  }

  private _clearSearch() {
    this._filter = undefined;
  }

  private async _findRelated() {
    const requestId = ++this._relatedRequestId;
    if (!this.value?.length) {
      this.value = [];
      fireEvent(this, "data-table-filter-changed", {
        value: [],
        items: undefined,
      });
      return;
    }

    const relatedPromises: Promise<RelatedResult>[] = [];

    for (const blueprintId of this.value) {
      if (this.type) {
        relatedPromises.push(
          findRelated(this._api, `${this.type}_blueprint`, blueprintId)
        );
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
        ha-list-selectable {
          display: flex;
          flex: 1;
          min-height: 0;
        }
        ha-list-selectable::part(base) {
          flex: 1;
          min-height: 0;
        }
        ha-input-search {
          display: block;
          padding: var(--ha-space-1) var(--ha-space-2) 0;
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
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-filter-blueprints": HaFilterBlueprints;
  }
}
