import {
  mdiAirFilter,
  mdiArrowDown,
  mdiArrowUp,
  mdiBellOff,
  mdiCheck,
  mdiChevronDown,
  mdiCog,
  mdiFan,
  mdiInformationOutline,
  mdiLightbulbOutline,
  mdiMinus,
  mdiPause,
  mdiPlay,
  mdiPlus,
  mdiPrinter3d,
  mdiRefresh,
  mdiSpeedometer,
  mdiStop,
  mdiThermometer,
  mdiVideo,
  mdiVolumeHigh,
  mdiBedOutline,
} from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { LanguageModeController } from "../../../common/language-mode/language-mode-controller";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-slider";
import "../../../components/ha-svg-icon";
import "../../../components/ha-switch";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import type {
  Printer3DEntities,
  Printer3DField,
  TemperatureTrend,
} from "../../../data/printer_3d";
import {
  isPaused,
  isPrintActive,
  listPrinter3DDevices,
  resolvePrinter3DEntities,
  stageLook,
  stepTarget,
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
  formatTemperature,
  isKnownState,
  motionReduced,
  printer3DSharedStyles,
  printerDeviceName,
  stateNumber,
  TONE_CLASS,
} from "./printer-3d/printer-3d-common";
import type { PrinterControlsCardConfig } from "./types";

type GroupKey = "print" | "speed" | "temp" | "fans" | "lights" | "more";

const GROUPS: {
  key: GroupKey;
  option: keyof PrinterControlsCardConfig;
  icon: string;
}[] = [
  { key: "print", option: "show_print", icon: mdiPlay },
  { key: "speed", option: "show_speed", icon: mdiSpeedometer },
  { key: "temp", option: "show_temperature", icon: mdiThermometer },
  { key: "fans", option: "show_fans", icon: mdiFan },
  { key: "lights", option: "show_lights", icon: mdiLightbulbOutline },
  { key: "more", option: "show_more", icon: mdiCog },
];

/** How fast each print speed runs, as a share of the sliced speed. */
const SPEED_SHARE: Record<string, string> = {
  silent: "50%",
  standard: "100%",
  sport: "124%",
  ludicrous: "166%",
};

const FANS: { field: Printer3DField; key: string }[] = [
  { field: "coolingFan", key: "part_cooling_fan" },
  { field: "auxFan", key: "aux_fan" },
  { field: "chamberFan", key: "chamber_fan" },
  { field: "exhaustFan", key: "exhaust_fan" },
];

const TREND_ICON: Record<TemperatureTrend, string> = {
  none: mdiMinus,
  target_off: mdiMinus,
  target_off_cooling: mdiArrowDown,
  heating: mdiArrowUp,
  cooling: mdiArrowDown,
  at_target: mdiCheck,
};

type L = ReturnType<LanguageModeController["localizer"]>;

interface TempRow {
  key: string;
  label: string;
  active: boolean;
  current?: number;
  unit?: string;
  target?: number;
  setter?: string;
  min: number;
  max: number;
  kind: "nozzle" | "bed" | "chamber";
  why?: string;
}

const P = "ui.panel.lovelace.cards.printer_controls";

@customElement("hui-printer-controls-card")
export class HuiPrinterControlsCard extends LitElement implements LovelaceCard {
  // Draws the card again when the language mode changes.
  private _lang = new LanguageModeController(this);

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("../editor/config-elements/hui-printer-card-editors");
    return document.createElement("hui-printer-controls-card-editor");
  }

  public static getStubConfig(hass: HomeAssistant): PrinterControlsCardConfig {
    const printers = listPrinter3DDevices(hass, (id) =>
      printerDeviceName(hass, id)
    );
    return { type: "printer-controls-card", device_id: printers[0]?.deviceId };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: PrinterControlsCardConfig;

  @state() private _closed: Partial<Record<GroupKey, boolean>> = {};

  /** The speed each fan returns to when it is switched back on. */
  private _fanLast: Record<string, number> = {};

  private _entities?: Printer3DEntities;

  public setConfig(config: PrinterControlsCardConfig): void {
    this._config = config;
  }

  public getCardSize(): number {
    return 10;
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: "auto", min_columns: 6 };
  }

  protected willUpdate(changed: PropertyValues): void {
    if (
      this._config &&
      this.hass &&
      (changed.has("_config") ||
        changed.get("hass")?.entities !== this.hass.entities)
    ) {
      this._entities = this._config.device_id
        ? resolvePrinter3DEntities(this.hass, this._config.device_id)
        : undefined;
    }
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    if (!this._entities || !this.hass || !changed.has("hass")) {
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

  private _state(field: Printer3DField): HassEntity | undefined {
    const id = this._entities?.[field];
    return id ? this.hass?.states[id] : undefined;
  }

  private _call(
    domain: string,
    service: string,
    field: Printer3DField,
    data = {}
  ) {
    const entityId = this._entities?.[field];
    if (!entityId || !this.hass) {
      return;
    }
    this.hass.callService(domain, service, { entity_id: entityId, ...data });
  }

  protected render() {
    if (!this._config || !this.hass) {
      return nothing;
    }
    const hass = this.hass;
    const localize = this._lang.localizer(hass.localize);
    const deviceId = this._config.device_id;
    if (!deviceId) {
      return html`<ha-card class=${classMap({ still: motionReduced() })}>
        <div class="card-body">
          <div class="why">
            <ha-svg-icon .path=${mdiInformationOutline}></ha-svg-icon>
            ${localize(`${P}.choose_printer`)}
          </div>
        </div>
      </ha-card>`;
    }
    const entities = this._entities ?? resolvePrinter3DEntities(hass, deviceId);
    if (!Object.keys(entities).length) {
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
      (stageKey !== undefined || statusKey !== undefined || !!onlineObj);
    const look = stageLook(stageKey, statusKey, online);
    const active = online && isPrintActive(stageKey, statusKey);
    const name = printerDeviceName(hass, deviceId);
    const model = hass.devices[deviceId]?.model ?? undefined;
    const jobObj = this._state("jobName");
    const job = active && isKnownState(jobObj) ? jobObj.state : "";
    const stageText = !online
      ? localize(`${P}.offline`)
      : isKnownState(stageObj)
        ? hass.formatEntityState(stageObj)
        : isKnownState(statusObj)
          ? hass.formatEntityState(statusObj)
          : localize(`${P}.idle`);

    const groups = GROUPS.filter(
      (group) => this._config![group.option] !== false
    )
      .map((group) => ({
        group,
        body: this._renderGroup(group.key, {
          online,
          active,
          stageKey,
          statusKey,
          localize,
        }),
      }))
      .filter((item) => item.body);

    return html`<ha-card
      class=${classMap({ still: motionReduced(), offline: !online })}
      aria-label=${localize(`${P}.card_label`, { name })}
    >
      <div class="card-body">
        <div class="head">
          <span class=${classMap({ pico: true, gone: !online })}>
            <ha-svg-icon .path=${mdiPrinter3d}></ha-svg-icon>
            <span
              class="odot"
              role="img"
              aria-label=${
                online ? localize(`${P}.online`) : localize(`${P}.offline`)
              }
            ></span>
          </span>
          <div class="grow">
            <h2 class="title ellipsis">${name}</h2>
            <span class="sub ellipsis"
              >${
                !online
                  ? [localize(`${P}.offline`), model]
                      .filter(Boolean)
                      .join(" · ")
                  : [model, job].filter(Boolean).join(" · ")
              }</span
            >
          </div>
          <span
            class=${classMap({ chip: true, [TONE_CLASS[look.tone]]: true })}
            role="status"
          >
            <span class=${classMap({ dot: true, pulse: look.pulse })}></span>
            <span>${stageText}</span>
          </span>
        </div>
        ${
          !online
            ? html`<div class="why block" role="status">
                <ha-svg-icon .path=${mdiInformationOutline}></ha-svg-icon>
                <span
                  ><b>${localize(`${P}.offline_title`)}</b>
                  ${localize(`${P}.offline_text`)}</span
                >
              </div>`
            : nothing
        }
        ${
          groups.length
            ? html`<div class="groups">
                ${groups.map(({ group, body }) =>
                  this._renderGroupShell(
                    group.key,
                    group.icon,
                    body!,
                    localize,
                    {
                      online,
                      active,
                      statusKey,
                      stageKey,
                    }
                  )
                )}
              </div>`
            : html`<p class="why">
                <ha-svg-icon .path=${mdiInformationOutline}></ha-svg-icon>
                ${localize(`${P}.no_groups`)}
              </p>`
        }
      </div>
    </ha-card>`;
  }

  private _renderGroupShell(
    key: GroupKey,
    icon: string,
    body: { summary: string; content: TemplateResult },
    localize: L,
    _ctx: unknown
  ) {
    const open = !this._closed[key];
    return html`<section class="group">
      <h3>
        <button
          class="ghead"
          aria-expanded=${open ? "true" : "false"}
          aria-controls=${`g-${key}`}
          @click=${this._toggleHandler(key)}
        >
          <ha-svg-icon .path=${icon}></ha-svg-icon>
          <span class="gl">${localize(`${P}.group_${key}`)}</span>
          <span class="gs ellipsis">${body.summary}</span>
          <ha-svg-icon
            class=${classMap({ cv: true, open })}
            .path=${mdiChevronDown}
          ></ha-svg-icon>
        </button>
      </h3>
      ${open ? html`<div class="gbody" id=${`g-${key}`}>${body.content}</div>` : nothing}
    </section>`;
  }

  private _toggleHandler(key: GroupKey) {
    return () => this._toggle(key);
  }

  private _callHandler(domain: string, service: string, field: Printer3DField) {
    return () => this._call(domain, service, field);
  }

  private _selectHandler(
    field: Printer3DField,
    option: string,
    current: string | undefined
  ) {
    return () => {
      if (option !== current) {
        this._call("select", "select_option", field, { option });
      }
    };
  }

  private _targetHandler(entityId: string | undefined, value: number) {
    return () => this._setTarget(entityId, value);
  }

  private _fanSliderHandler(field: Printer3DField, before: number) {
    return (ev: Event) =>
      this._setFan(
        field,
        Number((ev.currentTarget as HTMLInputElement).value),
        before
      );
  }

  private _fanSwitchHandler(field: Printer3DField, current: number) {
    return (ev: Event) =>
      this._switchFan(
        field,
        (ev.currentTarget as HTMLInputElement).checked,
        current
      );
  }

  private _toggle(key: GroupKey) {
    this._closed = { ...this._closed, [key]: !this._closed[key] };
  }

  /** The summary and content of one group, or nothing when the printer has none of it. */
  private _renderGroup(
    key: GroupKey,
    ctx: {
      online: boolean;
      active: boolean;
      stageKey?: string;
      statusKey?: string;
      localize: L;
    }
  ): { summary: string; content: TemplateResult } | undefined {
    switch (key) {
      case "print":
        return this._printGroup(ctx);
      case "speed":
        return this._speedGroup(ctx);
      case "temp":
        return this._tempGroup(ctx);
      case "fans":
        return this._fansGroup(ctx);
      case "lights":
        return this._lightsGroup(ctx);
      default:
        return this._moreGroup(ctx);
    }
  }

  private _why(text: string) {
    return html`<p class="why">
      <ha-svg-icon .path=${mdiInformationOutline}></ha-svg-icon>${text}
    </p>`;
  }

  // ----- Print

  private _printGroup(ctx: {
    online: boolean;
    active: boolean;
    stageKey?: string;
    statusKey?: string;
    localize: L;
  }) {
    const { online, active, stageKey, statusKey, localize } = ctx;
    const e = this._entities!;
    if (!e.pause && !e.resume && !e.stop) {
      return undefined;
    }
    const paused = isPaused(stageKey, statusKey);
    const off = !online || !active;
    const summary = !online
      ? localize(`${P}.offline`)
      : paused
        ? localize(`${P}.paused`)
        : active
          ? localize(`${P}.printing`)
          : localize(`${P}.nothing_printing`);
    const why = !online
      ? localize(`${P}.why_offline`)
      : !active
        ? localize(`${P}.why_nothing_printing`)
        : "";
    return {
      summary,
      content: html`<div class="print-row">
          ${
            paused && e.resume
              ? html`<ha-button
                  appearance="filled"
                  ?disabled=${!online}
                  @click=${this._callHandler("button", "press", "resume")}
                  ><ha-svg-icon slot="start" .path=${mdiPlay}></ha-svg-icon
                  >${localize(`${P}.resume`)}</ha-button
                >`
              : e.pause
                ? html`<ha-button
                    appearance="filled"
                    ?disabled=${off}
                    @click=${this._callHandler("button", "press", "pause")}
                    ><ha-svg-icon slot="start" .path=${mdiPause}></ha-svg-icon
                    >${localize(`${P}.pause`)}</ha-button
                  >`
                : nothing
          }
          ${
            e.stop
              ? html`<ha-button
                  variant="danger"
                  appearance="filled"
                  aria-haspopup="dialog"
                  ?disabled=${off}
                  @click=${this._askStop}
                  ><ha-svg-icon slot="start" .path=${mdiStop}></ha-svg-icon
                  >${localize(`${P}.stop`)}</ha-button
                >`
              : nothing
          }
        </div>
        ${why ? this._why(why) : nothing}`,
    };
  }

  private async _askStop(ev: Event) {
    const hass = this.hass;
    if (!hass || !this._entities?.stop) {
      return;
    }
    const localize = hass.localize;
    const jobObj = this._state("jobName");
    const name = this._config?.device_id
      ? printerDeviceName(hass, this._config.device_id)
      : "";
    const layer = stateNumber(this._state("currentLayer"));
    const total = stateNumber(this._state("totalLayers"));
    const percent = stateNumber(this._state("progress"));
    const job =
      isKnownState(jobObj) && jobObj.state
        ? localize(`${P}.stop_job`, { job: jobObj.state, name })
        : localize(`${P}.stop_job_unknown`, { name });
    const detail =
      layer !== undefined && total !== undefined
        ? localize(`${P}.stop_detail`, {
            layer,
            total,
            percent: Math.round(percent ?? 0),
          })
        : localize(`${P}.stop_cool_down`);
    const button = ev.currentTarget as HTMLElement | null;
    const confirmed = await showConfirmationDialog(this, {
      title: localize(`${P}.stop_title`),
      text: html`<p>${localize(`${P}.stop_text`)}</p>
        <p><b>${job}</b><br />${detail}</p>`,
      confirmText: localize(`${P}.stop_confirm`),
      dismissText: localize(`${P}.keep_printing`),
      destructive: true,
    });
    if (confirmed) {
      this._call("button", "press", "stop");
    }
    // Focus goes back to the button that opened the question.
    button?.focus?.();
  }

  // ----- Speed

  private _speedGroup(ctx: { online: boolean; active: boolean; localize: L }) {
    const { online, active, localize } = ctx;
    const select = this._state("printingSpeed");
    if (!select) {
      return undefined;
    }
    const options = (select.attributes.options as string[] | undefined) ?? [];
    if (!options.length) {
      return undefined;
    }
    const current = isKnownState(select) ? select.state : undefined;
    const off = !online || !active || !isKnownState(select);
    const hass = this.hass!;
    const note = !online
      ? localize(`${P}.why_offline`)
      : !active
        ? localize(`${P}.why_speed_idle`)
        : current
          ? localize(`${P}.speed_runs_at`, {
              speed: hass.formatEntityState(select, current),
              share: SPEED_SHARE[current] ?? "",
            })
          : "";
    return {
      summary:
        off || !current
          ? localize(`${P}.not_printing`)
          : hass.formatEntityState(select, current),
      content: html`<div
          class=${classMap({ seg: true, off })}
          role="radiogroup"
          aria-label=${localize(`${P}.printing_speed`)}
        >
          ${options.map(
            (option) =>
              html`<button
                class=${classMap({ sel: option === current })}
                role="radio"
                aria-checked=${option === current ? "true" : "false"}
                ?disabled=${off}
                @click=${this._selectHandler("printingSpeed", option, current)}
              >
                ${hass.formatEntityState(select, option)}
              </button>`
          )}
        </div>
        ${note ? this._why(note) : nothing}`,
    };
  }

  // ----- Temperature

  private _tempRows(online: boolean, localize: L): TempRow[] {
    const e = this._entities!;
    const activeObj = this._state("activeNozzle");
    const activeSide = isKnownState(activeObj) ? activeObj.state : "left";
    const num = (field: Printer3DField) => {
      const stateObj = this._state(field);
      return {
        id: this._entities?.[field],
        target: stateNumber(stateObj),
        min: Number(stateObj?.attributes.min ?? 0),
        max: Number(stateObj?.attributes.max ?? 320),
      };
    };
    const reading = (field: Printer3DField) => {
      const stateObj = this._state(field);
      return {
        value: online ? stateNumber(stateObj) : stateNumber(stateObj),
        unit: stateObj?.attributes.unit_of_measurement as string | undefined,
      };
    };
    const rows: TempRow[] = [];
    const nozzleNum = num("setNozzleTarget");
    const dual = !!(e.leftNozzleTemp || e.rightNozzleTemp);
    const nozzleSides: {
      key: string;
      label: string;
      temp: Printer3DField;
      target: Printer3DField;
      side?: string;
    }[] = dual
      ? [
          {
            key: "left",
            label: localize(`${P}.left_nozzle`),
            temp: "leftNozzleTemp",
            target: "leftNozzleTarget",
            side: "left",
          },
          {
            key: "right",
            label: localize(`${P}.right_nozzle`),
            temp: "rightNozzleTemp",
            target: "rightNozzleTarget",
            side: "right",
          },
        ]
      : [
          {
            key: "nozzle",
            label: localize(`${P}.nozzle`),
            temp: "nozzleTemp",
            target: "nozzleTarget",
          },
        ];
    for (const side of nozzleSides) {
      if (!e[side.temp]) {
        continue;
      }
      const isActive = dual ? side.side === activeSide : true;
      const cur = reading(side.temp);
      // The integration has one nozzle target control, and it is for the
      // nozzle in use, so the other nozzle's row is shown but cannot be set.
      const canSet = !!nozzleNum.id && isActive;
      rows.push({
        key: side.key,
        label: side.label,
        active: dual && isActive,
        current: cur.value,
        unit: cur.unit,
        target: canSet
          ? nozzleNum.target
          : stateNumber(this._state(side.target)),
        setter: canSet ? nozzleNum.id : undefined,
        min: nozzleNum.min,
        max: nozzleNum.max,
        kind: "nozzle",
        why:
          dual && !isActive && nozzleNum.id
            ? localize(`${P}.why_inactive_nozzle`)
            : undefined,
      });
    }
    const bedNum = num("setBedTarget");
    if (e.bedTemp && bedNum.id) {
      const cur = reading("bedTemp");
      rows.push({
        key: "bed",
        label: localize(`${P}.bed`),
        active: false,
        current: cur.value,
        unit: cur.unit,
        target: bedNum.target,
        setter: bedNum.id,
        min: bedNum.min,
        max: bedNum.max || 120,
        kind: "bed",
      });
    }
    const chamberNum = num("setChamberTarget");
    if (e.chamberTemp && chamberNum.id) {
      const cur = reading("chamberTemp");
      rows.push({
        key: "chamber",
        label: localize(`${P}.chamber`),
        active: false,
        current: cur.value,
        unit: cur.unit,
        target: chamberNum.target,
        setter: chamberNum.id,
        min: chamberNum.min,
        max: chamberNum.max || 65,
        kind: "chamber",
      });
    }
    return rows;
  }

  private _tempGroup(ctx: { online: boolean; active: boolean; localize: L }) {
    const { online, localize } = ctx;
    const hass = this.hass!;
    const rows = this._tempRows(online, localize);
    if (!rows.length) {
      return undefined;
    }
    const nozzleMax = Math.max(
      0,
      ...rows.filter((r) => r.kind === "nozzle").map((r) => r.target ?? 0)
    );
    const bed = rows.find((r) => r.kind === "bed")?.target ?? 0;
    const summary =
      nozzleMax <= 0 && bed <= 0
        ? localize(`${P}.all_off`)
        : localize(`${P}.temp_summary`, {
            nozzle:
              nozzleMax > 0
                ? formatTemperature(hass, nozzleMax, rows[0].unit)
                : localize(`${P}.off`),
            bed:
              bed > 0
                ? formatTemperature(
                    hass,
                    bed,
                    rows.find((r) => r.kind === "bed")?.unit
                  )
                : localize(`${P}.off`),
          });
    return {
      summary,
      content: html`${rows.map((row) => this._renderTempRow(row, online, localize))}`,
    };
  }

  private _renderTempRow(row: TempRow, online: boolean, localize: L) {
    const hass = this.hass!;
    const target = row.target ?? 0;
    const trend = temperatureTrend(
      row.current,
      row.setter || row.target !== undefined ? target : undefined,
      {
        coolAbove: 2,
      }
    );
    const disabled = !online || !row.setter;
    const label = row.label.toLowerCase();
    const now =
      row.current === undefined
        ? localize(`${P}.no_reading`)
        : !online
          ? localize(`${P}.last_seen`, {
              value: formatTemperature(hass, row.current, row.unit),
            })
          : trend === "heating" ||
              trend === "cooling" ||
              trend === "at_target" ||
              trend === "target_off_cooling"
            ? localize(`${P}.now_trend`, {
                value: formatTemperature(hass, row.current, row.unit),
                trend: localize(
                  `${P}.trend_${trend === "target_off_cooling" ? "cooling" : trend}`
                ),
              })
            : localize(`${P}.now`, {
                value: formatTemperature(hass, row.current, row.unit),
              });
    const down = row.setter
      ? stepTarget(row.kind, target, -1, row.min, row.max)
      : target;
    const up = row.setter
      ? stepTarget(row.kind, target, 1, row.min, row.max)
      : target;
    const downOff = disabled || target <= 0;
    const upOff = disabled || target >= row.max;
    return html`<div class="trow">
      <span class="grow">
        <span class="tnm"
          ><span class="ellipsis">${row.label}</span>${
            row.active && online
              ? html`<span class="atag">${localize(`${P}.active`)}</span>`
              : nothing
          }</span
        >
        <span class="sub tnow">
          ${
            online && trend !== "none" && trend !== "target_off"
              ? html`<ha-svg-icon
                  class=${classMap({ mk: true, [trend]: true })}
                  .path=${TREND_ICON[trend]}
                ></ha-svg-icon>`
              : nothing
          }
          <span class="ellipsis">${now}</span>
        </span>
        ${row.why && online ? html`<span class="sub">${row.why}</span>` : nothing}
      </span>
      <div
        class="stepper"
        role="group"
        aria-label=${localize(`${P}.target_for`, { name: label })}
      >
        <button
          class="sb"
          aria-label=${localize(`${P}.lower_target`, { name: label, step: 5 })}
          ?disabled=${downOff}
          @click=${this._targetHandler(row.setter, down)}
        >
          <ha-svg-icon .path=${mdiMinus}></ha-svg-icon>
        </button>
        <output
          class=${classMap({ sv: true, off: target <= 0 || disabled })}
          aria-live="polite"
          >${
            target > 0 && online
              ? formatTemperature(hass, target, row.unit)
              : localize(`${P}.off`)
          }</output
        >
        <button
          class="sb"
          aria-label=${
            target <= 0
              ? localize(`${P}.set_target`, {
                  name: label,
                  value: formatTemperature(hass, up, row.unit),
                })
              : localize(`${P}.raise_target`, { name: label, step: 5 })
          }
          ?disabled=${upOff}
          @click=${this._targetHandler(row.setter, up)}
        >
          <ha-svg-icon .path=${mdiPlus}></ha-svg-icon>
        </button>
      </div>
    </div>`;
  }

  private _setTarget(entityId: string | undefined, value: number) {
    if (!entityId) {
      return;
    }
    this.hass?.callService("number", "set_value", {
      entity_id: entityId,
      value,
    });
  }

  // ----- Fans

  private _fansGroup(ctx: { online: boolean; localize: L }) {
    const { online, localize } = ctx;
    const fans = FANS.filter((fan) => this._state(fan.field));
    if (!fans.length) {
      return undefined;
    }
    const percentOf = (stateObj: HassEntity): number =>
      stateObj.state === "on"
        ? Math.round(Number(stateObj.attributes.percentage ?? 100))
        : 0;
    const onCount = fans.filter(
      (fan) => percentOf(this._state(fan.field)!) > 0
    ).length;
    return {
      summary: onCount
        ? localize(`${P}.n_of_m_on`, { on: onCount, total: fans.length })
        : localize(`${P}.all_off`),
      content: html`${fans.map((fan) => {
        const stateObj = this._state(fan.field)!;
        const pct = percentOf(stateObj);
        const disabled = !online || !isKnownState(stateObj);
        const name = localize(`${P}.${fan.key}`);
        return html`<div class="frow">
          <span class="fnm"
            ><span class="tnm ellipsis">${name}</span
            ><span class="sub"
              >${pct ? `${pct}%` : localize(`${P}.off`)}</span
            ></span
          >
          <div class="fct">
            <ha-slider
              labeled
              min="0"
              max="100"
              step="10"
              .value=${pct}
              ?disabled=${disabled}
              aria-label=${localize(`${P}.fan_speed`, { name: name.toLowerCase() })}
              @change=${this._fanSliderHandler(fan.field, pct)}
            ></ha-slider>
            <ha-switch
              .checked=${pct > 0}
              ?disabled=${disabled}
              aria-label=${name}
              @change=${this._fanSwitchHandler(fan.field, pct)}
            ></ha-switch>
          </div>
        </div>`;
      })}
      ${!online ? this._why(localize(`${P}.why_offline`)) : nothing}`,
    };
  }

  private _setFan(field: Printer3DField, value: number, before: number) {
    const id = this._entities?.[field];
    if (!id) {
      return;
    }
    if (value > 0) {
      this._fanLast[id] = value;
      this._call("fan", "turn_on", field, { percentage: value });
    } else {
      // A drag that ends at zero keeps the speed from before it.
      if (before > 0) {
        this._fanLast[id] = before;
      }
      this._call("fan", "turn_off", field);
    }
  }

  private _switchFan(field: Printer3DField, on: boolean, current: number) {
    const id = this._entities?.[field];
    if (!id) {
      return;
    }
    if (on) {
      this._call("fan", "turn_on", field, {
        percentage: this._fanLast[id] || 100,
      });
    } else {
      if (current > 0) {
        this._fanLast[id] = current;
      }
      this._call("fan", "turn_off", field);
    }
  }

  // ----- Lights

  private _lightsGroup(ctx: { online: boolean; localize: L }) {
    const { online, localize } = ctx;
    const lights: { field: Printer3DField; name: string; icon: string }[] = [
      {
        field: "chamberLight",
        name: localize(`${P}.chamber_light`),
        icon: mdiLightbulbOutline,
      },
      {
        field: "heatbedLight",
        name: localize(`${P}.heatbed_light`),
        icon: mdiBedOutline,
      },
    ];
    const present = lights.filter((light) => this._state(light.field));
    if (!present.length) {
      return undefined;
    }
    const on = present.filter(
      (light) => this._state(light.field)!.state === "on"
    ).length;
    return {
      summary: on
        ? localize(`${P}.n_of_m_on`, { on, total: present.length })
        : localize(`${P}.all_off`),
      content: html`<div class="tiles">
          ${present.map((light) => {
            const stateObj = this._state(light.field)!;
            const isOn = stateObj.state === "on";
            const disabled = !online || !isKnownState(stateObj);
            return html`<button
              class=${classMap({ lt: true, on: isOn && !disabled })}
              role="switch"
              aria-label=${light.name}
              aria-checked=${isOn ? "true" : "false"}
              ?disabled=${disabled}
              @click=${this._callHandler("light", "toggle", light.field)}
            >
              <ha-svg-icon .path=${light.icon}></ha-svg-icon>
              <span class="grow"
                ><span class="tnm ellipsis">${light.name}</span
                ><span class="sub"
                  >${isOn ? localize(`${P}.on`) : localize(`${P}.off_state`)}</span
                ></span
              >
            </button>`;
          })}
        </div>
        ${!online ? this._why(localize(`${P}.why_offline`)) : nothing}`,
    };
  }

  // ----- More

  private _moreGroup(ctx: { online: boolean; localize: L }) {
    const { online, localize } = ctx;
    const hass = this.hass!;
    const e = this._entities!;
    const airduct = this._state("airductMode");
    const airOptions =
      (airduct?.attributes.options as string[] | undefined) ?? [];
    const switches: { field: Printer3DField; name: string; icon: string }[] = [
      { field: "camera", name: localize(`${P}.camera`), icon: mdiVideo },
      {
        field: "promptSound",
        name: localize(`${P}.prompt_sound`),
        icon: mdiVolumeHigh,
      },
    ];
    const presentSwitches = switches.filter((item) => this._state(item.field));
    const hasAirduct = !!airduct && airOptions.length > 0;
    const buttons: { field: Printer3DField; name: string; icon: string }[] = [
      ...(e.buzzerSilence
        ? [
            {
              field: "buzzerSilence" as const,
              name: localize(`${P}.silence_buzzer`),
              icon: mdiBellOff,
            },
          ]
        : []),
      ...(e.refresh
        ? [
            {
              field: "refresh" as const,
              name: localize(`${P}.force_refresh`),
              icon: mdiRefresh,
            },
          ]
        : []),
      ...(e.rackRaise
        ? [
            {
              field: "rackRaise" as const,
              name: localize(`${P}.raise_rack`),
              icon: mdiArrowUp,
            },
          ]
        : []),
      ...(e.rackLower
        ? [
            {
              field: "rackLower" as const,
              name: localize(`${P}.lower_rack`),
              icon: mdiArrowDown,
            },
          ]
        : []),
    ];
    if (!hasAirduct && !presentSwitches.length && !buttons.length) {
      return undefined;
    }
    const airCurrent = isKnownState(airduct) ? airduct.state : undefined;
    const airOff = !online || !isKnownState(airduct);
    return {
      summary:
        hasAirduct && airCurrent
          ? localize(`${P}.airduct_summary`, {
              mode: hass.formatEntityState(airduct!, airCurrent),
            })
          : "",
      content: html`${
        hasAirduct
          ? html`<div class="mrow">
              <span class="grow"
                ><span class="tnm"
                  ><ha-svg-icon .path=${mdiAirFilter}></ha-svg-icon
                  >${localize(`${P}.airduct_mode`)}</span
                ></span
              >
              <div
                class=${classMap({ seg: true, small: true, off: airOff })}
                role="radiogroup"
                aria-label=${localize(`${P}.airduct_mode`)}
              >
                ${airOptions.map(
                  (option) =>
                    html`<button
                      class=${classMap({ sel: option === airCurrent })}
                      role="radio"
                      aria-checked=${option === airCurrent ? "true" : "false"}
                      ?disabled=${airOff}
                      @click=${this._selectHandler("airductMode", option, airCurrent)}
                    >
                      ${hass.formatEntityState(airduct!, option)}
                    </button>`
                )}
              </div>
            </div>`
          : nothing
      }
      ${presentSwitches.map((item) => {
        const stateObj = this._state(item.field)!;
        const disabled = !online || !isKnownState(stateObj);
        return html`<label class=${classMap({ swrow: true, off: disabled })}>
          <ha-svg-icon .path=${item.icon}></ha-svg-icon>
          <span class="grow">${item.name}</span>
          <ha-switch
            .checked=${stateObj.state === "on"}
            ?disabled=${disabled}
            @change=${this._callHandler("switch", "toggle", item.field)}
          ></ha-switch>
        </label>`;
      })}
      ${
        buttons.length
          ? html`<div class="acts">
              ${buttons.map(
                (item) =>
                  html`<ha-button
                    appearance="outlined"
                    ?disabled=${!online}
                    @click=${this._callHandler("button", "press", item.field)}
                    ><ha-svg-icon slot="start" .path=${item.icon}></ha-svg-icon
                    >${item.name}</ha-button
                  >`
              )}
            </div>`
          : nothing
      }
      ${!online ? this._why(localize(`${P}.why_offline`)) : nothing}`,
    };
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
        gap: var(--ha-space-2, 8px);
        padding: var(--ha-space-4, 16px) var(--ha-space-4, 16px)
          var(--ha-space-2, 8px);
        box-sizing: border-box;
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
      label:focus-within {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }
      button[disabled] {
        cursor: not-allowed;
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
        padding-bottom: var(--ha-space-3, 12px);
      }
      .title {
        margin: 0;
        font-size: var(--ha-font-size-l);
        font-weight: var(--ha-font-weight-medium);
      }
      .pico {
        width: 40px;
        height: 40px;
        border-radius: 14px;
        display: grid;
        place-items: center;
        background: var(--printer-primary-container);
        color: var(--primary-text-color);
        flex: none;
        position: relative;
      }
      .pico.gone {
        background: var(--printer-tile);
        color: var(--secondary-text-color);
      }
      .pico .odot {
        position: absolute;
        inset-inline-end: -2px;
        bottom: -2px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: var(--success-color);
        box-shadow: 0 0 0 2px var(--card-background-color);
      }
      .pico.gone .odot {
        background: var(--secondary-text-color);
      }
      .chip {
        flex: none;
        max-width: 150px;
      }
      .groups {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
        gap: 0 var(--ha-space-4, 16px);
        align-items: start;
      }
      .group {
        display: flex;
        flex-direction: column;
        box-shadow: 0 -1px 0 var(--divider-color);
      }
      h3 {
        margin: 0;
        font: inherit;
      }
      .ghead {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 48px;
        width: 100%;
        color: var(--secondary-text-color);
        border-radius: var(--ha-border-radius-lg, 12px);
      }
      .ghead ha-svg-icon:first-child {
        --mdc-icon-size: 20px;
      }
      .gl {
        font-size: var(--ha-font-size-m);
        font-weight: var(--ha-font-weight-medium);
        color: var(--primary-text-color);
        flex: none;
      }
      .gs {
        flex: 1;
        text-align: end;
        font-size: var(--ha-font-size-s);
      }
      .cv {
        transition: transform var(--ha-animation-duration-fast, 0.2s) ease;
      }
      .cv.open {
        transform: rotate(180deg);
      }
      .gbody {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2, 8px);
        padding: 0 0 14px;
      }
      .why {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2, 8px);
        margin: 0;
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
      }
      .why ha-svg-icon {
        --mdc-icon-size: 18px;
        flex: none;
      }
      .why.block {
        align-items: flex-start;
        padding: var(--ha-space-3, 12px);
        border-radius: var(--ha-border-radius-xl, 16px);
        background: var(--printer-tile);
        margin-bottom: var(--ha-space-2, 8px);
      }
      .print-row {
        display: flex;
        gap: var(--ha-space-2, 8px);
      }
      .print-row ha-button {
        flex: 1;
        min-width: 0;
      }
      ha-button {
        --ha-button-height: 48px;
      }
      .seg {
        display: flex;
        border-radius: var(--ha-border-radius-pill, 999px);
        box-shadow: inset 0 0 0 1px var(--outline-color, var(--divider-color));
        overflow: hidden;
      }
      .seg button {
        flex: 1;
        min-width: 0;
        min-height: 48px;
        display: grid;
        place-items: center;
        font-size: var(--ha-font-size-s);
        font-weight: var(--ha-font-weight-medium);
        box-shadow: inset -1px 0 0 var(--divider-color);
        transition: background-color 0.2s;
      }
      .seg button:last-child {
        box-shadow: none;
      }
      .seg button.sel {
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
      }
      .seg.off button {
        color: var(--disabled-text-color);
      }
      .seg.off button.sel {
        background: var(--printer-tile);
        color: var(--secondary-text-color);
      }
      .seg.small {
        width: 188px;
        flex: none;
      }
      .trow {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3, 12px);
        min-height: 52px;
      }
      .tnm {
        font-size: var(--ha-font-size-m);
        display: flex;
        align-items: center;
        gap: var(--ha-space-2, 8px);
        min-width: 0;
      }
      .tnm ha-svg-icon {
        --mdc-icon-size: 20px;
        color: var(--secondary-text-color);
      }
      .tnow {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .atag {
        padding: 1px 8px;
        border-radius: 10px;
        background: var(--printer-primary-container);
        color: var(--primary-text-color);
        font-size: var(--ha-font-size-xs, 11px);
      }
      .mk {
        --mdc-icon-size: 16px;
      }
      .mk.heating {
        color: var(--printer-amber);
      }
      .mk.cooling,
      .mk.target_off_cooling {
        color: var(--primary-color);
      }
      .mk.at_target {
        color: var(--success-color);
      }
      .stepper {
        display: flex;
        align-items: center;
        background: var(--printer-tile);
        border-radius: var(--ha-border-radius-pill, 999px);
        flex: none;
      }
      .sb {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        color: var(--primary-color);
        transition: background-color 0.2s;
      }
      .sb:hover:not([disabled]) {
        background: var(--divider-color);
      }
      .sb[disabled] {
        color: var(--disabled-text-color);
      }
      .sv {
        min-width: 62px;
        text-align: center;
        font-size: var(--ha-font-size-l);
        font-weight: var(--ha-font-weight-bold, 600);
        font-variant-numeric: tabular-nums;
      }
      .sv.off {
        color: var(--secondary-text-color);
        font-weight: var(--ha-font-weight-normal);
      }
      .frow {
        display: flex;
        flex-direction: column;
        padding-top: 6px;
      }
      .fnm {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--ha-space-3, 12px);
        min-width: 0;
      }
      .fct {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .fct ha-slider {
        flex: 1;
        min-width: 0;
        min-height: 48px;
      }
      .fct ha-switch {
        flex: none;
        margin-inline: 8px;
      }
      .tiles {
        display: flex;
        gap: var(--ha-space-2, 8px);
      }
      .lt {
        flex: 1;
        min-width: 0;
        min-height: 64px;
        border-radius: 18px;
        padding: 8px 14px;
        display: flex;
        align-items: center;
        gap: var(--ha-space-3, 12px);
        background: var(--printer-tile);
        color: var(--secondary-text-color);
        transition:
          background-color 0.2s,
          color 0.2s;
      }
      .lt .tnm {
        color: var(--primary-text-color);
      }
      .lt.on {
        background: var(--printer-primary-container);
        color: var(--primary-text-color);
      }
      .lt.on .sub {
        color: inherit;
      }
      .mrow,
      .swrow {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3, 12px);
        min-height: 48px;
      }
      .swrow {
        cursor: pointer;
        color: var(--primary-text-color);
      }
      .swrow.off {
        cursor: not-allowed;
        color: var(--secondary-text-color);
      }
      .swrow > ha-svg-icon {
        color: var(--secondary-text-color);
      }
      .acts {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-2, 8px);
        padding-top: 4px;
      }
      .acts ha-button {
        flex: 1 1 140px;
        min-width: 0;
      }
      ha-card.offline .pico {
        opacity: 0.8;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-printer-controls-card": HuiPrinterControlsCard;
  }
}
