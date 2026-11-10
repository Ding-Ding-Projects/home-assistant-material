import { mdiCalendar, mdiClose, mdiExportVariant } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import type { ChangelogDay } from "../../../common/changelog/parse-changelog";
import {
  filterDays,
  splitCode,
} from "../../../common/changelog/parse-changelog";
import { fireEvent } from "../../../common/dom/fire_event";
import { searchMatcher } from "../../../common/regex/filter";
import "../../../components/ha-button";
import "../../../components/ha-svg-icon";
import "../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import "../../../layouts/hass-subpage";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";

/** Where the project's changes can be looked at one by one. */
const COMMIT_URL =
  "https://github.com/Ding-Ding-Projects/home-assistant-material/commit/";

type Range = "all" | "week" | "month" | "custom";

const isoDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

/**
 * What changed: the project's changelog, as it was when this build was
 * made, with a search and a range of days. It ships with the interface,
 * so it opens without a connection.
 */
@customElement("ha-config-changelog")
class HaConfigChangelog extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() private _days?: ChangelogDay[];

  @state() private _filter = "";

  @state() private _range: Range = "all";

  @state() private _from = "";

  @state() private _to = "";

  @query("hass-subpage") private _page?: HTMLElement;

  protected firstUpdated(): void {
    import("../../../data/changelog.json").then((module) => {
      this._days = module.default.days;
    });
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.changelog.${key}` as any,
      values
    );
  }

  private _bounds(): { from?: string; to?: string } {
    const today = new Date();
    if (this._range === "week") {
      const start = new Date(today);
      start.setDate(today.getDate() - 6);
      return { from: isoDate(start), to: isoDate(today) };
    }
    if (this._range === "month") {
      return {
        from: isoDate(new Date(today.getFullYear(), today.getMonth(), 1)),
        to: isoDate(today),
      };
    }
    if (this._range === "custom") {
      return { from: this._from || undefined, to: this._to || undefined };
    }
    return {};
  }

  private _shown(): ChangelogDay[] {
    const { from, to } = this._bounds();
    const matches = searchMatcher(this._filter);
    return filterDays(this._days ?? [], from, to)
      .map((day) => ({
        date: day.date,
        items: day.items.filter((item) =>
          matches(item.text, item.commit, day.date)
        ),
      }))
      .filter((day) => day.items.length);
  }

  private _formatDay(date: string): string {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(
      this.hass.locale.language,
      { day: "numeric", month: "long", year: "numeric" }
    );
  }

  protected render(): TemplateResult {
    const title = this._l("title");
    const days = this._shown();
    const all = this._days ?? [];
    const total = all.reduce((sum, day) => sum + day.items.length, 0);
    const shown = days.reduce((sum, day) => sum + day.items.length, 0);
    const search = this._l("search");
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config/info"
        .header=${title}
        .breadcrumb=${`${this.hass.localize("panel.config")}, ${this.hass.localize(
          "ui.panel.config.info.caption"
        )}`}
      >
        <div class="content">
          <div class="filters">
            <ha-input-search
              appearance="outlined"
              .placeholder=${search}
              .accessibleLabel=${search}
              .value=${this._filter}
              .patternSamples=${all.flatMap((day) =>
                day.items.map((item) => item.text)
              )}
              @input=${this._filterChanged}
            ></ha-input-search>
            <div class="chips" role="group" aria-label=${this._l("range")}>
              ${(["all", "week", "month", "custom"] as const).map(
                (range) => html`
                  <button
                    type="button"
                    class=${classMap({ chip: true, on: range === this._range })}
                    aria-pressed=${range === this._range ? "true" : "false"}
                    data-range=${range}
                    @click=${this._pickRange}
                  >
                    ${
                      range === "custom"
                        ? html`<ha-svg-icon .path=${mdiCalendar}></ha-svg-icon>`
                        : nothing
                    }
                    ${this._l(`range_${range}`)}
                  </button>
                `
              )}
            </div>
            <ha-button size="s" appearance="plain" @click=${this._export}>
              <ha-svg-icon slot="start" .path=${mdiExportVariant}></ha-svg-icon>
              ${this._l("export")}
            </ha-button>
          </div>
          ${
            this._range === "custom"
              ? html`<div class="dates">
                  <label>
                    <span>${this._l("from")}</span>
                    <input
                      type="date"
                      max=${this._to || nothing}
                      .value=${this._from}
                      data-end="from"
                      @change=${this._dateChanged}
                    />
                  </label>
                  <label>
                    <span>${this._l("to")}</span>
                    <input
                      type="date"
                      min=${this._from || nothing}
                      .value=${this._to}
                      data-end="to"
                      @change=${this._dateChanged}
                    />
                  </label>
                  <ha-button
                    size="s"
                    appearance="plain"
                    @click=${this._clearDates}
                  >
                    <ha-svg-icon slot="start" .path=${mdiClose}></ha-svg-icon>
                    ${this._l("clear_dates")}
                  </ha-button>
                </div>`
              : nothing
          }
          ${
            !this._days
              ? nothing
              : !days.length
                ? html`<p class="empty" role="status">${this._l("empty")}</p>`
                : days.map(
                    (day) => html`
                      <section class="day">
                        <h2>${this._formatDay(day.date)}</h2>
                        <ul>
                          ${day.items.map(
                            (item) => html`
                              <li>
                                <span class="text"
                                  >${splitCode(item.text).map((part) =>
                                    part.code
                                      ? html`<code>${part.text}</code>`
                                      : part.text
                                  )}</span
                                >
                                ${
                                  item.commit
                                    ? html`<a
                                        class="commit"
                                        href=${COMMIT_URL + item.commit}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title=${this._l("open_commit")}
                                        >${item.commit.slice(0, 7)}</a
                                      >`
                                    : nothing
                                }
                              </li>
                            `
                          )}
                        </ul>
                      </section>
                    `
                  )
          }
          <p class="note" role="status">
            ${this._l("count", { shown, total })} ${this._l("note")}
          </p>
        </div>
      </hass-subpage>
    `;
  }

  private _filterChanged(ev: Event): void {
    this._filter = (ev.target as HaInputSearch).value ?? "";
  }

  private _pickRange(ev: Event): void {
    this._range = (ev.currentTarget as HTMLElement).dataset.range as Range;
  }

  private _dateChanged(ev: Event): void {
    const input = ev.currentTarget as HTMLInputElement;
    if (input.dataset.end === "from") {
      this._from = input.value;
    } else {
      this._to = input.value;
    }
  }

  private _clearDates(): void {
    this._from = "";
    this._to = "";
  }

  private _export(ev: Event): void {
    if (!this._page) {
      return;
    }
    fireEvent(ev.currentTarget as HTMLElement, "hass-page-tool", {
      tool: "export",
      root: this._page,
      title: this._l("title"),
    });
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .content {
          box-sizing: border-box;
          max-width: 980px;
          margin: 0 auto;
          padding: var(--ha-space-4) var(--ha-space-8) var(--ha-space-8);
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
        }
        :host([narrow]) .content {
          padding: var(--ha-space-2) var(--ha-space-3) var(--ha-space-6);
        }
        .filters,
        .dates,
        .chips {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2);
        }
        ha-input-search {
          flex: 1 1 240px;
          --ha-input-search-height: var(--ha-space-12);
          --ha-input-search-border-radius: var(--ha-border-radius-pill);
        }
        button {
          font: inherit;
          color: inherit;
          cursor: pointer;
        }
        .chip {
          display: inline-flex;
          align-items: center;
          gap: var(--ha-space-1);
          min-height: var(--ha-space-10);
          padding: 0 var(--ha-space-4);
          border: 1px solid var(--outline-color);
          border-radius: var(--ha-border-radius-lg);
          background: none;
          font-weight: var(--ha-font-weight-medium);
          --mdc-icon-size: 18px;
        }
        .chip.on {
          border-color: transparent;
          background: color-mix(
            in srgb,
            var(--primary-color) 22%,
            var(--primary-background-color)
          );
        }
        button:focus-visible,
        input:focus-visible,
        a:focus-visible {
          outline: 3px solid var(--primary-color);
          outline-offset: 2px;
        }
        label {
          display: inline-flex;
          flex-direction: column;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        input[type="date"] {
          min-height: var(--ha-space-10);
          padding: 0 var(--ha-space-3);
          border: 1px solid var(--outline-color);
          border-radius: var(--ha-border-radius-lg);
          background: var(--primary-background-color);
          color: var(--primary-text-color);
          font: inherit;
        }
        .day {
          padding: var(--ha-space-5) var(--ha-space-6);
          border-radius: var(--ha-border-radius-3xl);
          background: var(--card-background-color);
        }
        h2 {
          margin: 0 0 var(--ha-space-3);
          font-family: var(--ha-font-family-heading, inherit);
          font-size: var(--ha-font-size-2xl);
          font-weight: var(--ha-font-weight-medium);
        }
        ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
        }
        li {
          display: flex;
          align-items: baseline;
          gap: var(--ha-space-3);
          line-height: var(--ha-line-height-normal);
        }
        .text {
          flex: 1;
          min-width: 0;
        }
        code {
          font-family: var(--ha-font-family-code);
          font-size: 0.92em;
          overflow-wrap: anywhere;
        }
        .commit {
          flex: none;
          padding: 2px var(--ha-space-2);
          border-radius: var(--ha-border-radius-md);
          background: color-mix(
            in srgb,
            var(--primary-color) 18%,
            var(--primary-background-color)
          );
          color: var(--primary-text-color);
          font-family: var(--ha-font-family-code);
          font-size: var(--ha-font-size-s);
          text-decoration: none;
        }
        .note,
        .empty {
          margin: 0;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .empty {
          padding: var(--ha-space-8) 0;
          text-align: center;
          font-size: var(--ha-font-size-m);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-changelog": HaConfigChangelog;
  }
}
