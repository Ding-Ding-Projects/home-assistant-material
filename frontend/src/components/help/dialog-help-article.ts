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
import type { HelpRedirects } from "./help-article-path";
import {
  headingId,
  helpArticleUrl,
  helpIntegrationDomain,
  HELP_INDEX_URL,
  HELP_INTEGRATIONS_INDEX_URL,
  HELP_NOTICE_URL,
  resolveHelpPath,
  rewriteArticleLinks,
  splitSections,
} from "./help-article-path";
import { HELP_LITERAL_TEXT } from "./help-literal-text";
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
  redirects?: HelpRedirects;
}

interface HelpIntegrationEntry {
  domain: string;
  title: string;
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

type View = "article" | "home" | "integrations" | "notice";

/** The most results listed at once, so a very long list stays usable. */
const MAX_LISTED = 150;

const SECTION_KEYS = [
  "docs",
  "dashboards",
  "faq",
  "getting-started",
  "voice_control",
  "more-info",
  "common-tasks",
  "help",
  "tag",
] as const;

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

  @state() private _view: View = "article";

  @state() private _path?: string;

  @state() private _history: string[] = [];

  @state() private _state: LoadState = "loading";

  @state() private _article?: HelpArticleData;

  @state() private _index?: HelpIndex;

  @state() private _integrations?: HelpIntegrationEntry[];

  @state() private _notice?: string;

  @state() private _query = "";

  @state() private _fallbackText?: Record<string, string>;

  private _indexPromise?: Promise<void>;

  public showDialog(params: HelpArticleDialogParams): void {
    this._history = [];
    this._query = "";
    this._open = true;
    this._index = undefined;
    this._integrations = undefined;
    this._indexPromise = this._loadIndex();
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

  /**
   * The text of the reader. Pages that have no translations loaded (the
   * sign-in page) get the English text from the bundled translation file,
   * loaded only then.
   */
  private _t(key: string, values?: Record<string, string | number>): string {
    const own = this.hass?.localize?.(
      `ui.help.${key}` as never,
      values as never
    );
    if (own) {
      return own as string;
    }
    // The translation file loads after the reader opens; until then the
    // literal English keeps the labels from being empty.
    const text = this._fallbackText?.[key] ?? HELP_LITERAL_TEXT[key];
    if (text === undefined) {
      return "";
    }
    return text.replace(/\{(\w+)\}/g, (_all, name: string) =>
      String(values?.[name] ?? "")
    );
  }

  private async _loadFallbackText() {
    if (this.hass?.localize?.("ui.help.title" as never)) {
      return;
    }
    try {
      const strings = (await import("../../translations/en.json")) as {
        default?: { ui: { help: Record<string, unknown> } };
        ui?: { help: Record<string, unknown> };
      };
      const help = (strings.default ?? strings).ui!.help;
      const flat: Record<string, string> = {};
      const walk = (node: Record<string, unknown>, prefix: string) => {
        for (const [name, value] of Object.entries(node)) {
          if (typeof value === "string") {
            flat[`${prefix}${name}`] = value;
          } else if (value && typeof value === "object") {
            walk(value as Record<string, unknown>, `${prefix}${name}.`);
          }
        }
      };
      walk(help, "");
      this._fallbackText = flat;
    } catch (_err) {
      this._fallbackText = {};
    }
  }

  private async _loadIndex() {
    this._loadFallbackText();
    const load = async <T>(url: string): Promise<T | undefined> => {
      try {
        const response = await fetch(url);
        return response.ok ? ((await response.json()) as T) : undefined;
      } catch (_err) {
        return undefined;
      }
    };
    const [index, integrations] = await Promise.all([
      load<HelpIndex>(HELP_INDEX_URL),
      load<{ integrations: HelpIntegrationEntry[] }>(
        HELP_INTEGRATIONS_INDEX_URL
      ),
    ]);
    this._index = index;
    this._integrations = integrations?.integrations;
  }

  private _isBundled = (path: string): boolean => {
    const { path: resolved } = resolveHelpPath(
      path,
      "",
      this._index?.redirects
    );
    if (resolved === "/integrations") {
      return true;
    }
    const domain = helpIntegrationDomain(resolved);
    return domain
      ? Boolean(this._integrations?.some((i) => i.domain === domain))
      : Boolean(this._index?.articles.some((a) => a.path === resolved));
  };

  private async _goTo(path: string, hash: string) {
    this._path = path;
    this._article = undefined;
    if (path === "/" || path === "") {
      this._view = "home";
      this._state = "ready";
      return;
    }
    if (path === "/integrations") {
      this._view = "integrations";
      this._state = "ready";
      return;
    }
    this._view = "article";
    this._state = "loading";
    await this._indexPromise;
    if (this._path !== path) {
      return;
    }
    const target = resolveHelpPath(path, hash, this._index?.redirects);
    if (target.path === "/integrations") {
      this._view = "integrations";
      this._state = "ready";
      return;
    }
    const url = helpArticleUrl(target.path);
    if (!url) {
      this._state = "missing";
      return;
    }
    try {
      const response = await fetch(url);
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
      this._scrollTo(target.hash);
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

  private _push() {
    if (this._path !== undefined) {
      this._history = [...this._history, this._path];
    }
  }

  private _navigate = (ev: HASSDomEvent<HelpArticleNavigateDetail>) => {
    ev.stopPropagation();
    if (!ev.detail.path) {
      this._scrollTo(ev.detail.hash);
      return;
    }
    this._push();
    this._query = "";
    this._goTo(ev.detail.path, ev.detail.hash);
  };

  private _back() {
    const previous = this._history[this._history.length - 1];
    if (previous === undefined) {
      return;
    }
    this._history = this._history.slice(0, -1);
    this._view = "article";
    this._query = "";
    this._goTo(previous, "");
  }

  private _searchInput(ev: Event) {
    this._query = (ev.target as HaInputSearch).value ?? "";
  }

  private _openResult(ev: Event) {
    const path = (ev.currentTarget as HTMLElement).dataset.path!;
    this._push();
    this._query = "";
    this._goTo(path, "");
  }

  private _openHome() {
    this._push();
    this._query = "";
    this._goTo("/", "");
  }

  private _openIntegrations() {
    this._push();
    this._query = "";
    this._goTo("/integrations", "");
  }

  private async _openNotice() {
    this._push();
    this._query = "";
    this._view = "notice";
    this._path = "notice";
    this._state = "loading";
    try {
      const response = await fetch(HELP_NOTICE_URL);
      this._notice = response.ok ? await response.text() : undefined;
      this._state = response.ok ? "ready" : "error";
    } catch (_err) {
      this._state = "error";
    }
  }

  private _jump(ev: Event) {
    this._scrollTo((ev.currentTarget as HTMLElement).dataset.heading!);
  }

  private _headerTitle(): string {
    if (this._view === "home") {
      return this._t("all_title");
    }
    if (this._view === "integrations") {
      return this._t("integrations_title");
    }
    if (this._view === "notice") {
      return this._t("notice_title");
    }
    return this._article?.title ?? this._t("title");
  }

  protected render() {
    if (this._path === undefined) {
      return nothing;
    }
    return html`
      <ha-dialog
        .open=${this._open}
        width="large"
        header-title=${this._headerTitle()}
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
                    .label=${this._t("back")}
                    @click=${this._back}
                  ></ha-icon-button>`
                : nothing
            }
            <ha-input-search
              appearance="outlined"
              .placeholder=${this._t("search")}
              .accessibleLabel=${this._t("search")}
              .value=${this._query}
              .patternSamples=${(this._index?.articles ?? []).map(
                (a) => a.title
              )}
              @input=${this._searchInput}
            ></ha-input-search>
          </div>
          ${this._renderBody()}
        </div>
      </ha-dialog>
    `;
  }

  private _renderBody() {
    if (this._query.trim()) {
      return this._renderResults();
    }
    switch (this._view) {
      case "home":
        return this._renderHome();
      case "integrations":
        return this._renderIntegrations();
      case "notice":
        return this._renderNotice();
      default:
        return this._renderArticle();
    }
  }

  private _resultButton(path: string, title: string, detail: string) {
    return html`<li>
      <button type="button" data-path=${path} @click=${this._openResult}>
        <strong>${title}</strong>
        <span>${detail}</span>
      </button>
    </li>`;
  }

  private _renderResults() {
    const matches = searchMatcher(this._query);
    const articles =
      this._view === "integrations"
        ? []
        : (this._index?.articles ?? []).filter((a) => matches(a.title, a.path));
    const integrations = (this._integrations ?? []).filter((i) =>
      matches(i.title, i.domain)
    );
    const shownArticles = articles.slice(0, MAX_LISTED);
    const shownIntegrations = integrations.slice(
      0,
      Math.max(0, MAX_LISTED - shownArticles.length)
    );
    if (!shownArticles.length && !shownIntegrations.length) {
      return html`<p class="note">${this._t("no_results")}</p>`;
    }
    return html`
      <ul class="results">
        ${shownArticles.map((a) => this._resultButton(a.path, a.title, a.path))}
        ${shownIntegrations.map((i) =>
          this._resultButton(
            `/integrations/${i.domain}`,
            i.title,
            `${this._t("integrations_title")}: ${i.domain}`
          )
        )}
      </ul>
      ${
        articles.length + integrations.length >
        shownArticles.length + shownIntegrations.length
          ? html`<p class="note">
              ${this._t("results_limited", { count: MAX_LISTED })}
            </p>`
          : nothing
      }
    `;
  }

  private _sectionLabel(segment: string): string {
    return (SECTION_KEYS as readonly string[]).includes(segment)
      ? this._t(`sections.${segment}`)
      : this._t("sections.other");
  }

  private _renderHome() {
    if (!this._index) {
      return html`<p class="note">${this._t("loading")}</p>`;
    }
    const groups = new Map<string, HelpIndexEntry[]>();
    for (const article of this._index.articles) {
      const segment = article.path.split("/")[1] ?? "";
      const key = (SECTION_KEYS as readonly string[]).includes(segment)
        ? segment
        : "other";
      groups.set(key, [...(groups.get(key) ?? []), article]);
    }
    const order = [...SECTION_KEYS, "other"].filter((k) => groups.has(k));
    return html`
      <p class="note">${this._t("home_intro")}</p>
      ${
        this._integrations?.length
          ? html`<section class="group">
              <h3>${this._t("integrations_title")}</h3>
              <button
                type="button"
                class="wide"
                @click=${this._openIntegrations}
              >
                <strong>${this._t("integrations_open")}</strong>
                <span
                  >${this._t("integrations_intro", {
                    count: this._integrations.length,
                  })}</span
                >
              </button>
            </section>`
          : nothing
      }
      ${order.map(
        (key) =>
          html`<section class="group">
            <h3>${this._sectionLabel(key)}</h3>
            <ul class="results">
              ${groups
                .get(key)!
                .map((a) => this._resultButton(a.path, a.title, a.path))}
            </ul>
          </section>`
      )}
      <footer>
        <p>${this._t("license")}</p>
        <button type="button" class="link" @click=${this._openNotice}>
          ${this._t("notice_link")}
        </button>
      </footer>
    `;
  }

  private _renderIntegrations() {
    const list = this._integrations;
    if (!list) {
      return html`<p class="note">${this._t("loading")}</p>`;
    }
    return html`
      <p class="note">
        ${this._t("integrations_intro", { count: list.length })}
      </p>
      <ul class="results">
        ${list
          .slice(0, MAX_LISTED)
          .map((i) =>
            this._resultButton(`/integrations/${i.domain}`, i.title, i.domain)
          )}
      </ul>
      ${
        list.length > MAX_LISTED
          ? html`<p class="note">
              ${this._t("results_limited", { count: MAX_LISTED })}
            </p>`
          : nothing
      }
    `;
  }

  private _renderNotice() {
    if (this._state === "loading") {
      return html`<p class="note">${this._t("loading")}</p>`;
    }
    if (this._state === "error" || !this._notice) {
      return html`<p class="note">${this._t("error")}</p>`;
    }
    return html`<article>
      <ha-markdown
        .content=${rewriteArticleLinks(
          this._notice,
          () => false,
          this._t("not_included")
        )}
      ></ha-markdown>
    </article>`;
  }

  private _renderArticle() {
    if (this._state === "loading") {
      return html`<p class="note">${this._t("loading")}</p>`;
    }
    if (this._state === "error") {
      return html`<p class="note">${this._t("error")}</p>`;
    }
    if (this._state === "missing" || !this._article) {
      return html`
        <div class="missing">
          <h3>${this._t("not_bundled_title")}</h3>
          <p>${this._t("not_bundled_body", { path: this._path ?? "" })}</p>
          <button type="button" class="link" @click=${this._openHome}>
            ${this._t("back_to_list")}
          </button>
        </div>
      `;
    }
    const note = this._t("not_included");
    const body = rewriteArticleLinks(this._article.body, this._isBundled, note);
    const sections = splitSections(body);
    const toc = sections.filter((s) => s.heading && s.heading.level <= 3);
    return html`
      ${
        toc.length > 3
          ? html`<nav class="toc" aria-label=${this._t("contents")}>
              <strong>${this._t("contents")}</strong>
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
          ${this._t("source", {
            path: this._article.source,
            commit: this._article.commit.slice(0, 7),
            date: this._article.fetched,
          })}
        </p>
        <p>${this._t("license")}</p>
        <p>${this._t("images_note")}</p>
        <button type="button" class="link" @click=${this._openNotice}>
          ${this._t("notice_link")}
        </button>
        <button type="button" class="link" @click=${this._openHome}>
          ${this._t("back_to_list")}
        </button>
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
        .group h3 {
          margin: var(--ha-space-4) 0 var(--ha-space-1);
          font-size: var(--ha-font-size-l, 1rem);
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
        .results button,
        button.wide {
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
        button.link {
          min-height: 44px;
          margin-inline-end: var(--ha-space-3);
          padding: 0;
          border: none;
          background: none;
          color: var(--primary-color);
          font: inherit;
          cursor: pointer;
          text-decoration: underline;
        }
        .toc button:hover,
        .results button:hover,
        button.wide:hover,
        .toc button:focus-visible,
        .results button:focus-visible,
        button.wide:focus-visible {
          background: var(--secondary-background-color);
        }
        .results span,
        button.wide span {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s, 0.8125rem);
          overflow-wrap: anywhere;
        }
        article {
          overflow-wrap: anywhere;
        }
        article img {
          max-width: 100%;
          height: auto;
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
