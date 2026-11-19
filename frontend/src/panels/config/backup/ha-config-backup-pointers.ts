import {
  mdiArchiveOutline,
  mdiLinkVariant,
  mdiLinkVariantOff,
  mdiLinkVariantRemove,
} from "@mdi/js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { resolveTimeZone } from "../../../common/datetime/resolve-time-zone";
import { fireEvent } from "../../../common/dom/fire_event";
import { LanguageModeController } from "../../../common/language-mode/language-mode-controller";
import type { PartText } from "../../../common/language-mode/language-mode";
import { navigate } from "../../../common/navigate";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-button-toggle-group";
import "../../../components/ha-spinner";
import "../../../components/ha-svg-icon";
import "../../../components/ha-switch";
import type { BackupContent } from "../../../data/backup";
import { formatMarkedTime } from "../../../data/backup_delete_proof";
import type {
  BackupPointerInfo,
  KeepWhole,
  PointerEvent,
  PointerPass,
  PointerRow,
  PointerTransfer,
} from "../../../data/backup_pointer";
import {
  bringBackBackup,
  canRestore,
  checkBackupPointers,
  fetchBackupPointerInfo,
  isCheckProblem,
  KEEP_WHOLE_CHOICES,
  keptReason,
  passResult,
  pointerErrorReason,
  pointerRisk,
  pointerRows,
  rowsOnThisSystem,
  runBackupPointerPass,
  setBackupPointerSettings,
  subscribeBackupPointerTransfer,
  transferPercent,
} from "../../../data/backup_pointer";
import "../../../layouts/hass-subpage";
import { SubscribeMixin } from "../../../mixins/subscribe-mixin";
import type { HomeAssistant } from "../../../types";
import { bytesToString } from "../../../util/bytes-to-string";
import { showToast } from "../../../util/toast";

const RULES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

const PREFIX = "ui.panel.config.backup.pointers";

/** Several changes in a row (one per backup a pass makes a pointer) read once. */
const REFRESH_DELAY_MS = 400;

/** The result line of the last pass: counts, or why it did not finish. */
type RunResult =
  | { kind: "done"; at: number; outcomes: Record<string, number | string> }
  | { kind: "error"; at: number; error: string };

@customElement("ha-config-backup-pointers")
class HaConfigBackupPointers extends SubscribeMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: false }) public backups: BackupContent[] = [];

  @state() private _info?: BackupPointerInfo;

  @state() private _error?: string;

  @state() private _selected?: string;

  @state() private _busy = false;

  @state() private _transfer: PointerTransfer | null = null;

  @state() private _restoring?: string;

  @state() private _transferError?: string;

  /** The backup whose bring back was asked for, until the first progress arrives. */
  @state() private _starting?: string;

  @state() private _pass?: PointerPass;

  /** "Save space now" is waiting for its answer. */
  @state() private _running = false;

  @state() private _runResult?: RunResult;

  private _revision?: number;

  private _refreshTimer?: ReturnType<typeof setTimeout>;

  private _lang = new LanguageModeController(this);

  public hassSubscribe(): Promise<UnsubscribeFunc>[] {
    return [
      subscribeBackupPointerTransfer(this.hass, (event) =>
        this._onPointerEvent(event)
      ),
    ];
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = undefined;
    }
  }

  protected firstUpdated(changedProps: PropertyValues<this>): void {
    super.firstUpdated(changedProps);
    this._fetch();
  }

  protected updated(changedProps: PropertyValues<this>): void {
    super.updated(changedProps);
    if (changedProps.has("backups") && this.hasUpdated && this._info) {
      this._fetch();
    }
  }

  // The page follows the backend: a pass that starts, makes pointers or ends,
  // and a bring back that moves on, are shown without a reload.
  private _onPointerEvent(event: PointerEvent): void {
    const before = this._transfer;
    this._transfer = event.transfer;
    if (event.transfer?.state === "in_progress") {
      this._starting = undefined;
    }
    const passBefore = this._pass;
    if (event.pass) {
      this._pass = event.pass;
      // A pass that ended while the page was open says what it did, also when
      // it started by itself after the setting was turned on.
      if (passBefore?.running && !event.pass.running && !this._running) {
        this._runResult = {
          kind: "done",
          at: Date.now(),
          outcomes: event.pass.outcomes,
        };
      }
    }
    const transferEnded =
      before?.state === "in_progress" &&
      event.transfer?.state !== "in_progress";
    const revisionChanged =
      event.revision !== undefined &&
      this._revision !== undefined &&
      event.revision !== this._revision;
    if (event.revision !== undefined) {
      this._revision = event.revision;
    }
    if (transferEnded || revisionChanged) {
      this._scheduleRefresh();
    }
  }

  // Reads the pointers again and asks the backups page to read the backups
  // again, so the rows and the saved figure follow a change.
  private _scheduleRefresh(): void {
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
    }
    this._refreshTimer = setTimeout(() => {
      this._refreshTimer = undefined;
      fireEvent(this, "ha-refresh-backup-info");
      this._fetch();
    }, REFRESH_DELAY_MS);
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.hass.localize, `${PREFIX}.${key}`, values);
  }

  // A sentence with another string inside it, built once per language.
  private _compose(build: (part: PartText) => string): string {
    return this._lang.compose(this.hass.localize, build);
  }

  private _reasonText(
    key: string,
    reasonKey: string,
    values?: Record<string, string | number>
  ): string {
    return this._compose((part) =>
      part(`${PREFIX}.${key}`, {
        ...values,
        reason: part(`${PREFIX}.${reasonKey}`),
      })
    );
  }

  private _time(iso: string): string {
    return formatMarkedTime(
      iso,
      this.hass.locale.language,
      resolveTimeZone(this.hass.locale.time_zone, this.hass.config.time_zone)
    );
  }

  private async _fetch(): Promise<void> {
    try {
      const info = await fetchBackupPointerInfo(this.hass);
      this._info = info;
      if (info.pass) {
        this._pass = info.pass;
      }
      if (info.revision !== undefined && this._revision === undefined) {
        this._revision = info.revision;
      }
      this._error = undefined;
    } catch (err: any) {
      this._error = this._t("load_error", { error: err?.message || err });
    }
  }

  protected render() {
    return html`
      <hass-subpage
        back-path="/config/backup/overview"
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${this._t("title")}
      >
        <div class="page">
          <header class="intro">
            <h1>${this._t("title")}</h1>
            <p>${this._t("summary")}</p>
          </header>
          ${
            this._error
              ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
              : nothing
          }
          ${
            this._info
              ? this._renderColumns(this._info)
              : this._error
                ? nothing
                : html`<div class="loading"><ha-spinner></ha-spinner></div>`
          }
        </div>
      </hass-subpage>
    `;
  }

  private _renderColumns(info: BackupPointerInfo) {
    const rows = rowsOnThisSystem(pointerRows(this.backups, info));
    const selected =
      rows.find((row) => row.backup_id === this._selected && row.pointer) ??
      rows.find((row) => row.pointer);
    return html`
      <div class="columns">
        <section class="column" aria-label=${this._t("section_list")}>
          <div class="eyebrow">${this._t("section_list")}</div>
          ${this._renderSetting(info)} ${this._renderSaved(info)}
          ${this._renderList(rows, selected)}
        </section>
        <section class="column" aria-label=${this._t("detail_title")}>
          <div class="eyebrow">${this._t("detail_title")}</div>
          ${this._renderDetail(selected)} ${this._renderTransfer()}
          ${this._renderKept(rows)}
        </section>
        <section class="column" aria-label=${this._t("rules_title")}>
          <div class="eyebrow">${this._t("rules_title")}</div>
          <div class="card rules">
            ${RULES.map(
              (rule) =>
                html`<div class="rule">
                  <span class="rule-number">${rule}</span>
                  <span>${this._t(`rule_${rule}`)}</span>
                </div>`
            )}
          </div>
        </section>
      </div>
    `;
  }

  private _renderSetting(info: BackupPointerInfo) {
    return html`
      <div class="card">
        <div class="row">
          <div class="text">
            <span class="title" id="setting-title"
              >${this._t("setting_title")}</span
            >
            <span class="sub">${this._t("setting_description")}</span>
          </div>
          <ha-switch
            .accessibleLabel=${this._t("setting_title")}
            .checked=${info.settings.enabled}
            .disabled=${this._busy || !info.readable || (!info.available && !info.settings.enabled)}
            @change=${this._toggle}
          ></ha-switch>
        </div>
        <div class="divider"></div>
        <div class="row">
          <span class="text" id="keep-whole"
            >${this._t("keep_whole_label")}</span
          >
          <ha-button-toggle-group
            size="s"
            aria-labelledby="keep-whole"
            .buttons=${KEEP_WHOLE_CHOICES.map((choice) => ({
              value: String(choice),
              label: this._t(`keep_whole_${choice}`),
            }))}
            .active=${String(info.settings.keep_whole)}
            .disabled=${this._busy || !info.readable}
            @value-changed=${this._keepWholeChanged}
          ></ha-button-toggle-group>
        </div>
        ${
          !info.readable
            ? html`<ha-alert alert-type="error"
                >${this._t("unreadable")}</ha-alert
              >`
            : !info.available
              ? html`<ha-alert alert-type="info"
                  >${this._t("not_available")}</ha-alert
                >`
              : nothing
        }
        ${
          info.settings.enabled
            ? html`<div class="actions">
                <ha-button
                  appearance="plain"
                  .disabled=${this._busy}
                  @click=${this._checkNow}
                  >${this._t("check_now")}</ha-button
                >
                <ha-button
                  appearance="filled"
                  .disabled=${this._busy || !!this._pass?.running}
                  .loading=${this._running}
                  @click=${this._runNow}
                  >${this._t("run_now")}</ha-button
                >
              </div>`
            : nothing
        }
      </div>
    `;
  }

  private _renderSaved(info: BackupPointerInfo) {
    const risk = pointerRisk(info.summary);
    return html`
      <div class="card note ok" role="status">
        <span class="dot" aria-hidden="true"></span>
        <div>
          <div class="title">
            ${this._t("saved_title", {
              size: bytesToString(info.summary.saved_bytes, 1),
            })}
          </div>
          <div class="sub">
            ${
              info.summary.pointers
                ? this._t("saved_count", {
                    count: info.summary.pointers,
                    whole: info.summary.whole_here,
                  })
                : this._t("saved_none")
            }
          </div>
        </div>
      </div>
      ${this._renderPass(info)}
      ${
        risk === "none"
          ? nothing
          : html`<ha-alert alert-type="warning"
              >${this._t(risk === "all" ? "risk_all" : "risk_some")}</ha-alert
            >`
      }
    `;
  }

  // While a pass runs, or waits to start, the page says so; once it ends, one
  // plain line says what it did, or why nothing changed.
  private _renderPass(info: BackupPointerInfo) {
    const pass = this._pass;
    if (pass?.running || this._running) {
      return html`<div class="card progress" role="status" aria-live="polite">
        <div class="title">${this._t("working_title")}</div>
        <div class="sub">
          ${
            pass?.started
              ? this._t("working_since", { time: this._time(pass.started) })
              : this._t("working_text")
          }
        </div>
        <div
          class="bar indeterminate"
          role="progressbar"
          aria-label=${this._t("working_title")}
        >
          <div class="fill"></div>
        </div>
      </div>`;
    }
    const result = this._runResult;
    if (result) {
      return html`<div
        class=${classMap({
          card: true,
          note: true,
          warn: result.kind === "error",
        })}
        role="status"
        aria-live="polite"
      >
        <span class="dot" aria-hidden="true"></span>
        <div>
          <div class="title">
            ${this._t("result_title", {
              time: this._time(new Date(result.at).toISOString()),
            })}
          </div>
          <div class="sub">${this._resultText(result)}</div>
        </div>
      </div>`;
    }
    if (info.settings.enabled && pass?.due) {
      return html`<div class="card empty" role="status">
        ${this._t("due_text", { time: this._time(pass.due) })}
      </div>`;
    }
    return nothing;
  }

  private _resultText(result: RunResult): string {
    if (result.kind === "error") {
      return this._t("result_failed", { error: result.error });
    }
    const { made, kept } = passResult(result.outcomes);
    if (!made && !kept.length) {
      return this._t("result_nothing");
    }
    return this._compose((part) => {
      const lines = [part(`${PREFIX}.run_done`, { pointers: made })];
      if (kept.length) {
        lines.push(
          part(`${PREFIX}.result_kept`, {
            reasons: kept
              .map((item) =>
                part(`${PREFIX}.result_kept_part`, {
                  reason: part(`${PREFIX}.reasons.${item.reason}`),
                  count: item.count,
                })
              )
              .join(part(`${PREFIX}.result_kept_separator`)),
          })
        );
      }
      return lines.join(" ");
    });
  }

  private _renderList(rows: PointerRow[], selected?: PointerRow) {
    if (!rows.length) {
      return html`<div class="card empty">${this._t("empty")}</div>`;
    }
    return html`
      <div class="card list" role="list">
        ${rows.map((row, index) => {
          const icon =
            row.state === "whole"
              ? mdiArchiveOutline
              : row.state === "missing"
                ? mdiLinkVariantRemove
                : row.pointer?.check_state === "unknown"
                  ? mdiLinkVariantOff
                  : mdiLinkVariant;
          const sub =
            row.state === "whole"
              ? this._t(row.in_registry ? "row_whole_in_registry" : "row_whole")
              : row.state === "missing"
                ? this._t("row_missing")
                : row.pointer?.check_state === "unknown"
                  ? this._t("row_unknown")
                  : this._t("row_pointer", {
                      size: bytesToString(row.size, 0),
                      here: bytesToString(row.pointer?.stored_size ?? 0, 0),
                    });
          const sizeText =
            row.state === "whole" ? ` · ${bytesToString(row.size, 0)}` : "";
          return html`
            ${index ? html`<div class="divider"></div>` : nothing}
            <div
              role="listitem"
              class=${classMap({
                row: true,
                clickable: !!row.pointer,
                selected: !!row.pointer && row === selected,
              })}
              tabindex=${row.pointer ? 0 : -1}
              data-id=${row.backup_id}
              @click=${row.pointer ? this._select : undefined}
              @keydown=${row.pointer ? this._selectKey : undefined}
            >
              <span class=${classMap({ tile: true, [row.state]: true })}
                ><ha-svg-icon .path=${icon}></ha-svg-icon
              ></span>
              <div class="text">
                <span class="title">${row.name}</span>
                <span
                  class=${classMap({ sub: true, danger: row.state === "missing" })}
                  ><span class="mono">${this._time(row.date)}</span>${sizeText}
                  · ${sub}</span
                >
              </div>
            </div>
          `;
        })}
      </div>
    `;
  }

  private _renderDetail(row?: PointerRow) {
    const pointer = row?.pointer;
    if (!row || !pointer) {
      return html`<div class="card empty">${this._t("detail_choose")}</div>`;
    }
    const checked = pointer.checked_at
      ? this._t(`detail_checked_${pointer.check_state}`, {
          time: this._time(pointer.checked_at),
        })
      : this._t("detail_checked_never");
    const busy =
      this._busy || !!this._starting || this._transfer?.state === "in_progress";
    return html`
      <div class="card">
        <div class="row line">
          <span class="label">${this._t("detail_here")}</span>
          <span class="value"
            >${this._t("detail_here_value", {
              size: bytesToString(pointer.stored_size, 0),
            })}</span
          >
        </div>
        <div class="divider"></div>
        <div class="row line">
          <span class="label">${this._t("detail_registry")}</span>
          <span class="value"
            >${this._t("detail_registry_value", {
              size: bytesToString(pointer.size, 0),
            })}</span
          >
        </div>
        <div class="divider"></div>
        <div class="row line">
          <span class="label">${this._t("detail_place")}</span>
          <span class="value">${pointer.place_name}</span>
        </div>
        <div class="divider"></div>
        <div class="row line">
          <span class="label">${this._t("detail_verified")}</span>
          <span class="value mono">${this._time(pointer.verified_at)}</span>
        </div>
        <div class="divider"></div>
        <div class="row line">
          <span class="label">${this._t("detail_checked")}</span>
          <span
            class=${classMap({
              value: true,
              mono: true,
              danger: pointer.check_state === "missing",
            })}
            >${checked}</span
          >
        </div>
      </div>
      ${
        canRestore(row)
          ? html`<div class="buttons">
                <ha-button
                  .disabled=${busy}
                  data-id=${row.backup_id}
                  @click=${this._restore}
                  >${this._t("restore")}</ha-button
                >
                <ha-button
                  appearance="outlined"
                  .disabled=${busy}
                  data-id=${row.backup_id}
                  @click=${this._bringBack}
                  >${this._t("bring_back")}</ha-button
                >
              </div>
              <p class="hint">${this._t("restore_hint")}</p>`
          : html`<ha-alert alert-type="error"
              >${this._t("not_restorable")}</ha-alert
            >`
      }
      <p class="hint">${this._t("check_scope")}</p>
    `;
  }

  private _renderTransfer() {
    const transfer = this._transfer;
    if (this._starting && transfer?.state !== "in_progress") {
      const backup = this._info?.pointers[this._starting];
      const date = backup ? this._time(backup.date) : this._starting;
      return html`<div class="card progress" role="status" aria-live="polite">
        <div class="title">
          ${this._t(
            this._restoring === this._starting
              ? "restoring_title"
              : "bringing_back_title",
            { date }
          )}
        </div>
        <div class="sub">${this._t("bring_back_starting")}</div>
        <div
          class="bar indeterminate"
          role="progressbar"
          aria-label=${this._t("bringing_back_title", { date })}
        >
          <div class="fill"></div>
        </div>
      </div>`;
    }
    if (!transfer && !this._transferError) {
      return nothing;
    }
    if (!transfer || transfer.state !== "in_progress") {
      return this._transferError
        ? html`<ha-alert alert-type="error">${this._transferError}</ha-alert>`
        : nothing;
    }
    const backup = this._info?.pointers[transfer.backup_id];
    const date = backup ? this._time(backup.date) : transfer.backup_id;
    const percent = transferPercent(transfer);
    const values = {
      time: this._time(transfer.started),
      done: bytesToString(transfer.bytes_done, 0),
      total: bytesToString(transfer.bytes_total, 0),
      part: transfer.parts_done,
      parts: transfer.parts_total,
    };
    return html`
      <div class="card progress" role="status" aria-live="polite">
        <div class="title">
          ${this._t(
            this._restoring === transfer.backup_id
              ? "restoring_title"
              : "bringing_back_title",
            { date }
          )}
        </div>
        <div class="sub">
          ${this._t(
            transfer.parts_total ? "progress" : "progress_no_parts",
            values
          )}
        </div>
        <div
          class="bar"
          role="progressbar"
          aria-label=${this._t("bringing_back_title", { date })}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow=${percent}
        >
          <div class="fill" style=${styleMap({ width: `${percent}%` })}></div>
        </div>
      </div>
    `;
  }

  private _renderKept(rows: PointerRow[]) {
    const problems = rows.filter(
      (row) => row.kept && isCheckProblem(keptReason(row.kept.reason))
    );
    return html`
      <div class="eyebrow">${this._t("kept_title")}</div>
      ${
        problems.length
          ? problems.map((row) => {
              const reason = keptReason(row.kept!.reason);
              return html`<div class="card note warn">
                <span class="dot" aria-hidden="true"></span>
                <div>
                  <div class="title">
                    ${this._reasonText("kept_heading", `reasons.${reason}`)}
                  </div>
                  <div class="sub">
                    ${row.name} ·
                    ${this._t("kept_at", { time: this._time(row.kept!.at) })}
                  </div>
                </div>
              </div>`;
            })
          : html`<div class="card empty">${this._t("kept_none")}</div>`
      }
    `;
  }

  private _select(ev: Event): void {
    this._selected = (ev.currentTarget as HTMLElement).dataset.id;
  }

  private _selectKey(ev: KeyboardEvent): void {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      this._select(ev);
    }
  }

  private async _save(
    settings: Parameters<typeof setBackupPointerSettings>[1]
  ): Promise<void> {
    this._busy = true;
    try {
      await setBackupPointerSettings(this.hass, settings);
    } catch (err: unknown) {
      showToast(this, {
        message: this._reasonText(
          "save_error",
          `transfer_reasons.${pointerErrorReason(err)}`
        ),
      });
    } finally {
      this._busy = false;
      await this._fetch();
    }
  }

  private _toggle(ev: Event): void {
    this._save({ enabled: (ev.target as HTMLInputElement).checked });
  }

  private _keepWholeChanged(ev: CustomEvent<{ value: string }>): void {
    this._save({ keep_whole: Number(ev.detail.value) as KeepWhole });
  }

  // Always ends with a result line: how many became pointers, or why none did.
  private async _runNow(): Promise<void> {
    this._busy = true;
    this._running = true;
    this._runResult = undefined;
    try {
      const { outcomes } = await runBackupPointerPass(this.hass);
      this._runResult = { kind: "done", at: Date.now(), outcomes };
    } catch (err: any) {
      this._runResult = {
        kind: "error",
        at: Date.now(),
        error: err?.message || String(err),
      };
    } finally {
      this._busy = false;
      this._running = false;
      fireEvent(this, "ha-refresh-backup-info");
      await this._fetch();
    }
  }

  private async _checkNow(): Promise<void> {
    this._busy = true;
    try {
      const { states } = await checkBackupPointers(this.hass);
      showToast(this, {
        message: this._t("check_done", {
          missing: Object.values(states).filter((s) => s === "missing").length,
        }),
      });
    } finally {
      this._busy = false;
      await this._fetch();
    }
  }

  private async _transferTo(backupId: string, restore: boolean): Promise<void> {
    this._transferError = undefined;
    this._restoring = restore ? backupId : undefined;
    this._starting = backupId;
    try {
      await bringBackBackup(this.hass, backupId);
    } catch (err: unknown) {
      this._transferError = this._reasonText(
        "transfer_failed",
        `transfer_reasons.${pointerErrorReason(err)}`
      );
      await this._fetch();
      return;
    } finally {
      this._restoring = undefined;
      this._starting = undefined;
    }
    fireEvent(this, "ha-refresh-backup-info");
    showToast(this, {
      message: this._t(restore ? "brought_back_restore" : "brought_back"),
    });
    await this._fetch();
    if (restore) {
      navigate(`/config/backup/details/${backupId}`);
    }
  }

  private _restore(ev: Event): void {
    this._transferTo((ev.currentTarget as HTMLElement).dataset.id!, true);
  }

  private _bringBack(ev: Event): void {
    this._transferTo((ev.currentTarget as HTMLElement).dataset.id!, false);
  }

  static styles = css`
    .page {
      box-sizing: border-box;
      max-width: 1240px;
      margin: 0 auto;
      padding: var(--ha-space-4) var(--ha-space-8) var(--ha-space-8);
    }
    :host([narrow]) .page {
      padding: var(--ha-space-2) var(--ha-space-4) var(--ha-space-6);
    }
    .intro h1 {
      margin: var(--ha-space-2) 0 var(--ha-space-1);
      font-family: var(--ha-font-family-heading, inherit);
      font-size: var(--ha-font-size-3xl);
      font-weight: var(--ha-font-weight-medium);
      line-height: var(--ha-line-height-condensed);
    }
    .intro p {
      margin: 0 0 var(--ha-space-5);
      color: var(--secondary-text-color);
    }
    .loading {
      display: flex;
      justify-content: center;
      padding: var(--ha-space-8);
    }
    .columns {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      align-items: start;
      gap: var(--ha-space-5);
    }
    .column {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
      min-width: 0;
    }
    .eyebrow {
      padding: var(--ha-space-2) var(--ha-space-1) 0;
      font-size: var(--ha-font-size-xs);
      font-weight: var(--ha-font-weight-bold);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
    }
    .card {
      box-sizing: border-box;
      padding: var(--ha-space-1) var(--ha-space-3);
      border-radius: var(--ha-border-radius-2xl);
      background: var(--card-background-color);
    }
    .card.empty {
      padding: var(--ha-space-3);
      color: var(--secondary-text-color);
    }
    .divider {
      height: 1px;
      background: var(--divider-color);
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      min-height: 56px;
      padding: var(--ha-space-1) 0;
      border-radius: var(--ha-border-radius-lg);
    }
    .row.line {
      min-height: 48px;
    }
    .row.clickable {
      cursor: pointer;
    }
    .row.clickable:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .row.selected .title {
      color: var(--primary-color);
    }
    .text {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .title {
      font-weight: var(--ha-font-weight-medium);
    }
    .sub,
    .hint {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .hint {
      margin: 0;
      padding: 0 var(--ha-space-1);
    }
    .danger {
      color: var(--error-color);
    }
    .mono {
      font-family: var(--ha-font-family-code, monospace);
    }
    .label {
      flex: 1;
      color: var(--secondary-text-color);
    }
    .value {
      font-weight: var(--ha-font-weight-medium);
      text-align: end;
    }
    .tile {
      display: flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: var(--ha-border-radius-lg);
      background: var(--secondary-background-color);
      color: var(--secondary-text-color);
      --mdc-icon-size: 18px;
    }
    .tile.pointer {
      color: var(--primary-color);
    }
    .tile.missing {
      color: var(--error-color);
    }
    .actions,
    .buttons {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
    }
    .actions {
      justify-content: flex-end;
      padding: var(--ha-space-2) 0;
    }
    .buttons ha-button {
      flex: 1;
    }
    .actions ha-button,
    .buttons ha-button {
      --ha-button-height: 48px;
      max-width: 100%;
    }
    ha-switch {
      flex: none;
      --ha-switch-min-touch-size: 48px;
    }
    .note {
      display: flex;
      gap: var(--ha-space-3);
      padding: var(--ha-space-3);
    }
    .note .dot {
      flex: none;
      width: 8px;
      height: 8px;
      margin-top: 6px;
      border-radius: 50%;
      background: var(--success-color);
    }
    .note.warn .dot {
      background: var(--warning-color);
    }
    .rules {
      padding: var(--ha-space-1) var(--ha-space-3);
    }
    .rule {
      display: flex;
      gap: var(--ha-space-3);
      padding: var(--ha-space-3) 0;
      border-bottom: 1px solid var(--divider-color);
    }
    .rule:last-child {
      border-bottom: none;
    }
    .rule-number {
      flex: none;
      width: 20px;
      font-family: var(--ha-font-family-code, monospace);
      color: var(--primary-color);
    }
    .progress {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
      padding: var(--ha-space-3);
    }
    .bar {
      height: 4px;
      overflow: hidden;
      border-radius: 2px;
      background: var(--divider-color);
    }
    .fill {
      height: 100%;
      border-radius: 2px;
      background: var(--primary-color);
    }
    /* No percentage is known: a short bar sweeps across. */
    .bar.indeterminate {
      position: relative;
    }
    .bar.indeterminate .fill {
      position: absolute;
      width: 34%;
      animation: pointer-sweep 1.6s ease-in-out infinite;
    }
    @keyframes pointer-sweep {
      from {
        left: -34%;
      }
      to {
        left: 100%;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .bar.indeterminate .fill {
        animation: none;
        left: 0;
        width: 100%;
        opacity: 0.5;
      }
    }
    ha-alert {
      display: block;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-backup-pointers": HaConfigBackupPointers;
  }
}
