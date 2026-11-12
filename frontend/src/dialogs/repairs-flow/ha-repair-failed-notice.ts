import type { PropertyValues } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import "../../components/ha-alert";
import { fetchRepairsIssues } from "../../data/repairs";
import type { HomeAssistant } from "../../types";
import type { RepairFailureKind } from "./repair-failure";
import { classifyRepairFailure, issueKey } from "./repair-failure";

/**
 * The line a repair dialog shows when its repair did not go through. It reads
 * the list of issues once and compares it with the list from before the
 * attempt, to say whether the repair only failed or also left new issues.
 */
@customElement("ha-repair-failed-notice")
export class HaRepairFailedNotice extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** The issues that existed when the repair was started. */
  @property({ attribute: false }) public issuesBefore?: readonly string[];

  @state() private _kind: RepairFailureKind = "failed";

  private _checked = false;

  protected willUpdate(changed: PropertyValues): void {
    if (this._checked || !this.hass || !changed.has("hass")) {
      return;
    }
    this._checked = true;
    fetchRepairsIssues(this.hass.connection).then(
      (result) => {
        this._kind = classifyRepairFailure(
          this.issuesBefore,
          result.issues.map(issueKey)
        );
      },
      () => {
        // The list could not be read: it stays a plain failure.
      }
    );
  }

  protected render() {
    return html`<ha-alert alert-type="error" role="alert">
      ${this.hass.localize(`ui.dialogs.repair_flow.failure.${this._kind}`)}
    </ha-alert>`;
  }

  static styles = css`
    :host {
      display: block;
      margin-bottom: var(--ha-space-3);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-repair-failed-notice": HaRepairFailedNotice;
  }
}
