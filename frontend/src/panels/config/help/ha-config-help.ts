import { mdiArrowLeft, mdiArrowRight, mdiBookOpenPageVariant } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import type { HASSDomEvent } from "../../../common/dom/fire_event";
import { searchMatcher } from "../../../common/regex/filter";
import "../../../components/ha-button";
import "../../../components/ha-icon-button";
import "../../../components/ha-markdown";
import "../../../components/ha-spinner";
import "../../../components/ha-svg-icon";
import type {
  HelpIndexEntry,
  HelpGroup,
} from "../../../components/help/help-bundle-logic";
import {
  buildBacklinks,
  groupHelpArticles,
  linkedArticlePaths,
  readingMinutes,
} from "../../../components/help/help-bundle-logic";
import type { HelpRedirects } from "../../../components/help/help-article-path";
import {
  helpArticleUrl,
  HELP_INDEX_URL,
  parseHelpAddress,
  resolveHelpPath,
  rewriteArticleLinks,
} from "../../../components/help/help-article-path";
import type { HelpArticleNavigateDetail } from "../../../components/help/open-help-article";
import "../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import "../../../layouts/hass-subpage";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";

interface HelpIndex {
  fetched: string;
  articles: HelpIndexEntry[];
  redirects?: HelpRedirects;
}

interface HelpArticleData {
  path: string;
  title: string;
  fetched: string;
  body: string;
}

type LoadState = "loading" | "ready" | "missing" | "error";

/** The offline help: every bundled article, read in place. */
@customElement("ha-config-help")
class HaConfigHelp extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @state() private _index?: HelpIndex;

  @state() private _indexFailed = false;

  @state() private _filter = "";

  @state() private _path?: string;

  @state() private _article?: HelpArticleData;

  @state() private _state: LoadState = "loading";

  /** Every article's text, loaded after the list is shown. */
  @state() private _bodies = new Map<string, string>();

  private _generation = 0;

  protected firstUpdated(): void {
    this._load();
  }

  private async _fetchJson<T>(url: string): Promise<T | undefined> {
    try {
      const response = await fetch(url);
      return response.ok ? ((await response.json()) as T) : undefined;
    } catch (_err) {
      return undefined;
    }
  }

  private async _load(): Promise<void> {
    const index = await this._fetchJson<HelpIndex>(HELP_INDEX_URL);
    if (!index) {
      this._indexFailed = true;
      return;
    }
    this._index = index;
    const wanted = new URLSearchParams(window.location.search).get("article");
    const ref = wanted ? parseHelpAddress(wanted) : undefined;
    const first = ref
      ? resolveHelpPath(ref.path, ref.hash, index.redirects).path
      : this.narrow
        ? undefined
        : index.articles[0]?.path;
    if (first) {
      this._open(first);
    }
    this._loadAllBodies(index);
  }

  /** The reading times and the links between articles need every text. */
  private async _loadAllBodies(index: HelpIndex): Promise<void> {
    const bodies = new Map<string, string>();
    await Promise.all(
      index.articles.map(async (entry) => {
        const url = helpArticleUrl(entry.path);
        const data = url
          ? await this._fetchJson<HelpArticleData>(url)
          : undefined;
        if (data) {
          bodies.set(entry.path, data.body);
        }
      })
    );
    this._bodies = bodies;
  }

  private _isBundled = (path: string): boolean => {
    const { path: resolved } = resolveHelpPath(
      path,
      "",
      this._index?.redirects
    );
    return Boolean(this._index?.articles.some((a) => a.path === resolved));
  };

  private async _open(path: string): Promise<void> {
    const generation = ++this._generation;
    this._path = path;
    this._article = undefined;
    this._state = "loading";
    const url = helpArticleUrl(path);
    if (!url) {
      this._state = "missing";
      return;
    }
    try {
      const response = await fetch(url);
      if (generation !== this._generation) {
        return;
      }
      if (!response.ok) {
        this._state = response.status === 404 ? "missing" : "error";
        return;
      }
      this._article = (await response.json()) as HelpArticleData;
      this._state = "ready";
    } catch (_err) {
      if (generation === this._generation) {
        this._state = "error";
      }
    }
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.help_page.${key}` as never,
      values as never
    ) as string;
  }

  protected render(): TemplateResult {
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config"
        .header=${this._l("title")}
      >
        <div class=${classMap({ content: true, narrow: this.narrow })}>
          ${this._renderBody()}
        </div>
      </hass-subpage>
    `;
  }

  private _renderBody(): TemplateResult {
    if (this._indexFailed) {
      return html`<p class="note" role="alert">${this._l("load_error")}</p>`;
    }
    if (!this._index) {
      return html`<div class="center">
        <ha-spinner .ariaLabel=${this._l("loading")}></ha-spinner>
      </div>`;
    }
    const showReader = !this.narrow || this._path !== undefined;
    const showList = !this.narrow || this._path === undefined;
    const search = this._l("search");
    return html`
      <p class="summary">
        ${this._l("summary", {
          count: this._index.articles.length,
        })}
      </p>
      ${
        showList
          ? html`<ha-input-search
              appearance="outlined"
              .placeholder=${search}
              .accessibleLabel=${search}
              .value=${this._filter}
              .patternSamples=${this._index.articles.map((a) => a.title)}
              @input=${this._filterChanged}
            ></ha-input-search>`
          : nothing
      }
      <div class="columns">
        ${showList ? this._renderList(this._index) : nothing}
        ${showReader ? this._renderReader(this._index) : nothing}
      </div>
    `;
  }

  private _filterChanged(ev: Event): void {
    this._filter = (ev.target as HaInputSearch).value ?? "";
  }

  private _renderList(index: HelpIndex): TemplateResult {
    const matches = searchMatcher(this._filter);
    const visible = index.articles.filter((a) => matches(a.title, a.path));
    const groups = groupHelpArticles(visible);
    return html`<section class="card list" aria-label=${this._l("articles")}>
      <h2>${this._l("articles")}</h2>
      ${
        groups.length
          ? groups.map((group) => this._renderGroup(group))
          : html`<p class="note" role="status">${this._l("no_results")}</p>`
      }
    </section>`;
  }

  private _renderGroup(group: HelpGroup): TemplateResult {
    return html`<h3>${this._l(`sections.${group.key}`)}</h3>
      <ul class="rows">
        ${group.articles.map((article) => {
          const body = this._bodies.get(article.path);
          return html`<li>
            <button
              type="button"
              class=${classMap({
                row: true,
                active: article.path === this._path,
              })}
              aria-current=${article.path === this._path ? "page" : "false"}
              data-path=${article.path}
              @click=${this._pick}
            >
              <span class="tile"
                ><ha-svg-icon .path=${mdiBookOpenPageVariant}></ha-svg-icon
              ></span>
              <span class="text">
                <span class="name">${article.title}</span>
                ${
                  body
                    ? html`<span class="detail"
                        >${this._l("minutes", {
                          count: readingMinutes(body),
                        })}</span
                      >`
                    : nothing
                }
              </span>
            </button>
          </li>`;
        })}
      </ul>`;
  }

  private _pick(ev: Event): void {
    this._open((ev.currentTarget as HTMLElement).dataset.path!);
  }

  private _closeReader(): void {
    this._generation++;
    this._path = undefined;
    this._article = undefined;
  }

  private _navigate = (ev: HASSDomEvent<HelpArticleNavigateDetail>): void => {
    ev.stopPropagation();
    if (!ev.detail.path) {
      this.shadowRoot
        ?.getElementById(`section-${ev.detail.hash}`)
        ?.scrollIntoView({ block: "start" });
      return;
    }
    const target = resolveHelpPath(
      ev.detail.path,
      ev.detail.hash,
      this._index?.redirects
    );
    this._open(target.path);
  };

  private _renderReader(index: HelpIndex): TemplateResult {
    if (this._path === undefined) {
      return html`<section class="card reader">
        <p class="note">${this._l("pick_one")}</p>
      </section>`;
    }
    return html`<section
      class="card reader"
      data-help-reader
      @help-article-navigate=${this._navigate}
    >
      ${this._renderArticle(index)}
    </section>`;
  }

  private _titleOf(index: HelpIndex, path: string): string {
    return index.articles.find((a) => a.path === path)?.title ?? path;
  }

  private _renderArticle(index: HelpIndex): TemplateResult {
    const back = this.narrow
      ? html`<ha-button appearance="plain" @click=${this._closeReader}
          >${this._l("all_articles")}</ha-button
        >`
      : nothing;
    if (this._state === "loading") {
      return html`${back}
        <p class="note">${this._l("loading")}</p>`;
    }
    if (this._state !== "ready" || !this._article) {
      return html`${back}
        <h2>${this._l("not_bundled_title")}</h2>
        <p class="note">
          ${this._l(
            this._state === "error" ? "article_error" : "not_bundled_body",
            {
              path: this._path ?? "",
            }
          )}
        </p>`;
    }
    const article = this._article;
    const body = rewriteArticleLinks(
      article.body,
      this._isBundled,
      this._l("not_included")
    );
    const position = index.articles.findIndex((a) => a.path === article.path);
    const previous = index.articles[position - 1];
    const next = index.articles[position + 1];
    const links = linkedArticlePaths(
      article.body,
      article.path,
      index.redirects,
      this._isBundled
    );
    const backlinks = this._bodies.size
      ? (buildBacklinks(
          [...this._bodies].map(([path, text]) => ({ path, body: text })),
          index.redirects,
          this._isBundled
        ).get(article.path) ?? [])
      : [];
    return html`${back}
      <h2>${article.title}</h2>
      <div class="chips">
        <span class="chip ok">${this._l("offline")}</span>
        <span class="chip"
          >${this._l("updated", { date: article.fetched })}</span
        >
        <span class="chip"
          >${this._l("minutes", { count: readingMinutes(article.body) })}</span
        >
      </div>
      <article><ha-markdown .content=${body}></ha-markdown></article>
      ${this._renderRelated(index, "links_to", links)}
      ${
        this._bodies.size
          ? this._renderRelated(index, "linked_from", backlinks)
          : nothing
      }
      <nav class="pager" aria-label=${this._l("pager")}>
        ${
          previous
            ? html`<ha-button
                appearance="plain"
                data-path=${previous.path}
                @click=${this._pick}
                ><ha-svg-icon slot="start" .path=${mdiArrowLeft}></ha-svg-icon
                >${this._l("previous")}: ${previous.title}</ha-button
              >`
            : html`<span></span>`
        }
        ${
          next
            ? html`<ha-button
                appearance="plain"
                data-path=${next.path}
                @click=${this._pick}
                >${this._l("next")}: ${next.title}<ha-svg-icon
                  slot="end"
                  .path=${mdiArrowRight}
                ></ha-svg-icon
              ></ha-button>`
            : nothing
        }
      </nav>
      <p class="note">${this._l("license")}</p>`;
  }

  private _renderRelated(
    index: HelpIndex,
    key: string,
    paths: string[]
  ): TemplateResult | typeof nothing {
    if (!paths.length) {
      return nothing;
    }
    return html`<h3>${this._l(key)}</h3>
      <ul class="related">
        ${paths.map(
          (path) =>
            html`<li>
              <button
                type="button"
                class="link"
                data-path=${path}
                @click=${this._pick}
              >
                ${this._titleOf(index, path)}
              </button>
            </li>`
        )}
      </ul>`;
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .content {
          max-width: 1180px;
          margin: 0 auto;
          padding: var(--ha-space-4) var(--ha-space-5) var(--ha-space-8);
          box-sizing: border-box;
        }
        .center {
          display: flex;
          justify-content: center;
          padding: var(--ha-space-8);
        }
        .summary,
        .note,
        .detail {
          color: var(--secondary-text-color);
        }
        .summary {
          margin: 0 0 var(--ha-space-3);
        }
        ha-input-search {
          display: block;
          max-width: 520px;
          margin-bottom: var(--ha-space-4);
        }
        .columns {
          display: grid;
          grid-template-columns: minmax(260px, 380px) 1fr;
          gap: var(--ha-space-4);
          align-items: start;
        }
        .narrow .columns {
          grid-template-columns: 1fr;
        }
        .card {
          background: var(--card-background-color);
          border-radius: var(--ha-border-radius-xl, 20px);
          box-shadow: var(--ha-shadow-card);
          padding: var(--ha-space-4);
          min-width: 0;
        }
        .card h2 {
          margin: 0 0 var(--ha-space-2);
          font-size: var(--ha-font-size-xl, 1.25rem);
          font-weight: var(--ha-font-weight-title, 600);
        }
        .card h3 {
          margin: var(--ha-space-4) 0 var(--ha-space-1);
          font-size: var(--ha-font-size-m, 0.9375rem);
          color: var(--secondary-text-color);
        }
        .rows,
        .related {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .row {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          width: 100%;
          min-height: 48px;
          padding: var(--ha-space-2);
          border: none;
          border-radius: var(--ha-border-radius-lg, 12px);
          background: none;
          color: var(--primary-text-color);
          font: inherit;
          text-align: start;
          cursor: pointer;
        }
        .row:hover,
        .row:focus-visible,
        .row.active {
          background: var(--ha-color-primary-container);
          color: var(--ha-color-on-primary-container);
        }
        .tile {
          display: grid;
          place-items: center;
          flex: none;
          width: 40px;
          height: 40px;
          border-radius: var(--ha-border-radius-lg, 12px);
          background: var(--ha-color-primary-container);
          color: var(--ha-color-on-primary-container);
        }
        .text {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .name {
          font-weight: var(--ha-font-weight-semibold, 600);
          overflow-wrap: anywhere;
        }
        .chips {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
          margin-bottom: var(--ha-space-3);
        }
        .chip {
          padding: var(--ha-space-1) var(--ha-space-3);
          border-radius: 999px;
          background: var(
            --ha-color-surface-tone-2,
            var(--secondary-background-color)
          );
          font-size: var(--ha-font-size-s, 0.8125rem);
        }
        .chip.ok {
          background: var(
            --ha-color-success-container,
            var(--secondary-background-color)
          );
          color: var(--ha-color-on-success-container, inherit);
        }
        article {
          overflow-wrap: anywhere;
        }
        article img {
          max-width: 100%;
          height: auto;
        }
        button.link {
          min-height: 44px;
          padding: 0;
          border: none;
          background: none;
          color: var(--primary-color);
          font: inherit;
          text-align: start;
          cursor: pointer;
          text-decoration: underline;
        }
        .pager {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          gap: var(--ha-space-2);
          margin-top: var(--ha-space-4);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-help": HaConfigHelp;
  }
}
