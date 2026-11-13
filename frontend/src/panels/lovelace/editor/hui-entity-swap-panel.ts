import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-checkbox";
import "../../../components/input/ha-input";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import type { EntityTextMatch } from "./swap-entity-text";
import { findEntityMatches, isEntityId } from "./swap-entity-text";

export interface EntitySwapRequest {
  matches: EntityTextMatch[];
  replacement: string;
}

declare global {
  interface HASSDomEvents {
    "entity-swap": EntitySwapRequest;
    "entity-swap-close": undefined;
  }
}

/**
 * Swaps one entity ID for another in the raw configuration text. Only whole
 * IDs match, every match is listed with its line, and a before and after
 * preview is shown. The swap changes the editor text only: saving stays a
 * separate step.
 */
@customElement("hui-entity-swap-panel")
export class HuiEntitySwapPanel extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property() public text = "";

  /** Entity ID to start from, for example the one under the cursor */
  @property({ attribute: "initial-from" }) public initialFrom = "";

  @state() private _from = "";

  @state() private _to = "";

  @state() private _skipped = new Set<number>();

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("initialFrom") && this.initialFrom && !this._from) {
      this._from = this.initialFrom;
    }
  }

  private _matches(): EntityTextMatch[] {
    if (!isEntityId(this._from) || !isEntityId(this._to)) {
      return [];
    }
    return findEntityMatches(this.text, this._from, this._to);
  }

  protected render(): TemplateResult {
    const t = (key: string, values?: Record<string, string | number>) =>
      this.hass.localize(
        `ui.panel.lovelace.editor.raw_editor.swap_entity.${key}` as any,
        values
      );
    const fromValid = !this._from || isEntityId(this._from);
    const toValid = !this._to || isEntityId(this._to);
    const matches = this._matches();
    const chosen = matches.filter((m) => !this._skipped.has(m.from));
    const ready = isEntityId(this._from) && isEntityId(this._to);
    return html`
      <ha-card>
        <div class="header">
          <h2>${t("title")}</h2>
          <ha-button appearance="plain" @click=${this._close}>
            ${this.hass.localize("ui.common.close")}
          </ha-button>
        </div>
        <p class="intro">${t("intro")}</p>
        <div class="fields">
          <ha-input
            .label=${t("from")}
            .value=${this._from}
            .invalid=${!fromValid}
            @input=${this._fromChanged}
            placeholder="light.kitchen"
            autocapitalize="none"
            spellcheck="false"
          ></ha-input>
          <ha-input
            .label=${t("to")}
            .value=${this._to}
            .invalid=${!toValid}
            @input=${this._toChanged}
            placeholder="light.galley"
            autocapitalize="none"
            spellcheck="false"
          ></ha-input>
        </div>
        ${
          !fromValid || !toValid
            ? html`<p class="error">${t("invalid")}</p>`
            : nothing
        }
        ${
          ready
            ? html`
                <div class="columns">
                  <section>
                    <h3>${t("preview")}</h3>
                    ${
                      chosen.length
                        ? html`<div class="diff" dir="ltr">
                            ${chosen.map(
                              (m) => html`
                                <div class="removed">
                                  <span class="line">${m.line}</span>-
                                  ${m.before}
                                </div>
                                <div class="added">
                                  <span class="line">${m.line}</span>+
                                  ${m.after}
                                </div>
                              `
                            )}
                          </div>`
                        : html`<p class="muted">${t("none")}</p>`
                    }
                    <p class="muted">
                      ${t("whole_only", { id: `${this._from}_…` })}
                    </p>
                  </section>
                  <section>
                    <h3>${t("where")}</h3>
                    <ul class="matches">
                      ${matches.map(
                        (m) =>
                          html`<li>
                            <ha-checkbox
                              .checked=${!this._skipped.has(m.from)}
                              .offset=${m.from}
                              @change=${this._toggle}
                            >
                              <span class="mono"
                                >${t("line", { line: m.line })}</span
                              >
                              <span class="muted">${m.before.trim()}</span>
                            </ha-checkbox>
                          </li>`
                      )}
                    </ul>
                    <ha-button
                      .disabled=${!chosen.length}
                      @click=${this._applyChosen}
                    >
                      ${t("replace", { count: chosen.length })}
                    </ha-button>
                  </section>
                </div>
              `
            : nothing
        }
      </ha-card>
    `;
  }

  private _fromChanged(ev: Event) {
    this._from = ((ev.target as HTMLInputElement).value ?? "").trim();
    this._skipped = new Set();
  }

  private _toChanged(ev: Event) {
    this._to = ((ev.target as HTMLInputElement).value ?? "").trim();
  }

  private _toggle(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      checked: boolean;
      offset: number;
    };
    const next = new Set(this._skipped);
    if (target.checked) {
      next.delete(target.offset);
    } else {
      next.add(target.offset);
    }
    this._skipped = next;
  }

  private _applyChosen = () => {
    const matches = this._matches().filter((m) => !this._skipped.has(m.from));
    fireEvent(this, "entity-swap", { matches, replacement: this._to });
    this._skipped = new Set();
  };

  private _close() {
    fireEvent(this, "entity-swap-close");
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        ha-card {
          padding: var(--ha-space-4);
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        h2 {
          margin: 0;
          font-size: var(--ha-font-size-xl);
          font-weight: var(--ha-font-weight-title);
        }
        h3 {
          margin: 0 0 var(--ha-space-2);
          font-size: var(--ha-font-size-m);
        }
        .intro,
        .muted {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
        }
        .error {
          color: var(--error-color);
        }
        .fields {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--ha-space-3);
        }
        .columns {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--ha-space-4);
          margin-top: var(--ha-space-3);
        }
        .diff {
          background: var(
            --ha-color-surface-tone-1,
            var(--secondary-background-color)
          );
          border-radius: var(--ha-border-radius-lg);
          padding: var(--ha-space-3);
          font-family: var(--ha-font-family-code, monospace);
          font-size: var(--ha-font-size-s);
          overflow-x: auto;
          max-height: 240px;
          overflow-y: auto;
        }
        .diff .line {
          display: inline-block;
          min-width: 3ch;
          color: var(--secondary-text-color);
        }
        .removed {
          background: var(--ha-color-error-container, transparent);
          white-space: pre;
        }
        .added {
          background: var(--ha-color-success-container, transparent);
          white-space: pre;
        }
        ul.matches {
          list-style: none;
          margin: 0 0 var(--ha-space-3);
          padding: 0;
          max-height: 200px;
          overflow-y: auto;
        }
        .mono {
          font-family: var(--ha-font-family-code, monospace);
        }
        @media all and (max-width: 600px) {
          .fields,
          .columns {
            grid-template-columns: 1fr;
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-entity-swap-panel": HuiEntitySwapPanel;
  }
}
