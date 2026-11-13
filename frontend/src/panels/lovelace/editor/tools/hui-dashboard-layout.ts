import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import type { LocalizeKeys } from "../../../../common/translations/localize";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-select";
import type { LovelaceConfig } from "../../../../data/lovelace/config/types";
import type { HomeAssistant } from "../../../../types";
import type { CardPath } from "../dashboard-tools";
import {
  hasSectionsLayout,
  listEditableCards,
  MAX_GRID_COLUMNS,
  replaceCard,
  setGridForCards,
  withGridOptions,
} from "./dashboard-edit";

const COLUMN_VALUES = [
  "",
  ...Array.from({ length: MAX_GRID_COLUMNS }, (_v, i) => String(i + 1)),
  "full",
];
const ROW_VALUES = [
  "",
  "auto",
  ...Array.from({ length: 8 }, (_v, i) => String(i + 1)),
];

const parse = (value: string): number | "full" | "auto" | undefined => {
  if (!value) {
    return undefined;
  }
  return value === "full" || value === "auto" ? value : Number(value);
};

/**
 * Size of the cards in a sections view. Columns and rows are the cards' real
 * `grid_options`; "same width" and "same height" set one value on every card
 * of a section at once. Cards cannot be dragged to free positions because a
 * sections view places cards on a grid, not at coordinates.
 */
@customElement("hui-dashboard-layout")
export class HuiDashboardLayout extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public config!: LovelaceConfig;

  @property({ type: Number }) public view = 0;

  private _t(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.lovelace.editor.dashboard_tools.editing.layout.${key}` as LocalizeKeys,
      values
    );
  }

  private _options(values: string[], defaultKey: string) {
    return values.map((value) => ({
      value,
      label: value
        ? value === "full" || value === "auto"
          ? this._t(value)
          : value
        : this._t(defaultKey),
    }));
  }

  protected render() {
    if (!hasSectionsLayout(this.config, this.view)) {
      return html`<ha-alert alert-type="info"
        >${this._t("not_sections")}</ha-alert
      >`;
    }
    const sections = new Map<number, ReturnType<typeof listEditableCards>>();
    listEditableCards(this.config)
      .filter((c) => c.path.view === this.view)
      .forEach((c) => {
        const list = sections.get(c.path.section) ?? [];
        list.push(c);
        sections.set(c.path.section, list);
      });
    if (!sections.size) {
      return html`<p class="hint">${this._t("empty")}</p>`;
    }
    return html`
      <p class="hint">${this._t("intro")}</p>
      ${[...sections.entries()].map(
        ([section, cards]) => html`
          <section>
            <div class="head">
              <h3>${this._t("section", { number: section + 1 })}</h3>
              <ha-select
                .label=${this._t("same_width")}
                .value=${""}
                .section=${section}
                .options=${this._options(COLUMN_VALUES.slice(1), "default")}
                @selected=${this._sameWidth}
              ></ha-select>
              <ha-select
                .label=${this._t("same_height")}
                .value=${""}
                .section=${section}
                .options=${this._options(ROW_VALUES.slice(1), "default")}
                @selected=${this._sameHeight}
              ></ha-select>
            </div>
            <ul>
              ${cards.map(
                (c) =>
                  html`<li>
                    <span class="name">${c.card.type}: ${c.label}</span>
                    <ha-select
                      .label=${this._t("columns")}
                      .value=${String(c.card.grid_options?.columns ?? "")}
                      .path=${c.path}
                      .options=${this._options(COLUMN_VALUES, "default")}
                      @selected=${this._columns}
                    ></ha-select>
                    <ha-select
                      .label=${this._t("rows")}
                      .value=${String(c.card.grid_options?.rows ?? "")}
                      .path=${c.path}
                      .options=${this._options(ROW_VALUES, "default")}
                      @selected=${this._rows}
                    ></ha-select>
                  </li>`
              )}
            </ul>
          </section>
        `
      )}
      ${nothing}
    `;
  }

  private _paths(section: number): CardPath[] {
    return listEditableCards(this.config)
      .filter((c) => c.path.view === this.view && c.path.section === section)
      .map((c) => c.path);
  }

  private _emit(config: LovelaceConfig) {
    fireEvent(this, "dashboard-config-change", { config });
  }

  private _sameWidth(ev: CustomEvent<{ value?: string }>) {
    const section = (ev.currentTarget as HTMLElement & { section: number })
      .section;
    const value = parse(ev.detail.value ?? "");
    if (value !== undefined) {
      this._emit(
        setGridForCards(this.config, this._paths(section), {
          columns: value as number | "full",
        })
      );
    }
  }

  private _sameHeight(ev: CustomEvent<{ value?: string }>) {
    const section = (ev.currentTarget as HTMLElement & { section: number })
      .section;
    const value = parse(ev.detail.value ?? "");
    if (value !== undefined) {
      this._emit(
        setGridForCards(this.config, this._paths(section), {
          rows: value as number | "auto",
        })
      );
    }
  }

  private _change(
    ev: CustomEvent<{ value?: string }>,
    key: "columns" | "rows"
  ) {
    const path = (ev.currentTarget as HTMLElement & { path: CardPath }).path;
    const card = listEditableCards(this.config).find(
      (c) =>
        c.path.view === path.view &&
        c.path.section === path.section &&
        c.path.card === path.card
    )?.card;
    if (!card) {
      return;
    }
    const value = parse(ev.detail.value ?? "");
    if ((card.grid_options?.[key] ?? undefined) === value) {
      return;
    }
    this._emit(
      replaceCard(this.config, path, withGridOptions(card, { [key]: value }))
    );
  }

  private _columns(ev: CustomEvent<{ value?: string }>) {
    this._change(ev, "columns");
  }

  private _rows(ev: CustomEvent<{ value?: string }>) {
    this._change(ev, "rows");
  }

  static styles = css`
    .hint {
      margin-top: 0;
      color: var(--secondary-text-color);
    }
    section {
      margin-bottom: var(--ha-space-3);
      padding: var(--ha-space-4);
      border-radius: var(--ha-border-radius-xl);
      background: var(
        --ha-color-surface-tone-1,
        var(--secondary-background-color)
      );
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-3);
    }
    h3 {
      margin: 0;
      flex: 1 1 auto;
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-semibold);
    }
    ul {
      list-style: none;
      margin: var(--ha-space-3) 0 0;
      padding: 0;
    }
    li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-3);
      padding: var(--ha-space-2) 0;
    }
    .name {
      flex: 1 1 160px;
      font-family: var(--ha-font-family-code);
      font-size: var(--ha-font-size-s);
    }
    ha-select {
      flex: 0 1 150px;
      min-width: 120px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-dashboard-layout": HuiDashboardLayout;
  }
}
