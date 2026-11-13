import type { TemplateResult } from "lit";
import { css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import { formatDateTime } from "../../../../common/datetime/format_date_time";
import { formatTime } from "../../../../common/datetime/format_time";
import "../../../../components/ha-button";
import "../../../../components/input/ha-input";
import type {
  WallTablet,
  WallTabletCommandName,
} from "../../../../data/wall-tablet";
import {
  fetchWallTablets,
  forgetWallTablet,
  isWallTabletUnavailable,
  sendWallTabletCommand,
} from "../../../../data/wall-tablet";
import { ToolView } from "./tools-base";

/** How often the list is read again while the tool is open, in milliseconds. */
const REFRESH_MS = 15000;

@customElement("hui-tool-tablets")
export class HuiToolTablets extends ToolView {
  @state() private _tablets?: WallTablet[];

  @state() private _unavailable = false;

  @state() private _path = "";

  private _timer?: number;

  protected firstUpdated(): void {
    this._load();
    this._timer = window.setInterval(() => this._load(), REFRESH_MS);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this._timer);
  }

  private async _load(): Promise<void> {
    try {
      this._tablets = await fetchWallTablets(this.hass);
      this._unavailable = false;
    } catch (err: unknown) {
      if (isWallTabletUnavailable(err)) {
        this._unavailable = true;
      } else {
        this._fail(err);
      }
    }
  }

  protected render(): TemplateResult {
    if (this._unavailable) {
      return html`<p class="empty">${this._t("tablets.unavailable")}</p>`;
    }
    const tablets = this._tablets;
    return html`
      <p class="intro">${this._t("tablets.intro")}</p>
      ${this._renderMessages()}
      ${
        tablets === undefined
          ? nothing
          : tablets.length
            ? html`<ul class="list" aria-label=${this._t("tablets.list")}>
                ${tablets.map((tablet) => this._renderTablet(tablet))}
              </ul>`
            : html`<p class="empty">${this._t("tablets.none")}</p>`
      }
      <div class="row">
        <ha-input
          .label=${this._t("tablets.path")}
          .placeholder=${"/lovelace/home"}
          .value=${this._path}
          @input=${this._pathInput}
        ></ha-input>
        <ha-button
          appearance="plain"
          .disabled=${!this._path.startsWith("/") || !tablets?.length}
          @click=${this._navigateAll}
        >
          ${this._t("tablets.go_all")}
        </ha-button>
      </div>
      <p class="hint">${this._t("tablets.automations")}</p>
      <ul class="hint codes">
        <li><code>wall_tablet.wake</code></li>
        <li><code>wall_tablet.sleep</code></li>
        <li><code>wall_tablet.reload</code></li>
        <li><code>wall_tablet.navigate</code></li>
      </ul>
    `;
  }

  private _renderTablet(tablet: WallTablet): TemplateResult {
    const seen = new Date(tablet.last_seen * 1000);
    const screen = this._t(`tablets.screen_${tablet.screen}`);
    return html`<li>
      <div class="main">
        <b>${tablet.name}</b>
        <span class="muted mono">${tablet.tablet_id}</span>
      </div>
      <span class="pill ${tablet.screen === "on" ? "success" : ""}">
        ${screen}
      </span>
      <span
        class="pill ${tablet.online ? "success" : "warning"}"
        title=${formatDateTime(seen, this.hass.locale, this.hass.config)}
      >
        ${
          tablet.online
            ? this._t("tablets.online")
            : this._t("tablets.offline_since", {
                time: formatTime(seen, this.hass.locale, this.hass.config),
              })
        }
      </span>
      ${(["wake", "sleep", "reload"] as const).map(
        (command) =>
          html`<ha-button
            appearance="plain"
            .tabletId=${tablet.tablet_id}
            .command=${command}
            @click=${this._send}
          >
            ${this._t(`tablets.${command}`)}
          </ha-button>`
      )}
      <ha-button
        variant="danger"
        appearance="plain"
        .tabletId=${tablet.tablet_id}
        @click=${this._forget}
      >
        ${this._t("tablets.forget")}
      </ha-button>
    </li>`;
  }

  private _pathInput(ev: Event) {
    this._path = (ev.currentTarget as HTMLInputElement).value.trim();
  }

  private async _run(action: () => Promise<void>, notice: string) {
    this._error = undefined;
    this._notice = undefined;
    try {
      await action();
      this._notice = notice;
    } catch (err: unknown) {
      this._fail(err);
    }
  }

  private _send(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      tabletId: string;
      command: WallTabletCommandName;
    };
    this._run(
      () => sendWallTabletCommand(this.hass, target.command, target.tabletId),
      this._t("tablets.sent")
    );
  }

  private _navigateAll() {
    this._run(
      () => sendWallTabletCommand(this.hass, "navigate", undefined, this._path),
      this._t("tablets.sent")
    );
  }

  private async _forget(ev: Event) {
    const target = ev.currentTarget as HTMLElement & { tabletId: string };
    await this._run(
      () => forgetWallTablet(this.hass, target.tabletId),
      this._t("tablets.forgotten")
    );
    this._load();
  }

  static get styles() {
    return [
      ToolView.styles,
      css`
        .codes {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-3);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-tool-tablets": HuiToolTablets;
  }
}
