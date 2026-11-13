import type { TemplateResult } from "lit";
import { css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import "../../../../components/ha-button";
import "../../../../components/ha-select";
import "../../../../components/input/ha-input";
import type { LovelaceConfig } from "../../../../data/lovelace/config/types";
import { showConfirmationDialog } from "../../../../dialogs/generic/show-dialog-box";
import type { Checkpoint } from "./checkpoints";
import {
  addCheckpoint,
  readCheckpoints,
  removeCheckpoint,
} from "./checkpoints";
import type { CardDiff, ViewDiff } from "./dashboard-diff";
import { diffDashboards, summarizeDiff } from "./dashboard-diff";
import { ToolView } from "./tools-base";

const CURRENT = "current";

@customElement("hui-tool-diff")
export class HuiToolDiff extends ToolView {
  @state() private _checkpoints: Checkpoint[] = [];

  @state() private _name = "";

  @state() private _left = "";

  @state() private _right = CURRENT;

  @state() private _showSame = false;

  public connectedCallback(): void {
    super.connectedCallback();
    this._checkpoints = readCheckpoints(
      this.params.lovelace()?.urlPath ?? null
    );
    this._left = this._checkpoints[this._checkpoints.length - 1]?.id ?? "";
  }

  private _configOf(id: string): LovelaceConfig | undefined {
    return id === CURRENT
      ? this._config
      : this._checkpoints.find((c) => c.id === id)?.config;
  }

  private _diff = memoizeOne(
    (left?: LovelaceConfig, right?: LovelaceConfig): ViewDiff[] | undefined =>
      left && right ? diffDashboards(left, right) : undefined
  );

  private _options() {
    return [
      ...this._checkpoints.map((c) => ({
        value: c.id,
        label: `${c.name} · ${new Date(c.at).toLocaleString(this.hass.locale?.language)}`,
      })),
      { value: CURRENT, label: this._t("diff.current") },
    ];
  }

  protected render(): TemplateResult {
    const diff = this._diff(
      this._configOf(this._left),
      this._configOf(this._right)
    );
    const summary = diff ? summarizeDiff(diff) : undefined;
    const options = this._options();
    return html`
      <p class="intro">${this._t("diff.intro")}</p>
      ${this._renderMessages()}
      <div class="row">
        <ha-input
          .label=${this._t("diff.name")}
          .value=${this._name}
          @input=${this._nameChanged}
        ></ha-input>
        <ha-button
          .disabled=${!this._name.trim()}
          @click=${this._saveCheckpoint}
        >
          ${this._t("diff.save")}
        </ha-button>
      </div>
      ${
        this._checkpoints.length
          ? html`
              <div class="row">
                <ha-select
                  .label=${this._t("diff.left")}
                  .value=${this._left}
                  .options=${options}
                  @selected=${this._leftChanged}
                ></ha-select>
                <ha-select
                  .label=${this._t("diff.right")}
                  .value=${this._right}
                  .options=${options}
                  @selected=${this._rightChanged}
                ></ha-select>
              </div>
              <div class="row">
                ${
                  summary
                    ? html`<span class="pill error"
                          >${this._t("diff.removed", { count: summary.removed })}</span
                        >
                        <span class="pill warning"
                          >${this._t("diff.changed", { count: summary.changed })}</span
                        >
                        <span class="pill success"
                          >${this._t("diff.added", { count: summary.added })}</span
                        >
                        <span class="pill"
                          >${this._t("diff.same", { count: summary.same })}</span
                        >`
                    : nothing
                }
                <span class="grow"></span>
                <ha-button
                  appearance="plain"
                  .disabled=${this._left === CURRENT || this._busy}
                  @click=${this._restore}
                >
                  ${this._t("diff.restore")}
                </ha-button>
                <ha-button
                  appearance="plain"
                  variant="danger"
                  .disabled=${this._left === CURRENT}
                  @click=${this._remove}
                >
                  ${this._t("diff.remove")}
                </ha-button>
                <ha-button appearance="plain" @click=${this._toggleSame}>
                  ${this._t(this._showSame ? "diff.hide_same" : "diff.show_same")}
                </ha-button>
              </div>
              ${
                diff && this._left === this._right
                  ? html`<p class="hint">${this._t("diff.same_pick")}</p>`
                  : nothing
              }
              ${diff ? html`${diff.map((view) => this._renderView(view))}` : nothing}
            `
          : html`<p class="empty">${this._t("diff.none")}</p>`
      }
    `;
  }

  private _renderView(view: ViewDiff): TemplateResult | typeof nothing {
    const cards = view.cards.filter((c) => this._showSame || c.kind !== "same");
    if (view.kind === "same" && !this._showSame) {
      return nothing;
    }
    return html`<section class="view">
      <h3>
        ${view.title}
        <span class="pill ${this._tone(view.kind)}"
          >${this._t(`diff.kind.${view.kind}`)}</span
        >
        ${
          view.settingsChanged
            ? html`<span class="pill warning"
                >${this._t("diff.settings")}</span
              >`
            : nothing
        }
      </h3>
      <ul>
        ${cards.map((card) => this._renderCard(card))}
      </ul>
    </section>`;
  }

  private _renderCard(card: CardDiff): TemplateResult {
    const tile = (present: boolean, cls: string) =>
      present
        ? html`<div class="tile ${cls}">
            <b>${card.label || card.type}</b>
            <span class="muted">${card.type}</span>
          </div>`
        : html`<div class="tile gap" aria-hidden="true"></div>`;
    return html`<li
      class="pair"
      aria-label=${this._t(`diff.kind.${card.kind}`)}
    >
      ${tile(!!card.before, card.kind === "removed" || card.kind === "changed" ? card.kind : "same")}
      ${tile(!!card.after, card.kind === "added" || card.kind === "changed" ? card.kind : "same")}
      <span class="pill ${this._tone(card.kind)}"
        >${this._t(`diff.kind.${card.kind}`)}</span
      >
    </li>`;
  }

  private _tone(kind: string): string {
    return kind === "added"
      ? "success"
      : kind === "removed"
        ? "error"
        : kind === "changed"
          ? "warning"
          : "";
  }

  private _nameChanged(ev: Event) {
    this._name = (ev.target as HTMLElement & { value?: string }).value ?? "";
  }

  private _leftChanged(ev: CustomEvent<{ value?: string }>) {
    this._left = ev.detail.value ?? "";
  }

  private _rightChanged(ev: CustomEvent<{ value?: string }>) {
    this._right = ev.detail.value ?? "";
  }

  private _toggleSame() {
    this._showSame = !this._showSame;
  }

  private _saveCheckpoint() {
    const config = this._config;
    if (!config) {
      return;
    }
    this._error = undefined;
    try {
      this._checkpoints = addCheckpoint(
        this._lovelace?.urlPath ?? null,
        this._name,
        config
      );
      this._left = this._checkpoints[this._checkpoints.length - 1].id;
      this._right = CURRENT;
      this._notice = this._t("diff.saved", { name: this._name.trim() });
      this._name = "";
    } catch (err: unknown) {
      this._notice = undefined;
      this._error =
        err instanceof Error && err.message === "too_large"
          ? this._t("diff.too_large")
          : this._t("diff.storage_failed");
    }
  }

  private async _restore() {
    const checkpoint = this._checkpoints.find((c) => c.id === this._left);
    if (!checkpoint) {
      return;
    }
    const ok = await showConfirmationDialog(this, {
      title: this._t("diff.restore_title", { name: checkpoint.name }),
      text: this._t("diff.restore_text"),
      confirmText: this._t("diff.restore"),
      dismissText: this.hass.localize("ui.common.cancel"),
    });
    if (ok) {
      await this._save(
        () => structuredClone(checkpoint.config),
        this._t("diff.restored", { name: checkpoint.name })
      );
    }
  }

  private async _remove() {
    const checkpoint = this._checkpoints.find((c) => c.id === this._left);
    if (!checkpoint) {
      return;
    }
    const ok = await showConfirmationDialog(this, {
      title: this._t("diff.remove_title", { name: checkpoint.name }),
      confirmText: this.hass.localize("ui.common.delete"),
      dismissText: this.hass.localize("ui.common.cancel"),
      destructive: true,
    });
    if (ok) {
      this._checkpoints = removeCheckpoint(
        this._lovelace?.urlPath ?? null,
        checkpoint.id
      );
      this._left = this._checkpoints[this._checkpoints.length - 1]?.id ?? "";
    }
  }

  static get styles() {
    return [
      ToolView.styles,
      css`
        .view h3 {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2);
          margin: var(--ha-space-4) 0 var(--ha-space-2);
          font-size: var(--ha-font-size-l);
        }
        .pair {
          display: grid;
          grid-template-columns: 1fr 1fr auto;
          align-items: center;
          gap: var(--ha-space-2);
          margin-bottom: var(--ha-space-2);
        }
        .tile {
          display: flex;
          flex-direction: column;
          min-height: 56px;
          padding: var(--ha-space-3);
          border-radius: var(--ha-border-radius-lg);
          background: var(--secondary-background-color);
          overflow-wrap: anywhere;
        }
        .tile.removed {
          outline: 3px solid var(--error-color);
        }
        .tile.added {
          outline: 3px solid var(--success-color);
        }
        .tile.changed {
          outline: 3px solid var(--warning-color);
        }
        .tile.gap {
          background: none;
          border: 2px dashed var(--divider-color);
        }
        @media (max-width: 520px) {
          .pair {
            grid-template-columns: 1fr;
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-tool-diff": HuiToolDiff;
  }
}
