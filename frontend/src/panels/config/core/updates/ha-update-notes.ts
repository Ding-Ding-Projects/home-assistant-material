import { mdiFileDocumentOutline, mdiRefresh } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { formatTime } from "../../../../common/datetime/format_time";
import { LanguageModeController } from "../../../../common/language-mode/language-mode-controller";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-dialog";
import "../../../../components/ha-dialog-footer";
import "../../../../components/ha-spinner";
import "../../../../components/ha-svg-icon";
import type { BuildNotes } from "../../../../data/build-notes";
import {
  NOTES_HIGHLIGHT_LIMIT,
  fetchNotes,
  findNotes,
  notesPageUrl,
  summaryForMode,
  whatForMode,
} from "../../../../data/build-notes";
import type { PublicFetchFailure } from "../../../../data/public-json";
import { haStyle } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";

const PREFIX = "ui.panel.config.updates.build_notes";
const DATA_PREFIX = "ui.panel.config.updates.build_data";

/**
 * "Notes for build N": the headline, summary and first highlights of a build,
 * read from the public updates log. The full public page is loaded only when
 * the person asks for it, in a sandboxed frame inside a dialog.
 */
@customElement("ha-update-notes")
export class HaUpdateNotes extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** The build whose notes are shown. */
  @property({ type: Number }) public build?: number;

  @state() private _notes?: BuildNotes[];

  @state() private _failure?: PublicFetchFailure;

  @state() private _loading = true;

  @state() private _dialogOpen = false;

  private _lang = new LanguageModeController(this);

  private _abort?: AbortController;

  public connectedCallback(): void {
    super.connectedCallback();
    this._load(false);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._abort?.abort();
    this._abort = undefined;
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    if (changed.has("build")) {
      this._dialogOpen = false;
    }
  }

  private async _load(force: boolean): Promise<void> {
    this._abort?.abort();
    const controller = new AbortController();
    this._abort = controller;
    this._loading = true;
    const result = await fetchNotes(force, controller.signal);
    if (controller.signal.aborted) {
      return;
    }
    this._loading = false;
    if (!result.ok) {
      this._failure = result;
      return;
    }
    this._failure = undefined;
    this._notes = result.data;
  }

  private _retry = (): void => {
    this._load(true);
  };

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.hass.localize, key, values);
  }

  private _failureText(failure: PublicFetchFailure): string {
    switch (failure.reason) {
      case "rate_limited":
        return failure.resetAt
          ? this._t(`${DATA_PREFIX}.error_rate`, {
              time: formatTime(
                failure.resetAt,
                this.hass.locale,
                this.hass.config
              ),
            })
          : this._t(`${DATA_PREFIX}.error_rate_unknown`);
      case "offline":
        return this._t(`${DATA_PREFIX}.error_offline`);
      case "not_found":
        return this._t(`${PREFIX}.missing`, { build: this.build ?? 0 });
      case "http":
        return this._t(`${DATA_PREFIX}.error_http`, { status: failure.status });
      default:
        return this._t(`${DATA_PREFIX}.error_invalid`);
    }
  }

  private _open = (): void => {
    this._dialogOpen = true;
  };

  private _close = (): void => {
    this._dialogOpen = false;
  };

  protected render(): TemplateResult | typeof nothing {
    if (this.build === undefined) {
      return nothing;
    }
    return html`
      <section class="card" aria-labelledby="notes-title">
        <div class="head">
          <span class="tile"
            ><ha-svg-icon .path=${mdiFileDocumentOutline}></ha-svg-icon
          ></span>
          <h3 id="notes-title">
            ${this._t(`${PREFIX}.title`, { build: this.build })}
          </h3>
        </div>
        ${this._renderBody()}
      </section>
      ${this._dialogOpen ? this._renderDialog() : nothing}
    `;
  }

  private _renderBody(): TemplateResult {
    if (this._failure) {
      return html`<ha-alert
        alert-type=${this._failure.reason === "not_found" ? "info" : "warning"}
      >
        ${this._failureText(this._failure)}
        <ha-button
          slot="action"
          appearance="plain"
          .disabled=${this._loading}
          @click=${this._retry}
        >
          <ha-svg-icon slot="start" .path=${mdiRefresh}></ha-svg-icon>
          ${this._t(`${DATA_PREFIX}.retry`)}
        </ha-button>
      </ha-alert>`;
    }
    if (!this._notes) {
      return html`<div class="loading" role="status">
        <ha-spinner size="small"></ha-spinner>
        <span>${this._t(`${PREFIX}.loading`)}</span>
      </div>`;
    }
    const notes = findNotes(this._notes, this.build);
    if (!notes) {
      return html`<p class="quiet">
        ${this._t(`${PREFIX}.missing`, { build: this.build! })}
      </p>`;
    }
    const mode = this._lang.mode;
    const shown = notes.highlights.slice(0, NOTES_HIGHLIGHT_LIMIT);
    const more = notes.highlights.length - shown.length;
    return html`
      <p class="headline">${notes.headline}</p>
      ${summaryForMode(notes, mode).map(
        (paragraph) => html`<p class="summary">${paragraph}</p>`
      )}
      ${
        shown.length
          ? html`<ul class="highlights">
              ${shown.map(
                (item) =>
                  html`<li>
                    <strong>${item.title}</strong>
                    ${whatForMode(item, mode).map(
                      (paragraph) =>
                        html`<span class="what">${paragraph}</span>`
                    )}
                  </li>`
              )}
            </ul>`
          : nothing
      }
      ${
        more > 0
          ? html`<p class="quiet">
              ${this._t(`${PREFIX}.more`, { count: more })}
            </p>`
          : nothing
      }
      <div class="actions">
        <ha-button appearance="filled" @click=${this._open}>
          ${this._t(`${PREFIX}.show_full`)}
        </ha-button>
      </div>
    `;
  }

  private _renderDialog(): TemplateResult {
    const build = this.build!;
    const title = this._t(`${PREFIX}.dialog_title`, { build });
    return html`
      <ha-dialog
        open
        width="large"
        .headerTitle=${title}
        @closed=${this._close}
      >
        <div class="frame-wrap">
          <p class="quiet">${this._t(`${PREFIX}.dialog_note`)}</p>
          <iframe
            title=${title}
            src=${notesPageUrl(build)}
            sandbox="allow-scripts"
            referrerpolicy="no-referrer"
            loading="lazy"
          ></iframe>
        </div>
        <ha-dialog-footer slot="footer">
          <ha-button slot="primaryAction" @click=${this._close}>
            ${this._t("ui.common.close")}
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        /* The shared heading style keeps an h2 on one line and cuts it with an
           ellipsis. Headings on this page are long and must wrap. */
        h1,
        h2,
        h3 {
          white-space: normal;
          overflow: visible;
          text-overflow: clip;
          overflow-wrap: anywhere;
          max-width: 100%;
        }
        :host {
          display: block;
        }
        .card {
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
          padding: var(--ha-space-5) var(--ha-space-6);
          border-radius: var(--ha-border-radius-5xl);
          background: color-mix(
            in srgb,
            var(--primary-color) 14%,
            var(--card-background-color)
          );
        }
        .head {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
        }
        .tile {
          display: flex;
          flex: none;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border-radius: var(--ha-border-radius-2xl);
          background: color-mix(
            in srgb,
            var(--primary-color) 26%,
            var(--card-background-color)
          );
        }
        h3 {
          margin: 0;
          font-size: var(--ha-font-size-xl);
          font-weight: var(--ha-font-weight-bold);
        }
        p {
          margin: 0;
        }
        .headline {
          font-size: var(--ha-font-size-l);
          font-weight: var(--ha-font-weight-bold);
          line-height: var(--ha-line-height-condensed);
          overflow-wrap: anywhere;
        }
        .summary {
          line-height: var(--ha-line-height-normal);
          overflow-wrap: anywhere;
        }
        .quiet {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
          overflow-wrap: anywhere;
        }
        .loading {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          color: var(--secondary-text-color);
        }
        .highlights {
          display: grid;
          grid-template-columns: repeat(
            auto-fit,
            minmax(min(100%, 240px), 1fr)
          );
          gap: var(--ha-space-2);
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .highlights li {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
          padding: var(--ha-space-3) var(--ha-space-4);
          border-radius: var(--ha-border-radius-3xl);
          background: var(--card-background-color);
          overflow-wrap: anywhere;
        }
        .what {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
          line-height: var(--ha-line-height-normal);
        }
        ha-button {
          --ha-button-height: 52px;
        }
        .actions {
          display: flex;
        }
        .frame-wrap {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        iframe {
          box-sizing: border-box;
          width: 100%;
          height: min(70vh, 720px);
          border: 1px solid var(--divider-color);
          border-radius: var(--ha-border-radius-2xl);
          background: var(--card-background-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-update-notes": HaUpdateNotes;
  }
}
