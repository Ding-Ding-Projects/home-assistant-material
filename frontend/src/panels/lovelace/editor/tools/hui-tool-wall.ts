import type { TemplateResult } from "lit";
import { css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-button";
import "../../../../components/ha-checkbox";
import "../../../../components/ha-switch";
import "../../../../components/entity/ha-entity-picker";
import {
  PIN_PATTERN,
  readLocks,
  withPin,
  writeLocks,
} from "../../../../common/locks/element-locks";
import "../../../../components/input/ha-input";
import { isStrategyView } from "../../../../data/lovelace/config/view";
import { ToolView } from "./tools-base";
import type { WallPanelSettings } from "./wall-panel";
import { clearWallPanel, readWallPanel, writeWallPanel } from "./wall-panel";
import { previewWallPanelScreensaver } from "./wall-panel-runtime";

type Part = "screensaver" | "rotation" | "night";

@customElement("hui-tool-wall")
export class HuiToolWall extends ToolView {
  @state() private _settings: WallPanelSettings = readWallPanel();

  @state() private _pin = "";

  @state() private _hasPin = Boolean(readLocks().pin);

  protected render(): TemplateResult {
    const s = this._settings;
    const views = (this._config?.views ?? []).map((view, index) => ({
      key: view.path ?? String(index),
      title: view.title ?? view.path ?? String(index + 1),
      strategy: isStrategyView(view),
    }));
    return html`
      <p class="intro">${this._t("wall.intro")}</p>
      ${this._renderMessages()} ${this._renderKiosk(s)}
      <div class="cards">
        <section class="panel">
          <div class="head">
            <h3>${this._t("wall.screensaver")}</h3>
            <ha-switch
              .section=${"screensaver"}
              .checked=${s.screensaver.enabled}
              aria-label=${this._t("wall.screensaver")}
              @change=${this._toggle}
            ></ha-switch>
          </div>
          <ha-input
            type="number"
            .label=${this._t("wall.after_minutes")}
            .value=${String(s.screensaver.minutes)}
            .section=${"screensaver"}
            @change=${this._number}
          ></ha-input>
          <label class="inline">
            <ha-switch
              .checked=${s.screensaver.shift}
              @change=${this._shift}
            ></ha-switch>
            ${this._t("wall.shift")}
          </label>
          <p class="hint">${this._t("wall.screensaver_hint")}</p>
          <ha-button appearance="plain" @click=${this._preview}>
            ${this._t("wall.preview")}
          </ha-button>
        </section>
        <section class="panel">
          <div class="head">
            <h3>${this._t("wall.rotation")}</h3>
            <ha-switch
              .section=${"rotation"}
              .checked=${s.rotation.enabled}
              aria-label=${this._t("wall.rotation")}
              @change=${this._toggle}
            ></ha-switch>
          </div>
          <ha-input
            type="number"
            .label=${this._t("wall.every_seconds")}
            .value=${String(s.rotation.seconds)}
            .section=${"rotation"}
            @change=${this._number}
          ></ha-input>
          <ul class="views" aria-label=${this._t("wall.views")}>
            ${views.map(
              (view) =>
                html`<li>
                  <label>
                    <ha-checkbox
                      .viewKey=${view.key}
                      .checked=${s.rotation.views.includes(view.key)}
                      .disabled=${view.strategy}
                      @change=${this._viewToggle}
                    ></ha-checkbox>
                    ${view.title}
                  </label>
                </li>`
            )}
          </ul>
          <p class="hint">${this._t("wall.rotation_hint")}</p>
        </section>
        <section class="panel">
          <div class="head">
            <h3>${this._t("wall.night")}</h3>
            <ha-switch
              .section=${"night"}
              .checked=${s.night.enabled}
              aria-label=${this._t("wall.night")}
              @change=${this._toggle}
            ></ha-switch>
          </div>
          <ha-input
            type="time"
            .label=${this._t("wall.from")}
            .value=${s.night.from}
            .field=${"from"}
            @change=${this._time}
          ></ha-input>
          <ha-input
            type="time"
            .label=${this._t("wall.to")}
            .value=${s.night.to}
            .field=${"to"}
            @change=${this._time}
          ></ha-input>
          <ha-input
            type="number"
            .label=${this._t("wall.darkness")}
            .value=${String(s.night.darkness)}
            .section=${"night"}
            @change=${this._number}
          ></ha-input>
          <p class="hint">${this._t("wall.night_hint")}</p>
        </section>
      </div>
      <div class="row">
        <p class="hint grow">${this._t("wall.stored")}</p>
        <ha-button variant="danger" appearance="plain" @click=${this._reset}>
          ${this._t("wall.reset")}
        </ha-button>
      </div>
    `;
  }

  private _renderKiosk(s: WallPanelSettings): TemplateResult {
    const wakeLockSupported = "wakeLock" in navigator;
    return html`
      <section class="panel mode">
        <div class="head">
          <h3>${this._t("wall.kiosk")}</h3>
          <ha-switch
            .checked=${s.kiosk.enabled}
            aria-label=${this._t("wall.kiosk")}
            @change=${this._kioskToggle}
          ></ha-switch>
        </div>
        <p class="hint">${this._t("wall.kiosk_hint")}</p>
        <ha-input
          .label=${this._t("wall.tablet_name")}
          .value=${s.kiosk.name}
          .maxLength=${60}
          @change=${this._kioskName}
        ></ha-input>
        <p class="hint">${this._t("wall.tablet_name_hint")}</p>
      </section>
      <div class="cards">
        <section class="panel">
          <div class="head">
            <h3>${this._t("wall.lockdown")}</h3>
            <ha-switch
              .checked=${s.kiosk.lockdown}
              aria-label=${this._t("wall.lockdown")}
              @change=${this._lockdownToggle}
            ></ha-switch>
          </div>
          <p class="hint">${this._t("wall.lockdown_hint")}</p>
          <ha-input
            type="password"
            inputmode="numeric"
            .label=${this._t("wall.pin")}
            .value=${this._pin}
            @input=${this._pinInput}
          ></ha-input>
          <div class="row">
            <ha-button
              appearance="plain"
              .disabled=${!PIN_PATTERN.test(this._pin)}
              @click=${this._setPin}
            >
              ${this._t("wall.pin_set")}
            </ha-button>
            ${
              this._hasPin
                ? html`<ha-button
                    variant="danger"
                    appearance="plain"
                    @click=${this._removePin}
                  >
                    ${this._t("wall.pin_remove")}
                  </ha-button>`
                : nothing
            }
          </div>
          <p class="hint">
            ${
              this._hasPin
                ? this._t("wall.pin_is_set")
                : this._t("wall.pin_not_set")
            }
          </p>
        </section>
        <section class="panel">
          <h3>${this._t("wall.wake")}</h3>
          <ha-entity-picker
            .hass=${this.hass}
            .label=${this._t("wall.motion")}
            .value=${s.kiosk.motionEntity}
            .includeDomains=${["binary_sensor"]}
            @value-changed=${this._motionChanged}
          ></ha-entity-picker>
          <p class="hint">${this._t("wall.motion_hint")}</p>
          <label class="inline">
            <ha-switch
              .checked=${s.kiosk.keepAwake}
              .disabled=${!wakeLockSupported}
              @change=${this._keepAwakeToggle}
            ></ha-switch>
            ${this._t("wall.keep_awake")}
          </label>
          <p class="hint">
            ${
              wakeLockSupported
                ? this._t("wall.keep_awake_hint")
                : this._t("wall.keep_awake_unsupported")
            }
          </p>
        </section>
      </div>
    `;
  }

  private _kioskPatch(patch: Partial<WallPanelSettings["kiosk"]>) {
    const s = this._settings;
    this._write({ ...s, kiosk: { ...s.kiosk, ...patch } });
    this._settings = readWallPanel();
  }

  private _kioskToggle(ev: Event) {
    this._kioskPatch({
      enabled: (ev.currentTarget as HTMLInputElement).checked,
    });
  }

  private _lockdownToggle(ev: Event) {
    this._kioskPatch({
      lockdown: (ev.currentTarget as HTMLInputElement).checked,
    });
  }

  private _keepAwakeToggle(ev: Event) {
    this._kioskPatch({
      keepAwake: (ev.currentTarget as HTMLInputElement).checked,
    });
  }

  private _kioskName(ev: Event) {
    this._kioskPatch({ name: (ev.currentTarget as HTMLInputElement).value });
  }

  private _motionChanged(ev: CustomEvent<{ value?: string }>) {
    this._kioskPatch({ motionEntity: ev.detail.value ?? "" });
  }

  private _shift(ev: Event) {
    const s = this._settings;
    this._write({
      ...s,
      screensaver: {
        ...s.screensaver,
        shift: (ev.currentTarget as HTMLInputElement).checked,
      },
    });
  }

  private _pinInput(ev: Event) {
    this._pin = (ev.currentTarget as HTMLInputElement).value;
  }

  private _setPin() {
    try {
      writeLocks(withPin(readLocks(), this._pin));
      this._pin = "";
      this._hasPin = true;
      this._error = undefined;
      this._notice = this._t("wall.pin_saved");
    } catch (err: unknown) {
      this._fail(err);
    }
  }

  private _removePin() {
    try {
      writeLocks(withPin(readLocks(), undefined));
      this._hasPin = false;
      this._notice = this._t("wall.pin_removed");
    } catch (err: unknown) {
      this._fail(err);
    }
  }

  private _write(next: WallPanelSettings) {
    this._settings = next;
    this._error = undefined;
    try {
      writeWallPanel(next);
    } catch (err: unknown) {
      this._fail(err);
    }
  }

  private _toggle(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      section: Part;
      checked: boolean;
    };
    const s = this._settings;
    this._write({
      ...s,
      [target.section]: { ...s[target.section], enabled: target.checked },
    } as WallPanelSettings);
  }

  private _number(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      section: Part;
      value: string;
    };
    const value = Number(target.value);
    const s = this._settings;
    const key =
      target.section === "screensaver"
        ? "minutes"
        : target.section === "rotation"
          ? "seconds"
          : "darkness";
    this._write({
      ...s,
      [target.section]: { ...s[target.section], [key]: value },
    } as WallPanelSettings);
    // Show the value that was kept after limits were applied.
    this._settings = readWallPanel();
  }

  private _time(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      field: "from" | "to";
      value: string;
    };
    const s = this._settings;
    this._write({ ...s, night: { ...s.night, [target.field]: target.value } });
    this._settings = readWallPanel();
  }

  private _viewToggle(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      viewKey: string;
      checked: boolean;
    };
    const s = this._settings;
    const views = target.checked
      ? [...s.rotation.views, target.viewKey]
      : s.rotation.views.filter((v) => v !== target.viewKey);
    this._write({ ...s, rotation: { ...s.rotation, views } });
  }

  private _preview() {
    fireEvent(this, "close-tool");
    window.setTimeout(previewWallPanelScreensaver, 400);
  }

  private _reset() {
    clearWallPanel();
    this._settings = readWallPanel();
    this._notice = this._t("wall.reset_done");
  }

  static get styles() {
    return [
      ToolView.styles,
      css`
        .cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: var(--ha-space-3);
        }
        .panel {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
          padding: var(--ha-space-4);
          border-radius: var(--ha-border-radius-lg);
          background: var(--secondary-background-color);
        }
        /* The shared row rule gives inputs a 200px flex basis, which in a
           column would become a 200px tall empty block. */
        .panel ha-input,
        .panel ha-entity-picker {
          flex: none;
        }
        .head {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        h3 {
          margin: 0;
          font-size: var(--ha-font-size-l);
          font-weight: var(--ha-font-weight-title, 600);
        }
        .mode {
          margin-bottom: var(--ha-space-3);
        }
        .inline {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
        }
        .cards {
          margin-bottom: var(--ha-space-3);
        }
        .views label {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-tool-wall": HuiToolWall;
  }
}
