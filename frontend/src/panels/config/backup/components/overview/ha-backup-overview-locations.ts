import { mdiHarddisk, mdiNas } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import memoizeOne from "memoize-one";
import { computeDomain } from "../../../../../common/entity/compute_domain";
import { navigate } from "../../../../../common/navigate";
import "../../../../../components/ha-svg-icon";
import type {
  BackupAgent,
  BackupConfig,
  BackupContent,
} from "../../../../../data/backup";
import {
  compareAgents,
  computeBackupAgentName,
  isLocalAgent,
  isNetworkMountAgent,
} from "../../../../../data/backup";
import { haStyle } from "../../../../../resources/styles";
import type { HomeAssistant } from "../../../../../types";
import { brandsUrl } from "../../../../../util/brands-url";
import { bytesToString } from "../../../../../util/bytes-to-string";

interface LocationFigures {
  agentId: string;
  count: number;
  size: number;
}

/**
 * One card for each place backups are kept, saying how many backups it holds
 * and how much space they take there. A card opens the backups list filtered
 * to that location.
 */
@customElement("ha-backup-overview-locations")
class HaBackupOverviewLocations extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public backups: BackupContent[] = [];

  @property({ attribute: false }) public agents: BackupAgent[] = [];

  @property({ attribute: false }) public config?: BackupConfig;

  // A location is listed when it holds a backup or is one of the places new
  // backups go to, so a place that is set up but still empty shows as empty.
  private _figures = memoizeOne(
    (
      backups: BackupContent[],
      configuredAgentIds: string[]
    ): LocationFigures[] => {
      const figures = new Map<string, LocationFigures>();
      configuredAgentIds.forEach((agentId) =>
        figures.set(agentId, { agentId, count: 0, size: 0 })
      );
      backups.forEach((backup) => {
        Object.entries(backup.agents).forEach(([agentId, agent]) => {
          const entry = figures.get(agentId) ?? { agentId, count: 0, size: 0 };
          entry.count++;
          entry.size += agent.size;
          figures.set(agentId, entry);
        });
      });
      return [...figures.values()].sort((a, b) =>
        compareAgents(a.agentId, b.agentId)
      );
    }
  );

  private _renderIcon(agentId: string): TemplateResult {
    if (isLocalAgent(agentId)) {
      return html`<ha-svg-icon .path=${mdiHarddisk}></ha-svg-icon>`;
    }
    if (isNetworkMountAgent(agentId)) {
      return html`<ha-svg-icon .path=${mdiNas}></ha-svg-icon>`;
    }
    return html`
      <img
        .src=${brandsUrl(
          {
            domain: computeDomain(agentId),
            type: "icon",
            darkOptimized: this.hass.themes?.darkMode,
          },
          this.hass.auth.data.hassUrl
        )}
        crossorigin="anonymous"
        referrerpolicy="no-referrer"
        alt=""
        height="24"
      />
    `;
  }

  protected render() {
    const figures = this._figures(
      this.backups,
      this.config?.create_backup.agent_ids ?? []
    );
    if (!figures.length) {
      return nothing;
    }

    return html`
      <div class="locations">
        ${figures.map((location) => {
          const name = computeBackupAgentName(
            this.hass.localize,
            location.agentId,
            this.agents
          );
          return html`
            <div
              class="card"
              role="button"
              tabindex="0"
              .agentId=${location.agentId}
              @click=${this._open}
              @keydown=${this._keydown}
            >
              <div class="name">
                ${this._renderIcon(location.agentId)}
                <span>${name}</span>
              </div>
              <div class="count">
                ${this.hass.localize(
                  "ui.panel.config.backup.overview.locations.count",
                  { count: location.count }
                )}
              </div>
              <div class="size">
                ${
                  location.count
                    ? bytesToString(location.size)
                    : this.hass.localize(
                        "ui.panel.config.backup.overview.locations.empty"
                      )
                }
              </div>
            </div>
          `;
        })}
      </div>
    `;
  }

  private _open(ev: Event) {
    const agentId = (ev.currentTarget as any).agentId as string;
    navigate(
      `/config/backup/backups?location=${encodeURIComponent(agentId)}&type=all`
    );
  }

  private _keydown(ev: KeyboardEvent) {
    if (ev.target === ev.currentTarget && ev.key === "Enter") {
      this._open(ev);
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .locations {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: var(--ha-space-4);
        }
        .card {
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
          min-width: 0;
          padding: var(--ha-space-5) var(--ha-space-6);
          border-radius: var(--ha-border-radius-3xl);
          background: var(--card-background-color);
          cursor: pointer;
        }
        .card:focus-visible {
          outline: 3px solid var(--primary-color);
          outline-offset: 2px;
        }
        .name {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-medium);
          color: var(--secondary-text-color);
        }
        .name span {
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .name ha-svg-icon,
        .name img {
          flex: none;
          color: var(--primary-text-color);
        }
        .count {
          font-family: var(--ha-font-family-heading, inherit);
          font-size: var(--ha-font-size-2xl);
          font-weight: var(--ha-font-weight-medium);
          line-height: var(--ha-line-height-condensed);
        }
        .size {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-backup-overview-locations": HaBackupOverviewLocations;
  }
}
