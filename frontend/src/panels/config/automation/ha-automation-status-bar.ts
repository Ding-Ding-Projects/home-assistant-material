import type { CSSResultGroup, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../common/dom/fire_event";
import { isNavigationClick } from "../../../common/dom/is-navigation-click";
import "../../../components/ha-button";
import type { ManualAutomationConfig } from "../../../data/automation";
import type { AutomationRepository } from "../../../data/automation_repos";
import { fetchAutomationReposStatus } from "../../../data/automation_repos";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import "./ha-automation-repo-strip";

const PREFIX = "ui.panel.config.automation.editor.status_bar.";

/**
 * The repository strip and the link to past runs at the top of the automation
 * editor. Run now and Check live in the bottom bar only, which stays in view,
 * so they are not repeated here.
 */
@customElement("ha-automation-status-bar")
export class HaAutomationStatusBar extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public config!: ManualAutomationConfig;

  /** True while the editor holds changes that are not saved yet. */
  @property({ type: Boolean }) public dirty = false;

  @state() private _repository?: AutomationRepository;

  protected updated(changedProps: PropertyValues<this>) {
    let reload = false;
    if (changedProps.has("config")) {
      const oldId = (
        changedProps.get("config") as ManualAutomationConfig | undefined
      )?.id;
      reload = oldId !== this.config?.id;
      if (reload) {
        this._repository = undefined;
      }
    }
    // Saving clears the unsaved changes, and the repository moved on with it.
    if (changedProps.get("dirty") === true && !this.dirty) {
      reload = true;
    }
    if (reload) {
      this._loadRepository();
    }
  }

  private async _loadRepository() {
    const id = this.config?.id;
    if (!id || !this.hass) {
      this._repository = undefined;
      return;
    }
    try {
      const status = await fetchAutomationReposStatus(this.hass);
      if (this.config?.id === id) {
        this._repository = status.automations.find((item) => item.id === id);
      }
    } catch (_err: unknown) {
      // The history manager is not installed here, so there is no strip.
      this._repository = undefined;
    }
  }

  protected render() {
    return html`${this._renderRepository()}${this._renderBar()}`;
  }

  private _renderRepository() {
    if (!this._repository || !this.config?.id) {
      return nothing;
    }
    return html`<ha-automation-repo-strip
      .hass=${this.hass}
      .repository=${this._repository}
    ></ha-automation-repo-strip>`;
  }

  private _renderBar() {
    if (!this.config?.id) {
      return nothing;
    }
    return html`
      <div class="bar">
        <ha-button
          appearance="plain"
          href="/config/automation/trace/${encodeURIComponent(this.config.id)}"
          @click=${this._navigate}
        >
          ${this.hass.localize(`${PREFIX}past_runs`)}
        </ha-button>
      </div>
    `;
  }

  /** The editor decides whether unsaved changes allow leaving the page. */
  private _navigate(ev: MouseEvent) {
    const href = isNavigationClick(ev);
    if (href) {
      fireEvent(this, "automation-navigate", { path: href });
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          display: block;
        }
        ha-automation-repo-strip {
          margin-bottom: var(--ha-space-3);
        }
        .bar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2);
          margin-bottom: var(--ha-space-3);
        }
        ha-button {
          min-height: 44px;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-status-bar": HaAutomationStatusBar;
  }

  interface HASSDomEvents {
    "automation-navigate": { path: string };
  }
}
