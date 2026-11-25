import { mdiBackupRestore, mdiCheckCircle } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consumeLocalize } from "../common/decorators/consume-context-entry";
import { fireEvent } from "../common/dom/fire_event";
import { modeText } from "../common/language-mode/language-mode";
import type { LocalizeFunc } from "../common/translations/localize";
import "../components/ha-alert";
import "../components/ha-button";
import "../components/ha-svg-icon";
import "../components/progress/ha-progress-bar";
import type { OnboardingPendingRestore } from "../data/onboarding-pending-restore";
import { onBoardingStyles } from "./styles";

declare global {
  interface HASSDomEvents {
    "pending-restore-dismiss": undefined;
    "pending-restore-recheck": undefined;
  }
}

/**
 * Shown in place of the welcome step while a backup that was queued during
 * first start is restoring, and afterwards with the sign-in note or the
 * reason it failed.
 */
@customElement("onboarding-pending-restore")
class OnboardingPendingRestoreView extends LitElement {
  @property({ attribute: false }) public restore!: OnboardingPendingRestore;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  private _t(key: string, values?: Record<string, string | number>) {
    return modeText(this._localize, key, values);
  }

  protected render(): TemplateResult {
    const { state: restoreState, name, error } = this.restore;
    const prefix = "ui.panel.page-onboarding.restore_pending";
    const active = restoreState === "queued" || restoreState === "running";
    return html`
      <h1>${this._t(`${prefix}.${restoreState}_title`)}</h1>
      ${
        restoreState === "failed"
          ? html`<ha-alert alert-type="error" role="alert">
                ${this._t(`${prefix}.failed_text`, { error: error ?? "" })}
              </ha-alert>
              <p>${this._t(`${prefix}.failed_note`)}</p>`
          : html`<p role="status">
              <ha-svg-icon
                class="lead"
                .path=${restoreState === "done" ? mdiCheckCircle : mdiBackupRestore}
              ></ha-svg-icon>
              ${this._t(`${prefix}.${restoreState}_text`, { name })}
            </p>`
      }
      ${
        active
          ? html`<ha-progress-bar
              indeterminate
              .label=${this._t(`${prefix}.progress_label`)}
            ></ha-progress-bar>`
          : nothing
      }
      <div class="actions">
        ${
          active
            ? nothing
            : html`<ha-button @click=${this._dismiss}>
                ${this._t(`${prefix}.continue`)}
              </ha-button>`
        }
        ${
          restoreState === "done"
            ? html`<ha-button appearance="plain" @click=${this._recheck}>
                ${this._t(`${prefix}.reload`)}
              </ha-button>`
            : nothing
        }
      </div>
    `;
  }

  private _dismiss() {
    fireEvent(this, "pending-restore-dismiss");
  }

  private _recheck() {
    fireEvent(this, "pending-restore-recheck");
  }

  static styles: CSSResultGroup = [
    onBoardingStyles,
    css`
      .lead {
        color: var(--primary-color);
        vertical-align: middle;
        margin-inline-end: var(--ha-space-2);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
        margin-top: var(--ha-space-4);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "onboarding-pending-restore": OnboardingPendingRestoreView;
  }
}
