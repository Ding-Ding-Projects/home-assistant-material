import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { relativeTime } from "../../../common/datetime/relative_time";
import { modeText } from "../../../common/language-mode/language-mode";
import { searchMatcher } from "../../../common/regex/filter";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-button-toggle-group";
import "../../../components/ha-card";
import "../../../components/ha-control-slider";
import "../../../components/ha-duration-input";
import "../../../components/ha-switch";
import "../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import type { ConfigEntry } from "../../../data/config_entries";
import { getConfigEntries } from "../../../data/config_entries";
import type {
  DefenderDirection,
  DefenderGuard,
  DefenderInfo,
} from "../../../data/defenders";
import {
  controlDefender,
  DEFENDER_DOMAINS,
  defenderLogLine,
  fetchDefenderInfo,
  formatHours,
  groupGuards,
  guardTitle,
  needsConfirmationToDisable,
  setDefenderFloor,
  setDefenderGuard,
  setDefenderTemperature,
} from "../../../data/defenders";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-subpage";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant, ToggleButton } from "../../../types";

type View = "now" | "guards" | "cost" | "log";

const REFRESH_MS = 15000;

/** One page for both defenders, driven by the direction: cool or heat. */
@customElement("ha-defender-page")
export class HaDefenderPage extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property() public direction: DefenderDirection = "cool";

  @state() private _entries?: ConfigEntry[];

  @state() private _entryId?: string;

  @state() private _info?: DefenderInfo;

  @state() private _error?: string;

  @state() private _view: View = "now";

  @state() private _filter = "";

  @state() private _pauseHours = 1;

  @state() private _draft?: number;

  @state() private _floorDraft?: number;

  private _timer?: number;

  public connectedCallback(): void {
    super.connectedCallback();
    this._load();
    this._timer = window.setInterval(() => this._refresh(), REFRESH_MS);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this._timer);
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return modeText(
      this.hass.localize,
      `ui.panel.config.defenders.${key}`,
      values
    );
  }

  private async _load(): Promise<void> {
    try {
      this._entries = await getConfigEntries(this.hass, {
        domain: DEFENDER_DOMAINS[this.direction],
      });
    } catch (err: any) {
      this._error = err?.message ?? String(err);
      return;
    }
    this._entryId ??= this._entries[0]?.entry_id;
    await this._refresh();
  }

  private async _refresh(): Promise<void> {
    if (!this._entryId) {
      return;
    }
    try {
      this._info = await fetchDefenderInfo(this.hass, this._entryId);
      this._error = undefined;
    } catch (err: any) {
      this._error = err?.message ?? String(err);
    }
  }

  protected render(): TemplateResult {
    const title = this._t(`title_${this.direction}`);
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${title}
        back-path="/config"
      >
        <div class="content">
          <p class="intro">${this._t(`intro_${this.direction}`)}</p>
          ${this._body()}
        </div>
      </hass-subpage>
    `;
  }

  private _body(): TemplateResult | typeof nothing {
    if (this._error && !this._info) {
      return html`<ha-alert alert-type="error"
        >${this._t("error", { error: this._error })}</ha-alert
      >`;
    }
    if (this._entries && !this._entries.length) {
      return html`<p>${this._t("none")}</p>`;
    }
    if (!this._info) {
      return html`<p>${this._t("loading")}</p>`;
    }
    const tabs: ToggleButton[] = (
      ["now", "guards", "cost", "log"] as View[]
    ).map((value) => ({ value, label: this._t(`tabs.${value}`) }));
    return html`
      ${
        this._entries && this._entries.length > 1
          ? html`<ha-button-toggle-group
              size="s"
              .buttons=${this._entries.map((e) => ({
                value: e.entry_id,
                label: e.title,
              }))}
              .active=${this._entryId}
              @value-changed=${this._entryChanged}
            ></ha-button-toggle-group>`
          : nothing
      }
      ${this._siblingRow()}
      <ha-button-toggle-group
        full-width
        size="s"
        .buttons=${tabs}
        .active=${this._view}
        @value-changed=${this._viewChanged}
      ></ha-button-toggle-group>
      ${
        this._view === "now"
          ? this._now(this._info)
          : this._view === "guards"
            ? this._guards(this._info)
            : this._view === "cost"
              ? this._cost(this._info)
              : this._log(this._info)
      }
    `;
  }

  private _siblingRow(): TemplateResult | typeof nothing {
    const sibling = this._info?.sibling;
    if (!sibling) {
      return nothing;
    }
    const name = this._t(`sibling.${sibling.role}`);
    const stateText = this._t(`state.${sibling.state}`);
    const temp =
      sibling.role === "ac" || sibling.heat_mode === "cap"
        ? `${sibling.my_temperature.toFixed(1)}°`
        : this._t("now.heat_off");
    return html`<div class="row sibling" role="status">
      <span class="grow"
        ><strong>${name}</strong><br /><span class="detail"
          >${stateText}${sibling.paused ? `, ${this._t("sibling.paused")}` : ""},
          ${temp}</span
        ></span
      >
    </div>`;
  }

  private _now(info: DefenderInfo): TemplateResult {
    const heat = this.direction === "heat";
    const low = heat ? 10 : 7;
    const value = this._draft ?? info.my_temperature;
    const showCap = !heat || info.heat_mode === "cap";
    return html`
      <ha-card>
        <div class="row">
          <span class="grow">
            <span class="big">${this._t(`state.${info.state}`)}</span><br />
            <span class="detail">${info.reason}</span>
          </span>
        </div>
        ${
          info.gated
            ? html`<div class="row detail">${this._t("now.gated")}</div>`
            : nothing
        }
        ${
          info.band
            ? html`<div class="row detail">
                ${this._t("now.band", {
                  low: info.band.low.toFixed(1),
                  high: info.band.high.toFixed(1),
                })}
              </div>`
            : nothing
        }
        ${
          showCap
            ? html`<div class="row column">
                <span
                  >${this._t(`now.hold_${this.direction}`)}:
                  <strong>${value.toFixed(1)}°</strong></span
                >
                <ha-control-slider
                  .label=${this._t(`now.hold_${this.direction}`)}
                  .value=${value}
                  .min=${low}
                  .max=${35}
                  .step=${0.5}
                  @slider-moved=${this._moved}
                  @value-changed=${this._commit}
                ></ha-control-slider>
              </div>`
            : html`<div class="row detail">${this._t("now.heat_off")}</div>`
        }
        ${
          heat && info.floor !== null
            ? html`<div class="row column">
                <span
                  >${this._t("now.floor")}:
                  <strong
                    >${(this._floorDraft ?? info.floor).toFixed(1)}°</strong
                  >
                  ${
                    info.effective_floor !== null &&
                    info.effective_floor !== info.floor
                      ? html`<span class="detail"
                          >(${this._t("now.floor_in_force", {
                            floor: info.effective_floor.toFixed(1),
                          })})</span
                        >`
                      : nothing
                  }</span
                >
                <ha-control-slider
                  .label=${this._t("now.floor")}
                  .value=${this._floorDraft ?? info.floor}
                  .min=${10}
                  .max=${24}
                  .step=${0.5}
                  @slider-moved=${this._floorMoved}
                  @value-changed=${this._floorCommit}
                ></ha-control-slider>
              </div>`
            : nothing
        }
        ${
          info.next_check
            ? html`<div class="row detail">
                ${this._t("now.next_check")}:
                ${relativeTime(new Date(info.next_check), this.hass.locale)}
              </div>`
            : nothing
        }
      </ha-card>
      <ha-card>
        <div class="row column">
          <span>${this._t("now.pause_for")}</span>
          <ha-duration-input
            .data=${{ hours: this._pauseHours }}
            @value-changed=${this._pauseChanged}
          ></ha-duration-input>
          <span class="detail">${this._t("now.pause_hint")}</span>
        </div>
        <div class="row buttons">
          <ha-button size="small" @click=${this._pause}
            >${this._t("now.pause")}</ha-button
          >
          <ha-button size="small" variant="danger" @click=${this._stop}
            >${this._t("now.stop")}</ha-button
          >
          <ha-button size="small" @click=${this._resume}
            >${this._t("now.resume")}</ha-button
          >
        </div>
      </ha-card>
    `;
  }

  private _guards(info: DefenderInfo): TemplateResult {
    const search = this._t("guards.search");
    const matcher = searchMatcher(this._filter);
    const match = (guard: DefenderGuard) =>
      matcher(guard.id, guardTitle(guard.id), guard.family);
    const groups = groupGuards(info.guards, match);
    return html`
      <ha-input-search
        appearance="outlined"
        .placeholder=${search}
        .accessibleLabel=${search}
        .value=${this._filter}
        .patternSamples=${info.guards.map((g) => g.id)}
        @input=${this._filterChanged}
      ></ha-input-search>
      ${
        groups.length
          ? groups.map(
              (group) =>
                html`<ha-card .header=${this._t(`guards.${group.group}`)}>
                  ${group.guards.map((guard) => this._guardRow(guard))}
                </ha-card>`
            )
          : html`<p>${this._t("guards.none")}</p>`
      }
    `;
  }

  private _guardRow(guard: DefenderGuard): TemplateResult {
    return html`<div class=${classMap({ row: true, safety: guard.safety })}>
      <span class="grow">
        ${guardTitle(guard.id)}<br />
        <span class="detail"
          >${
            guard.last_acted
              ? this._t("guards.last_acted", {
                  time: relativeTime(
                    new Date(guard.last_acted),
                    this.hass.locale
                  ),
                })
              : this._t("guards.never_acted")
          }${guard.reason ? `: ${guard.reason}` : ""}</span
        >
      </span>
      <ha-switch
        .checked=${guard.enabled}
        .guardId=${guard.id}
        aria-label=${guardTitle(guard.id)}
        @change=${this._guardChanged}
      ></ha-switch>
    </div>`;
  }

  private _cost(info: DefenderInfo): TemplateResult {
    const money = (value: number | null) =>
      value === null ? "" : value.toFixed(2);
    return html`<ha-card>
      <div class="row">
        <span class="grow">${this._t("cost.today")}</span>
        <span
          >${formatHours(info.cost.seconds_today)}${
            info.cost.cost_today !== null
              ? `, ${money(info.cost.cost_today)}`
              : ""
          }</span
        >
      </div>
      <div class="row">
        <span class="grow">${this._t("cost.month")}</span>
        <span
          >${formatHours(info.cost.seconds_month)}${
            info.cost.cost_month !== null
              ? `, ${money(info.cost.cost_month)}`
              : ""
          }</span
        >
      </div>
      <div class="row detail">
        ${
          info.cost.cost_today === null
            ? this._t("cost.no_power")
            : this._t("cost.note")
        }
      </div>
    </ha-card>`;
  }

  private _log(info: DefenderInfo): TemplateResult {
    if (!info.log.length) {
      return html`<p>${this._t("log.empty")}</p>`;
    }
    return html`<ha-card>
      ${info.log.map((entry) => {
        const line = defenderLogLine(entry, info.plain_log);
        const text = line
          ? modeText(this.hass.localize, line.key, line.values)
          : entry.message;
        return html`<div class="row">
          <span class="grow"
            >${text}<br /><span class="detail"
              >${relativeTime(new Date(entry.time), this.hass.locale)}</span
            ></span
          >
        </div>`;
      })}
    </ha-card>`;
  }

  private _entryChanged(ev: CustomEvent<{ value: string }>): void {
    this._entryId = ev.detail.value;
    this._info = undefined;
    this._refresh();
  }

  private _viewChanged(ev: CustomEvent<{ value: string }>): void {
    this._view = ev.detail.value as View;
  }

  private _filterChanged(ev: Event): void {
    this._filter = (ev.target as HaInputSearch).value ?? "";
  }

  private _moved(ev: CustomEvent<{ value?: number }>): void {
    this._draft = ev.detail.value;
  }

  private async _commit(ev: CustomEvent<{ value?: number }>): Promise<void> {
    const value = ev.detail.value;
    this._draft = undefined;
    if (value === undefined || !this._entryId) {
      return;
    }
    try {
      await setDefenderTemperature(this.hass, this._entryId, value);
      this._error = undefined;
    } catch (err: any) {
      this._error = this._t("now.save_failed", { error: err?.message ?? "" });
    }
    await this._refresh();
  }

  private _floorMoved(ev: CustomEvent<{ value?: number }>): void {
    this._floorDraft = ev.detail.value;
  }

  private async _floorCommit(
    ev: CustomEvent<{ value?: number }>
  ): Promise<void> {
    const value = ev.detail.value;
    this._floorDraft = undefined;
    if (value === undefined || !this._entryId) {
      return;
    }
    try {
      await setDefenderFloor(this.hass, this._entryId, value);
      this._error = undefined;
    } catch (err: any) {
      this._error = this._t("now.save_failed", { error: err?.message ?? "" });
    }
    await this._refresh();
  }

  private _pauseChanged(ev: CustomEvent<{ value: { hours?: number } }>): void {
    this._pauseHours = Math.max(0.25, ev.detail.value?.hours ?? 1);
  }

  private async _guardChanged(ev: Event): Promise<void> {
    const target = ev.target as HTMLElement & {
      checked: boolean;
      guardId: string;
    };
    const guard = this._info?.guards.find((g) => g.id === target.guardId);
    if (!guard || !this._entryId) {
      return;
    }
    const enabled = target.checked;
    let confirmed = false;
    if (!enabled && needsConfirmationToDisable(guard)) {
      confirmed = await showConfirmationDialog(this, {
        title: this._t("guards.confirm_title"),
        text: this._t("guards.confirm_text", { guard: guardTitle(guard.id) }),
        confirmText: this._t("guards.confirm_second"),
        destructive: true,
        confirmName: guardTitle(guard.id),
      });
      if (!confirmed) {
        target.checked = true;
        return;
      }
    }
    try {
      await setDefenderGuard(
        this.hass,
        this._entryId,
        guard.id,
        enabled,
        confirmed
      );
    } catch (err: any) {
      this._error = err?.message ?? String(err);
    }
    await this._refresh();
  }

  private async _alsoSibling(): Promise<boolean> {
    if (!this._info?.sibling) {
      return false;
    }
    return showConfirmationDialog(this, {
      title: this._t("now.also_title"),
      text: this._t("now.also_body"),
      confirmText: this._t("now.also_yes"),
      dismissText: this._t("now.also_no"),
    });
  }

  private async _pause(): Promise<void> {
    if (!this._entryId) {
      return;
    }
    const also = await this._alsoSibling();
    await controlDefender(this.hass, this._entryId, "pause", {
      hours: this._pauseHours,
      alsoSibling: also,
    });
    await this._refresh();
  }

  private async _stop(): Promise<void> {
    if (!this._entryId) {
      return;
    }
    const also = await this._alsoSibling();
    await controlDefender(this.hass, this._entryId, "stop", {
      alsoSibling: also,
    });
    await this._refresh();
  }

  private async _resume(): Promise<void> {
    if (!this._entryId) {
      return;
    }
    await controlDefender(this.hass, this._entryId, "resume");
    await this._refresh();
  }

  static styles: CSSResultGroup = [
    haStyle,
    css`
      .content {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-3);
        padding: var(--ha-space-3);
        max-width: 640px;
        margin: 0 auto;
      }
      .intro,
      p {
        margin: 0;
        color: var(--secondary-text-color);
      }
      .row {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3);
        min-height: 52px;
        padding: var(--ha-space-2) var(--ha-space-4);
      }
      .row.column {
        flex-direction: column;
        align-items: stretch;
        gap: var(--ha-space-2);
      }
      .row.buttons {
        justify-content: flex-end;
        flex-wrap: wrap;
      }
      .row.sibling {
        border: 1px solid var(--divider-color);
        border-radius: var(--ha-border-radius-lg);
        background: var(--card-background-color);
      }
      .row.safety {
        border-inline-start: 3px solid var(--primary-color);
      }
      .grow {
        flex: 1;
        min-width: 0;
      }
      .big {
        font-size: 28px;
        line-height: 1.2;
      }
      .detail {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
      }
      ha-input-search {
        display: block;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-defender-page": HaDefenderPage;
  }
}
