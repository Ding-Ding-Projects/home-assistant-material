import { mdiMinus, mdiPlus } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { LanguageModeController } from "../../../../common/language-mode/language-mode-controller";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-svg-icon";
import "../../../../components/ha-switch";
import type { HaSwitch } from "../../../../components/ha-switch";
import "../../../../components/ha-time-input";
import type {
  AutoSystemInfo,
  AutoSystemPartName,
} from "../../../../data/auto-update";
import {
  AUTO_SYSTEM_MAX_WAIT_DAYS,
  AUTO_SYSTEM_MIN_WINDOW_MINUTES,
  AUTO_SYSTEM_PARTS,
  autoSystemFailures,
  autoSystemLastResult,
  autoSystemPending,
  autoWindowMinutes,
  autoWindowSummary,
  formatAutoUpdateDateTime,
  retryAutoUpdateSystem,
  setAutoUpdateSystem,
  setAutoUpdateSystemWait,
  setAutoUpdateSystemWindow,
} from "../../../../data/auto-update";
import { extractApiErrorMessage } from "../../../../data/hassio/common";
import { TimeFormat } from "../../../../data/translation";
import { showConfirmationDialog } from "../../../../dialogs/generic/show-dialog-box";
import { haStyle } from "../../../../resources/styles";
import type { HomeAssistant, ValueChangedEvent } from "../../../../types";
import { showToast } from "../../../../util/toast";

const PREFIX = "ui.panel.config.updates.";

type PartTarget = HTMLElement & { systemPart: AutoSystemPartName };

/**
 * The switches, window and wait for updating Home Assistant itself, the
 * Supervisor and the operating system on their own, and what will happen next.
 */
@customElement("ha-update-auto-system")
export class HaUpdateAutoSystem extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public system!: AutoSystemInfo;

  // The window as typed, until it is long enough to save.
  @state() private _start?: string;

  @state() private _end?: string;

  private _lang = new LanguageModeController(this);

  protected willUpdate(changedProps: PropertyValues<this>): void {
    if (changedProps.has("system")) {
      this._start = undefined;
      this._end = undefined;
    }
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.hass.localize, `${PREFIX}${key}`, values);
  }

  private _partName(part: AutoSystemPartName): string {
    return this._t(`auto_system_${part}`);
  }

  protected render(): TemplateResult {
    const system = this.system;
    const anyOn = AUTO_SYSTEM_PARTS.some((part) => system.enabled[part]);
    return html`
      <div class="system" role="group" aria-labelledby="system-title">
        <h3 id="system-title">${this._t("auto_system_title")}</h3>
        <p class="note">${this._t("auto_system_intro")}</p>
        ${AUTO_SYSTEM_PARTS.map((part) => this._renderPart(part))}
        ${this._renderWindow()} ${this._renderWait()}
        ${anyOn ? this._renderStatus() : nothing} ${this._renderFailures()}
      </div>
    `;
  }

  private _renderPart(part: AutoSystemPartName): TemplateResult {
    return html`
      <div class="row">
        <span class="text">
          <span class="name">${this._partName(part)}</span>
          <span
            class="sub one-line"
            title=${this._t(`auto_system_${part}_help`)}
            >${this._t(`auto_system_${part}_help`)}</span
          >
        </span>
        <ha-switch
          .systemPart=${part}
          .checked=${this.system.enabled[part]}
          haptic
          @change=${this._togglePart}
          aria-label=${this._partName(part)}
        ></ha-switch>
      </div>
    `;
  }

  private _renderWindow(): TemplateResult {
    const start = this._start ?? this.system.window.start;
    const end = this._end ?? this.system.window.end;
    const short =
      autoWindowMinutes(start, end) < AUTO_SYSTEM_MIN_WINDOW_MINUTES;
    const locale = { ...this.hass.locale, time_format: TimeFormat.twenty_four };
    const label = this._t("auto_system_window");
    const from = this._t("auto_system_window_from");
    const until = this._t("auto_system_window_until");
    return html`
      <div class="block">
        <span class="name">${label}</span>
        <div class="pickers">
          <label class="picker">
            <span class="sub">${from}</span>
            <ha-time-input
              .locale=${locale}
              .value=${start}
              .accessibleLabel=${`${label}: ${from}`}
              @value-changed=${this._startChanged}
            ></ha-time-input>
          </label>
          <label class="picker">
            <span class="sub">${until}</span>
            <ha-time-input
              .locale=${locale}
              .value=${end}
              .accessibleLabel=${`${label}: ${until}`}
              @value-changed=${this._endChanged}
            ></ha-time-input>
          </label>
        </div>
        ${
          short
            ? html`<span class="sub error" role="alert"
                >${this._t("auto_system_window_short")}</span
              >`
            : html`<span class="sub"
                >${this._t("auto_system_window_help")}</span
              >`
        }
      </div>
    `;
  }

  private _renderWait(): TemplateResult {
    const days = this.system.wait_days;
    return html`
      <div class="row">
        <span class="text">
          <span class="name">${this._t("auto_system_wait")}</span>
          <span class="sub">${this._t("auto_system_wait_help")}</span>
        </span>
        <span class="stepper">
          <button
            type="button"
            class="step"
            .disabled=${days <= 0}
            aria-label=${this._t("auto_system_wait_less")}
            @click=${this._waitLess}
          >
            <ha-svg-icon .path=${mdiMinus}></ha-svg-icon>
          </button>
          <span class="days" aria-live="polite"
            >${this._t("auto_system_wait_days", { count: days })}</span
          >
          <button
            type="button"
            class="step"
            .disabled=${days >= AUTO_SYSTEM_MAX_WAIT_DAYS}
            aria-label=${this._t("auto_system_wait_more")}
            @click=${this._waitMore}
          >
            <ha-svg-icon .path=${mdiPlus}></ha-svg-icon>
          </button>
        </span>
      </div>
    `;
  }

  private _renderStatus(): TemplateResult {
    const system = this.system;
    const summary = autoWindowSummary(system);
    const pending = autoSystemPending(system, new Date());
    const last = autoSystemLastResult(system);
    const lang = this.hass.locale?.language;
    const timeZone = this.hass.config?.time_zone;
    const windowText =
      summary.kind === "open"
        ? this._t("auto_system_next_open", { end: summary.end })
        : this._t(`auto_system_next_${summary.kind}`, {
            start: summary.start,
            end: summary.end,
          });
    return html`
      <ul class="status" aria-live="polite">
        <li>${windowText}</li>
        ${
          pending.length
            ? pending.map((item) => {
                const values = {
                  name: this._partName(item.part),
                  version: item.version ?? "",
                  days: item.daysLeft,
                };
                return html`<li>
                  ${this._t(
                    item.daysLeft > 0
                      ? "auto_system_waiting"
                      : "auto_system_ready",
                    values
                  )}
                </li>`;
              })
            : html`<li>${this._t("auto_system_nothing")}</li>`
        }
        ${
          last
            ? html`<li class=${last.result.ok ? "" : "failed"}>
                ${this._t(
                  last.result.ok
                    ? "auto_system_last_ok"
                    : "auto_system_last_failed",
                  {
                    name: this._partName(last.part),
                    version: last.result.version ?? "",
                    time: formatAutoUpdateDateTime(
                      last.result.time,
                      lang,
                      timeZone
                    ),
                  }
                )}
              </li>`
            : nothing
        }
      </ul>
    `;
  }

  private _renderFailures(): TemplateResult | typeof nothing {
    const failures = autoSystemFailures(this.system);
    if (!failures.length) {
      return nothing;
    }
    return html`${failures.map((part) => {
      const name = this._partName(part.part);
      const version = part.failed?.version ?? "";
      return html`
        <ha-alert
          alert-type="warning"
          .title=${this._t("auto_system_failed_title", { name, version })}
        >
          <span class="sub"
            >${this._t("auto_system_failed_help", {
              error: part.failed?.error ?? "",
            })}</span
          >
          <div class="alert-actions">
            <ha-button
              appearance="filled"
              .systemPart=${part.part}
              @click=${this._tryNow}
              >${this._t("auto_system_try_now")}</ha-button
            >
            <ha-button
              appearance="plain"
              .systemPart=${part.part}
              @click=${this._skip}
              >${this._t("auto_system_skip")}</ha-button
            >
          </div>
        </ha-alert>
      `;
    })}`;
  }

  private async _save(save: () => Promise<void>): Promise<void> {
    try {
      await save();
    } catch (err: any) {
      this._start = undefined;
      this._end = undefined;
      this.requestUpdate();
      showToast(this, {
        message: extractApiErrorMessage(err),
        duration: 10000,
        dismissable: true,
      });
    }
  }

  private async _confirmRestart(
    part: AutoSystemPartName,
    confirmText: string,
    title: string
  ): Promise<boolean> {
    return showConfirmationDialog(this, {
      title,
      text: this._t(
        part === "os"
          ? "auto_system_confirm_text_os"
          : "auto_system_confirm_text"
      ),
      confirmText,
      dismissText: this._lang.text(this.hass.localize, "ui.common.cancel"),
      destructive: true,
    });
  }

  private async _togglePart(ev: Event): Promise<void> {
    const target = ev.currentTarget as HaSwitch & {
      systemPart: AutoSystemPartName;
    };
    const enabled = target.checked;
    const part = target.systemPart;
    // Turning one off needs no confirmation; turning one on asks once.
    if (
      enabled &&
      !(await this._confirmRestart(
        part,
        this._t("auto_system_turn_on"),
        this._t("auto_system_confirm_title", { name: this._partName(part) })
      ))
    ) {
      target.checked = false;
      return;
    }
    await this._save(() => setAutoUpdateSystem(this.hass, part, enabled));
  }

  private _startChanged(ev: ValueChangedEvent<string | undefined>): void {
    this._windowChanged(ev.detail.value?.slice(0, 5), undefined);
  }

  private _endChanged(ev: ValueChangedEvent<string | undefined>): void {
    this._windowChanged(undefined, ev.detail.value?.slice(0, 5));
  }

  private async _windowChanged(
    start: string | undefined,
    end: string | undefined
  ): Promise<void> {
    const nextStart = start ?? this._start ?? this.system.window.start;
    const nextEnd = end ?? this._end ?? this.system.window.end;
    if (
      nextStart === this.system.window.start &&
      nextEnd === this.system.window.end
    ) {
      return;
    }
    this._start = nextStart;
    this._end = nextEnd;
    if (
      autoWindowMinutes(nextStart, nextEnd) < AUTO_SYSTEM_MIN_WINDOW_MINUTES
    ) {
      return;
    }
    await this._save(() =>
      setAutoUpdateSystemWindow(this.hass, nextStart, nextEnd)
    );
  }

  private async _waitLess(): Promise<void> {
    await this._save(() =>
      setAutoUpdateSystemWait(this.hass, Math.max(0, this.system.wait_days - 1))
    );
  }

  private async _waitMore(): Promise<void> {
    await this._save(() =>
      setAutoUpdateSystemWait(
        this.hass,
        Math.min(AUTO_SYSTEM_MAX_WAIT_DAYS, this.system.wait_days + 1)
      )
    );
  }

  private async _tryNow(ev: Event): Promise<void> {
    const part = (ev.currentTarget as PartTarget).systemPart;
    const confirmed = await this._confirmRestart(
      part,
      this._t("auto_system_try_now"),
      this._t("auto_system_try_now_title", { name: this._partName(part) })
    );
    if (!confirmed) {
      return;
    }
    await this._save(() => retryAutoUpdateSystem(this.hass, part));
  }

  private async _skip(ev: Event): Promise<void> {
    const part = (ev.currentTarget as PartTarget).systemPart;
    const entry = this.system.parts.find((item) => item.part === part);
    if (!entry) {
      return;
    }
    await this._save(async () => {
      await this.hass.callService("update", "skip", {
        entity_id: entry.entity_id,
      });
    });
    showToast(this, {
      message: this._t("auto_system_skip_done", {
        name: this._partName(part),
        version: entry.failed?.version ?? "",
      }),
    });
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          display: block;
        }
        .system {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
          border-top: 1px solid var(--divider-color);
          margin-top: var(--ha-space-2);
          padding-top: var(--ha-space-3);
        }
        h3 {
          margin: 0;
          font-size: var(--ha-font-size-m);
          font-weight: var(--ha-font-weight-medium);
        }
        .note,
        .sub,
        .status {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
          margin: 0;
        }
        .row {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          min-height: 48px;
          padding: var(--ha-space-1) 0;
        }
        .text {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }
        .name {
          font-size: var(--ha-font-size-m);
        }
        /* A system part rests as one name line and one help line; the full
           help is the tooltip. */
        .one-line {
          display: block;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
        .block {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
          padding: var(--ha-space-2) 0;
        }
        .pickers {
          display: flex;
          flex-wrap: nowrap;
          gap: var(--ha-space-3);
        }
        .picker {
          flex: 1 1 0;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
        }
        .stepper {
          flex: none;
          display: inline-flex;
          align-items: center;
        }
        .step {
          width: 44px;
          height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: none;
          border-radius: 50%;
          background: none;
          color: var(--primary-text-color);
          cursor: pointer;
        }
        .step:disabled {
          opacity: 0.4;
          cursor: default;
        }
        .step:focus-visible {
          outline: 2px solid var(--primary-color);
        }
        .days {
          min-width: 56px;
          text-align: center;
          font-size: var(--ha-font-size-s);
        }
        .status {
          list-style: none;
          padding: var(--ha-space-2) 0 0;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
        }
        .status .failed,
        .error {
          color: var(--error-color);
        }
        ha-alert {
          display: block;
          margin-top: var(--ha-space-2);
        }
        .alert-actions {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
          margin-top: var(--ha-space-2);
        }
        .alert-actions ha-button {
          --ha-button-height: 44px;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-update-auto-system": HaUpdateAutoSystem;
  }
}
