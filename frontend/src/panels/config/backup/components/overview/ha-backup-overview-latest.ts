import { mdiArchiveOutline, mdiUpload } from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import memoizeOne from "memoize-one";
import { isComponentLoaded } from "../../../../../common/config/is_component_loaded";
import { formatShortDateTime } from "../../../../../common/datetime/format_date_time";
import { navigate } from "../../../../../common/navigate";
import "../../../../../components/ha-button";
import "../../../../../components/ha-svg-icon";
import type { BackupAgent, BackupContent } from "../../../../../data/backup";
import {
  compareAgents,
  computeBackupAgentName,
  computeBackupSize,
  computeBackupType,
} from "../../../../../data/backup";
import { haStyle } from "../../../../../resources/styles";
import type { HomeAssistant } from "../../../../../types";
import { bytesToString } from "../../../../../util/bytes-to-string";
import { showUploadBackupDialog } from "../../dialogs/show-dialog-upload-backup";

const SHOWN = 5;

/**
 * The newest backups as rows, with the whole list one step away. A row opens
 * that backup. Choosing several, downloading and deleting stay on the full
 * list.
 */
@customElement("ha-backup-overview-latest")
class HaBackupOverviewLatest extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public backups: BackupContent[] = [];

  @property({ attribute: false }) public agents: BackupAgent[] = [];

  private _newest = memoizeOne((backups: BackupContent[]) =>
    [...backups].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
  );

  protected render() {
    const isHassio = isComponentLoaded(this.hass.config, "hassio");
    const newest = this._newest(this.backups);
    const shown = newest.slice(0, SHOWN);

    return html`
      <section class="card">
        <h3>
          ${this.hass.localize("ui.panel.config.backup.overview.latest.title")}
        </h3>
        ${
          shown.length
            ? html`
                <div class="head" aria-hidden="true">
                  <span class="c-name"
                    >${this.hass.localize(
                      "ui.panel.config.backup.overview.latest.backup"
                    )}</span
                  >
                  <span class="c-made"
                    >${this.hass.localize(
                      "ui.panel.config.backup.overview.latest.made"
                    )}</span
                  >
                  <span class="c-size"
                    >${this.hass.localize("ui.panel.config.backup.size")}</span
                  >
                  <span class="c-kept"
                    >${this.hass.localize(
                      "ui.panel.config.backup.overview.latest.kept_in"
                    )}</span
                  >
                </div>
                ${shown.map((backup) => {
                  const type = computeBackupType(backup, isHassio);
                  const agentIds = Object.keys(backup.agents).sort(
                    compareAgents
                  );
                  return html`
                    <div
                      class="row"
                      role="button"
                      tabindex="0"
                      .backupId=${backup.backup_id}
                      @click=${this._open}
                      @keydown=${this._keydown}
                    >
                      <div class="c-name">
                        <span class="tile"
                          ><ha-svg-icon .path=${mdiArchiveOutline}></ha-svg-icon
                        ></span>
                        <div class="text">
                          <span class="title">${backup.name}</span>
                          <span class="sub"
                            >${this.hass.localize(
                              `ui.panel.config.backup.type.${type}`
                            )}</span
                          >
                        </div>
                      </div>
                      <span class="c-made"
                        >${formatShortDateTime(
                          new Date(backup.date),
                          this.hass.locale,
                          this.hass.config
                        )}</span
                      >
                      <span class="c-size"
                        >${bytesToString(computeBackupSize(backup))}</span
                      >
                      <span class="c-kept">
                        ${agentIds.map(
                          (agentId) =>
                            html`<span class="chip"
                              >${computeBackupAgentName(
                                this.hass.localize,
                                agentId,
                                this.agents
                              )}</span
                            >`
                        )}
                      </span>
                    </div>
                  `;
                })}
              `
            : html`<p class="empty">
                ${this.hass.localize(
                  "ui.panel.config.backup.overview.latest.empty"
                )}
              </p>`
        }
        <div class="foot">
          <span class="showing">
            ${
              shown.length
                ? this.hass.localize(
                    "ui.panel.config.backup.overview.latest.showing",
                    { shown: shown.length, total: newest.length }
                  )
                : nothing
            }
          </span>
          ${
            newest.length > shown.length
              ? html`<ha-button
                  appearance="plain"
                  href="/config/backup/backups?type=all"
                >
                  ${this.hass.localize(
                    "ui.panel.config.backup.overview.latest.show_all"
                  )}
                </ha-button>`
              : nothing
          }
          <ha-button appearance="outlined" @click=${this._upload}>
            <ha-svg-icon slot="start" .path=${mdiUpload}></ha-svg-icon>
            ${this.hass.localize("ui.panel.config.backup.overview.latest.upload")}
          </ha-button>
        </div>
      </section>
    `;
  }

  private _open(ev: Event) {
    const id = (ev.currentTarget as any).backupId as string;
    navigate(`/config/backup/details/${id}`);
  }

  private _keydown(ev: KeyboardEvent) {
    if (ev.target === ev.currentTarget && ev.key === "Enter") {
      this._open(ev);
    }
  }

  private _upload = async () => {
    await showUploadBackupDialog(this, {});
  };

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .card {
          box-sizing: border-box;
          padding: var(--ha-space-5) var(--ha-space-6);
          border-radius: var(--ha-border-radius-3xl);
          background: var(--card-background-color);
        }
        h3 {
          margin: 0 0 var(--ha-space-3);
          font-size: var(--ha-font-size-l);
          font-weight: var(--ha-font-weight-medium);
        }
        .head,
        .row {
          display: grid;
          grid-template-columns: minmax(0, 3fr) minmax(0, 1.5fr) minmax(
              0,
              1fr
            ) minmax(0, 2fr);
          align-items: center;
          gap: var(--ha-space-4);
        }
        .head {
          padding: 0 var(--ha-space-3);
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .row {
          margin-top: var(--ha-space-2);
          padding: var(--ha-space-3);
          border-radius: var(--ha-border-radius-xl);
          background: var(--secondary-background-color);
          cursor: pointer;
        }
        .row:focus-visible {
          outline: 3px solid var(--primary-color);
          outline-offset: 2px;
        }
        .c-name {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          min-width: 0;
        }
        .tile {
          display: flex;
          flex: none;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: var(--ha-border-radius-xl);
          background: var(--card-background-color);
          color: var(--secondary-text-color);
        }
        .text {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .title {
          font-weight: var(--ha-font-weight-medium);
          overflow-wrap: anywhere;
        }
        .sub {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .c-kept {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-1);
        }
        .chip {
          padding: var(--ha-space-1) var(--ha-space-2);
          border-radius: var(--ha-border-radius-pill);
          background: var(--card-background-color);
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-medium);
          overflow-wrap: anywhere;
        }
        .empty {
          margin: 0;
          color: var(--secondary-text-color);
        }
        .foot {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
          gap: var(--ha-space-2);
          margin-top: var(--ha-space-4);
        }
        .showing {
          flex: 1;
          min-width: 140px;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        @media all and (max-width: 700px) {
          .card {
            padding: var(--ha-space-4);
          }
          .head {
            display: none;
          }
          .row {
            grid-template-columns: minmax(0, 1fr) auto;
            row-gap: var(--ha-space-1);
          }
          .row .c-name {
            grid-column: 1 / -1;
          }
          .row .c-made,
          .row .c-size {
            font-size: var(--ha-font-size-s);
            color: var(--secondary-text-color);
          }
          .row .c-kept {
            grid-column: 1 / -1;
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-backup-overview-latest": HaBackupOverviewLatest;
  }
}
