import { mdiFlask, mdiHistory, mdiPlay, mdiSourceRepository } from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import type { CSSResultGroup, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { keyed } from "lit/directives/keyed";
import { fireEvent } from "../../../common/dom/fire_event";
import { isNavigationClick } from "../../../common/dom/is-navigation-click";
import "../../../components/ha-button";
import "../../../components/ha-svg-icon";
import type { ManualAutomationConfig } from "../../../data/automation";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import type { AutomationRepository } from "../../../data/automation_repos";
import { fetchAutomationReposStatus } from "../../../data/automation_repos";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { repositoryUrl } from "../automation-history/automation-history-query-params";
import type { AutomationCheckResult } from "./automation-check";
import { checkAutomation } from "./automation-check";
import { motionAppearStyles, motionKeyframes } from "./motion-styles";
import { beginRun, getErrorMessage } from "./run-helpers";

const PREFIX = "ui.panel.config.automation.editor.status_bar.";

/**
 * The repository strip and the bottom bar of the automation editor. Both only
 * use calls the instance already has: the automation history status, the
 * automation trigger service and server-side config validation.
 */
@customElement("ha-automation-status-bar")
export class HaAutomationStatusBar extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public config!: ManualAutomationConfig;

  @property({ attribute: false }) public stateObj?: HassEntity;

  /** True while the editor holds changes that are not saved yet. */
  @property({ type: Boolean }) public dirty = false;

  @state() private _repository?: AutomationRepository;

  @state() private _checking = false;

  @state() private _running = false;

  @state() private _checkResult?: AutomationCheckResult;

  @state() private _runMessage?: { danger: boolean; text: string };

  private _checkedKey?: string;

  protected willUpdate(changedProps: PropertyValues<this>) {
    if (
      changedProps.has("config") &&
      this._checkResult &&
      this._checkedKey !== this._configKey()
    ) {
      // A result must never describe a config that is no longer on screen.
      this._checkResult = undefined;
      this._checkedKey = undefined;
    }
  }

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

  private _configKey() {
    const { triggers, conditions, actions } = this.config ?? {};
    return JSON.stringify([triggers, conditions, actions]);
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
    const repo = this._repository;
    if (!repo || !this.config?.id) {
      return nothing;
    }
    const localize = this.hass.localize;
    return html`
      <section class="repo" aria-label=${localize(`${PREFIX}repo_title`)}>
        <ha-svg-icon .path=${mdiSourceRepository}></ha-svg-icon>
        <div class="repo-text">
          <strong>${localize(`${PREFIX}repo_title`)}</strong>
          <span class="mono"
            >${localize(`${PREFIX}repo_details`, {
              folder: repo.repository,
              commits: repo.commits,
            })}</span
          >
          <span
            >${localize(
              `${PREFIX}${repo.dirty ? "repo_dirty" : "repo_clean"}`
            )}</span
          >
        </div>
        <ha-button
          appearance="plain"
          href=${repositoryUrl(this.config.id)}
          @click=${this._navigate}
        >
          <ha-svg-icon slot="start" .path=${mdiHistory}></ha-svg-icon>
          ${localize(`${PREFIX}repo_history`, { commits: repo.commits })}
        </ha-button>
      </section>
    `;
  }

  private _renderBar() {
    const localize = this.hass.localize;
    const result = this._checkResult;
    const message = this._runMessage;
    return html`
      <div class="bar">
        <ha-button
          appearance="plain"
          .disabled=${!this.stateObj || this.dirty || this._running}
          title=${localize(
            `${PREFIX}${this.dirty ? "run_dirty" : "run_now_hint"}`
          )}
          @click=${this._runNow}
        >
          <ha-svg-icon slot="start" .path=${mdiPlay}></ha-svg-icon>
          ${localize(`${PREFIX}run_now`)}
        </ha-button>
        <ha-button
          appearance="plain"
          .disabled=${this._checking}
          title=${localize(`${PREFIX}check_hint`)}
          @click=${this._check}
        >
          <ha-svg-icon slot="start" .path=${mdiFlask}></ha-svg-icon>
          ${localize(`${PREFIX}${this._checking ? "checking" : "check"}`)}
        </ha-button>
        ${
          this.config?.id
            ? html`<ha-button
                appearance="plain"
                href="/config/automation/trace/${encodeURIComponent(
                  this.config.id
                )}"
                @click=${this._navigate}
              >
                ${localize(`${PREFIX}past_runs`)}
              </ha-button>`
            : nothing
        }
        ${
          this.dirty
            ? html`<span class="result"
                >${localize(`${PREFIX}run_dirty`)}</span
              >`
            : nothing
        }
        <span
          class="result ${
            message?.danger || (!message && result && result.status !== "ok")
              ? "danger"
              : ""
          }"
          role="status"
          aria-live="polite"
          >${keyed(
            message ? message.text : result ? result.status : "",
            html`<span class="motion-appear"
              >${
                message ? message.text : result ? this._resultText(result) : ""
              }</span
            >`
          )}</span
        >
      </div>
    `;
  }

  private _resultText(result: AutomationCheckResult): string {
    const localize = this.hass.localize;
    switch (result.status) {
      case "invalid":
        return localize(`${PREFIX}check_invalid`, {
          part: localize(`${PREFIX}check_part_${result.part}`),
          message: result.message,
        });
      case "error":
        return localize(`${PREFIX}check_error`, { message: result.message });
      default:
        return localize(`${PREFIX}check_ok_${result.conditions}`);
    }
  }

  /**
   * Runs the SAVED automation: the trigger service uses the config the server
   * holds, ignores whether the automation is on, and skips its conditions.
   * Unsaved edits are never part of the run, so the button is off while there
   * are any.
   */
  private async _runNow() {
    const stateObj = this.stateObj;
    if (!stateObj || this._running || this.dirty) {
      return;
    }
    const release = beginRun(stateObj.entity_id);
    if (!release) {
      return;
    }
    const localize = this.hass.localize;
    const name = this.config?.alias || stateObj.attributes.friendly_name || "";
    this._running = true;
    try {
      const switchedOff = stateObj.state === "off";
      const confirmed = await showConfirmationDialog(this, {
        title: localize(`${PREFIX}run_confirm_title`),
        text: `${localize(`${PREFIX}run_confirm_text`, { name })}${
          switchedOff ? ` ${localize(`${PREFIX}run_confirm_off`)}` : ""
        }`,
        confirmText: localize(`${PREFIX}run_now`),
        dismissText: localize("ui.common.cancel"),
        destructive: true,
      });
      if (!confirmed) {
        return;
      }
      this._checkResult = undefined;
      this._runMessage = undefined;
      try {
        await this.hass.callService("automation", "trigger", {
          entity_id: stateObj.entity_id,
          skip_condition: true,
        });
        this._runMessage = {
          danger: false,
          text: localize(`${PREFIX}run_success`),
        };
      } catch (err: unknown) {
        this._runMessage = {
          danger: true,
          text: localize(`${PREFIX}run_failed`, {
            message: getErrorMessage(err),
          }),
        };
      }
    } finally {
      release();
      this._running = false;
    }
  }

  private async _check() {
    if (this._checking) {
      return;
    }
    const key = this._configKey();
    this._checking = true;
    this._checkResult = undefined;
    this._runMessage = undefined;
    const result = await checkAutomation(this.hass, this.config);
    this._checking = false;
    if (key !== this._configKey()) {
      // Edited while checking, so the answer would be stale.
      return;
    }
    this._checkedKey = key;
    this._checkResult = result;
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
      motionKeyframes,
      motionAppearStyles,
      css`
        :host {
          display: block;
        }
        .repo {
          animation: ha-automation-enter
            var(--ha-animation-duration-normal, 250ms)
            var(--ha-automation-ease-enter) backwards;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-3);
          padding: var(--ha-space-3) var(--ha-space-4);
          margin-bottom: var(--ha-space-3);
          border-radius: var(--ha-border-radius-2xl, 20px);
          background: var(
            --ha-color-surface-container,
            var(--card-background-color)
          );
        }
        .repo-text {
          display: flex;
          flex-direction: column;
          flex: 1 1 200px;
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .mono {
          font-family: var(--ha-font-family-code, monospace);
          font-size: var(--ha-font-size-s, 0.875rem);
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
        .result {
          flex: 1 1 200px;
          min-width: 0;
          overflow-wrap: anywhere;
          font-size: var(--ha-font-size-s, 0.875rem);
        }
        .result.danger {
          color: var(--ha-color-on-danger-normal, var(--error-color));
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
