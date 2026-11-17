import { mdiClipboardTextOutline } from "@mdi/js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { CSSResultGroup, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { computeDomain } from "../../../../../common/entity/compute_domain";
import { copyToClipboard } from "../../../../../common/util/copy-clipboard";
import "../../../../../components/ha-button";
import "../../../../../components/ha-svg-icon";
import { subscribeIntegrationLog } from "../../../../../data/error_log";
import { fetchHassioLogs } from "../../../../../data/hassio/supervisor";
import type { HomeAssistant } from "../../../../../types";
import {
  appendLogLines,
  cleanLogLine,
  filterLinesSince,
  wallClock,
} from "../../helper/backup-log";
import { progressText } from "../../helper/backup-progress-text";

const COLLAPSED_LINES = 3;
const MAX_INTEGRATION_SUBSCRIPTIONS = 6;
const SUPERVISOR_POLL_MS = 4000;
// Start a little before the first event to catch lines written just ahead of it
const START_MARGIN_MS = 10000;

/**
 * The output of a backup operation: real lines from the logs of the backup
 * component and of each location, plus the Supervisor log filtered to backup
 * lines when Supervisor runs. Everything is masked before it is stored, so a
 * token, password, key or signed address never reaches the screen or the
 * clipboard.
 */
@customElement("ha-backup-progress-log")
export class HaBackupProgressLog extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  // Time the operation started, in milliseconds
  @property({ type: Number, attribute: false }) public since = 0;

  // Locations taking part, used to pick which integration logs to read
  @property({ attribute: false }) public agentIds: string[] = [];

  @property({ type: Boolean }) public running = false;

  @property({ type: Boolean, attribute: "has-supervisor" })
  public hasSupervisor = false;

  @query(".lines") private _linesEl?: HTMLElement;

  @state() private _lines: string[] = [];

  @state() private _expanded = false;

  @state() private _follow = true;

  @state() private _copied = false;

  @state() private _unavailable = false;

  private _sources: string[] = [];

  private _unsubs: Promise<UnsubscribeFunc>[] = [];

  private _pollTimer?: ReturnType<typeof setInterval>;

  private _subscribedKey = "";

  connectedCallback(): void {
    super.connectedCallback();
    this._sync();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._subscribedKey = "";
    this._stop();
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (
      changed.has("running") ||
      changed.has("since") ||
      changed.has("agentIds") ||
      changed.has("hass")
    ) {
      this._sync();
    }
  }

  protected updated(changed: PropertyValues): void {
    if (changed.has("_lines")) {
      this.dispatchEvent(
        new CustomEvent("backup-log-lines", { detail: this._lines })
      );
    }
    if (changed.has("_lines") && this._follow && this._expanded) {
      if (this._linesEl) {
        this._linesEl.scrollTop = this._linesEl.scrollHeight;
      }
    }
  }

  private get _sinceWall() {
    return wallClock(this.since - START_MARGIN_MS, this.hass.config.time_zone);
  }

  private _integrations(): string[] {
    const domains = new Set<string>(["backup"]);
    this.agentIds.forEach((agentId) => domains.add(computeDomain(agentId)));
    return [...domains].slice(0, MAX_INTEGRATION_SUBSCRIPTIONS);
  }

  private _sync() {
    if (!this.hass || !this.since) {
      return;
    }
    const key = `${this.since}|${this._integrations().join(",")}|${this.running}`;
    if (key === this._subscribedKey) {
      return;
    }
    const sinceChanged = !this._subscribedKey.startsWith(`${this.since}|`);
    this._subscribedKey = key;
    this._stop();
    if (sinceChanged) {
      this._lines = [];
    }
    if (!this.running) {
      // The run is over: one last read so the final lines are included
      if (this.hasSupervisor) {
        this._pollSupervisor();
      }
      return;
    }
    this._start();
  }

  private _start() {
    const integrations = this._integrations();
    this._sources = [...integrations];
    this._unavailable = false;
    let failures = 0;
    this._unsubs = integrations.map((integration) => {
      const unsub = subscribeIntegrationLog(
        this.hass.connection,
        integration,
        (lines) => this._receive(filterLinesSince(lines, this._sinceWall))
      );
      unsub.catch(() => {
        failures++;
        if (failures === integrations.length && !this.hasSupervisor) {
          this._unavailable = true;
        }
      });
      return unsub;
    });
    if (this.hasSupervisor) {
      this._sources.push("supervisor");
      this._pollSupervisor();
      this._pollTimer = setInterval(
        () => this._pollSupervisor(),
        SUPERVISOR_POLL_MS
      );
    }
  }

  private _stop() {
    this._unsubs.forEach((unsub) =>
      unsub.then((unsubscribe) => unsubscribe()).catch(() => undefined)
    );
    this._unsubs = [];
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = undefined;
    }
  }

  private async _pollSupervisor() {
    try {
      const response = await fetchHassioLogs(
        this.hass,
        "supervisor",
        "entries=:-150:150"
      );
      const text = await response.text();
      const lines = text.split("\n").filter((line) => /backup/i.test(line));
      // Supervisor writes its log times in UTC
      this._receive(
        filterLinesSince(lines, wallClock(this.since - START_MARGIN_MS, "UTC"))
      );
    } catch (_err) {
      // The Supervisor log is optional; the other sources still work
    }
  }

  private _receive(lines: string[]) {
    const cleaned = lines.map(cleanLogLine);
    const merged = appendLogLines(this._lines, cleaned);
    if (merged !== this._lines) {
      this._lines = merged;
    }
  }

  private async _copy() {
    await copyToClipboard(this._lines.join("\n"));
    this._copied = true;
    setTimeout(() => {
      this._copied = false;
    }, 2000);
  }

  protected render() {
    const t = (key: string, params?: Record<string, string | number>) =>
      progressText(this.hass, key, params);
    const visible = this._expanded
      ? this._lines
      : this._lines.slice(-COLLAPSED_LINES);

    return html`
      <div class="log">
        <div class="head">
          <span class="title">${t("log.title")}</span>
          <span class="tools">
            ${
              this._expanded
                ? html`<ha-button
                    size="small"
                    appearance=${this._follow ? "filled" : "plain"}
                    aria-pressed=${this._follow ? "true" : "false"}
                    @click=${this._toggleFollow}
                  >
                    ${t("log.follow")}
                  </ha-button>`
                : nothing
            }
            <ha-button
              size="small"
              appearance="plain"
              .disabled=${!this._lines.length}
              @click=${this._copy}
            >
              <ha-svg-icon
                slot="start"
                .path=${mdiClipboardTextOutline}
              ></ha-svg-icon>
              ${this._copied ? t("log.copied") : t("log.copy")}
            </ha-button>
            ${
              this._lines.length > COLLAPSED_LINES
                ? html`<ha-button
                    size="small"
                    appearance="plain"
                    @click=${this._toggleExpanded}
                  >
                    ${this._expanded ? t("log.show_less") : t("log.show_all")}
                  </ha-button>`
                : nothing
            }
          </span>
        </div>
        ${
          this._unavailable
            ? html`<p class="note">${t("log.unavailable")}</p>`
            : visible.length
              ? html`<div
                  class="lines ${this._expanded ? "expanded" : ""}"
                  role="log"
                  aria-live="off"
                  tabindex="0"
                >
                  ${visible.map((line) => html`<div class="line">${line}</div>`)}
                </div>`
              : html`<p class="note">${t("log.empty")}</p>`
        }
        <p class="note small">
          ${t("log.masked_note")}
          ${
            this._sources.length
              ? t("log.sources", { sources: this._sources.join(", ") })
              : nothing
          }
        </p>
      </div>
    `;
  }

  private _toggleExpanded() {
    this._expanded = !this._expanded;
  }

  private _toggleFollow() {
    this._follow = !this._follow;
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-2);
      flex-wrap: wrap;
    }
    .title {
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
    }
    .tools {
      display: flex;
      align-items: center;
      gap: var(--ha-space-1);
      flex-wrap: wrap;
    }
    .lines {
      margin-top: var(--ha-space-1);
      padding: var(--ha-space-2);
      border-radius: var(--ha-border-radius-lg);
      background: var(--secondary-background-color);
      font-family: var(--ha-font-family-code, monospace);
      font-size: var(--ha-font-size-xs);
      line-height: 1.4;
      overflow: auto;
      max-height: 5.5em;
    }
    .lines.expanded {
      max-height: 240px;
    }
    .line {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .note {
      margin: var(--ha-space-1) 0 0;
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .note.small {
      font-size: var(--ha-font-size-xs);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-backup-progress-log": HaBackupProgressLog;
  }
}
