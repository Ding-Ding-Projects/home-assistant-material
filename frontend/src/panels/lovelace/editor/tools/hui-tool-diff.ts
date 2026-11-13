import type { PropertyValues, TemplateResult } from "lit";
import { css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import "../../../../components/ha-button";
import "../../../../components/ha-select";
import "../../../../components/input/ha-input";
import { fetchConfig } from "../../../../data/lovelace/config/types";
import type {
  LovelaceRawConfig,
  LovelaceConfig,
} from "../../../../data/lovelace/config/types";
import { showConfirmationDialog } from "../../../../dialogs/generic/show-dialog-box";
import type { Checkpoint } from "./checkpoints";
import {
  addCheckpoint,
  readCheckpoints,
  removeCheckpoint,
} from "./checkpoints";
import type { CardDiff, ViewDiff } from "./dashboard-diff";
import { diffDashboards, summarizeDiff } from "./dashboard-diff";
import { fileDownload } from "../../../../util/file_download";
import type { SavedRevision } from "./saved-revisions";
import { readSavedRevisions } from "./saved-revisions";
import { ToolView } from "./tools-base";

const CURRENT = "current";

@customElement("hui-tool-diff")
export class HuiToolDiff extends ToolView {
  @state() private _checkpoints: Checkpoint[] = [];

  @state() private _name = "";

  @state() private _revisionChoice = "";

  @state() private _revisionEntries: SavedRevision[] = [];

  private _revisionScope = "";

  @state() private _review?: {
    userId: string;
    urlPath: string | null;
    current: LovelaceRawConfig;
    target: LovelaceRawConfig;
  };

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

  protected willUpdate(changed: PropertyValues) {
    super.willUpdate(changed);
    const scope = JSON.stringify([this.hass.user?.id, this._lovelace?.urlPath]);
    if (scope !== this._revisionScope) {
      this._revisionScope = scope;
      this._review = undefined;
      this._revisionChoice = "";
      this._revisionEntries = this._savedRevisions();
    }
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
    const revisions = this._revisionEntries;
    const revisionCount = revisions.length;
    const revisionOptions = revisions.flatMap((revision, index) =>
      ["before", "after"].map((side) => ({
        value: `${index}:${side}`,
        label: this._t(`diff.revisions_${side}`, {
          date: new Date(revision.at).toLocaleString(
            this.hass.locale?.language
          ),
        }),
      }))
    );
    return html`
      <section>
        <h3>${this._t("diff.revisions_title")}</h3>
        <p>${this._t("diff.revisions_intro")}</p>
        <ha-button
          appearance="outlined"
          .disabled=${!revisionCount}
          @click=${this._exportRevisions}
          >${this._t("diff.revisions_export", { count: revisionCount })}</ha-button
        >
        <div class="row">
          <ha-select
            .label=${this._t("diff.revisions_choose")}
            .value=${this._revisionChoice}
            .options=${revisionOptions}
            .disabled=${this._busy}
            @selected=${this._revisionChanged}
          ></ha-select>
          <ha-button
            .disabled=${this._busy || !this._revisionChoice || this._lovelace?.mode !== "storage"}
            @click=${this._prepareRevision}
            >${this._t("diff.revisions_review")}</ha-button
          >
        </div>
        ${
          this._review
            ? html`
                <p>${this._t("diff.revisions_review_note")}</p>
                <details>
                  <summary>${this._t("diff.revisions_current")}</summary>
                  <pre>${JSON.stringify(this._review.current, null, 2)}</pre>
                </details>
                <details>
                  <summary>${this._t("diff.revisions_target")}</summary>
                  <pre>${JSON.stringify(this._review.target, null, 2)}</pre>
                </details>
                <ha-button
                  .disabled=${this._busy}
                  @click=${this._restoreRevision}
                  >${this._t("diff.revisions_restore")}</ha-button
                >
                <ha-button
                  appearance="plain"
                  .disabled=${this._busy}
                  @click=${this._cancelRevision}
                  >${this.hass.localize("ui.common.cancel")}</ha-button
                >
              `
            : nothing
        }
      </section>
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

  private _revisionChanged(ev: CustomEvent<{ value?: string }>) {
    this._revisionChoice = ev.detail.value ?? "";
    this._review = undefined;
  }

  private _cancelRevision() {
    this._review = undefined;
  }

  private async _prepareRevision() {
    if (this._busy) return;
    const lovelace = this._lovelace;
    const userId = this.hass.user?.id;
    const [index, side] = this._revisionChoice.split(":");
    const entry = this._revisionEntries[Number(index)];
    if (
      !entry ||
      !userId ||
      !lovelace ||
      lovelace.mode !== "storage" ||
      (side !== "before" && side !== "after")
    ) {
      return;
    }
    const urlPath = lovelace.urlPath;
    const target = structuredClone(entry[side]);
    this._busy = true;
    this._review = undefined;
    this._error = undefined;
    try {
      const current = await fetchConfig(this.hass.connection, urlPath, true);
      if (
        !this.isConnected ||
        this.hass.user?.id !== userId ||
        this._lovelace?.urlPath !== urlPath
      ) {
        return;
      }
      this._review = {
        userId,
        urlPath,
        current: structuredClone(current),
        target,
      };
    } catch (err: unknown) {
      this._fail(err);
    } finally {
      this._busy = false;
    }
  }

  private async _restoreRevision() {
    const review = this._review;
    if (!review || this._busy) return;
    this._busy = true;
    this._error = undefined;
    try {
      const confirmed = await showConfirmationDialog(this, {
        title: this._t("diff.revisions_restore"),
        text: this._t("diff.revisions_confirm"),
        confirmText: this._t("diff.revisions_restore"),
        dismissText: this.hass.localize("ui.common.cancel"),
      });
      const lovelace = this._lovelace;
      if (
        !confirmed ||
        !this.isConnected ||
        this._review !== review ||
        this.hass.user?.id !== review.userId ||
        !lovelace ||
        lovelace.urlPath !== review.urlPath ||
        lovelace.mode !== "storage"
      ) {
        return;
      }
      // The server rejects stale reviews atomically. Never retry without the guard.
      await lovelace.saveConfig(structuredClone(review.target), review.current);
      this._review = undefined;
      this._revisionChoice = "";
      this._revisionEntries = this._savedRevisions();
      this._notice = this._t("diff.revisions_restored");
    } catch {
      this._error = this._t("diff.revisions_restore_failed");
      this._review = undefined;
    } finally {
      this._busy = false;
    }
  }

  private _savedRevisions() {
    const userId = this.hass.user?.id;
    return userId
      ? readSavedRevisions({ userId, urlPath: this._lovelace?.urlPath ?? null })
      : [];
  }

  private _exportRevisions() {
    const revisions = this._savedRevisions();
    if (!revisions.length) return;
    const blob = new Blob(
      [
        JSON.stringify(
          { version: 1, dashboard: this._lovelace?.urlPath ?? null, revisions },
          null,
          2
        ),
      ],
      { type: "application/json" }
    );
    fileDownload(URL.createObjectURL(blob), "dashboard-saved-revisions.json");
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
        pre {
          max-height: 320px;
          overflow: auto;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
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
