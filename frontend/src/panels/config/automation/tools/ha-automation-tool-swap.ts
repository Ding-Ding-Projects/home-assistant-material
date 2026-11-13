import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import "../../../../components/ha-button";
import "../../../../components/ha-card";
import type {
  EntitySwap,
  SaveOutcome,
  StoredAutomation,
} from "./automation-bulk";
import { loadAllAutomations, saveOne, swapEntity } from "./automation-bulk";
import type { AutomationToolContext } from "./registry";

interface Affected {
  automation: StoredAutomation;
  swap: EntitySwap;
}

const ENTITY_ID = /^[a-z_]+\.[a-z0-9_]+$/;

@customElement("ha-automation-tool-swap")
export class HaAutomationToolSwap extends LitElement {
  @property({ attribute: false }) public context!: AutomationToolContext;

  @state() private _from = "";

  @state() private _to = "";

  @state() private _loading = false;

  @state() private _affected?: Affected[];

  @state() private _failedToLoad: string[] = [];

  @state() private _selected = new Set<string>();

  @state() private _outcomes: Record<string, SaveOutcome> = {};

  @state() private _saving = false;

  private _all?: StoredAutomation[];

  private _t(key: string, values?: Record<string, string | number>) {
    return this.context.hass.localize(
      `ui.panel.config.automation.editor.tools_more.swap.${key}` as any,
      values
    );
  }

  private get _valid() {
    return (
      ENTITY_ID.test(this._from) &&
      ENTITY_ID.test(this._to) &&
      this._from !== this._to
    );
  }

  private async _find() {
    this._loading = true;
    this._outcomes = {};
    if (!this._all) {
      const result = await loadAllAutomations(this.context.hass);
      this._all = result.automations;
      this._failedToLoad = result.failed;
    }
    const affected = this._all
      .map((automation) => ({
        automation,
        swap: swapEntity(automation.config, this._from, this._to),
      }))
      .filter(
        (a) => a.swap.paths.length > 0 || a.swap.untouchedMentions.length > 0
      );
    this._affected = affected;
    this._selected = new Set(
      affected.filter((a) => a.swap.paths.length).map((a) => a.automation.id)
    );
    this._loading = false;
  }

  private _fromChanged(ev: Event) {
    this._from = (ev.target as HTMLInputElement).value.trim();
  }

  private _toChanged(ev: Event) {
    this._to = (ev.target as HTMLInputElement).value.trim();
  }

  private _toggle(ev: Event) {
    const id = (ev.currentTarget as HTMLElement).dataset.id ?? "";
    const next = new Set(this._selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this._selected = next;
  }

  private async _save() {
    this._saving = true;
    // One automation at a time, so each one has its own clear result.
    for (const { automation, swap } of this._affected ?? []) {
      if (!this._selected.has(automation.id) || !swap.paths.length) {
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const outcome = await saveOne(
        this.context.hass,
        automation.id,
        swap.config
      );
      this._outcomes = { ...this._outcomes, [automation.id]: outcome };
      if (outcome.status === "saved") {
        automation.config = swap.config;
      }
    }
    this._saving = false;
  }

  protected render() {
    if (!this.context) {
      return nothing;
    }
    const total = (this._affected ?? [])
      .filter((a) => this._selected.has(a.automation.id))
      .reduce((sum, a) => sum + a.swap.paths.length, 0);
    return html`
      <ha-card .header=${this._t("title")}>
        <div class="content">
          <p class="hint">${this._t("description")}</p>
          <label>
            <span>${this._t("from")}</span>
            <input
              class="mono"
              .value=${this._from}
              @input=${this._fromChanged}
            />
          </label>
          <label>
            <span>${this._t("to")}</span>
            <input class="mono" .value=${this._to} @input=${this._toChanged} />
          </label>
          <div>
            <ha-button
              .disabled=${!this._valid || this._loading}
              @click=${this._find}
            >
              ${this._loading ? this._t("loading") : this._t("find")}
            </ha-button>
          </div>
          ${
            this._failedToLoad.length
              ? html`<p class="hint">
                  ${this._t("failed_load", { count: this._failedToLoad.length })}
                </p>`
              : nothing
          }
        </div>
      </ha-card>
      ${
        this._affected
          ? html`<ha-card .header=${this._t("review")}>
              <div class="content">
                ${
                  this._affected.length
                    ? html`<ul>
                          ${this._affected.map(({ automation, swap }) => {
                            const outcome = this._outcomes[automation.id];
                            return html`<li>
                              <label class="head">
                                <input
                                  type="checkbox"
                                  .disabled=${!swap.paths.length}
                                  .checked=${this._selected.has(automation.id)}
                                  data-id=${automation.id}
                                  @change=${this._toggle}
                                />
                                <b>${automation.name}</b>
                                ${
                                  outcome
                                    ? html`<span
                                        class="outcome ${outcome.status}"
                                        role="status"
                                      >
                                        ${
                                          outcome.status === "saved"
                                            ? this._t("saved")
                                            : this._t("failed", {
                                                message: outcome.message,
                                              })
                                        }
                                      </span>`
                                    : nothing
                                }
                              </label>
                              ${swap.paths.map(
                                (path) =>
                                  html`<div class="change mono">
                                    ${path}: ${this._from} → ${this._to}
                                  </div>`
                              )}
                              ${swap.untouchedMentions.map(
                                (path) =>
                                  html`<div class="change hint">
                                    ${this._t("mention", { path })}
                                  </div>`
                              )}
                            </li>`;
                          })}
                        </ul>
                        <div>
                          <ha-button
                            .disabled=${!total || this._saving}
                            @click=${this._save}
                          >
                            ${this._t("save", { count: this._selected.size })}
                          </ha-button>
                        </div>`
                    : html`<p>${this._t("none_found")}</p>`
                }
              </div>
            </ha-card>`
          : nothing
      }
    `;
  }

  static styles = css`
    :host {
      display: grid;
      gap: var(--ha-space-4);
    }
    .content {
      padding: var(--ha-space-4);
      display: grid;
      gap: var(--ha-space-3);
    }
    label {
      display: grid;
      gap: var(--ha-space-1);
    }
    label.head {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
    }
    input:not([type="checkbox"]) {
      padding: var(--ha-space-2) var(--ha-space-3);
      border: 1px solid var(--ha-color-outline, var(--divider-color));
      border-radius: var(--ha-border-radius-md);
      background: var(--card-background-color);
      color: var(--primary-text-color);
      font: inherit;
    }
    .mono {
      font-family: var(--ha-font-family-code, monospace);
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--ha-space-3);
    }
    .change {
      padding-inline-start: var(--ha-space-6, 24px);
      font-size: var(--ha-font-size-s);
      overflow-wrap: anywhere;
    }
    .hint {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      margin: 0;
    }
    .outcome.saved {
      color: var(--success-color);
    }
    .outcome.failed {
      color: var(--error-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-tool-swap": HaAutomationToolSwap;
  }
}
