import { mdiContentCopy } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { navigate } from "../../../common/navigate";
import { supportsFeature } from "../../../common/entity/supports-feature";
import { computeStateDomain } from "../../../common/entity/compute_state_domain";
import { computeStateName } from "../../../common/entity/compute_state_name";
import { searchMatcher } from "../../../common/regex/filter";
import "../../../components/ha-button";
import "../../../components/ha-markdown";
import "../../../components/ha-svg-icon";
import { rewriteArticleLinks } from "../../../components/help/help-article-path";
import "../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import type { UpdateEntity } from "../../../data/update";
import { UpdateEntityFeature, updateReleaseNotes } from "../../../data/update";
import "../../../layouts/hass-subpage";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { showToast } from "../../../util/toast";
import type { NoteDay, NoteFilter } from "./release-notes-data";
import {
  dayAsText,
  filterNoteDays,
  newKeys,
  readSeen,
  toNoteDays,
  writeSeen,
} from "./release-notes-data";

/** Where one change can be looked at on its own. */
const COMMIT_URL =
  "https://github.com/Ding-Ding-Projects/home-assistant-material/commit/";

type NotesState =
  | { status: "loading" }
  | { status: "done"; text: string | null }
  | { status: "error" };

const FILTERS: NoteFilter[] = ["all", "fixed", "new"];

/**
 * Release notes: what changed in this build, by day, and the notes that
 * update entities carry. Both are shown as the project wrote them, as text;
 * a link to another site is never made clickable.
 */
@customElement("ha-config-release-notes")
class HaConfigReleaseNotes extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() private _days?: NoteDay[];

  @state() private _new: ReadonlySet<string> = new Set();

  @state() private _filter = "";

  @state() private _chip: NoteFilter = "all";

  @state() private _notes: Record<string, NotesState> = {};

  protected firstUpdated(): void {
    import("../../../data/changelog.json").then((module) => {
      const days = toNoteDays(module.default.days);
      this._new = newKeys(days, readSeen());
      // What is on the page now counts as seen the next time it is opened.
      writeSeen(days.flatMap((day) => day.entries.map((entry) => entry.key)));
      this._days = days;
    });
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.release_notes.${key}` as any,
      values
    );
  }

  private _formatDay(date: string): string {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(
      this.hass.locale.language,
      { day: "numeric", month: "long", year: "numeric" }
    );
  }

  private _updates(): UpdateEntity[] {
    return Object.values(this.hass.states)
      .filter((item) => computeStateDomain(item) === "update")
      .map((item) => item as UpdateEntity)
      .filter((entity) => entity.attributes.latest_version)
      .sort((a, b) =>
        (a.attributes.title ?? a.entity_id).localeCompare(
          b.attributes.title ?? b.entity_id
        )
      );
  }

  protected render(): TemplateResult {
    const all = this._days ?? [];
    const matches = searchMatcher(this._filter);
    const days = filterNoteDays(all, this._chip, this._new, matches);
    const total = all.reduce((sum, day) => sum + day.entries.length, 0);
    const shown = days.reduce((sum, day) => sum + day.entries.length, 0);
    const search = this._l("search");
    const updates = this._updates();
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config/info"
        .header=${this._l("title")}
        .breadcrumb=${`${this.hass.localize("panel.config")}, ${this.hass.localize(
          "ui.panel.config.info.caption"
        )}`}
      >
        <div class="content">
          <p class="intro">${this._l("intro")}</p>
          <div class="columns">
            <div class="main">
              <div class="filters">
                <ha-input-search
                  appearance="outlined"
                  .placeholder=${search}
                  .accessibleLabel=${search}
                  .value=${this._filter}
                  .patternSamples=${all.flatMap((day) =>
                    day.entries.map((entry) => entry.text)
                  )}
                  @input=${this._filterChanged}
                ></ha-input-search>
                <div class="chips" role="group" aria-label=${this._l("show")}>
                  ${FILTERS.map(
                    (chip) =>
                      html`<button
                        type="button"
                        class=${classMap({ chip: true, on: chip === this._chip })}
                        aria-pressed=${chip === this._chip ? "true" : "false"}
                        data-chip=${chip}
                        @click=${this._pickChip}
                      >
                        ${
                          chip === "new"
                            ? this._l("chip_new", { count: this._new.size })
                            : this._l(`chip_${chip}`)
                        }
                      </button>`
                  )}
                </div>
                ${
                  this._new.size
                    ? html`<ha-button
                        size="s"
                        appearance="plain"
                        @click=${this._markSeen}
                        >${this._l("mark_seen")}</ha-button
                      >`
                    : nothing
                }
              </div>
              ${
                !this._days
                  ? html`<p class="empty" role="status">
                      ${this._l("loading")}
                    </p>`
                  : !days.length
                    ? html`<p class="empty" role="status">
                        ${this._l("empty")}
                      </p>`
                    : days.map((day) => this._renderDay(day))
              }
              <p class="note" role="status">
                ${this._l("count", { shown, total })} ${this._l("note")}
              </p>
            </div>
            <aside class="side" aria-labelledby="updates-title">
              <h2 id="updates-title">${this._l("updates_title")}</h2>
              <p class="note">${this._l("updates_note")}</p>
              ${
                updates.length
                  ? updates.map((entity) => this._renderUpdate(entity))
                  : html`<div class="none">
                      <strong>${this._l("updates_none")}</strong>
                      <span>${this._l("updates_none_detail")}</span>
                    </div>`
              }
            </aside>
          </div>
        </div>
      </hass-subpage>
    `;
  }

  private _renderDay(day: NoteDay): TemplateResult {
    const heading = this._formatDay(day.date);
    return html`
      <section class="day" aria-label=${heading}>
        <div class="day-head">
          <h2>${heading}</h2>
          <ha-button
            size="s"
            appearance="plain"
            data-date=${day.date}
            @click=${this._copyDay}
          >
            <ha-svg-icon slot="start" .path=${mdiContentCopy}></ha-svg-icon>
            ${this._l("copy_day")}
          </ha-button>
        </div>
        <ul>
          ${day.entries.map(
            (entry) => html`
              <li>
                ${
                  this._new.has(entry.key)
                    ? html`<span class="badge new"
                        >${this._l("badge_new")}</span
                      >`
                    : nothing
                }
                ${
                  entry.fixed
                    ? html`<span class="badge">${this._l("badge_fixed")}</span>`
                    : nothing
                }
                <span class="text">${entry.text}</span>
                ${
                  entry.page
                    ? html`<a
                        class="open"
                        href=${entry.page}
                        @click=${this._openPage}
                        >${this._l("open_page")}</a
                      >`
                    : nothing
                }
                ${
                  entry.commit
                    ? html`<a
                        class="commit"
                        href=${COMMIT_URL + entry.commit}
                        target="_blank"
                        rel="noopener noreferrer"
                        title=${this._l("open_commit")}
                        >${entry.commit.slice(0, 7)}</a
                      >`
                    : nothing
                }
              </li>
            `
          )}
        </ul>
      </section>
    `;
  }

  private _renderUpdate(entity: UpdateEntity): TemplateResult {
    const name = entity.attributes.title || computeStateName(entity);
    const summary = entity.attributes.release_summary;
    const canLoad = supportsFeature(entity, UpdateEntityFeature.RELEASE_NOTES);
    const loaded = this._notes[entity.entity_id];
    const hasNotes =
      Boolean(summary) || (loaded?.status === "done" && Boolean(loaded.text));
    return html`
      <section class="update">
        <h3>${name}</h3>
        <span class="versions"
          >${this._l("versions", {
            installed: entity.attributes.installed_version ?? "?",
            latest: entity.attributes.latest_version ?? "?",
          })}</span
        >
        ${summary ? this._markdown(summary) : nothing}
        ${
          canLoad && !loaded
            ? html`<ha-button
                size="s"
                appearance="plain"
                data-entity=${entity.entity_id}
                @click=${this._loadNotes}
                >${this._l("show_notes")}</ha-button
              >`
            : nothing
        }
        ${
          loaded?.status === "loading"
            ? html`<p class="note" role="status">${this._l("loading")}</p>`
            : loaded?.status === "error"
              ? html`<p class="note" role="alert">${this._l("notes_error")}</p>`
              : loaded?.status === "done" && loaded.text
                ? this._markdown(loaded.text)
                : nothing
        }
        ${
          !hasNotes && (!canLoad || loaded?.status === "done")
            ? html`<div class="none">
                <strong>${this._l("no_notes")}</strong>
                <span>${this._l("no_notes_detail")}</span>
              </div>`
            : nothing
        }
      </section>
    `;
  }

  /** Text exactly as the project wrote it; links to other sites become text. */
  private _markdown(text: string): TemplateResult {
    return html`<div class="rendered" @click=${this._blockOutsideLinks}>
      <ha-markdown
        .content=${rewriteArticleLinks(text, () => false, this._l("link_removed"))}
      ></ha-markdown>
      <p class="note">${this._l("rendered_note")}</p>
    </div>`;
  }

  private _blockOutsideLinks(ev: Event): void {
    const anchor = (ev.composedPath() as HTMLElement[]).find(
      (node) => node.tagName === "A"
    ) as HTMLAnchorElement | undefined;
    const href = anchor?.getAttribute("href");
    if (href && !href.startsWith("#")) {
      ev.preventDefault();
    }
  }

  private _filterChanged(ev: Event): void {
    this._filter = (ev.target as HaInputSearch).value ?? "";
  }

  private _pickChip(ev: Event): void {
    this._chip = (ev.currentTarget as HTMLElement).dataset.chip as NoteFilter;
  }

  private _markSeen(): void {
    this._new = new Set();
    if (this._chip === "new") {
      this._chip = "all";
    }
  }

  private _openPage(ev: Event): void {
    ev.preventDefault();
    navigate((ev.currentTarget as HTMLAnchorElement).getAttribute("href")!);
  }

  private async _copyDay(ev: Event): Promise<void> {
    const date = (ev.currentTarget as HTMLElement).dataset.date;
    const day = this._days?.find((entry) => entry.date === date);
    if (!day) {
      return;
    }
    try {
      await navigator.clipboard.writeText(
        dayAsText(this._formatDay(day.date), day.entries)
      );
      showToast(this, { message: this._l("copied") });
    } catch (_err: any) {
      showToast(this, { message: this._l("copy_failed") });
    }
  }

  private async _loadNotes(ev: Event): Promise<void> {
    const entityId = (ev.currentTarget as HTMLElement).dataset.entity!;
    this._notes = { ...this._notes, [entityId]: { status: "loading" } };
    try {
      const text = await updateReleaseNotes(this.hass, entityId);
      this._notes = { ...this._notes, [entityId]: { status: "done", text } };
    } catch (_err: any) {
      this._notes = { ...this._notes, [entityId]: { status: "error" } };
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .content {
          box-sizing: border-box;
          max-width: 1100px;
          margin: 0 auto;
          padding: var(--ha-space-4) var(--ha-space-8) var(--ha-space-8);
        }
        :host([narrow]) .content {
          padding: var(--ha-space-2) var(--ha-space-3) var(--ha-space-6);
        }
        .intro {
          margin: 0 0 var(--ha-space-4);
          color: var(--secondary-text-color);
        }
        .columns {
          display: grid;
          grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
          gap: var(--ha-space-4);
          align-items: start;
        }
        :host([narrow]) .columns {
          grid-template-columns: minmax(0, 1fr);
        }
        .main,
        .side {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
          min-width: 0;
        }
        .filters,
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
        .chip {
          min-height: 44px;
          padding: 0 var(--ha-space-4);
          border: 1px solid var(--outline-color);
          border-radius: var(--ha-border-radius-lg);
          background: none;
          color: inherit;
          font: inherit;
          font-weight: var(--ha-font-weight-medium);
          cursor: pointer;
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
        a:focus-visible {
          outline: 3px solid var(--primary-color);
          outline-offset: 2px;
        }
        .day,
        .update {
          padding: var(--ha-space-5) var(--ha-space-6);
          border-radius: var(--ha-border-radius-3xl);
          background: var(--card-background-color);
        }
        .update {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        .day-head {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: var(--ha-space-2);
          margin-bottom: var(--ha-space-3);
        }
        h2 {
          margin: 0;
          font-family: var(--ha-font-family-heading, inherit);
          font-size: var(--ha-font-size-2xl);
          font-weight: var(--ha-font-weight-medium);
        }
        h3 {
          margin: 0;
          font-size: var(--ha-font-size-l);
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
          flex-wrap: wrap;
          align-items: baseline;
          gap: var(--ha-space-2);
          line-height: var(--ha-line-height-normal);
        }
        .text {
          flex: 1 1 200px;
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .badge {
          flex: none;
          padding: 2px var(--ha-space-2);
          border-radius: var(--ha-border-radius-md);
          background: var(--secondary-background-color);
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-medium);
        }
        .badge.new {
          background: var(--primary-color);
          color: var(--text-primary-color);
        }
        .open,
        .commit {
          flex: none;
          display: inline-flex;
          align-items: center;
          min-height: 24px;
          padding: 2px var(--ha-space-2);
          border-radius: var(--ha-border-radius-md);
          background: color-mix(
            in srgb,
            var(--primary-color) 18%,
            var(--primary-background-color)
          );
          color: var(--primary-text-color);
          font-size: var(--ha-font-size-s);
          text-decoration: none;
        }
        .commit {
          font-family: var(--ha-font-family-code);
        }
        .versions,
        .note {
          margin: 0;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .empty {
          margin: 0;
          padding: var(--ha-space-8) 0;
          text-align: center;
          color: var(--secondary-text-color);
        }
        .none {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
          padding: var(--ha-space-5);
          border-radius: var(--ha-border-radius-3xl);
          background: var(--card-background-color);
          text-align: center;
          color: var(--secondary-text-color);
        }
        .none strong {
          color: var(--primary-text-color);
        }
        .rendered {
          overflow-wrap: anywhere;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-release-notes": HaConfigReleaseNotes;
  }
}
