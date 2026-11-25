import type { ContextType } from "@lit/context";
import { mdiCog, mdiFilterVariantRemove } from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { createRef, ref } from "lit/directives/ref";
import { repeat } from "lit/directives/repeat";
import memoizeOne from "memoize-one";
import { normalizeSearchText, searchMatcher } from "../common/regex/filter";
import { consume } from "../common/decorators/consume";
import {
  FilterPanelController,
  filterPanelStyles,
} from "../common/controllers/filter-panel-controller";
import { consumeLocalize } from "../common/decorators/consume-context-entry";
import { fireEvent } from "../common/dom/fire_event";
import { navigate } from "../common/navigate";
import { stringCompare } from "../common/string/compare";
import type { LocalizeFunc } from "../common/translations/localize";
import { internationalizationContext, labelsContext } from "../data/context";
import type { LabelRegistryEntry } from "../data/label/label_registry";
import { haStyleScrollbar } from "../resources/styles";
import "./ha-expansion-panel";
import "./ha-filter-empty";
import "./ha-icon";
import "./ha-icon-button";
import "./ha-label";
import "./ha-svg-icon";
import "./input/ha-input-search";
import type { HaInputSearch } from "./input/ha-input-search";
import "./item/ha-list-item-button";
import "./item/ha-list-item-option";
import type { HaListItemOption } from "./item/ha-list-item-option";
import "./list/ha-list-selectable";
import type { HaListSelectable } from "./list/ha-list-selectable";

@customElement("ha-filter-labels")
export class HaFilterLabels extends LitElement {
  @property({ attribute: false }) public value?: string[];

  @property({ type: Boolean }) public narrow = false;

  @property({ type: Boolean, reflect: true }) public expanded = false;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @consume({ context: internationalizationContext, subscribe: true })
  @state()
  private _i18n!: ContextType<typeof internationalizationContext>;

  @consume({ context: labelsContext, subscribe: true })
  @state()
  private _labels?: LabelRegistryEntry[];

  @state() private _filter?: string;

  @query("ha-list-selectable") private _list?: HaListSelectable;

  private _content = createRef<HTMLElement>();

  private _panel = new FilterPanelController(this, this._content);

  private _filteredLabels = memoizeOne(
    // `_value` used to recalculate the memoization when the selection changes
    (
      labels: LabelRegistryEntry[],
      filter: string | undefined,
      language: string | undefined,
      _value
    ) =>
      labels
        .filter((label) => searchMatcher(filter)(label.name, label.label_id))
        .sort((a, b) =>
          stringCompare(a.name || a.label_id, b.name || b.label_id, language)
        )
  );

  protected render() {
    return html`
      <ha-expansion-panel
        left-chevron
        .expanded=${this.expanded}
        @expanded-changed=${this._expandedChanged}
      >
        <div slot="header" class="header">
          ${this._localize("ui.panel.config.labels.caption")}
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
      ${this._panel.showContent ? this._renderContent() : nothing}
    `;
  }

  private _renderContent() {
    const labels = this._filteredLabels(
      this._labels || [],
      this._filter,
      this._i18n.locale.language,
      this.value
    );
    const noMatch = !!this._filter && !labels.length;

    return html`<div class="content" ${ref(this._content)}>
      <ha-input-search
        appearance="outlined"
        .value=${this._filter}
        @input=${this._handleSearchChange}
      >
      </ha-input-search>
      <ha-list-selectable
        class="ha-scrollbar"
        ?hidden=${noMatch}
        multi
        controlled
        aria-label=${this._localize("ui.panel.config.labels.caption")}
        @ha-list-item-selected=${this._labelToggled}
        @ha-list-item-deselected=${this._labelToggled}
      >
        ${repeat(
          labels,
          (label) => label.label_id,
          (label) =>
            html`<ha-list-item-option
              appearance="checkbox"
              selection-position="end"
              .value=${label.label_id}
              .selected=${(this.value || []).includes(label.label_id)}
            >
              <ha-label
                slot="headline"
                .color=${label.color}
                .description=${label.description}
              >
                ${
                  label.icon
                    ? html`<ha-icon slot="icon" .icon=${label.icon}></ha-icon>`
                    : nothing
                }
                ${label.name}
              </ha-label>
            </ha-list-item-option>`
        )}
      </ha-list-selectable>
      ${
        noMatch
          ? html`<ha-filter-empty
              .search=${this._filter}
              @filter-search-cleared=${this._clearSearch}
            ></ha-filter-empty>`
          : nothing
      }
      <ha-list-item-button
        .headline=${this._localize("ui.panel.config.labels.manage_labels")}
        @click=${this._manageLabels}
      >
        <ha-svg-icon slot="start" .path=${mdiCog}></ha-svg-icon>
      </ha-list-item-button>
    </div>`;
  }

  private _manageLabels() {
    navigate("/config/labels");
  }

  private _expandedChanged(ev) {
    this.expanded = ev.detail.expanded;
  }

  private _handleSearchChange(ev: InputEvent) {
    const value = (ev.target as HaInputSearch).value ?? "";
    this._filter = normalizeSearchText(value);
  }

  private _labelToggled(ev: CustomEvent<number>) {
    const option = this._list?.items[ev.detail] as HaListItemOption | undefined;
    const labelId = option?.value;
    if (!labelId) {
      return;
    }

    // Labels chosen earlier that the search hides stay chosen.
    const value = new Set(this.value || []);
    if (!value.delete(labelId)) {
      value.add(labelId);
    }
    this.value = [...value];

    fireEvent(this, "data-table-filter-changed", {
      value: this.value.length ? this.value : undefined,
      items: undefined,
    });
  }

  private _clearSearch() {
    this._filter = undefined;
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
        .warning {
          color: var(--error-color);
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
    "ha-filter-labels": HaFilterLabels;
  }
}
