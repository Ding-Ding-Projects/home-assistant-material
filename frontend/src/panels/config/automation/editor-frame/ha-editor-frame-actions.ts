import { mdiContentSave, mdiTestTube } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-button";
import "../../../../components/ha-svg-icon";
import "../../../../components/ha-tooltip";
import type { HomeAssistant } from "../../../../types";

const PREFIX = "ui.panel.config.automation.editor.frame.";

declare global {
  interface HASSDomEvents {
    "frame-save": undefined;
    "frame-dry-run": undefined;
  }
  interface HTMLElementTagNameMap {
    "ha-editor-frame-actions": HaEditorFrameActions;
  }
}

/**
 * The header actions shared by the automation, script and scene editors: a
 * pill that says whether there are unsaved changes, Dry run and a filled
 * Save pill. It saves and runs nothing itself; it fires `frame-save` and
 * `frame-dry-run` and the editor does what it always did.
 */
@customElement("ha-editor-frame-actions")
export class HaEditorFrameActions extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public dirty = false;

  @property({ type: Boolean }) public saving = false;

  @property({ type: Boolean, attribute: "read-only" }) public readOnly = false;

  /** False where the editor cannot dry-run yet; the button then says so. */
  @property({ type: Boolean, attribute: "dry-run-available" })
  public dryRunAvailable = false;

  @property({ type: Boolean, attribute: "dry-run-busy" })
  public dryRunBusy = false;

  protected render() {
    const t = this.hass.localize;
    const label = t(`${PREFIX}${this.dirty ? "unsaved" : "no_unsaved"}`);
    return html`
      <span
        class="pill ${this.dirty ? "dirty" : ""}"
        role="status"
        aria-live="polite"
        >${label}</span
      >
      <span class="dry-wrap" id="frame-dry-run">
        <ha-button
          appearance="plain"
          .disabled=${!this.dryRunAvailable || this.dryRunBusy}
          @click=${this._dryRun}
        >
          <ha-svg-icon slot="start" .path=${mdiTestTube}></ha-svg-icon>
          ${t(`${PREFIX}dry_run`)}
        </ha-button>
      </span>
      ${
        this.dryRunAvailable
          ? nothing
          : html`<ha-tooltip for="frame-dry-run" placement="bottom"
              >${t(`${PREFIX}dry_run_soon`)}</ha-tooltip
            >`
      }
      <ha-button
        class="save"
        .disabled=${this.readOnly || this.saving || !this.dirty}
        .loading=${this.saving}
        @click=${this._save}
      >
        <ha-svg-icon slot="start" .path=${mdiContentSave}></ha-svg-icon>
        ${t("ui.common.save")}
      </ha-button>
    `;
  }

  private _save() {
    fireEvent(this, "frame-save");
  }

  private _dryRun() {
    fireEvent(this, "frame-dry-run");
  }

  static styles = css`
    :host {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: var(--ha-space-2);
      max-width: 100%;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 32px;
      padding: 0 var(--ha-space-3);
      border-radius: var(--ha-border-radius-pill, 999px);
      font-size: var(--ha-font-size-s, 0.875rem);
      font-weight: var(--ha-font-weight-medium);
      background: var(
        --md-sys-color-secondary-container,
        var(--ha-color-fill-neutral-normal-resting, #dde3ea)
      );
      color: var(
        --md-sys-color-on-secondary-container,
        var(--primary-text-color)
      );
      flex: none;
      white-space: nowrap;
    }
    .pill.dirty {
      background: var(
        --ha-color-primary-container,
        var(--secondary-background-color)
      );
      color: var(--ha-color-on-primary-container, var(--primary-text-color));
    }
    ha-button {
      min-height: 48px;
      --ha-button-border-radius: var(--ha-border-radius-pill, 999px);
    }
    .save::part(base) {
      border-radius: var(--ha-border-radius-pill, 999px);
    }
  `;
}
