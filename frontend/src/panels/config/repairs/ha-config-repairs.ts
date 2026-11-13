import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { relativeTime } from "../../../common/datetime/relative_time";
import { capitalizeFirstLetter } from "../../../common/string/capitalize-first-letter";
import "../../../components/ha-button";
import { domainToName } from "../../../data/integration";
import type { StatisticsValidationResult } from "../../../data/recorder";
import {
  STATISTIC_TYPES,
  updateStatisticsIssues,
} from "../../../data/recorder";
import {
  fetchRepairsIssueData,
  ignoreRepairsIssue,
  type RepairsIssue,
} from "../../../data/repairs";
import { showConfigFlowDialog } from "../../../dialogs/config-flow/show-dialog-config-flow";
import { showAlertDialog } from "../../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../../types";
import { brandsUrl } from "../../../util/brands-url";
import { fixStatisticsIssue } from "../tools/statistics/fix-statistics";
import { showVacuumSegmentMappingDialog } from "../entities/dialogs/show-dialog-vacuum-segment-mapping";
import { showRepairsFlowDialog } from "../../../dialogs/repairs-flow/show-dialog-repair-flow";
import { showRepairsIssueDialog } from "./show-repair-issue-dialog";

/**
 * One card for each repair, tinted by how serious it is, with the actions a
 * person can take on it: ignore it, or start fixing it.
 */
@customElement("ha-config-repairs")
class HaConfigRepairs extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false })
  public repairsIssues?: RepairsIssue[];

  protected render() {
    if (!this.repairsIssues?.length) {
      return nothing;
    }

    return html`
      <ul
        class="issues"
        aria-label=${this.hass.localize("ui.panel.config.repairs.caption")}
      >
        ${this.repairsIssues.map((issue) => this._renderIssue(issue))}
      </ul>
    `;
  }

  private _renderIssue(issue: RepairsIssue) {
    const localize = this.hass.localize;
    const domainName = domainToName(localize, issue.domain);
    const serious = issue.severity === "critical" || issue.severity === "error";

    const createdBy =
      issue.created && domainName
        ? localize("ui.panel.config.repairs.created_at_by", {
            date: capitalizeFirstLetter(
              relativeTime(new Date(issue.created), this.hass.locale)
            ),
            integration: domainName,
          })
        : "";

    const title =
      localize(
        `component.${issue.domain}.issues.${issue.translation_key || issue.issue_id}.title`,
        issue.translation_placeholders || {}
      ) || `${issue.domain}: ${issue.translation_key || issue.issue_id}`;

    return html`
      <li
        class="issue ${serious ? "serious" : "warning"} ${
          issue.ignored ? "ignored" : ""
        }"
      >
        <img
          alt=${domainName}
          loading="lazy"
          src=${brandsUrl(
            {
              domain: issue.issue_domain || issue.domain,
              type: "icon",
              darkOptimized: this.hass.themes?.darkMode,
            },
            this.hass.auth.data.hassUrl
          )}
          .title=${domainName}
          crossorigin="anonymous"
          referrerpolicy="no-referrer"
        />
        <div class="body">
          <h3>${title}</h3>
          <p>
            ${
              serious
                ? html`<strong
                      >${localize(
                        `ui.panel.config.repairs.${issue.severity}`
                      )}</strong
                    >${createdBy ? " · " : nothing}`
                : nothing
            }
            ${createdBy}
            ${
              issue.ignored
                ? html` ·
                  ${localize(
                    "ui.panel.config.repairs.dialog.ignored_in_version_short",
                    { version: issue.dismissed_version }
                  )}`
                : nothing
            }
          </p>
          <div class="actions">
            <ha-button
              appearance="plain"
              size="s"
              .issue=${issue}
              @click=${this._toggleIgnore}
            >
              ${localize(
                `ui.panel.config.repairs.dialog.${issue.ignored ? "unignore" : "ignore"}`
              )}
            </ha-button>
            <ha-button
              appearance="filled"
              size="s"
              .issue=${issue}
              @click=${this._openShowMoreDialog}
            >
              ${localize(
                this._canFix(issue)
                  ? "ui.panel.config.repairs.fix_it"
                  : "ui.panel.config.repairs.details"
              )}
            </ha-button>
          </div>
        </div>
      </li>
    `;
  }

  // Issues that start a flow or a guided fix when opened, rather than only
  // explaining themselves.
  private _canFix(issue: RepairsIssue): boolean {
    return (
      issue.is_fixable ||
      (issue.domain === "homeassistant" &&
        issue.translation_key === "config_entry_reauth") ||
      (issue.domain === "vacuum" &&
        issue.translation_key === "segments_changed") ||
      (issue.domain === "sensor" &&
        !!issue.translation_key &&
        STATISTIC_TYPES.includes(issue.translation_key as any))
    );
  }

  private async _toggleIgnore(ev: Event): Promise<void> {
    const issue = (ev.currentTarget as any).issue as RepairsIssue;
    try {
      await ignoreRepairsIssue(this.hass, issue, !issue.ignored);
    } catch (err: any) {
      showAlertDialog(this, {
        title: this.hass.localize("ui.panel.config.repairs.dialog.title"),
        text: err?.message || String(err),
      });
    }
  }

  private async _openShowMoreDialog(ev): Promise<void> {
    const issue = ev.currentTarget.issue as RepairsIssue;
    if (issue.is_fixable) {
      showRepairsFlowDialog(this, issue);
    } else if (
      issue.domain === "homeassistant" &&
      issue.translation_key === "config_entry_reauth"
    ) {
      const data = await fetchRepairsIssueData(
        this.hass.connection,
        issue.domain,
        issue.issue_id
      );
      if (data.issue_data && "flow_id" in data.issue_data) {
        showConfigFlowDialog(this, {
          continueFlowId: data.issue_data.flow_id as string,
        });
      }
    } else if (
      issue.domain === "vacuum" &&
      issue.translation_key === "segments_changed"
    ) {
      const data = await fetchRepairsIssueData(
        this.hass.connection,
        issue.domain,
        issue.issue_id
      );
      if (
        data.issue_data &&
        "entity_id" in data.issue_data &&
        typeof data.issue_data.entity_id === "string"
      ) {
        showVacuumSegmentMappingDialog(this, {
          entityId: data.issue_data.entity_id,
        });
      }
    } else if (
      issue.domain === "sensor" &&
      issue.translation_key &&
      STATISTIC_TYPES.includes(issue.translation_key as any)
    ) {
      this.hass.loadFragmentTranslation("config");
      const data = await fetchRepairsIssueData(
        this.hass.connection,
        issue.domain,
        issue.issue_id
      );
      if (data.issue_data && "issue_type" in data.issue_data) {
        await fixStatisticsIssue(this, {
          type: data.issue_data
            .issue_type as StatisticsValidationResult["type"],
          data: data.issue_data as any,
        });
        updateStatisticsIssues(this.hass);
      }
    } else {
      showRepairsIssueDialog(this, {
        issue,
      });
    }
  }

  static styles = css`
    :host {
      display: block;
    }
    /* One white card per repair: a tinted icon tile, what is wrong in two
       lines, and the actions at the end of the row. */
    .issues {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--ha-space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .issue {
      display: flex;
      align-items: center;
      gap: var(--ha-space-4);
      box-sizing: border-box;
      padding: var(--ha-space-4) var(--ha-space-5);
      border-radius: var(--ha-border-radius-3xl);
      color: var(--primary-text-color);
      background: var(--card-background-color);
      box-shadow: var(--ha-shadow-card, none);
      --tile-bg: var(--ha-color-warning-container, rgba(255, 170, 0, 0.2));
    }
    .issue.serious {
      --tile-bg: var(--ha-color-error-container, rgba(255, 0, 0, 0.15));
    }
    .issue.ignored {
      opacity: var(--light-secondary-opacity);
    }
    img {
      flex: none;
      box-sizing: border-box;
      width: 52px;
      height: 52px;
      padding: var(--ha-space-3);
      border-radius: var(--ha-border-radius-xl);
      background: var(--tile-bg);
      object-fit: contain;
    }
    .body {
      flex: 1;
      min-width: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      column-gap: var(--ha-space-4);
    }
    .body h3,
    .body p {
      grid-column: 1;
    }
    .actions {
      grid-column: 2;
      grid-row: 1 / span 2;
    }
    @media (max-width: 600px) {
      .issue {
        align-items: flex-start;
      }
      .body {
        grid-template-columns: minmax(0, 1fr);
      }
      .actions {
        grid-column: 1;
        grid-row: auto;
      }
    }
    h3 {
      margin: 0;
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
    }
    p {
      margin: var(--ha-space-1) 0 0;
      line-height: var(--ha-line-height-normal);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--ha-space-2);
    }
    @media (max-width: 600px) {
      .actions {
        margin-top: var(--ha-space-3);
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-repairs": HaConfigRepairs;
  }
}
