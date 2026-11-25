import type { ContextType } from "@lit/context";
import { mdiFilterVariantRemove } from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
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
import { computeDomain } from "../common/entity/compute_domain";
import { stringCompare } from "../common/string/compare";
import type { LocalizeFunc } from "../common/translations/localize";
import { internationalizationContext, statesContext } from "../data/context";
import { domainToName } from "../data/integration";
import { haStyleScrollbar } from "../resources/styles";
import "./ha-domain-icon";
import "./ha-expansion-panel";
import "./ha-filter-empty";
import "./input/ha-input-search";
import type { HaInputSearch } from "./input/ha-input-search";
import "./item/ha-list-item-option";
import type { HaListItemOption } from "./item/ha-list-item-option";
import "./list/ha-list-selectable";
import type { HaListSelectable } from "./list/ha-list-selectable";

@customElement("ha-filter-domains")
export class HaFilterDomains extends LitElement {
  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @consume({ context: statesContext, subscribe: true })
  @state()
  private _states!: ContextType<typeof statesContext>;

  @consume({ context: internationalizationContext, subscribe: true })
  @state()
  private _i18n!: ContextType<typeof internationalizationContext>;

  @property({ attribute: false }) public value?: string[];

  @property({ type: Boolean }) public narrow = false;

  @property({ type: Boolean, reflect: true }) public expanded = false;

  @state() private _filter?: string;

  @query("ha-list-selectable") private _list?: HaListSelectable;

  private _content = createRef<HTMLElement>();

  private _panel = new FilterPanelController(this, this._content);

  protected render() {
    return html`
      <ha-expansion-panel
        left-chevron
        .expanded=${this.expanded}
        @expanded-changed=${this._expandedChanged}
      >
        <div slot="header" class="header">
          ${this._localize("ui.panel.config.domains.caption")}
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
    const domains = this._domains(
      this._states,
      this._localize,
      this._i18n.locale.language,
      this._filter,
      this.value
    );
    const noMatch = !!this._filter && !domains.length;

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
        aria-label=${this._localize("ui.panel.config.domains.caption")}
        @ha-list-item-selected=${this._handleItemToggled}
        @ha-list-item-deselected=${this._handleItemToggled}
      >
        ${repeat(
          domains,
          (i) => i,
          (domain) =>
            html`<ha-list-item-option
              appearance="checkbox"
              selection-position="end"
              .value=${domain}
              .selected=${(this.value || []).includes(domain)}
            >
              <ha-domain-icon
                slot="start"
                .domain=${domain}
                brand-fallback
              ></ha-domain-icon>
              <span slot="headline"
                >${domainToName(this._localize, domain)}</span
              >
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
    </div>`;
  }

  private _domains = memoizeOne(
    (
      states: ContextType<typeof statesContext>,
      localize: LocalizeFunc,
      language: string | undefined,
      filter: string | undefined,
      _value
    ) => {
      const domains = new Set<string>();
      Object.keys(states).forEach((entityId) => {
        domains.add(computeDomain(entityId));
      });

      return Array.from(domains.values())
        .map((domain) => ({
          domain,
          name: domainToName(localize, domain),
        }))
        .filter((entry) => searchMatcher(filter)(entry.domain, entry.name))
        .sort((a, b) => stringCompare(a.name, b.name, language))
        .map((entry) => entry.domain);
    }
  );

  private _expandedChanged(ev) {
    this.expanded = ev.detail.expanded;
  }

  private _handleItemToggled(ev: CustomEvent<number>) {
    const option = this._list?.items[ev.detail] as HaListItemOption | undefined;
    const domain = option?.value;
    if (!domain) {
      return;
    }

    // Domains chosen earlier that the search hides stay chosen.
    const value = new Set(this.value || []);
    if (!value.delete(domain)) {
      value.add(domain);
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

  private _handleSearchChange(ev: InputEvent) {
    const target = ev.target as HaInputSearch;
    this._filter = normalizeSearchText(target.value);
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
          margin-inline-end: initial;
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
    "ha-filter-domains": HaFilterDomains;
  }
}
