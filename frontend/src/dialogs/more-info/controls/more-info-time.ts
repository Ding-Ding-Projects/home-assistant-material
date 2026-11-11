import type { HassEntity } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, queryAll, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { consume } from "../../../common/decorators/consume";
import { resolveTimeZone } from "../../../common/datetime/resolve-time-zone";
import { useAmPm } from "../../../common/datetime/use_am_pm";
import "../../../components/ha-button";
import { apiContext } from "../../../data/context";
import { UNAVAILABLE, UNKNOWN } from "../../../data/entity/entity";
import { setTimeValue } from "../../../data/time";
import type { HomeAssistant, HomeAssistantApi } from "../../../types";
import { moreInfoBoardStyle } from "../components/more-info-board-style";
import { getZonedParts } from "./more-info-time-zone";

type Part = "hour" | "minute";

// Typed digits are forgotten after this long without another key
const TYPED_TIMEOUT_MS = 1500;

const pad = (value: number) => String(value).padStart(2, "0");

@customElement("more-info-time")
class MoreInfoTime extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public stateObj?: HassEntity;

  @state()
  @consume({ context: apiContext, subscribe: true })
  private _api!: HomeAssistantApi;

  // The time picked here, applied only by the Set time button
  @state() private _hour = 0;

  @state() private _minute = 0;

  @state() private _part: Part = "hour";

  private _syncedState?: string;

  @state() private _invalidEntry?: string;

  private _typed = "";

  @queryAll(".current") private _spinbuttons!: NodeListOf<HTMLElement>;

  private _typedTimer?: ReturnType<typeof setTimeout>;

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._clearTyped();
  }

  private _clearTyped = () => {
    this._typed = "";
    if (this._typedTimer !== undefined) {
      clearTimeout(this._typedTimer);
      this._typedTimer = undefined;
    }
  };

  // The times offered as shortcuts follow the clock in the profile time zone
  private _presets(): [number, number][] {
    const { hour, minute } = getZonedParts(
      new Date(),
      resolveTimeZone(this.hass!.locale.time_zone, this.hass!.config.time_zone)
    );
    const total = hour * 60 + minute;
    const nextHalf = (Math.floor(total / 30) + 1) * 30;
    const nextHour = (Math.floor(total / 60) + 1) * 60;
    const seen = new Set<number>();
    return [total, nextHalf, nextHour]
      .map((value) => value % 1440)
      .filter((value) => !seen.has(value) && seen.add(value))
      .map((value) => [Math.floor(value / 60), value % 60]);
  }

  protected willUpdate(changedProps: PropertyValues<this>): void {
    super.willUpdate(changedProps);
    if (this.stateObj && this.stateObj.state !== this._syncedState) {
      this._syncedState = this.stateObj.state;
      this._resetDraft();
    }
  }

  private _resetDraft() {
    const match = /^(\d{1,2}):(\d{2})/.exec(this.stateObj?.state ?? "");
    this._hour = match ? Number(match[1]) % 24 : 0;
    this._minute = match ? Number(match[2]) % 60 : 0;
    this._invalidEntry = undefined;
    this._clearTyped();
  }

  protected render() {
    if (!this.hass || !this.stateObj || this.stateObj.state === UNAVAILABLE) {
      return nothing;
    }
    const localize = this.hass.localize;
    const ampm = useAmPm(this.hass.locale);
    const changed =
      this.stateObj.state === UNKNOWN ||
      !this.stateObj.state.startsWith(
        `${pad(this._hour)}:${pad(this._minute)}`
      );

    const hourLabel = (hour: number) => pad(ampm ? hour % 12 || 12 : hour);
    const presetFormat = new Intl.DateTimeFormat(this.hass.locale.language, {
      hour: "numeric",
      minute: "2-digit",
      hour12: ampm,
    });

    return html`
      <div class="stack">
        <div class="picker" role="group" aria-label=${this._announce(ampm)}>
          ${this._renderColumn(
            "hour",
            hourLabel,
            24,
            localize("ui.dialogs.more_info_control.time.hour"),
            ampm
          )}
          <span class="colon" aria-hidden="true">:</span>
          ${this._renderColumn(
            "minute",
            pad,
            60,
            localize("ui.dialogs.more_info_control.time.minute"),
            ampm
          )}
          ${
            ampm
              ? html`<div class="segmented meridiem">
                  <button
                    type="button"
                    aria-pressed=${this._hour < 12}
                    .meridiem=${"am"}
                    @click=${this._setMeridiem}
                  >
                    ${this._meridiemLabel(false)}
                  </button>
                  <button
                    type="button"
                    aria-pressed=${this._hour >= 12}
                    .meridiem=${"pm"}
                    @click=${this._setMeridiem}
                  >
                    ${this._meridiemLabel(true)}
                  </button>
                </div>`
              : nothing
          }
        </div>
        <p class="hint">
          ${localize("ui.dialogs.more_info_control.time.keyboard_hint", {
            example: "0645",
          })}
        </p>
        <p class="hint error" role="alert">
          ${
            this._invalidEntry
              ? localize("ui.dialogs.more_info_control.time.invalid_entry", {
                  entry: this._invalidEntry,
                })
              : nothing
          }
        </p>
        <div class="chips">
          ${this._presets().map(
            ([hour, minute]) => html`
              <button
                type="button"
                class="chip"
                .preset=${[hour, minute]}
                @click=${this._pickPreset}
              >
                ${presetFormat.format(new Date(2023, 0, 1, hour, minute))}
              </button>
            `
          )}
        </div>
        <div class="actions">
          <ha-button
            appearance="plain"
            .disabled=${!changed}
            @click=${this._resetDraft}
          >
            ${localize("ui.common.cancel")}
          </ha-button>
          <ha-button .disabled=${!changed} @click=${this._apply}>
            ${localize("ui.dialogs.more_info_control.time.set_time")}
          </ha-button>
        </div>
      </div>
    `;
  }

  private _meridiemLabel(pm: boolean) {
    const parts = new Intl.DateTimeFormat(this.hass!.locale.language, {
      hour: "numeric",
      hour12: true,
    }).formatToParts(new Date(2023, 0, 1, pm ? 15 : 3));
    return parts.find((part) => part.type === "dayPeriod")?.value ?? "";
  }

  private _announce(ampm: boolean) {
    const time = new Intl.DateTimeFormat(this.hass!.locale.language, {
      hour: "numeric",
      minute: "2-digit",
      hour12: ampm,
    }).format(new Date(2023, 0, 1, this._hour, this._minute));
    return time;
  }

  private _renderColumn(
    part: Part,
    label: (value: number) => string,
    size: number,
    partLabel: string,
    ampm: boolean
  ) {
    const value = part === "hour" ? this._hour : this._minute;
    const step = part === "minute" ? 15 : 1;
    const before = (value - step + size) % size;
    const after = (value + step) % size;
    return html`
      <div class="column">
        <button
          type="button"
          class="neighbor"
          tabindex="-1"
          .part=${part}
          .delta=${-step}
          @click=${this._nudge}
        >
          ${label(before)}
        </button>
        <div
          class=${classMap({ current: true, selected: this._part === part })}
          role="spinbutton"
          tabindex="0"
          aria-label=${partLabel}
          aria-valuemin="0"
          aria-valuemax=${size - 1}
          aria-valuenow=${value}
          aria-valuetext=${this._valueText(part, value, ampm)}
          .part=${part}
          @click=${this._selectPart}
          @focus=${this._selectPart}
          @blur=${this._clearTyped}
          @keydown=${this._handleKey}
        >
          ${label(value)}
        </div>
        <button
          type="button"
          class="neighbor"
          tabindex="-1"
          .part=${part}
          .delta=${step}
          @click=${this._nudge}
        >
          ${label(after)}
        </button>
      </div>
    `;
  }

  private _valueText(part: Part, value: number, ampm: boolean) {
    if (part === "minute") {
      return pad(value);
    }
    return new Intl.DateTimeFormat(this.hass!.locale.language, {
      hour: "numeric",
      hour12: ampm,
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2023, 0, 1, value)));
  }

  private _change(part: Part, delta: number) {
    if (part === "hour") {
      this._hour = (this._hour + delta + 24) % 24;
    } else {
      this._minute = (this._minute + delta + 60) % 60;
    }
  }

  private _nudge(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      part: Part;
      delta: number;
    };
    this._part = target.part;
    this._invalidEntry = undefined;
    this._clearTyped();
    this._change(target.part, target.delta);
  }

  private _selectPart(ev: Event) {
    this._part = (ev.currentTarget as HTMLElement & { part: Part }).part;
  }

  private _setMeridiem(ev: Event) {
    const pm =
      (ev.currentTarget as HTMLElement & { meridiem: string }).meridiem ===
      "pm";
    this._hour = (this._hour % 12) + (pm ? 12 : 0);
  }

  // Keys are handled on the hour and minute controls only, so a key pressed
  // on the AM or PM buttons never changes the time
  private _handleKey(ev: KeyboardEvent) {
    if (ev.altKey || ev.ctrlKey || ev.metaKey) {
      return;
    }
    const part = (ev.currentTarget as HTMLElement & { part: Part }).part;
    this._part = part;
    if (/^\d$/.test(ev.key)) {
      this._type(ev.key);
      ev.preventDefault();
      return;
    }
    // Any other key ends a half typed entry
    this._clearTyped();
    switch (ev.key) {
      case "ArrowUp":
        this._invalidEntry = undefined;
        this._change(part, 1);
        break;
      case "ArrowDown":
        this._invalidEntry = undefined;
        this._change(part, -1);
        break;
      case "PageUp":
        this._invalidEntry = undefined;
        this._change(part, part === "hour" ? 6 : 15);
        break;
      case "PageDown":
        this._invalidEntry = undefined;
        this._change(part, part === "hour" ? -6 : -15);
        break;
      case "Home":
        this._invalidEntry = undefined;
        this._set(part, 0);
        break;
      case "End":
        this._invalidEntry = undefined;
        this._set(part, part === "hour" ? 23 : 59);
        break;
      case "ArrowLeft":
      case "ArrowRight":
        this._part = part === "hour" ? "minute" : "hour";
        this._focusPart(this._part);
        break;
      default:
        return;
    }
    ev.preventDefault();
  }

  private _focusPart(part: Part) {
    this.updateComplete.then(() => {
      this._spinbuttons[part === "hour" ? 0 : 1]?.focus();
    });
  }

  private _set(part: Part, value: number) {
    if (part === "hour") {
      this._hour = value;
    } else {
      this._minute = value;
    }
  }

  // Four typed digits (0645) set hours and minutes together
  private _type(digit: string) {
    this._invalidEntry = undefined;
    this._typed = (this._typed + digit).slice(-4);
    if (this._typed.length === 4) {
      const entry = this._typed;
      const hour = Number(entry.slice(0, 2));
      const minute = Number(entry.slice(2));
      if (hour < 24 && minute < 60) {
        this._hour = hour;
        this._minute = minute;
      } else {
        // Announced through the alert region, the time stays as it was
        this._invalidEntry = `${entry.slice(0, 2)}:${entry.slice(2)}`;
      }
      this._clearTyped();
      return;
    }
    // Digits left over after a pause are not part of the next entry
    if (this._typedTimer !== undefined) {
      clearTimeout(this._typedTimer);
    }
    this._typedTimer = setTimeout(this._clearTyped, TYPED_TIMEOUT_MS);
  }

  private _pickPreset(ev: Event) {
    const [hour, minute] = (
      ev.currentTarget as HTMLElement & { preset: [number, number] }
    ).preset;
    this._hour = hour;
    this._minute = minute;
    this._invalidEntry = undefined;
    this._clearTyped();
  }

  private _apply() {
    // Keep the seconds the entity already has
    const seconds =
      /^\d{1,2}:\d{2}:(\d{2})/.exec(this.stateObj!.state)?.[1] ?? "00";
    setTimeValue(
      this._api.callService,
      this.stateObj!.entity_id,
      `${pad(this._hour)}:${pad(this._minute)}:${seconds}`
    );
  }

  static styles = [
    moreInfoBoardStyle,
    css`
      :host {
        display: block;
      }
      .picker {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: var(--ha-space-2);
        direction: ltr;
        border-radius: var(--ha-border-radius-xl);
      }
      .column .current:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }
      .column {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--ha-space-1);
      }
      .column button {
        appearance: none;
        border: none;
        background: transparent;
        font: inherit;
        cursor: pointer;
        color: var(--disabled-text-color);
        font-size: 24px;
        min-width: 80px;
        min-height: 40px;
      }
      .column .current {
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        min-width: 80px;
        cursor: pointer;
        font-size: 48px;
        line-height: 64px;
        min-height: 72px;
        border-radius: var(--ha-border-radius-xl);
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
      }
      .column .current.selected {
        background: var(
          --ha-color-fill-primary-quiet-resting,
          rgba(3, 169, 244, 0.2)
        );
        color: var(--primary-color);
      }
      .colon {
        font-size: 48px;
      }
      .meridiem {
        flex-direction: column;
        flex-wrap: nowrap;
      }
      .hint {
        margin: 0;
        text-align: center;
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-m);
      }
      .error {
        color: var(--error-color);
        min-height: 1.2em;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: var(--ha-space-3);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "more-info-time": MoreInfoTime;
  }
}
