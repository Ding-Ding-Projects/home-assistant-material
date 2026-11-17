import type { PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { copyToClipboard } from "../../../../common/util/copy-clipboard";
import "../../../../components/ha-button";
import { haStyle } from "../../../../resources/styles";
import type { OutputState } from "./update-progress-feed";
import { OUTPUT_COLLAPSED_LINES } from "./update-progress-model";
import type { ProgressText } from "./update-progress-strings";

/**
 * The live output of one update: the newest lines of its log, three of them
 * until the person asks for all. Lines come in already hidden of anything
 * that looks like a password or a token.
 */
@customElement("ha-update-output")
class HaUpdateOutput extends LitElement {
  @property({ attribute: false }) public text!: ProgressText;

  @property({ attribute: false }) public lines: string[] = [];

  @property({ attribute: false }) public outputState: OutputState = "waiting";

  /** The name used in the accessible label. */
  @property() public name = "";

  @state() private _expanded = false;

  @state() private _follow = true;

  @state() private _copied = false;

  @query(".all") private _all?: HTMLElement;

  protected updated(changed: PropertyValues): void {
    if (
      this._expanded &&
      this._follow &&
      this._all &&
      (changed.has("lines") || changed.has("_expanded"))
    ) {
      this._all.scrollTop = this._all.scrollHeight;
    }
  }

  protected render(): TemplateResult {
    const t = this.text;
    return html`
      <section
        class="output"
        role="group"
        aria-label=${t("output.region", { name: this.name })}
      >
        <div class="head">
          <span class="title">${t("output.title")}</span>
          ${
            this.lines.length > OUTPUT_COLLAPSED_LINES
              ? html`<ha-button
                  appearance="plain"
                  size="s"
                  aria-expanded=${this._expanded ? "true" : "false"}
                  @click=${this._toggle}
                  >${
                    this._expanded
                      ? t("output.show_less")
                      : t("output.show_all")
                  }</ha-button
                >`
              : nothing
          }
          ${
            this.lines.length
              ? html`<ha-button appearance="plain" size="s" @click=${this._copy}
                  >${this._copied ? t("output.copied") : t("output.copy")}</ha-button
                >`
              : nothing
          }
        </div>
        ${this._renderBody()}
        ${
          this._expanded
            ? html`<label class="follow">
                <input
                  type="checkbox"
                  .checked=${this._follow}
                  @change=${this._setFollow}
                />
                ${t("output.follow")}
              </label>`
            : nothing
        }
        <p class="note">${t("output.masked_note")}</p>
      </section>
    `;
  }

  private _renderBody(): TemplateResult {
    const t = this.text;
    if (this.outputState === "none") {
      return html`<p class="empty">${t("output.none")}</p>`;
    }
    if (!this.lines.length) {
      return html`<p class="empty" role="status">
        ${
          this.outputState === "unavailable"
            ? t("output.unavailable")
            : t("output.empty")
        }
      </p>`;
    }
    const shown = this._expanded
      ? this.lines
      : this.lines.slice(-OUTPUT_COLLAPSED_LINES);
    return html`
      <pre
        class=${classMap({ lines: true, all: this._expanded })}
        tabindex=${this._expanded ? "0" : "-1"}
      >
${shown.join("\n")}</pre>
      ${
        this.outputState === "unavailable"
          ? html`<p class="empty" role="status">${t("output.unavailable")}</p>`
          : nothing
      }
    `;
  }

  private _toggle(): void {
    this._expanded = !this._expanded;
  }

  private _setFollow(ev: Event): void {
    this._follow = (ev.target as HTMLInputElement).checked;
  }

  private async _copy(): Promise<void> {
    await copyToClipboard(this.lines.join("\n"), this);
    this._copied = true;
    setTimeout(() => {
      this._copied = false;
    }, 2000);
  }

  static styles = [
    haStyle,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .output {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-1);
      }
      .head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--ha-space-1);
      }
      .title {
        flex: 1 1 auto;
        font-size: var(--ha-font-size-s);
        font-weight: var(--ha-font-weight-medium);
        color: var(--secondary-text-color);
      }
      .head ha-button {
        --ha-button-height: 32px;
      }
      pre {
        box-sizing: border-box;
        margin: 0;
        padding: var(--ha-space-2);
        border-radius: var(--ha-border-radius-lg, 12px);
        background: var(--primary-background-color);
        font-family: var(--ha-font-family-code, monospace);
        font-size: var(--ha-font-size-xs, 12px);
        line-height: 1.4;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      pre.all {
        max-height: 240px;
        overflow: auto;
      }
      .empty,
      .note {
        margin: 0;
        font-size: var(--ha-font-size-xs, 12px);
        color: var(--secondary-text-color);
      }
      .follow {
        display: inline-flex;
        align-items: center;
        gap: var(--ha-space-2);
        min-height: 32px;
        font-size: var(--ha-font-size-s);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-update-output": HaUpdateOutput;
  }
}
