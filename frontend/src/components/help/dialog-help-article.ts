import { mdiArrowLeft } from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import type { HASSDomEvent } from "../../common/dom/fire_event";
import { fireEvent } from "../../common/dom/fire_event";
import { searchMatcher } from "../../common/regex/filter";
import type { HassDialog } from "../../dialogs/make-dialog-manager";
import { haStyleDialog } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import "../ha-dialog";
import "../ha-icon-button";
import "../ha-markdown";
import type { HaInputSearch } from "../input/ha-input-search";
import "../input/ha-input-search";
import {
  headingId,
  helpArticleUrl,
  HELP_INDEX_URL,
  rewriteArticleLinks,
  splitSections,
} from "./help-article-path";
import type {
  HelpArticleDialogParams,
  HelpArticleNavigateDetail,
} from "./open-help-article";

interface HelpIndexEntry {
  path: string;
  title: string;
}

interface HelpIndex {
  commit: string;
  fetched: string;
  articles: HelpIndexEntry[];
}

interface HelpArticleData {
  path: string;
  title: string;
  source: string;
  commit: string;
  fetched: string;
  body: string;
}

type LoadState = "loading" | "ready" | "missing" | "error";

/**
 * The reader for the offline help articles. Articles are bundled files
 * loaded on demand; nothing here ever opens the website.
 */
@customElement("dialog-help-article")
export class DialogHelpArticle
  extends LitElement
  implements HassDialog<HelpArticleDialogParams>
{
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _open = false;

  @state() private _path?: string;

  @state() private _history: string[] = [];

  @state() private _state: LoadState = "loading";

  @state() private _article?: HelpArticleData;

  @state() private _index?: HelpIndex;

  @state() private _query = "";

  public showDialog(params: HelpArticleDialogParams): void {
    this._history = [];
    this._query = "";
    this._open = true;
    this._index = undefined;
    this._loadIndex();
    this._goTo(params.path, params.hash ?? "");
  }

  public closeDialog() {
    this._open = false;
    return true;
  }

  private _dialogClosed() {
    this._path = undefined;
    this._article = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private async _loadIndex() {
    try {
      const response = await fetch(HELP_INDEX_URL);
      if (response.ok) {
        this._index = (await response.json()) as HelpIndex;
      }
    } catch (_err) {
      this._index = undefined;
    }
  }

  private async _goTo(path: string, hash: string) {
    this._path = path;
    this._state = "loading";
    this._article = undefined;
    try {
      const response = await fetch(helpArticleUrl(path));
      if (this._path !== path) {
        return;
      }
      if (response.status === 404) {
        this._state = "missing";
        return;
      }
      if (!response.ok) {
        this._state = "error";
        return;
      }
      this._article = (await response.json()) as HelpArticleData;
      this._state = "ready";
      await this.updateComplete;
      this._scrollTo(hash);
    } catch (_err) {
      if (this._path === path) {
        this._state = "error";
      }
    }
  }

  private _scrollTo(hash: string) {
    const target = hash
      ? this.shadowRoot?.getElementById(`section-${headingId(hash)}`)
      : null;
    if (target) {
      target.scrollIntoView({ block: "start" });
    }
  }

  private _navigate = (ev: HASSDomEvent<HelpArticleNavigateDetail>) => {
    ev.stopPropagation();
    if (!ev.detail.path) {
      this._scrollTo(ev.detail.hash);
      return;
    }
    if (this._path) {
      this._history = [...this._history, this._path];
    }
    this._query = "";
    this._goTo(ev.detail.path, ev.detail.hash);
  };

  private _back() {
    const previous = this._history[this._history.length - 1];
    if (!previous) {
      return;
    }
    this._history = this._history.slice(0, -1);
    this._goTo(previous, "");
  }

  private _searchInput(ev: Event) {
    this._query = (ev.target as HaInputSearch).value ?? "";
  }

  private _openResult(ev: Event) {
    const path = (ev.currentTarget as HTMLElement).dataset.path!;
    if (this._path) {
      this._history = [...this._history, this._path];
    }
    this._query = "";
    this._goTo(path, "");
  }

  private _jump(ev: Event) {
    this._scrollTo((ev.currentTarget as HTMLElement).dataset.heading!);
  }

  protected render() {
    if (!this._path) {
      return nothing;
    }
    const localize = this.hass.localize;
    return html`
      <ha-dialog
        .open=${this._open}
        width="large"
        header-title=${this._article?.title ?? localize("ui.help.title")}
        @closed=${this._dialogClosed}
      >
        <div
          class="reader"
          data-help-reader
          @help-article-navigate=${this._navigate}
        >
          <div class="bar">
            ${
              this._history.length
                ? html`<ha-icon-button
                    .path=${mdiArrowLeft}
                    .label=${localize("ui.help.back")}
                    @click=${this._back}
                  ></ha-icon-button>`
                : nothing
            }
            <ha-input-search
              appearance="outlined"
              .placeholder=${localize("ui.help.search")}
              .accessibleLabel=${localize("ui.help.search")}
              .value=${this._query}
              .patternSamples=${(this._index?.articles ?? []).map(
                (a) => a.title
              )}
              @input=${this._searchInput}
            ></ha-input-search>
          </div>
          ${this._query.trim() ? this._renderResults() : this._renderArticle()}
        </div>
      </ha-dialog>
    `;
  }

  private _renderResults() {
    const localize = this.hass.localize;
    const matches = searchMatcher(this._query);
    const results = (this._index?.articles ?? []).filter((a) =>
      matches(a.title, a.path)
    );
    return results.length
      ? html`<ul class="results">
          ${results.map(
            (a) =>
              html`<li>
                <button
                  type="button"
                  data-path=${a.path}
                  @click=${this._openResult}
                >
                  <strong>${a.title}</strong>
                  <span>${a.path}</span>
                </button>
              </li>`
          )}
        </ul>`
      : html`<p class="note">${localize("ui.help.no_results")}</p>`;
  }

  private _renderArticle() {
    const localize = this.hass.localize;
    if (this._state === "loading") {
      return html`<p class="note">${localize("ui.help.loading")}</p>`;
    }
    if (this._state === "error") {
      return html`<p class="note">${localize("ui.help.error")}</p>`;
    }
    if (this._state === "missing" || !this._article) {
      return html`
        <div class="missing">
          <h3>${localize("ui.help.not_bundled_title")}</h3>
          <p>
            ${localize("ui.help.not_bundled_body", { path: this._path ?? "" })}
          </p>
        </div>
      `;
    }
    const bundled = new Set((this._index?.articles ?? []).map((a) => a.path));
    const note = localize("ui.help.not_included");
    const body = rewriteArticleLinks(
      this._article.body,
      (path) => bundled.has(path),
      note
    );
    const sections = splitSections(body);
    const toc = sections.filter((s) => s.heading);
    return html`
      ${
        toc.length > 3
          ? html`<nav class="toc" aria-label=${localize("ui.help.contents")}>
              <strong>${localize("ui.help.contents")}</strong>
              <ul>
                ${toc.map(
                  (s) =>
                    html`<li
                      style=${styleMap({
                        "padding-inline-start": `${(s.heading!.level - 2) * 16}px`,
                      })}
                    >
                      <button
                        type="button"
                        data-heading=${s.heading!.id}
                        @click=${this._jump}
                      >
                        ${s.heading!.text}
                      </button>
                    </li>`
                )}
              </ul>
            </nav>`
          : nothing
      }
      <article>
        ${sections.map(
          (s) =>
            html`<section
              id=${s.heading ? `section-${s.heading.id}` : "section-top"}
            >
              <ha-markdown .content=${s.markdown}></ha-markdown>
            </section>`
        )}
      </article>
      <footer>
        <p>
          ${localize("ui.help.source", {
            path: this._article.source,
            commit: this._article.commit.slice(0, 7),
            date: this._article.fetched,
          })}
        </p>
        <p>${localize("ui.help.license")}</p>
        <p>${localize("ui.help.images_note")}</p>
      </footer>
    `;
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleDialog,
      css`
        .bar {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          margin-bottom: var(--ha-space-4);
        }
        .bar ha-input-search {
          flex: 1;
          min-width: 0;
        }
        ha-icon-button {
          min-width: 44px;
          min-height: 44px;
        }
        .note {
          color: var(--secondary-text-color);
        }
        .toc {
          margin-bottom: var(--ha-space-4);
          padding: var(--ha-space-3) var(--ha-space-4);
          border-radius: var(--ha-border-radius-lg, 12px);
          background: var(--secondary-background-color);
        }
        .toc ul,
        .results {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .toc button,
        .results button {
          display: flex;
          flex-direction: column;
          width: 100%;
          min-height: 44px;
          justify-content: center;
          text-align: start;
          padding: var(--ha-space-2) var(--ha-space-3);
          border: none;
          background: none;
          color: var(--primary-text-color);
          font: inherit;
          cursor: pointer;
          border-radius: var(--ha-border-radius-md, 8px);
        }
        .toc button {
          color: var(--primary-color);
        }
        .toc button:hover,
        .results button:hover,
        .toc button:focus-visible,
        .results button:focus-visible {
          background: var(--secondary-background-color);
        }
        .results span {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s, 0.8125rem);
          overflow-wrap: anywhere;
        }
        article {
          overflow-wrap: anywhere;
        }
        footer {
          margin-top: var(--ha-space-6);
          padding-top: var(--ha-space-3);
          border-top: 1px solid var(--divider-color);
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s, 0.8125rem);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-help-article": DialogHelpArticle;
  }
}
