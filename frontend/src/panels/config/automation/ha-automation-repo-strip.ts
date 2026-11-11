import { mdiHistory, mdiSourceRepository } from "@mdi/js";
import type { CSSResultGroup, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../common/dom/fire_event";
import { isNavigationClick } from "../../../common/dom/is-navigation-click";
import { createQueryString } from "../../../common/url/query-params";
import "../../../components/ha-button";
import "../../../components/ha-relative-time";
import "../../../components/ha-svg-icon";
import type {
  AutomationCommit,
  AutomationRepository,
} from "../../../data/automation_repos";
import { fetchAutomationHistory } from "../../../data/automation_repos";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import {
  automationHistoryQueryParamConfig,
  repositoryUrl,
} from "../automation-history/automation-history-query-params";
import { describeRepoStrip } from "./repo-strip-logic";

const PREFIX = "ui.panel.config.automation.editor.status_bar.";

/**
 * A short strip about the Git repository of the automation that is open:
 * its current commit, whether the saved copy matches the live configuration,
 * how many versions exist, the remote host and unpushed commits.
 *
 * It only shows what the instance reports. A commit time that cannot be read,
 * or an unpushed count the server does not give, is left out, never guessed.
 */
@customElement("ha-automation-repo-strip")
export class HaAutomationRepoStrip extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public repository?: AutomationRepository;

  @state() private _head?: AutomationCommit;

  private _headKey?: string;

  protected willUpdate(changed: PropertyValues<this>) {
    if (!changed.has("repository")) {
      return;
    }
    const key = this.repository
      ? `${this.repository.id}:${this.repository.head ?? ""}`
      : undefined;
    if (key === this._headKey) {
      return;
    }
    this._headKey = key;
    this._head = undefined;
    if (this.repository?.head) {
      this._loadHead(this.repository.id, this.repository.head, key);
    }
  }

  private async _loadHead(id: string, head: string, key?: string) {
    try {
      const commits = await fetchAutomationHistory(this.hass, id, 1);
      if (this._headKey === key && commits[0]?.sha === head) {
        this._head = commits[0];
      }
    } catch (_err: unknown) {
      // The time is left out when it cannot be read.
    }
  }

  protected render() {
    const repo = this.repository;
    if (!repo?.id) {
      return nothing;
    }
    const localize = this.hass.localize;
    const info = describeRepoStrip(repo);
    return html`
      <section class="strip" aria-label=${localize(`${PREFIX}repo_title`)}>
        <ha-svg-icon .path=${mdiSourceRepository}></ha-svg-icon>
        <div class="facts">
          <strong>${localize(`${PREFIX}repo_title`)}</strong>
          ${
            info.headShort
              ? html`<span
                  >${localize(`${PREFIX}repo_commit`)}
                  <code>${info.headShort}</code>${
                    this._head
                      ? html`,
                          <ha-relative-time
                            .hass=${this.hass}
                            .datetime=${new Date(this._head.timestamp * 1000)}
                          ></ha-relative-time>`
                      : nothing
                  }</span
                >`
              : nothing
          }
          ${
            info.match === "unknown"
              ? nothing
              : html`<span class=${info.match}
                  >${localize(`${PREFIX}repo_${info.match}`)}</span
                >`
          }
          <span
            >${localize(`${PREFIX}repo_versions`, {
              count: info.versions,
            })}</span
          >
          ${
            info.remoteKind === "host"
              ? html`<span
                  >${localize(`${PREFIX}repo_remote`, {
                    host: info.remoteHost!,
                  })}</span
                >`
              : info.remoteKind === "none"
                ? html`<span>${localize(`${PREFIX}repo_no_remote`)}</span>`
                : nothing
          }
          ${
            info.unpushed !== undefined
              ? html`<span
                  >${localize(`${PREFIX}repo_unpushed`, {
                    count: info.unpushed,
                  })}</span
                >`
              : nothing
          }
        </div>
        <div class="actions">
          <ha-button
            appearance="plain"
            href=${repositoryUrl(repo.id)}
            @click=${this._navigate}
          >
            <ha-svg-icon
              slot="start"
              .path=${mdiSourceRepository}
            ></ha-svg-icon>
            ${localize(`${PREFIX}repo_open`)}
          </ha-button>
          <ha-button
            appearance="plain"
            href=${this._historyUrl(repo.id)}
            @click=${this._navigate}
          >
            <ha-svg-icon slot="start" .path=${mdiHistory}></ha-svg-icon>
            ${localize(`${PREFIX}repo_history`, { commits: repo.commits })}
          </ha-button>
        </div>
      </section>
    `;
  }

  private _historyUrl(id: string): string {
    return `/config/automation_history?${createQueryString(
      { automation: id },
      automationHistoryQueryParamConfig
    )}`;
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
        .strip {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-3);
          padding: var(--ha-space-3) var(--ha-space-4);
          border-radius: var(--ha-border-radius-2xl, 20px);
          background: var(
            --ha-color-surface-container,
            var(--card-background-color)
          );
        }
        .facts {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          gap: var(--ha-space-1) var(--ha-space-3);
          flex: 1 1 220px;
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .facts strong {
          flex: 1 1 100%;
        }
        code {
          font-family: var(--ha-font-family-code, monospace);
          font-size: var(--ha-font-size-s, 0.875rem);
        }
        .diverged {
          color: var(--ha-color-on-warning-normal, var(--warning-color));
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
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
    "ha-automation-repo-strip": HaAutomationRepoStrip;
  }
}
