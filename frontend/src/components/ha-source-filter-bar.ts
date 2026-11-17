import {
  mdiFilterVariant,
  mdiFilterVariantRemove,
  mdiPuzzleOutline,
  mdiShapeOutline,
  mdiTuneVariant,
} from "@mdi/js";
import type { HassServiceTarget } from "home-assistant-js-websocket";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import type {
  HASSDomEvent,
  HASSDomTargetEvent,
} from "../common/dom/fire_event";
import { fireEvent } from "../common/dom/fire_event";
import type { DataTableFiltersValue } from "../data/data_table_filters";
import type { HaEntityPickerEntityFilterFunc } from "../data/entity/entity";
import type { EntitySources } from "../data/entity/entity_sources";
import type { HomeAssistant } from "../types";
import "./ha-adaptive-dialog";
import "./ha-button";
import "./ha-dialog-footer";
import "./ha-filter-entity-types";
import "./ha-filter-integrations";
import "./ha-filter-logbook-causes";
import "./ha-filter-pane-chip";
import "./ha-icon-button";
import "./ha-svg-icon";
import type { SourceFilters } from "./ha-sources-picker";
import {
  countSourceFilters,
  countTargets,
  sourceFiltersStyles,
} from "./ha-sources-picker";

/** The filters a page can offer next to the entities it shows. */
export type SourceFilterKey = "types" | "integrations" | "causes";

export interface SourceBarFilters extends SourceFilters {
  /** Keys from `computeLogbookCauseKey`. */
  causes?: string[];
}

type OpenFilter = "all" | "sources" | SourceFilterKey;

type ExpandableFilter = HTMLElement & { expanded: boolean };

/**
 * The filters of an activity or history page as one row of pills: entities,
 * type, integration and, where the page has them, cause. Each pill shows how
 * many choices it holds and opens that one filter in a dialog. On a phone the
 * row is a single Filters pill that opens every filter in one bottom sheet.
 *
 * The page keeps the state. This element only edits it through events:
 * `sources-changed`, `source-filter-changed` and `sources-cleared`, and tells
 * the page when a dialog or sheet is open with `filter-sheet-changed`, so that
 * a phone can wait to fetch results until the sheet closes.
 */
@customElement("ha-source-filter-bar")
export class HaSourceFilterBar extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  /** The picked entities, areas, devices, floors and labels. */
  @property({ attribute: false }) public targets: HassServiceTarget = {};

  @property({ attribute: false }) public filters: SourceBarFilters = {};

  @property({ attribute: false }) public entitySources?: EntitySources;

  @property({ attribute: false })
  public entityFilter?: HaEntityPickerEntityFilterFunc;

  /** Explains what the page shows while nothing is picked. */
  @property({ attribute: "no-targets-text" }) public noTargetsText?: string;

  @property({ type: Boolean, attribute: "show-causes" })
  public showCauses = false;

  @property({ type: Boolean }) public disabled = false;

  /** How many entities the choices resolve to, when the page narrows them. */
  @property({ attribute: false }) public resultCount?: number;

  /** The label of the entities pill. */
  @property({ attribute: "sources-label" }) public sourcesLabel = "";

  /** The title of the phone sheet and its pill, for example with a count. */
  @property({ attribute: "sources-count-label" })
  public sourcesCountLabel?: string;

  @state() private _open?: OpenFilter;

  // Only one filter of the phone sheet is expanded at a time, so that its
  // list can use the height that is left.
  @state() private _expandedFilter?: string;

  /** Opens the entities choice, or the whole sheet on a phone. */
  public openSources(): void {
    this._setOpen(this.narrow ? "all" : "sources");
  }

  protected render() {
    const filterCount = countSourceFilters(this.filters);
    const targetCount = countTargets(this.targets);
    const total = targetCount + filterCount;
    return html`${
      this.narrow
        ? html`<ha-filter-pane-chip
            .label=${this.sourcesCountLabel ?? this.sourcesLabel}
            .path=${mdiTuneVariant}
            .count=${filterCount}
            .active=${total > 0}
            .disabled=${this.disabled}
            @click=${this._openAll}
          ></ha-filter-pane-chip>`
        : this._renderPills(targetCount, total)
    }${this._renderDialog(total)}`;
  }

  private _renderPills(targetCount: number, total: number) {
    const localize = this.hass.localize;
    const pill = (
      key: OpenFilter,
      label: string,
      path: string,
      count: number
    ) =>
      html`<ha-filter-pane-chip
        data-filter=${key}
        .label=${label}
        .path=${path}
        .count=${count}
        .active=${count > 0}
        .disabled=${this.disabled}
        @click=${this._openFromPill}
      ></ha-filter-pane-chip>`;
    return html`
      ${pill("sources", this.sourcesLabel, mdiTuneVariant, targetCount)}
      ${pill(
        "types",
        localize("ui.components.filter-entity-types.caption"),
        mdiShapeOutline,
        this.filters.types?.length ?? 0
      )}
      ${pill(
        "integrations",
        localize("ui.panel.config.integrations.caption"),
        mdiPuzzleOutline,
        this.filters.integrations?.length ?? 0
      )}
      ${
        this.showCauses
          ? pill(
              "causes",
              localize("ui.components.logbook.cause_filter.caption"),
              mdiFilterVariant,
              this.filters.causes?.length ?? 0
            )
          : nothing
      }
      ${
        total > 0
          ? html`<ha-button
              appearance="plain"
              size="s"
              .disabled=${this.disabled}
              @click=${this._clear}
            >
              <ha-svg-icon slot="start" .path=${mdiFilterVariantRemove}>
              </ha-svg-icon>
              ${localize("ui.components.subpage-data-table.clear_filter")}
            </ha-button>`
          : nothing
      }
    `;
  }

  private _renderDialog(total: number) {
    const open = this._open;
    if (!open) {
      return nothing;
    }
    const localize = this.hass.localize;
    const all = open === "all";
    const title = all
      ? (this.sourcesCountLabel ?? this.sourcesLabel)
      : this._filterLabel(open);

    return html`
      <ha-adaptive-dialog
        open
        flexcontent
        .headerTitle=${title}
        @closed=${this._closed}
      >
        ${
          all && total > 0
            ? html`<ha-icon-button
                slot="headerActionItems"
                .path=${mdiFilterVariantRemove}
                .disabled=${this.disabled}
                .label=${localize(
                  "ui.components.subpage-data-table.clear_filter"
                )}
                @click=${this._clear}
              ></ha-icon-button>`
            : nothing
        }
        <div class="sheet-content">
          ${all || open === "sources" ? this._renderPicker() : nothing}
          ${
            all
              ? html`<div
                  class=${classMap({
                    filters: true,
                    expanded: !!this._expandedFilter,
                  })}
                >
                  ${this._renderFilter("types", false)}
                  ${this._renderFilter("integrations", false)}
                  ${this.showCauses ? this._renderFilter("causes", false) : nothing}
                </div>`
              : open !== "sources"
                ? html`<div class="filters single">
                    ${this._renderFilter(open, true)}
                  </div>`
                : nothing
          }
        </div>
        <ha-dialog-footer slot="footer">
          <ha-button slot="primaryAction" data-dialog="close">
            ${
              this.resultCount === undefined
                ? localize("ui.common.close")
                : localize("ui.components.subpage-data-table.show_results", {
                    number: this.resultCount,
                  })
            }
          </ha-button>
        </ha-dialog-footer>
      </ha-adaptive-dialog>
    `;
  }

  private _renderPicker() {
    return html`<ha-sources-picker
      .hass=${this.hass}
      .value=${this.targets}
      .filters=${this.filters}
      .entitySources=${this.entitySources}
      .entityFilter=${this.entityFilter}
      .disabled=${this.disabled}
      .description=${this.noTargetsText}
      @value-changed=${this._targetsChanged}
    ></ha-sources-picker>`;
  }

  /** One filter. Alone in its dialog it stays open, in the sheet it folds. */
  private _renderFilter(key: SourceFilterKey, alone: boolean) {
    const tag = this._filterTag(key);
    const expanded = alone || this._expandedFilter === tag;
    const expandedChanged = alone ? this._keepExpanded : this._filterExpanded;
    const changed = (
      ev: HASSDomEvent<HASSDomEvents["data-table-filter-changed"]>
    ) => this._filterChanged(key, ev);

    switch (key) {
      case "types":
        return html`<ha-filter-entity-types
          .value=${this.filters.types}
          .expanded=${expanded}
          @data-table-filter-changed=${changed}
          @expanded-changed=${expandedChanged}
        ></ha-filter-entity-types>`;
      case "integrations":
        return html`<ha-filter-integrations
          .value=${this.filters.integrations}
          .expanded=${expanded}
          @data-table-filter-changed=${changed}
          @expanded-changed=${expandedChanged}
        ></ha-filter-integrations>`;
      default:
        return html`<ha-filter-logbook-causes
          .value=${this.filters.causes}
          .expanded=${expanded}
          @data-table-filter-changed=${changed}
          @expanded-changed=${expandedChanged}
        ></ha-filter-logbook-causes>`;
    }
  }

  private _filterTag(key: SourceFilterKey): string {
    switch (key) {
      case "types":
        return "ha-filter-entity-types";
      case "integrations":
        return "ha-filter-integrations";
      default:
        return "ha-filter-logbook-causes";
    }
  }

  private _filterLabel(open: OpenFilter): string {
    const localize = this.hass.localize;
    switch (open) {
      case "types":
        return localize("ui.components.filter-entity-types.caption");
      case "integrations":
        return localize("ui.panel.config.integrations.caption");
      case "causes":
        return localize("ui.components.logbook.cause_filter.caption");
      default:
        return this.sourcesLabel;
    }
  }

  private _openAll(): void {
    this._setOpen("all");
  }

  private _openFromPill(ev: Event): void {
    const key = (ev.currentTarget as HTMLElement).dataset.filter as OpenFilter;
    this._setOpen(key);
  }

  private _setOpen(open?: OpenFilter): void {
    if (this._open === open) {
      return;
    }
    const wasOpen = this._open !== undefined;
    this._open = open;
    if (!open) {
      this._expandedFilter = undefined;
    }
    if (wasOpen !== (open !== undefined)) {
      fireEvent(this, "filter-sheet-changed", { open: open !== undefined });
    }
  }

  private _closed(ev: Event): void {
    if (ev.target !== ev.currentTarget) {
      return;
    }
    this._setOpen(undefined);
  }

  private _targetsChanged(ev: CustomEvent<{ value: HassServiceTarget }>): void {
    ev.stopPropagation();
    fireEvent(this, "sources-changed", { value: ev.detail.value || {} });
  }

  private _filterChanged(
    key: SourceFilterKey,
    ev: HASSDomEvent<HASSDomEvents["data-table-filter-changed"]>
  ): void {
    ev.stopPropagation();
    fireEvent(this, "source-filter-changed", { key, value: ev.detail.value });
  }

  private _filterExpanded = (
    ev: HASSDomEvent<HASSDomEvents["expanded-changed"]> &
      HASSDomTargetEvent<HTMLElement>
  ): void => {
    ev.stopPropagation();
    if (ev.detail.expanded) {
      this._expandedFilter = ev.target.localName;
    } else if (this._expandedFilter === ev.target.localName) {
      this._expandedFilter = undefined;
    }
  };

  // A filter that is alone in its dialog has nothing to fold into.
  private _keepExpanded = (ev: Event): void => {
    ev.stopPropagation();
    const filter = ev.target as ExpandableFilter;
    if (!filter.expanded) {
      filter.expanded = true;
    }
  };

  private _clear(): void {
    fireEvent(this, "sources-cleared");
  }

  static get styles(): CSSResultGroup {
    return [
      sourceFiltersStyles,
      css`
        /* The pills are items of the page's own toolbar row. */
        :host {
          display: contents;
        }

        .sheet-content {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
          overflow-y: auto;
        }

        /* One filter alone in its dialog takes the height it needs. */
        .filters.single {
          border-top: 0;
          min-height: min(360px, 100%);
        }

        ha-adaptive-dialog {
          --dialog-content-padding: 0;
          /* Fixed height so the sheet does not resize while filtering. */
          --ha-bottom-sheet-height: calc(100dvh - var(--ha-space-12));
          --ha-generic-picker-width: min(400px, calc(100vw - 32px));
          --ha-generic-picker-max-width: 400px;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-source-filter-bar": HaSourceFilterBar;
  }
  interface HASSDomEvents {
    "sources-changed": { value: HassServiceTarget };
    "source-filter-changed": {
      key: SourceFilterKey;
      value: DataTableFiltersValue;
    };
    "sources-cleared": undefined;
    "filter-sheet-changed": { open: boolean };
  }
}
