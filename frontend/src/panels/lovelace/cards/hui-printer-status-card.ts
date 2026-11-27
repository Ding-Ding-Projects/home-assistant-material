import {
  mdiAlert,
  mdiArrowDown,
  mdiArrowUp,
  mdiCheck,
  mdiChevronDown,
  mdiChevronRight,
  mdiCheckCircleOutline,
  mdiCubeOutline,
  mdiMinus,
  mdiOpenInNew,
  mdiPower,
  mdiPrinter3d,
  mdiSleep,
} from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { formatTime } from "../../../common/datetime/format_time";
import { fireEvent } from "../../../common/dom/fire_event";
import { LanguageModeController } from "../../../common/language-mode/language-mode-controller";
import { navigate } from "../../../common/navigate";
import "../../../components/ha-card";
import "../../../components/ha-svg-icon";
import type {
  Printer3DEntities,
  TemperatureTrend,
} from "../../../data/printer_3d";
import {
  durationToMinutes,
  isPaused,
  listPrinter3DDevices,
  parseHmsProblems,
  parsePrintError,
  progressTicks,
  resolvePrinter3DEntities,
  safeWikiUrl,
  splitMinutes,
  stageLook,
  temperatureTrend,
} from "../../../data/printer_3d";
import type { HomeAssistant } from "../../../types";
import { createEntityNotFoundWarning } from "../components/hui-warning";
import type {
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceGridOptions,
} from "../types";
import {
  chipStateObj,
  formatTemperature,
  isKnownState,
  MotionPreferenceController,
  motionReduced,
  printer3DSharedStyles,
  printerDeviceName,
  stateNumber,
  TONE_CLASS,
} from "./printer-3d/printer-3d-common";
import type { PrinterStatusCardConfig } from "./types";

interface Tile {
  key: string;
  label: string;
  active: boolean;
  value: string;
  trend: TemperatureTrend;
  sub: string;
  percent: number;
}

const TREND_ICON: Record<TemperatureTrend, string> = {
  none: mdiMinus,
  target_off: mdiMinus,
  target_off_cooling: mdiArrowDown,
  heating: mdiArrowUp,
  cooling: mdiArrowDown,
  at_target: mdiCheck,
};

const P = "ui.panel.lovelace.cards.printer_status";

type Txt = (key: string, values?: Record<string, string | number>) => string;

const SEVERITIES = ["fatal", "serious", "common", "info"];

@customElement("hui-printer-status-card-card")
export class HuiPrinterStatusCard extends LitElement implements LovelaceCard {
  // Draws the card again when the language mode changes.
  private _lang = new LanguageModeController(this);

  constructor() {
    super();
    // Draws the card again when the app's reduced motion settings change.
    new MotionPreferenceController(this);
  }

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("../editor/config-elements/hui-printer-card-editors");
    return document.createElement("hui-printer-status-card-editor");
  }

  public static getStubConfig(hass: HomeAssistant): PrinterStatusCardConfig {
    const printers = listPrinter3DDevices(hass, (id) =>
      printerDeviceName(hass, id)
    );
    return { type: "printer-status-card", device_id: printers[0]?.deviceId };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;

  /** Set by the editor and the card picker: nothing here may reach the printer. */
  @property({ type: Boolean }) public preview = false;

  @state() private _config?: PrinterStatusCardConfig;

  @state() private _problemsOpen = true;

  private _entities?: Printer3DEntities;

  /** The entity registry the entities were resolved from. */
  private _entitiesSource?: HomeAssistant["entities"];

  public setConfig(config: PrinterStatusCardConfig): void {
    this._config = config;
  }

  public getCardSize(): number {
    return 8;
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: "auto", min_columns: 6 };
  }

  protected willUpdate(changed: PropertyValues): void {
    if (
      this._config &&
      this.hass &&
      (changed.has("_config") || this._entitiesSource !== this.hass.entities)
    ) {
      this._entitiesSource = this.hass.entities;
      this._entities = this._config.device_id
        ? resolvePrinter3DEntities(this.hass, this._config.device_id)
        : undefined;
    }
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    if (!this._entities || !this.hass || !changed.has("hass")) {
      return true;
    }
    // A change in the entity registry can add or rename the printer's entities.
    if (this._entitiesSource !== this.hass.entities) {
      return true;
    }
    const oldHass = changed.get("hass") as HomeAssistant | undefined;
    if (
      !oldHass ||
      oldHass.locale !== this.hass.locale ||
      oldHass.devices !== this.hass.devices
    ) {
      return true;
    }
    return (
      changed.size > 1 ||
      Object.values(this._entities).some(
        (id) => id && oldHass.states[id] !== this.hass!.states[id]
      )
    );
  }

  private _state(field: keyof Printer3DEntities): HassEntity | undefined {
    const id = this._entities?.[field];
    return id ? this.hass?.states[id] : undefined;
  }

  private _time(stateObj: HassEntity | undefined): string | undefined {
    if (!this.hass || !isKnownState(stateObj)) {
      return undefined;
    }
    const date = new Date(stateObj.state);
    return Number.isNaN(date.getTime())
      ? undefined
      : formatTime(date, this.hass.locale, this.hass.config);
  }

  private _sinceTime(stateObj: HassEntity | undefined): string | undefined {
    if (!this.hass || !stateObj) {
      return undefined;
    }
    return formatTime(
      new Date(stateObj.last_changed),
      this.hass.locale,
      this.hass.config
    );
  }

  protected render() {
    if (!this._config || !this.hass) {
      return nothing;
    }
    const hass = this.hass;
    const localize = this._lang.localizer(hass.localize);
    const deviceId = this._config.device_id;
    if (!deviceId) {
      const found = listPrinter3DDevices(hass, (id) =>
        printerDeviceName(hass, id)
      );
      return html`<ha-card class=${classMap({ still: motionReduced() })}>
        <div class="card-body">
          <div class="quiet">
            <ha-svg-icon .path=${mdiPrinter3d}></ha-svg-icon>
            <span class="grow">
              <span class="quiet-title">${localize(`${P}.title`)}</span>
              <span class="sub">${localize(`${P}.choose_printer`)}</span>
              <span class="sub"
                >${
                  found.length
                    ? localize(`${P}.choose_printer_hint`)
                    : localize(`${P}.no_printer_found`)
                }</span
              >
            </span>
          </div>
          ${
            found.length
              ? html`<ul class="found">
                  ${found.map(
                    (printer) =>
                      html`<li>
                        <ha-svg-icon .path=${mdiPrinter3d}></ha-svg-icon>
                        <span class="grow">
                          <span class="name">${printer.name}</span>
                          ${
                            printer.model
                              ? html`<span class="sub">${printer.model}</span>`
                              : nothing
                          }
                        </span>
                      </li>`
                  )}
                </ul>`
              : nothing
          }
        </div>
      </ha-card>`;
    }
    const entities = this._entities ?? resolvePrinter3DEntities(hass, deviceId);
    if (!entities.stage && !entities.printStatus) {
      return html`<hui-warning>
        ${createEntityNotFoundWarning(hass.localize, hass.config)}
      </hui-warning>`;
    }

    const stageObj = this._state("stage");
    const statusObj = this._state("printStatus");
    const onlineObj = this._state("online");
    const stageKey = isKnownState(stageObj) ? stageObj.state : undefined;
    const statusKey = isKnownState(statusObj) ? statusObj.state : undefined;
    const online =
      onlineObj?.state !== "off" &&
      stageKey !== "offline" &&
      statusKey !== "offline" &&
      (stageKey !== undefined || statusKey !== undefined);
    const look = stageLook(stageKey, statusKey, online);
    const name = printerDeviceName(hass, deviceId);
    const model = hass.devices[deviceId]?.model ?? undefined;
    const active =
      online &&
      (statusKey === "running" ||
        statusKey === "prepare" ||
        isPaused(stageKey, statusKey));
    const finished = online && statusKey === "finish";

    const chipObj = chipStateObj(stageObj, statusObj);
    const stageText = !online
      ? localize(`${P}.offline`)
      : chipObj
        ? hass.formatEntityState(chipObj)
        : localize(`${P}.idle`);

    // A short note beside the chip, only when it adds something.
    const speedObj = this._state("speedProfile");
    const layer = stateNumber(this._state("currentLayer"));
    const total = stateNumber(this._state("totalLayers"));
    let note = "";
    if (online && isPaused(stageKey, statusKey) && stageObj) {
      note = localize(`${P}.since`, { time: this._sinceTime(stageObj) ?? "" });
    } else if (online && active && layer === 0) {
      note = localize(`${P}.before_layer_1`);
    } else if (online && active && isKnownState(speedObj)) {
      note = localize(`${P}.speed_note`, {
        speed: hass.formatEntityState(speedObj),
      });
    }
    if (note === stageText) {
      note = "";
    }

    const lineText = online
      ? model
        ? `${localize(`${P}.online`)} · ${model}`
        : localize(`${P}.online`)
      : [
          localize(`${P}.offline_since`, {
            time: this._sinceTime(onlineObj ?? stageObj) ?? "",
          }),
          model,
        ]
          .filter(Boolean)
          .join(" · ");

    const hms = this._state("hmsErrors");
    const problems =
      online && hms?.state === "on" ? parseHmsProblems(hms.attributes) : [];
    const printError = online
      ? parsePrintError(this._state("printError"))
      : undefined;
    const problemCount = problems.length + (printError ? 1 : 0);

    const admin = hass.user?.is_admin !== false;
    return html`<ha-card
      class=${classMap({ still: motionReduced(), offline: !online })}
    >
      <div
        class="card-body"
        role="region"
        aria-label=${localize(`${P}.card_label`, { name })}
      >
        <button
          class="head"
          aria-label=${
            admin
              ? localize(`${P}.open_device`, { name })
              : localize(`${P}.open_details`, { name })
          }
          aria-describedby="printer-line"
          @click=${this._openDevice}
        >
          <span class="lead"
            ><ha-svg-icon .path=${mdiPrinter3d}></ha-svg-icon
          ></span>
          <span class="grow">
            <span class="name">${name}</span>
            <span class="sub line" id="printer-line">
              <span class=${classMap({ odot: true, no: !online })}></span>
              <span class="ellipsis">${lineText}</span>
            </span>
          </span>
          <ha-svg-icon class="chev" .path=${mdiChevronRight}></ha-svg-icon>
        </button>

        <div class="stage-row">
          <span
            class=${classMap({ chip: true, [TONE_CLASS[look.tone]]: true })}
          >
            <span class=${classMap({ dot: true, pulse: look.pulse })}></span>
            <span>${stageText}</span>
          </span>
          ${note ? html`<span class="note">${note}</span>` : nothing}
        </div>

        ${this._renderJob(entities, active || finished, localize)}
        ${this._renderProgress(active, finished, online, layer, total, localize)}
        ${
          !active && !finished
            ? this._renderQuiet(online, stageKey, localize)
            : nothing
        }
        ${
          this._config.show_problems !== false && problemCount
            ? this._renderProblems(problems, printError, problemCount, localize)
            : nothing
        }
        ${
          online && !problemCount && this._config.show_problems !== false
            ? html`<div class="ok-line">
                <ha-svg-icon .path=${mdiCheckCircleOutline}></ha-svg-icon>
                <span>${localize(`${P}.no_problems`)}</span>
              </div>`
            : nothing
        }
        <div
          class="tiles"
          role="group"
          aria-label=${localize(`${P}.temperatures`)}
        >
          ${this._tiles(entities, online, localize).map((tile) =>
            this._renderTile(tile, localize)
          )}
        </div>
        ${
          this.preview
            ? html`<p class="sub preview-note">
                ${localize(`${P}.preview_only`)}
              </p>`
            : nothing
        }
      </div>
    </ha-card>`;
  }

  private _renderJob(
    entities: Printer3DEntities,
    show: boolean,
    localize: ReturnType<LanguageModeController["localizer"]>
  ) {
    const jobObj = this._state("jobName");
    if (!show || !isKnownState(jobObj) || !jobObj.state) {
      return nothing;
    }
    const picture =
      this._config?.show_image !== false
        ? (this._state("coverImage")?.attributes.entity_picture as
            string | undefined)
        : undefined;
    const showThumb = this._config?.show_image !== false;
    return html`<div class="job">
      ${
        showThumb
          ? html`<span
              class="thumb"
              role="img"
              aria-label=${localize(`${P}.cover_image`, { name: jobObj.state })}
            >
              ${
                picture && entities.coverImage
                  ? html`<img
                      src=${this.hass!.hassUrl(picture)}
                      alt=""
                      loading="lazy"
                    />`
                  : html`<ha-svg-icon .path=${mdiCubeOutline}></ha-svg-icon>`
              }
            </span>`
          : nothing
      }
      <span class="grow">
        <span class="job-name ellipsis">${jobObj.state}</span>
        <span class="sub">${localize(`${P}.print_job`)}</span>
      </span>
    </div>`;
  }

  private _durationText(minutes: number, localize: Txt): string {
    const { hours, minutes: mins } = splitMinutes(minutes);
    if (!hours) {
      return localize(`${P}.minutes`, { minutes: mins });
    }
    return mins
      ? localize(`${P}.hours_minutes`, { hours, minutes: mins })
      : localize(`${P}.hours`, { hours });
  }

  private _minutesOf(field: keyof Printer3DEntities): number | undefined {
    const stateObj = this._state(field);
    const value = stateNumber(stateObj);
    return value === undefined
      ? undefined
      : durationToMinutes(
          value,
          stateObj?.attributes.unit_of_measurement as string | undefined
        );
  }

  private _renderProgress(
    active: boolean,
    finished: boolean,
    online: boolean,
    layer: number | undefined,
    total: number | undefined,
    localize: ReturnType<LanguageModeController["localizer"]>
  ) {
    const percent = stateNumber(this._state("progress"));
    if (!online || (!active && !finished) || percent === undefined) {
      return nothing;
    }
    const paused = isPaused(
      this._state("stage")?.state,
      this._state("printStatus")?.state
    );
    const remaining = this._minutesOf("remainingTime");
    const endTime = this._time(this._state("endTime"));
    const elapsed = this._minutesOf("elapsedTime");
    let timeMain: string;
    let timeSub: string;
    if (finished) {
      timeMain = endTime
        ? localize(`${P}.finished_at`, { time: endTime })
        : localize(`${P}.finished`);
      timeSub =
        elapsed !== undefined
          ? this._lang.compose(this.hass!.localize, (t) =>
              t(`${P}.took`, { time: this._durationText(elapsed, t) })
            )
          : "";
    } else {
      timeMain =
        remaining !== undefined
          ? this._lang.compose(this.hass!.localize, (t) =>
              t(`${P}.time_left`, { time: this._durationText(remaining, t) })
            )
          : "";
      timeSub = paused
        ? localize(`${P}.when_resumed`)
        : endTime
          ? localize(`${P}.done_at`, { time: endTime })
          : "";
    }
    const left =
      layer !== undefined && total !== undefined
        ? Math.max(0, total - layer)
        : undefined;
    const rounded = Math.round(percent);
    return html`<div class="progress">
      <div class="progress-row">
        <span class="percent"
          >${rounded}<span class="percent-unit">%</span></span
        >
        <span class="time">
          ${timeMain ? html`<span class="time-main">${timeMain}</span>` : nothing}
          ${timeSub ? html`<span class="sub">${timeSub}</span>` : nothing}
        </span>
      </div>
      <div
        class=${classMap({ lines: true, hold: paused })}
        role="progressbar"
        aria-label=${localize(`${P}.progress`)}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow=${rounded}
      >
        ${progressTicks(percent).map(
          (kind) => html`<span class="tick ${kind}"></span>`
        )}
      </div>
      ${
        layer !== undefined && total !== undefined
          ? html`<div class="layers">
              <b>${localize(`${P}.layer_of`, { layer, total })}</b>
              <span class="sub"
                >·
                ${
                  left === 0
                    ? localize(`${P}.no_layers_left`)
                    : localize(`${P}.layers_left`, { count: left ?? 0 })
                }</span
              >
            </div>`
          : nothing
      }
    </div>`;
  }

  private _renderQuiet(
    online: boolean,
    stageKey: string | undefined,
    localize: ReturnType<LanguageModeController["localizer"]>
  ) {
    if (!online) {
      return html`<div class="quiet">
        <ha-svg-icon .path=${mdiPower}></ha-svg-icon>
        <span class="grow">
          <span class="quiet-title">${localize(`${P}.no_live`)}</span>
          <span class="sub">${localize(`${P}.no_live_sub`)}</span>
        </span>
      </div>`;
    }
    const jobObj = this._state("jobName");
    const last = this._time(this._state("endTime"));
    const lastName = isKnownState(jobObj) ? jobObj.state : "";
    return html`<div class="quiet">
      <ha-svg-icon .path=${mdiSleep}></ha-svg-icon>
      <span class="grow">
        <span class="quiet-title">${localize(`${P}.nothing_printing`)}</span>
        <span class="sub"
          >${
            lastName && last && stageKey
              ? localize(`${P}.last_print`, { name: lastName, time: last })
              : localize(`${P}.ready_next`)
          }</span
        >
      </span>
    </div>`;
  }

  private _renderProblems(
    problems: ReturnType<typeof parseHmsProblems>,
    printError: ReturnType<typeof parsePrintError>,
    count: number,
    localize: ReturnType<LanguageModeController["localizer"]>
  ) {
    return html`<div class="problems">
      <button
        class="problems-head"
        aria-expanded=${this._problemsOpen ? "true" : "false"}
        aria-controls="printer-problems"
        @click=${this._toggleProblems}
      >
        <ha-svg-icon .path=${mdiAlert}></ha-svg-icon>
        <span class="grow">${localize(`${P}.problems`, { count })}</span>
        <ha-svg-icon
          class=${classMap({ cv: true, open: this._problemsOpen })}
          .path=${mdiChevronDown}
        ></ha-svg-icon>
      </button>
      <div id="printer-problems">
        ${
          this._problemsOpen
            ? html`<div class="problem-list">
                ${problems.map((problem) => {
                  const wiki = safeWikiUrl(problem.wiki);
                  return html`<div class="problem">
                    <span class="problem-text">${problem.text}</span>
                    <span class="problem-meta">
                      ${
                        SEVERITIES.includes(problem.severity)
                          ? html`<span
                              class=${classMap({
                                sev: true,
                                high:
                                  problem.severity === "serious" ||
                                  problem.severity === "fatal",
                              })}
                              >${localize(
                                `${P}.severity_${problem.severity}`
                              )}</span
                            >`
                          : nothing
                      }
                      <span class="code">${problem.code}</span>
                    </span>
                    ${
                      wiki
                        ? html`<a
                            class="wiki"
                            href=${wiki}
                            target="_blank"
                            rel="noreferrer noopener"
                            aria-label=${localize(`${P}.what_this_means_for`, {
                              code: problem.code,
                            })}
                            >${localize(`${P}.what_this_means`)}<ha-svg-icon
                              .path=${mdiOpenInNew}
                            ></ha-svg-icon
                          ></a>`
                        : nothing
                    }
                  </div>`;
                })}
                ${
                  printError
                    ? html`<div class="problem">
                        <span class="label"
                          >${localize(`${P}.print_error`)}</span
                        >
                        ${
                          printError.text
                            ? html`<span class="problem-text"
                                >${printError.text}</span
                              >`
                            : nothing
                        }
                        ${
                          printError.code
                            ? html`<span class="code"
                                >${localize(`${P}.code`, {
                                  code: printError.code,
                                })}</span
                              >`
                            : nothing
                        }
                      </div>`
                    : nothing
                }
              </div>`
            : nothing
        }
      </div>
    </div>`;
  }

  private _tiles(
    entities: Printer3DEntities,
    online: boolean,
    localize: ReturnType<LanguageModeController["localizer"]>
  ): Tile[] {
    const hass = this.hass!;
    const activeNozzle = this._state("activeNozzle");
    const activeSide = isKnownState(activeNozzle)
      ? activeNozzle.state
      : undefined;
    const idle = !online;
    const make = (
      key: string,
      label: string,
      tempField: keyof Printer3DEntities,
      targetField: keyof Printer3DEntities,
      isActive: boolean
    ): Tile => {
      const tempObj = this._state(tempField);
      const targetObj = this._state(targetField);
      const unit = tempObj?.attributes.unit_of_measurement as
        string | undefined;
      const current = idle ? undefined : stateNumber(tempObj);
      const target = idle ? undefined : stateNumber(targetObj);
      const trend = temperatureTrend(current, target, { unit });
      let sub: string;
      if (current === undefined) {
        sub = localize(`${P}.no_reading`);
      } else if (target === undefined) {
        sub = localize(`${P}.no_target`);
      } else if (trend === "target_off") {
        sub = localize(`${P}.target_off`);
      } else if (trend === "target_off_cooling") {
        sub = localize(`${P}.target_off_cooling`);
      } else {
        sub = this._lang.compose(hass.localize, (t) =>
          t(`${P}.of_target`, {
            target: formatTemperature(hass, target, unit),
            trend: t(`${P}.trend_${trend}`),
          })
        );
      }
      return {
        key,
        label,
        active: isActive && !idle,
        value:
          current === undefined ? "—" : formatTemperature(hass, current, unit),
        trend: current === undefined ? "none" : trend,
        sub,
        percent:
          current !== undefined && target !== undefined && target > 0
            ? Math.min(100, Math.round((current / target) * 100))
            : 0,
      };
    };
    const tiles: Tile[] = [];
    if (entities.leftNozzleTemp || entities.rightNozzleTemp) {
      if (entities.leftNozzleTemp) {
        tiles.push(
          make(
            "left",
            localize(`${P}.left_nozzle`),
            "leftNozzleTemp",
            "leftNozzleTarget",
            activeSide === "left"
          )
        );
      }
      if (entities.rightNozzleTemp) {
        tiles.push(
          make(
            "right",
            localize(`${P}.right_nozzle`),
            "rightNozzleTemp",
            "rightNozzleTarget",
            activeSide === "right"
          )
        );
      }
    } else if (entities.nozzleTemp) {
      tiles.push(
        make(
          "nozzle",
          localize(`${P}.nozzle`),
          "nozzleTemp",
          "nozzleTarget",
          false
        )
      );
    }
    if (entities.bedTemp) {
      tiles.push(
        make("bed", localize(`${P}.bed`), "bedTemp", "bedTarget", false)
      );
    }
    if (entities.chamberTemp && this._config?.show_chamber !== false) {
      tiles.push(
        make(
          "chamber",
          localize(`${P}.chamber`),
          "chamberTemp",
          "chamberTarget",
          false
        )
      );
    }
    return tiles;
  }

  private _renderTile(
    tile: Tile,
    localize: ReturnType<LanguageModeController["localizer"]>
  ): TemplateResult {
    return html`<div class=${classMap({ tile: true, act: tile.active })}>
      <span class="tile-label">
        <span class="ellipsis">${tile.label}</span>
        ${
          tile.active
            ? html`<span class="atag">${localize(`${P}.active`)}</span>`
            : nothing
        }
      </span>
      <span class="tile-value">
        <span class="tile-number">${tile.value}</span>
        <span class=${classMap({ mark: true, [tile.trend]: true })}
          ><ha-svg-icon .path=${TREND_ICON[tile.trend]}></ha-svg-icon
        ></span>
      </span>
      <span class="sub ellipsis">${tile.sub}</span>
      <span class="tbar" aria-hidden="true"
        ><span style=${styleMap({ width: `${tile.percent}%` })}></span
      ></span>
    </div>`;
  }

  private _toggleProblems() {
    this._problemsOpen = !this._problemsOpen;
  }

  private _openDevice() {
    if (this.preview || !this._config?.device_id || !this.hass) {
      return;
    }
    if (this.hass.user?.is_admin !== false) {
      navigate(`/config/devices/device/${this._config.device_id}`);
      return;
    }
    // The device page is for administrators; others get the more info dialog.
    const entityId = this._entities?.stage ?? this._entities?.printStatus;
    if (entityId) {
      fireEvent(this, "hass-more-info", { entityId });
    }
  }

  static styles = [
    printer3DSharedStyles,
    css`
      ha-card {
        height: 100%;
        overflow: hidden;
      }
      .card-body {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-3, 12px);
        padding: var(--ha-space-4, 16px);
        box-sizing: border-box;
        container-type: inline-size;
      }
      .found {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2, 8px);
      }
      .found li {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3, 12px);
        padding: var(--ha-space-2, 8px) var(--ha-space-3, 12px);
        border-radius: var(--ha-border-radius-lg, 12px);
        background: var(--printer-tile);
      }
      .preview-note {
        margin: 0;
      }
      button {
        font: inherit;
        color: inherit;
        border: 0;
        background: none;
        padding: 0;
        cursor: pointer;
        text-align: start;
      }
      button:focus-visible,
      a:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }
      .grow {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .ellipsis {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
      }
      .sub {
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
      }
      .head {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3, 12px);
        min-height: 48px;
        width: 100%;
        border-radius: var(--ha-border-radius-lg, 12px);
      }
      .lead {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: var(--printer-tile);
        color: var(--secondary-text-color);
        flex: none;
      }
      .name {
        font-size: var(--ha-font-size-l);
        font-weight: var(--ha-font-weight-medium);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .line {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .chev {
        color: var(--secondary-text-color);
      }
      .chev,
      .cv {
        transition: transform var(--ha-animation-duration-fast, 0.2s) ease;
      }
      :host-context([dir="rtl"]) .chev {
        transform: scaleX(-1);
      }
      .odot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--success-color);
        flex: none;
      }
      .odot.no {
        background: transparent;
        box-shadow: inset 0 0 0 2px var(--secondary-text-color);
      }
      .stage-row {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2, 8px);
        flex-wrap: wrap;
      }
      .note {
        margin-inline-start: auto;
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
      }
      .job {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3, 12px);
        min-width: 0;
      }
      .thumb {
        width: 48px;
        height: 48px;
        border-radius: var(--ha-border-radius-lg, 12px);
        flex: none;
        display: grid;
        place-items: center;
        overflow: hidden;
        color: var(--primary-color);
        background: var(--printer-tile);
        box-shadow: inset 0 0 0 1px var(--divider-color);
      }
      .thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .job-name {
        font-size: var(--ha-font-size-l);
        font-weight: var(--ha-font-weight-medium);
      }
      .progress {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .progress-row {
        display: flex;
        align-items: flex-end;
        gap: var(--ha-space-3, 12px);
      }
      .percent {
        font-size: 44px;
        line-height: 44px;
        font-weight: var(--ha-font-weight-bold, 600);
        letter-spacing: -1px;
        font-variant-numeric: tabular-nums;
      }
      .percent-unit {
        font-size: 20px;
        color: var(--secondary-text-color);
        margin-inline-start: 2px;
      }
      .time {
        margin-inline-start: auto;
        text-align: end;
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .time-main {
        font-size: var(--ha-font-size-l);
        font-weight: var(--ha-font-weight-medium);
      }
      .lines {
        display: flex;
        align-items: flex-end;
        gap: 3px;
        height: 36px;
      }
      .tick {
        flex: 1;
        min-width: 0;
        height: 24px;
        border-radius: 2px;
        background: var(--divider-color);
        transition:
          height var(--ha-animation-duration-normal, 0.25s) ease,
          background-color var(--ha-animation-duration-normal, 0.25s) ease;
      }
      .tick.done {
        background: var(--primary-color);
      }
      .tick.current {
        height: 36px;
        background: var(--primary-text-color);
        animation: printer-glow 2.4s ease-in-out infinite;
      }
      .lines.hold .tick.current {
        animation: none;
        background: var(--error-color);
      }
      @keyframes printer-glow {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.45;
        }
      }
      .layers {
        display: flex;
        flex-wrap: wrap;
        gap: 0 6px;
      }
      .layers b {
        font-weight: var(--ha-font-weight-medium);
      }
      .quiet {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3, 12px);
        padding: var(--ha-space-3, 12px) 14px;
        border-radius: var(--ha-border-radius-xl, 16px);
        background: var(--printer-tile);
        color: var(--secondary-text-color);
      }
      .quiet-title {
        color: var(--primary-text-color);
        font-weight: var(--ha-font-weight-medium);
      }
      .ok-line {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2, 8px);
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
        min-height: 24px;
      }
      .ok-line ha-svg-icon {
        --mdc-icon-size: 20px;
        color: var(--success-color);
      }
      .problems {
        background: var(--printer-error-container);
        border-radius: var(--ha-border-radius-xl, 16px);
        padding: 0 4px 4px;
        display: flex;
        flex-direction: column;
      }
      .problems-head {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 48px;
        padding-block: 0;
        padding-inline: 12px 8px;
        width: 100%;
        border-radius: var(--ha-border-radius-xl, 16px);
        font-weight: var(--ha-font-weight-medium);
      }
      .cv.open {
        transform: rotate(180deg);
      }
      .problem-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .problem {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 10px 12px;
        border-radius: var(--ha-border-radius-lg, 12px);
        background: color-mix(in srgb, var(--error-color) 10%, transparent);
      }
      .problem-text {
        overflow-wrap: anywhere;
      }
      .problem-meta {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2, 8px);
        flex-wrap: wrap;
      }
      .label {
        font-size: var(--ha-font-size-s);
        font-weight: var(--ha-font-weight-medium);
      }
      .sev {
        display: inline-flex;
        align-items: center;
        padding: 1px 8px;
        border-radius: 10px;
        font-size: var(--ha-font-size-s);
        font-weight: var(--ha-font-weight-bold, 600);
        box-shadow: inset 0 0 0 1px currentColor;
      }
      .sev.high {
        background: var(--error-color);
        color: var(--text-primary-color, #fff);
        box-shadow: none;
      }
      .code {
        font-family: var(--ha-font-family-code, monospace);
        font-size: var(--ha-font-size-s);
        overflow-wrap: anywhere;
      }
      .wiki {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 48px;
        align-self: flex-start;
        font-size: var(--ha-font-size-s);
        font-weight: var(--ha-font-weight-medium);
        color: inherit;
        text-decoration: underline;
      }
      .wiki ha-svg-icon {
        --mdc-icon-size: 16px;
      }
      .tiles {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--ha-space-2, 8px);
      }
      /* Follows the width of the card, not of the screen. */
      @container (max-width: 300px) {
        .tiles {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      .tile {
        background: var(--printer-tile);
        border-radius: var(--ha-border-radius-xl, 16px);
        padding: 10px 12px 12px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .tile.act {
        box-shadow: inset 0 0 0 1.5px var(--primary-color);
      }
      .tile-label {
        display: flex;
        align-items: center;
        gap: 6px;
        min-height: 20px;
        font-size: var(--ha-font-size-s);
        font-weight: var(--ha-font-weight-medium);
        color: var(--secondary-text-color);
      }
      .atag {
        margin-inline-start: auto;
        padding: 1px 8px;
        border-radius: 10px;
        background: var(--printer-primary-container);
        color: var(--primary-text-color);
        font-size: var(--ha-font-size-xs, 11px);
      }
      .tile-value {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .tile-number {
        font-size: 22px;
        line-height: 28px;
        font-weight: var(--ha-font-weight-bold, 600);
        font-variant-numeric: tabular-nums;
      }
      .mark {
        margin-inline-start: auto;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: var(--divider-color);
        color: var(--secondary-text-color);
      }
      .mark ha-svg-icon {
        --mdc-icon-size: 16px;
      }
      .mark.heating {
        background: var(--printer-amber-container);
        color: var(--printer-amber);
      }
      .mark.cooling,
      .mark.target_off_cooling {
        background: var(--printer-primary-container);
        color: var(--primary-color);
      }
      .mark.at_target {
        background: var(--printer-green-container);
        color: var(--success-color);
      }
      .tbar {
        height: 3px;
        border-radius: 2px;
        background: var(--divider-color);
        overflow: hidden;
        margin-top: 6px;
      }
      .tbar span {
        display: block;
        height: 100%;
        background: var(--primary-color);
        transition: width var(--ha-animation-duration-normal, 0.25s) ease;
      }
      ha-card.offline .tiles,
      ha-card.offline .lead {
        opacity: 0.62;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-printer-status-card-card": HuiPrinterStatusCard;
  }
}
