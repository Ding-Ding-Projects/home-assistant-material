import { mdiPrinter3d } from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
import { assert, assign, boolean, object, optional, string } from "superstruct";
import { fireEvent } from "../../../../common/dom/fire_event";
import { LanguageModeController } from "../../../../common/language-mode/language-mode-controller";
import "../../../../components/ha-alert";
import "../../../../components/ha-svg-icon";
import "../../../../components/ha-switch";
import type { Printer3DDevice } from "../../../../data/printer_3d";
import { listPrinter3DDevices } from "../../../../data/printer_3d";
import type { HomeAssistant } from "../../../../types";
import { printerDeviceName } from "../../cards/printer-3d/printer-3d-common";
import type {
  PrinterControlsCardConfig,
  PrinterStatusCardConfig,
} from "../../cards/types";
import type { LovelaceCardEditor } from "../../types";
import { baseLovelaceCardConfig } from "../structs/base-card-struct";

const statusStruct = assign(
  baseLovelaceCardConfig,
  object({
    device_id: optional(string()),
    show_image: optional(boolean()),
    show_problems: optional(boolean()),
    show_chamber: optional(boolean()),
  })
);

const controlsStruct = assign(
  baseLovelaceCardConfig,
  object({
    device_id: optional(string()),
    show_print: optional(boolean()),
    show_speed: optional(boolean()),
    show_temperature: optional(boolean()),
    show_fans: optional(boolean()),
    show_lights: optional(boolean()),
    show_more: optional(boolean()),
  })
);

interface ShowOption {
  key: string;
  label: string;
  help: string;
}

const P = "ui.panel.lovelace.editor.card";

abstract class PrinterCardEditor<
  T extends PrinterStatusCardConfig | PrinterControlsCardConfig,
>
  extends LitElement
  implements LovelaceCardEditor
{
  // Draws the editor again when the language mode changes.
  protected _lang = new LanguageModeController(this);

  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() protected _config?: T;

  protected abstract get _prefix(): string;

  protected abstract _options(localize: (key: string) => string): ShowOption[];

  public abstract setConfig(config: T): void;

  private _printers = memoizeOne(
    (entities: HomeAssistant["entities"], devices: HomeAssistant["devices"]) =>
      listPrinter3DDevices({ entities, devices }, (id) =>
        printerDeviceName(this.hass!, id)
      )
  );

  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }
    const hass = this.hass;
    const localize = this._lang.localizer(hass.localize) as (
      key: string,
      values?: Record<string, string | number>
    ) => string;
    const printers = this._printers(hass.entities, hass.devices);
    const options = this._options(localize);
    return html`
      <div class="sec">
        <span class="gh" id="gh-printer"
          >${localize(`${this._prefix}.printer`)}</span
        >
        ${
          printers.length
            ? this._renderPrinters(printers, localize)
            : html`<ha-alert alert-type="info">
                ${localize(`${this._prefix}.no_printer_title`)}
                <div class="help">
                  ${localize(`${this._prefix}.no_printer_text`)}
                </div>
                <a class="link" href="/config/integrations/dashboard"
                  >${localize(`${this._prefix}.add_integration`)}</a
                >
              </ha-alert>`
        }
      </div>
      <div class="sec" role="group" aria-labelledby="gh-show">
        <span class="gh" id="gh-show">${localize(`${this._prefix}.show`)}</span>
        ${options.map((option) => this._renderOption(option))}
      </div>
    `;
  }

  private _renderPrinters(
    printers: Printer3DDevice[],
    localize: (key: string, values?: Record<string, string | number>) => string
  ): TemplateResult {
    const selected = this._config!.device_id;
    return html`<div
        role="radiogroup"
        aria-labelledby="gh-printer"
        class="list"
      >
        ${printers.map(
          (printer) =>
            html`<button
              class=${classMap({ pick: true, sel: printer.deviceId === selected })}
              role="radio"
              aria-checked=${printer.deviceId === selected ? "true" : "false"}
              @click=${this._pickHandler(printer.deviceId)}
            >
              <span class="lead"
                ><ha-svg-icon .path=${mdiPrinter3d}></ha-svg-icon
              ></span>
              <span class="grow">
                <span class="nm">${printer.name}</span>
                ${printer.model ? html`<span class="sub">${printer.model}</span>` : nothing}
              </span>
              <span class="radio"></span>
            </button>`
        )}
      </div>
      <span class="sub note"
        >${localize(`${this._prefix}.printer_help`)}</span
      >`;
  }

  private _renderOption(option: ShowOption) {
    const value =
      (this._config as unknown as Record<string, boolean | undefined>)[
        option.key
      ] !== false;
    return html`<label class="opt">
      <span class="grow">
        <span class="nm">${option.label}</span>
        <span class="sub">${option.help}</span>
      </span>
      <ha-switch
        .checked=${value}
        @change=${this._optionHandler(option.key)}
      ></ha-switch>
    </label>`;
  }

  private _pickHandler(deviceId: string) {
    return () => this._pick(deviceId);
  }

  private _optionHandler(key: string) {
    return (ev: Event) =>
      this._set(key, (ev.currentTarget as HTMLInputElement).checked);
  }

  private _pick(deviceId: string) {
    fireEvent(this, "config-changed", {
      config: { ...this._config!, device_id: deviceId },
    });
  }

  private _set(key: string, value: boolean) {
    fireEvent(this, "config-changed", {
      config: { ...this._config!, [key]: value },
    });
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-4, 16px);
    }
    .sec {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1, 4px);
    }
    .gh {
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
      color: var(--secondary-text-color);
      padding: 4px;
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .pick,
    .opt {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3, 12px);
      min-height: 56px;
      padding: 4px var(--ha-space-3, 12px) 4px 4px;
      border-radius: var(--ha-border-radius-xl, 16px);
      background: var(--secondary-background-color);
      font: inherit;
      color: inherit;
      border: 0;
      text-align: start;
      cursor: pointer;
      width: 100%;
      box-sizing: border-box;
    }
    .opt {
      padding-inline: var(--ha-space-4, 16px);
    }
    .pick:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .pick.sel {
      background: color-mix(
        in srgb,
        var(--primary-color) 20%,
        var(--card-background-color)
      );
    }
    .lead {
      width: 40px;
      height: 40px;
      margin-inline-start: 4px;
      display: grid;
      place-items: center;
      color: var(--secondary-text-color);
      flex: none;
    }
    .grow {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .nm {
      font-size: var(--ha-font-size-m);
    }
    .sub {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .note {
      padding: 6px 4px;
    }
    .radio {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      box-shadow: inset 0 0 0 2px var(--secondary-text-color);
      display: grid;
      place-items: center;
      flex: none;
    }
    .pick.sel .radio {
      box-shadow: inset 0 0 0 2px var(--primary-color);
    }
    .pick.sel .radio::after {
      content: "";
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--primary-color);
    }
    .help {
      margin-top: 4px;
    }
    .link {
      display: inline-block;
      margin-top: var(--ha-space-2, 8px);
      min-height: 48px;
      line-height: 48px;
      color: var(--primary-color);
    }
  `;
}

@customElement("hui-printer-status-card-editor")
export class HuiPrinterStatusCardEditor extends PrinterCardEditor<PrinterStatusCardConfig> {
  protected get _prefix() {
    return `${P}.printer-status-card`;
  }

  public setConfig(config: PrinterStatusCardConfig): void {
    assert(config, statusStruct);
    this._config = config;
  }

  protected _options(localize: (key: string) => string): ShowOption[] {
    return [
      {
        key: "show_image",
        label: localize(`${this._prefix}.show_image`),
        help: localize(`${this._prefix}.show_image_help`),
      },
      {
        key: "show_problems",
        label: localize(`${this._prefix}.show_problems`),
        help: localize(`${this._prefix}.show_problems_help`),
      },
      {
        key: "show_chamber",
        label: localize(`${this._prefix}.show_chamber`),
        help: localize(`${this._prefix}.show_chamber_help`),
      },
    ];
  }
}

@customElement("hui-printer-controls-card-editor")
export class HuiPrinterControlsCardEditor extends PrinterCardEditor<PrinterControlsCardConfig> {
  protected get _prefix() {
    return `${P}.printer-controls-card`;
  }

  public setConfig(config: PrinterControlsCardConfig): void {
    assert(config, controlsStruct);
    this._config = config;
  }

  protected _options(localize: (key: string) => string): ShowOption[] {
    return ["print", "speed", "temperature", "fans", "lights", "more"].map(
      (group) => ({
        key: `show_${group}`,
        label: localize(`${this._prefix}.show_${group}`),
        help: localize(`${this._prefix}.show_${group}_help`),
      })
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-printer-status-card-editor": HuiPrinterStatusCardEditor;
    "hui-printer-controls-card-editor": HuiPrinterControlsCardEditor;
  }
}
