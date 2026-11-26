import {
  mdiAlertCircle,
  mdiBackupRestore,
  mdiCheck,
  mdiCheckCircle,
  mdiEye,
  mdiEyeOff,
  mdiFileDocumentOutline,
  mdiInformation,
  mdiLoading,
  mdiUpload,
} from "@mdi/js";
import type { PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { consumeLocalize } from "../../../src/common/decorators/consume-context-entry";
import { modeText } from "../../../src/common/language-mode/language-mode";
import type {
  LandingPageKeys,
  LocalizeFunc,
} from "../../../src/common/translations/localize";
import { formatBytes } from "../../../src/common/file-drop/format-bytes";
import "../../../src/components/ha-alert";
import "../../../src/components/ha-button";
import "../../../src/components/ha-card";
import "../../../src/components/ha-icon-button";
import "../../../src/components/ha-svg-icon";
import "../../../src/components/input/ha-input";
import "../../../src/components/progress/ha-progress-bar";
import {
  FOLDER_ORDER,
  RestoreApiError,
  checkBackupPassword,
  clearPendingRestore,
  computeRestoreSteps,
  discardUploadedBackup,
  formatClock,
  getPendingRestore,
  getUploadedBackup,
  queueBackupRestore,
  uploadBackup,
  uploadRate,
  type BackupUpload,
  type PendingRestore,
  type RestoreStep,
  type UploadedBackup,
} from "../data/restore";
import { getSupervisorJobsInfo } from "../data/supervisor";

const POLL_SECONDS = 2;
const FULL_RESTORE_JOB = "backup_manager_full_restore";

type Phase = "idle" | "uploading" | "details" | "pending";
type KeyState = "idle" | "checking" | "ok" | "bad" | "empty" | "failed";

const STEP_KEYS: Record<RestoreStep["id"], LandingPageKeys> = {
  prepare: "restore.step_prepare",
  restore: "restore.step_restore",
  start: "restore.step_start",
  ready: "restore.step_ready",
};

@customElement("landing-page-restore")
class LandingPageRestore extends LitElement {
  /** Progress of the Core install, 0 to 100, or -1 when it is not running. */
  @property({ type: Number, attribute: "core-progress" })
  public coreProgress = -1;

  @property() public language = "en";

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc<LandingPageKeys>;

  @state() private _available = true;

  @state() private _phase: Phase = "idle";

  @state() private _dragging = false;

  @state() private _file?: File;

  @state() private _loaded = 0;

  @state() private _total = 0;

  @state() private _elapsedMs = 0;

  @state() private _backup?: UploadedBackup;

  @state() private _note?: string;

  @state() private _error?: { title?: string; text: string };

  @state() private _key = "";

  @state() private _keyState: KeyState = "idle";

  @state() private _queuing = false;

  @state() private _pending?: PendingRestore;

  @state() private _restoreProgress?: number;

  @state() private _confirmCancel = false;

  @state() private _confirmWithout = false;

  @state() private _removing = false;

  @state() private _keyVisible = false;

  @state() private _keyError = "";

  /** The backup was queued, cancelled, and is still uploaded. */
  @state() private _cancelled = false;

  /** A short text for screen readers, changed only at upload milestones. */
  @state() private _announcement = "";

  @query(".file-input") private _fileInput?: HTMLInputElement;

  @query("[data-focus]") private _focusTarget?: HTMLElement;

  @query("[data-heading]") private _headingTarget?: HTMLElement;

  @query(".cancel-btn") private _cancelButton?: HTMLElement;

  private _upload?: BackupUpload;

  private _uploadStart = 0;

  private _timer?: number;

  private _polling = false;

  /**
   * Counts every change the person makes. A poll that started before a change
   * and answers after it is out of date and must not overwrite the new state.
   */
  private _seq = 0;

  private _lastKey = "";

  private _milestone = 0;

  public connectedCallback() {
    super.connectedCallback();
    // A file dropped outside the zone would open in the browser and leave this
    // page, which abandons an upload in progress.
    window.addEventListener("dragover", this._blockDrop);
    window.addEventListener("drop", this._blockDrop);
    if (!this._polling) {
      this._polling = true;
      this._refresh();
    }
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("dragover", this._blockDrop);
    window.removeEventListener("drop", this._blockDrop);
    window.clearTimeout(this._timer);
    this._upload?.abort();
  }

  private _blockDrop = (ev: DragEvent) => {
    ev.preventDefault();
  };

  protected updated(changed: PropertyValues) {
    if (changed.has("_phase")) {
      if (this._phase === "details") {
        this.updateComplete.then(() =>
          this._focusTarget?.focus({ preventScroll: true })
        );
      } else if (this._phase === "pending" && changed.get("_phase")) {
        // The button the person pressed is gone: put focus on the new heading
        this.updateComplete.then(() =>
          this._headingTarget?.focus({ preventScroll: true })
        );
      }
    }
  }

  private _t(key: LandingPageKeys, values?: Record<string, string | number>) {
    return modeText(
      (k, v) => this._localize(k.replace(/^landing-page\./, "") as any, v),
      `landing-page.${key}`,
      values
    );
  }

  private async _refresh() {
    window.clearTimeout(this._timer);
    const seq = this._seq;
    try {
      const record = await getPendingRestore();
      this._available = true;
      if (seq === this._seq && !this._queuing && !this._removing) {
        this._pending = record ?? undefined;
        if (record) {
          this._phase = "pending";
        } else if (this._phase === "pending") {
          this._phase = "idle";
        }
      }
      if (record?.state === "running") {
        await this._fetchRestoreProgress();
      }
    } catch (err: any) {
      // An older Supervisor has no such route: keep the card hidden
      if (err instanceof RestoreApiError && err.status === 404) {
        this._available = false;
      }
    }
    if (!this.isConnected) {
      this._polling = false;
      return;
    }
    this._timer = window.setTimeout(() => this._refresh(), POLL_SECONDS * 1000);
  }

  private async _fetchRestoreProgress() {
    try {
      const jobs = await getSupervisorJobsInfo();
      const job =
        jobs.result === "ok"
          ? jobs.data.jobs.find((j) => j.name === FULL_RESTORE_JOB)
          : undefined;
      this._restoreProgress = job ? job.progress : undefined;
    } catch (_err) {
      // Progress is a nicety; the record still tells the state
    }
  }

  protected render() {
    if (!this._available || !this._localize) {
      return nothing;
    }
    return html`
      <ha-card>
        <div class="card-content">
          ${
            this._phase === "pending" && this._pending
              ? this._renderPending(this._pending)
              : html`
                  ${this._renderHeader()}
                  ${this._phase === "idle" ? this._renderPick() : nothing}
                  ${this._phase === "uploading" ? this._renderUploading() : nothing}
                  ${this._phase === "details" ? this._renderDetails() : nothing}
                `
          }
        </div>
      </ha-card>
    `;
  }

  private _renderHeader() {
    const sub =
      this._phase === "uploading"
        ? "restore.sub_uploading"
        : this._phase === "details"
          ? "restore.sub_details"
          : "restore.sub_idle";
    return html`
      <div class="head">
        <span class="lead" aria-hidden="true">
          <ha-svg-icon .path=${mdiBackupRestore}></ha-svg-icon>
        </span>
        <div class="grow">
          <h2>${this._t("restore.title")}</h2>
          <span class="sub">${this._t(sub)}</span>
        </div>
      </div>
    `;
  }

  // Choosing a file

  private _renderPick() {
    return html`
      <div
        class=${classMap({ drop: true, over: this._dragging })}
        @dragover=${this._dragOver}
        @dragleave=${this._dragLeave}
        @drop=${this._drop}
      >
        <span class="big wide-only" aria-hidden="true">
          <ha-svg-icon .path=${mdiUpload}></ha-svg-icon>
        </span>
        <span class="strong wide-only">${this._t("restore.drop_here")}</span>
        <span class="or wide-only">${this._t("restore.or")}</span>
        <ha-button @click=${this._openPicker}>
          <ha-svg-icon slot="start" .path=${mdiUpload}></ha-svg-icon>
          ${this._t("restore.choose")}
        </ha-button>
        <span class="sub">${this._t("restore.choose_hint")}</span>
        <input
          class="file-input"
          type="file"
          accept=".tar,application/x-tar"
          tabindex="-1"
          aria-hidden="true"
          @change=${this._picked}
        />
      </div>
      ${
        this._error
          ? html`<ha-alert alert-type="error" .title=${this._error.title ?? ""}
              >${this._error.text}</ha-alert
            >`
          : nothing
      }
      ${
        this._note
          ? html`<ha-alert alert-type="info">${this._note}</ha-alert>`
          : nothing
      }
      <p class="sub">${this._t("restore.no_backup_needed")}</p>
    `;
  }

  private _openPicker() {
    this._fileInput?.click();
  }

  private _dragOver(ev: DragEvent) {
    ev.preventDefault();
    this._dragging = true;
  }

  private _dragLeave(ev: DragEvent) {
    // Moving over the button or text inside the zone also fires dragleave
    const to = ev.relatedTarget as Node | null;
    if (to && (ev.currentTarget as Node).contains(to)) {
      return;
    }
    this._dragging = false;
  }

  private _drop(ev: DragEvent) {
    ev.preventDefault();
    this._dragging = false;
    const file = ev.dataTransfer?.files?.[0];
    if (file) {
      this._start(file);
    }
  }

  private _picked(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) {
      this._start(file);
    }
  }

  // Uploading

  private _start(file: File) {
    this._file = file;
    this._error = undefined;
    this._note = undefined;
    this._loaded = 0;
    this._total = file.size;
    this._elapsedMs = 0;
    this._uploadStart = Date.now();
    this._milestone = 0;
    this._announcement = "";
    this._cancelled = false;
    this._phase = "uploading";
    this._upload = uploadBackup(file, ({ loaded, total }) => {
      this._loaded = loaded;
      this._total = total;
      this._elapsedMs = Date.now() - this._uploadStart;
      // Screen readers hear only every quarter, not every progress event
      const quarter = total ? Math.floor((loaded / total) * 4) * 25 : 0;
      if (quarter > this._milestone && quarter < 100) {
        this._milestone = quarter;
        this._announcement = this._t("restore.upload_milestone", {
          percent: quarter,
        });
      }
    });
    const current = this._upload;
    current.result
      .then(async (slug) => {
        this._announcement = this._t("restore.upload_complete");
        this._backup = await getUploadedBackup(slug);
        this._key = "";
        this._keyState = "idle";
        this._phase = "details";
      })
      .catch((err: RestoreApiError) => {
        if (this._upload !== current) {
          return;
        }
        this._phase = "idle";
        // The Supervisor answers a file that is not a backup with its generic
        // message. Any other message, such as a full disk, is shown as it is.
        this._error =
          err.status === 200 ||
          (err.status === 400 && /^Unknown error/.test(err.message))
            ? {
                title: this._t("restore.not_backup_title"),
                text: this._t("restore.not_backup", { name: file.name }),
              }
            : {
                text: this._t("restore.upload_failed", { error: err.message }),
              };
      });
  }

  private _renderUploading() {
    const percent = this._total
      ? Math.floor((this._loaded / this._total) * 100)
      : 0;
    const { bytesPerSecond, secondsLeft } = uploadRate(
      this._loaded,
      this._total,
      this._elapsedMs
    );
    const bytes = (n: number) => (n <= 0 ? "0 KB" : formatBytes(n));
    // Once every byte is sent the Supervisor finishes the import by itself
    const sent = this._total > 0 && this._loaded >= this._total;
    return html`
      <div class="file-row">
        <ha-svg-icon .path=${mdiFileDocumentOutline}></ha-svg-icon>
        <span class="grow">
          <span class="name">${this._file?.name}</span>
          <span class="sub">${this._t("restore.uploading")}</span>
        </span>
        <span class="strong num">${percent}%</span>
      </div>
      <ha-progress-bar
        .value=${percent}
        .label=${this._t("restore.upload_label")}
      ></ha-progress-bar>
      <div class="actions">
        <span class="sub grow num">
          ${
            bytesPerSecond === undefined || secondsLeft === undefined
              ? this._t("restore.upload_progress_start", {
                  done: bytes(this._loaded),
                  total: bytes(this._total),
                })
              : this._t("restore.upload_progress", {
                  done: bytes(this._loaded),
                  total: bytes(this._total),
                  speed: bytes(bytesPerSecond),
                  time: secondsLeft,
                })
          }
        </span>
        <span class="visually-hidden" role="status">${this._announcement}</span>
        <ha-button
          appearance="plain"
          .disabled=${sent}
          @click=${this._cancelUpload}
        >
          ${this._t("restore.cancel")}
        </ha-button>
      </div>
      <p class="sub">${this._t("restore.keep_open")}</p>
    `;
  }

  private _cancelUpload() {
    const upload = this._upload;
    this._upload = undefined;
    upload?.abort();
    this._phase = "idle";
    this._note = this._t("restore.upload_cancelled");
  }

  // Details and the key

  private _holds(backup: UploadedBackup): string[] {
    const holds: string[] = [];
    if (backup.homeassistant) {
      holds.push(this._t("restore.holds_settings"));
    }
    if (backup.apps.length) {
      holds.push(this._t("restore.holds_apps", { count: backup.apps.length }));
    }
    const folderKeys: Record<string, LandingPageKeys> = {
      media: "restore.holds_media",
      share: "restore.holds_share",
      ssl: "restore.holds_ssl",
      "apps/local": "restore.holds_local_apps",
      "addons/local": "restore.holds_local_apps",
    };
    const seen = new Set<string>();
    FOLDER_ORDER.filter((f) => backup.folders.includes(f)).forEach((f) => {
      const text = this._t(folderKeys[f]);
      if (!seen.has(text)) {
        seen.add(text);
        holds.push(text);
      }
    });
    return holds;
  }

  private _renderDetails() {
    const backup = this._backup;
    if (!backup) {
      return nothing;
    }
    const canGo =
      !this._queuing && (!backup.protected || this._keyState === "ok");
    return html`
      ${
        this._cancelled
          ? html`<ha-alert alert-type="info"
              >${this._note}
              ${this._t("restore.still_uploaded", {
                size: formatBytes(backup.size_bytes),
              })}</ha-alert
            >`
          : html`<ha-alert alert-type="success"
              >${this._note ?? this._t("restore.checked")}</ha-alert
            >`
      }
      <dl class="kv">
        <dt>${this._t("restore.name")}</dt>
        <dd class="strong">${backup.name}</dd>
        <dt>${this._t("restore.made_on")}</dt>
        <dd>${this._formatDate(backup.date)}</dd>
        <dt>${this._t("restore.size")}</dt>
        <dd>${formatBytes(backup.size_bytes)}</dd>
        <dt>${this._t("restore.holds")}</dt>
        <dd>
          <span class="tags">
            ${this._holds(backup).map((h) => html`<span class="tag">${h}</span>`)}
          </span>
        </dd>
        <dt>${this._t("restore.protection")}</dt>
        <dd>
          ${
            backup.protected
              ? this._t("restore.is_protected")
              : this._t("restore.not_protected")
          }
        </dd>
      </dl>
      ${backup.protected ? this._renderKey() : nothing}
      <p class="sub">${this._t("restore.replace_warning")}</p>
      ${
        this._error
          ? html`<ha-alert alert-type="error">${this._error.text}</ha-alert>`
          : nothing
      }
      <div class="actions">
        <ha-button appearance="plain" @click=${this._chooseAnother}>
          ${this._t("restore.choose_other")}
        </ha-button>
        <span class="grow"></span>
        <ha-button
          .disabled=${!canGo}
          .loading=${this._queuing}
          @click=${this._continue}
          data-focus
        >
          ${
            this._cancelled
              ? this._t("restore.restore_this")
              : this._t("restore.continue")
          }
        </ha-button>
      </div>
      <span class="sub">
        ${
          canGo
            ? this._t("restore.continue_help_ready")
            : this._t("restore.continue_help_key")
        }
      </span>
    `;
  }

  private _formatDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return iso;
    }
    return new Intl.DateTimeFormat(this.language, {
      dateStyle: "medium",
      timeStyle: "short",
      hourCycle: "h23",
    }).format(date);
  }

  private _renderKey() {
    const bad =
      this._keyState === "bad" ||
      this._keyState === "empty" ||
      this._keyState === "failed";
    return html`
      <div class="key">
        <ha-input
          type=${this._keyVisible ? "text" : "password"}
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          data-focus
          .label=${this._t("restore.key_label")}
          .placeholder=${this._t("restore.key_placeholder")}
          .value=${this._key}
          .disabled=${this._keyState === "ok"}
          .invalid=${bad}
          .hint=${this._t("restore.key_help")}
          @input=${this._keyInput}
          @keydown=${this._keyKey}
        >
          <ha-icon-button
            slot="end"
            .path=${this._keyVisible ? mdiEyeOff : mdiEye}
            .label=${
              this._keyVisible
                ? this._t("restore.key_hide_button")
                : this._t("restore.key_show_button")
            }
            @click=${this._toggleKey}
          ></ha-icon-button>
        </ha-input>
        ${
          bad
            ? html`<ha-alert alert-type="error">
                ${
                  this._keyState === "empty"
                    ? this._t("restore.key_empty")
                    : this._keyState === "failed"
                      ? this._t("restore.key_check_failed", {
                          error: this._keyError,
                        })
                      : this._t("restore.key_bad")
                }
              </ha-alert>`
            : nothing
        }
        ${
          this._keyState === "ok"
            ? html`<ha-alert alert-type="success"
                >${this._t("restore.key_ok")}</ha-alert
              >`
            : nothing
        }
        ${
          this._keyState === "ok"
            ? nothing
            : html`<ha-button
                appearance="filled"
                variant="neutral"
                .loading=${this._keyState === "checking"}
                @click=${this._checkKey}
              >
                ${
                  this._keyState === "checking"
                    ? this._t("restore.checking_key")
                    : this._t("restore.check_key")
                }
              </ha-button>`
        }
      </div>
    `;
  }

  private _toggleKey() {
    this._keyVisible = !this._keyVisible;
  }

  private _keyInput(ev: Event) {
    this._key = (ev.target as HTMLInputElement).value;
    if (this._keyState !== "checking") {
      this._keyState = "idle";
    }
  }

  private _keyKey(ev: KeyboardEvent) {
    if (ev.key === "Enter") {
      this._checkKey();
    }
  }

  private async _checkKey() {
    if (!this._backup || this._keyState === "checking") {
      return;
    }
    const key = this._key.trim();
    if (!key) {
      this._keyState = "empty";
      return;
    }
    this._keyState = "checking";
    try {
      await checkBackupPassword(this._backup.slug, key);
      this._keyState = "ok";
    } catch (err: any) {
      // Only the Supervisor's own answer means the key is wrong. A network
      // error or a refused request says nothing about the key.
      if (err instanceof RestoreApiError && err.status === 400) {
        this._keyState = "bad";
      } else {
        this._keyError = err?.message ?? "";
        this._keyState = "failed";
      }
    }
  }

  private _chooseAnother() {
    const slug = this._backup?.slug;
    this._phase = "idle";
    this._note = undefined;
    this._error = undefined;
    this._backup = undefined;
    this._cancelled = false;
    this._keyVisible = false;
    if (slug) {
      // The file is no longer wanted: do not leave it on a small disk
      discardUploadedBackup(slug).catch(() => undefined);
    }
  }

  private async _continue() {
    if (!this._backup || this._queuing) {
      return;
    }
    this._queuing = true;
    this._seq++;
    this._error = undefined;
    try {
      this._lastKey = this._backup.protected ? this._key.trim() : "";
      this._pending = await queueBackupRestore(
        this._backup.slug,
        this._lastKey || undefined
      );
      this._phase = "pending";
      this._key = "";
      this._cancelled = false;
    } catch (err: any) {
      this._error = {
        text: this._t("restore.continue_failed", { error: err.message }),
      };
    }
    this._seq++;
    this._queuing = false;
  }

  // A restore is queued, running, failed or finished

  private _stepTitle(step: RestoreStep) {
    return this._t(STEP_KEYS[step.id]);
  }

  private _stepState(step: RestoreStep, record: PendingRestore): string {
    const at = (iso: string | null) =>
      iso ? formatClock(iso, this.language) : "";
    if (step.state === "done") {
      const time = step.id === "restore" ? at(record.finished_at) : "";
      return time
        ? this._t("restore.state_done_at", { time })
        : this._t("restore.state_done");
    }
    if (step.state === "failed") {
      const time = at(record.finished_at);
      return time
        ? this._t("restore.state_failed_at", { time })
        : this._t("restore.state_failed");
    }
    if (step.state === "not_started") {
      return this._t("restore.state_not_started");
    }
    if (step.state === "active") {
      return step.progress !== undefined
        ? this._t("restore.state_active_percent", {
            percent: Math.round(step.progress),
          })
        : this._t("restore.state_active");
    }
    if (step.id === "restore") {
      const time = at(record.queued_at);
      return time
        ? this._t("restore.state_queued_at", { time })
        : this._t("restore.state_restore_waiting");
    }
    return step.id === "ready"
      ? this._t("restore.state_ready_waiting")
      : this._t("restore.state_waiting");
  }

  private _renderSteps(record: PendingRestore) {
    const steps = computeRestoreSteps({
      pending: record,
      coreProgress: this.coreProgress,
      restoreProgress: this._restoreProgress,
    });
    return html`
      <span class="label" id="steps-label"
        >${
          record.state === "failed"
            ? this._t("restore.steps_label_failed")
            : this._t("restore.steps_label")
        }</span
      >
      <ol class="steps" aria-labelledby="steps-label">
        ${steps.map(
          (step, index) => html`
            <li
              class=${`step ${step.state}`}
              aria-current=${step.state === "active" ? "step" : "false"}
            >
              <span class="dot" aria-hidden="true">
                ${
                  step.state === "done"
                    ? html`<ha-svg-icon .path=${mdiCheck}></ha-svg-icon>`
                    : step.state === "active"
                      ? html`<ha-svg-icon
                          class="spin"
                          .path=${mdiLoading}
                        ></ha-svg-icon>`
                      : step.state === "failed"
                        ? html`<ha-svg-icon
                            .path=${mdiAlertCircle}
                          ></ha-svg-icon>`
                        : index + 1
                }
              </span>
              <span class="grow">
                <span class="step-name">${this._stepTitle(step)}</span>
                <span class="sub">${this._stepState(step, record)}</span>
                ${
                  step.state === "active" && step.progress !== undefined
                    ? html`<ha-progress-bar
                        .value=${step.progress}
                        .label=${this._stepTitle(step)}
                      ></ha-progress-bar>`
                    : nothing
                }
              </span>
            </li>
          `
        )}
      </ol>
    `;
  }

  private _renderPending(record: PendingRestore) {
    if (record.state === "failed") {
      return this._renderFailed(record);
    }
    if (this._confirmWithout) {
      return this._renderWithout();
    }
    const done = record.state === "done";
    const running = record.state === "running";
    return html`
      <div class="head">
        <span class="lead ${done || !running ? "good" : ""}" aria-hidden="true">
          <ha-svg-icon .path=${done ? mdiCheckCircle : mdiCheck}></ha-svg-icon>
        </span>
        <div class="grow">
          <h2 tabindex="-1" data-heading>
            ${
              done
                ? this._t("restore.done_title")
                : running
                  ? this._t("restore.walk_away_title")
                  : this._t("restore.queued_title")
            }
          </h2>
          <p class="text" role="status">
            ${
              done
                ? this._t("restore.done_text", { name: record.name })
                : running
                  ? this._t("restore.walk_away_text")
                  : this._t("restore.queued_text")
            }
          </p>
        </div>
      </div>
      ${this._renderSteps(record)}
      <ha-alert alert-type="info">
        ${this._t("restore.backup_summary", {
          name: record.name,
          size: formatBytes(record.size_bytes),
          time: formatClock(record.queued_at, this.language),
        })}
      </ha-alert>
      ${
        this._error
          ? html`<ha-alert alert-type="error">${this._error.text}</ha-alert>`
          : nothing
      }
      ${record.state === "queued" ? this._renderCancel() : nothing}
      ${
        running
          ? html`<p class="sub lock">
              <ha-svg-icon .path=${mdiInformation}></ha-svg-icon>
              ${this._t("restore.locked")}
            </p>`
          : nothing
      }
    `;
  }

  private _renderCancel() {
    if (this._confirmCancel) {
      return html`
        <div
          class="confirm"
          role="group"
          aria-label=${this._t("restore.cancel_title")}
        >
          <span class="strong">${this._t("restore.cancel_title")}</span>
          <span class="sub">${this._t("restore.cancel_text")}</span>
          <div class="actions end">
            <ha-button
              appearance="plain"
              data-focus
              @click=${this._keepRestore}
            >
              ${this._t("restore.keep_restore")}
            </ha-button>
            <ha-button
              appearance="plain"
              variant="danger"
              @click=${this._cancelRestore}
            >
              ${this._t("restore.cancel_restore")}
            </ha-button>
          </div>
        </div>
      `;
    }
    return html`
      <div class="actions">
        <ha-button
          class="cancel-btn"
          appearance="plain"
          @click=${this._askCancel}
        >
          ${this._t("restore.cancel_restore")}
        </ha-button>
        <span class="sub grow">${this._t("restore.cancel_note")}</span>
      </div>
    `;
  }

  private _askCancel() {
    this._error = undefined;
    this._confirmCancel = true;
    this.updateComplete.then(() =>
      this._focusTarget?.focus({ preventScroll: true })
    );
  }

  private _keepRestore() {
    this._confirmCancel = false;
    // The confirm box is gone, so focus goes back to the button that opened it
    this.updateComplete.then(() =>
      this._cancelButton?.focus({ preventScroll: true })
    );
  }

  private async _cancelRestore() {
    this._confirmCancel = false;
    const record = this._pending;
    this._removing = true;
    this._seq++;
    this._error = undefined;
    try {
      await clearPendingRestore(false);
      this._pending = undefined;
      if (record) {
        this._backup = await getUploadedBackup(record.slug);
        // The key was accepted a moment ago and lives only in this page's
        // memory, so one press queues the backup again
        const keep = this._backup.protected && this._lastKey;
        this._key = keep ? this._lastKey : "";
        this._keyState = keep ? "ok" : "idle";
        this._note = this._t("restore.cancelled_note");
        this._cancelled = true;
        this._phase = "details";
      }
    } catch (err: any) {
      this._error = {
        text: this._t("restore.cancel_failed", { error: err?.message ?? "" }),
      };
    }
    this._seq++;
    this._removing = false;
  }

  private _renderFailed(record: PendingRestore) {
    if (this._confirmWithout) {
      return this._renderWithout();
    }
    return html`
      <ha-alert alert-type="error" .title=${this._t("restore.failed_title")}>
        ${this._t("restore.failed_text", { error: record.error ?? "" })}
      </ha-alert>
      ${this._renderSteps(record)}
      <p class="sub">${this._t("restore.failed_safe")}</p>
      ${
        this._error
          ? html`<ha-alert alert-type="error">${this._error.text}</ha-alert>`
          : nothing
      }
      <div class="stack">
        <ha-button @click=${this._tryAgain} .loading=${this._queuing}>
          ${this._t("restore.try_again")}
        </ha-button>
        <ha-button appearance="plain" @click=${this._askWithout}>
          ${this._t("restore.set_up_without")}
        </ha-button>
      </div>
    `;
  }

  private async _tryAgain() {
    const record = this._pending;
    if (!record || this._queuing) {
      return;
    }
    this._queuing = true;
    this._seq++;
    this._error = undefined;
    try {
      await clearPendingRestore(false);
      const backup = await getUploadedBackup(record.slug);
      if (backup.protected) {
        // The key was deleted with the failed run, so ask for it again
        this._backup = backup;
        this._key = "";
        this._keyState = "idle";
        this._note = undefined;
        this._cancelled = false;
        this._pending = undefined;
        this._phase = "details";
      } else {
        this._pending = await queueBackupRestore(record.slug);
      }
    } catch (err: any) {
      this._error = {
        text: this._t("restore.continue_failed", { error: err.message }),
      };
    }
    this._seq++;
    this._queuing = false;
  }

  private _askWithout() {
    this._error = undefined;
    this._confirmWithout = true;
    // Focus the safe choice, never the button that deletes the backup
    this.updateComplete.then(() =>
      this._focusTarget?.focus({ preventScroll: true })
    );
  }

  private _renderWithout() {
    return html`
      <div class="head">
        <span class="lead good" aria-hidden="true">
          <ha-svg-icon .path=${mdiCheckCircle}></ha-svg-icon>
        </span>
        <div class="grow">
          <h2>${this._t("restore.without_title")}</h2>
          <p class="text">${this._t("restore.without_text")}</p>
        </div>
      </div>
      <div class="stack">
        <ha-button @click=${this._withoutGo} .loading=${this._removing}>
          ${
            this._removing
              ? this._t("restore.without_busy")
              : this._t("restore.without_go")
          }
        </ha-button>
        <ha-button appearance="plain" data-focus @click=${this._withoutBack}>
          ${this._t("restore.back_to_restore")}
        </ha-button>
      </div>
    `;
  }

  private _withoutBack() {
    this._confirmWithout = false;
  }

  private async _withoutGo() {
    this._removing = true;
    this._seq++;
    this._error = undefined;
    try {
      await clearPendingRestore(true);
      this._pending = undefined;
      this._backup = undefined;
      this._confirmWithout = false;
      this._phase = "idle";
    } catch (err: any) {
      this._error = {
        text: this._t("restore.continue_failed", { error: err.message }),
      };
      this._confirmWithout = false;
    }
    this._seq++;
    this._removing = false;
  }

  static styles = css`
    :host {
      display: block;
      /* Touch targets are 48 px on a phone */
      --ha-button-height: 48px;
    }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .card-content {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-4);
      padding: var(--ha-space-5);
    }
    h2 {
      margin: 0;
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
    }
    p {
      margin: 0;
      font-size: var(--ha-font-size-m);
    }
    .head {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
    }
    .head .text {
      color: var(--secondary-text-color);
      margin-top: var(--ha-space-1);
    }
    .grow {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .lead {
      display: grid;
      place-items: center;
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: var(--ha-border-radius-circle, 50%);
      background: var(--secondary-background-color);
      color: var(--primary-color);
    }
    .lead.good {
      background: var(--success-color, #1f6a3b);
      color: var(--text-primary-color, #fff);
    }
    .sub {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
      line-height: 1.4;
    }
    .strong {
      font-weight: var(--ha-font-weight-medium);
    }
    .num {
      font-variant-numeric: tabular-nums;
    }
    .label {
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
      letter-spacing: 0.4px;
      color: var(--secondary-text-color);
    }
    .drop {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--ha-space-2);
      padding: var(--ha-space-4) var(--ha-space-3);
      text-align: center;
      border: 2px dashed var(--divider-color);
      border-radius: var(--ha-border-radius-xl);
      transition:
        background-color 0.2s,
        border-color 0.2s;
    }
    .drop.over {
      border-color: var(--primary-color);
      background: var(--secondary-background-color);
    }
    .drop .big {
      display: grid;
      place-items: center;
      width: 56px;
      height: 56px;
      border-radius: var(--ha-border-radius-circle, 50%);
      background: var(--secondary-background-color);
      color: var(--primary-color);
    }
    .drop .or {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .wide-only {
      display: none;
    }
    @media (min-width: 640px) and (hover: hover) {
      .wide-only {
        display: grid;
      }
      .drop .strong.wide-only,
      .drop .or.wide-only {
        display: block;
      }
      .drop {
        padding: var(--ha-space-6) var(--ha-space-4);
      }
    }
    .file-input {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    }
    .file-row {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      min-width: 0;
    }
    .file-row .name {
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
    }
    .actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
    }
    .actions.end {
      justify-content: flex-end;
    }
    .stack {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    .stack ha-button {
      width: 100%;
    }
    .kv {
      display: grid;
      grid-template-columns: minmax(96px, auto) 1fr;
      gap: var(--ha-space-2) var(--ha-space-4);
      margin: 0;
    }
    .kv dt {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .kv dd {
      margin: 0;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-1);
    }
    .tag {
      padding: 2px var(--ha-space-2);
      border-radius: var(--ha-border-radius-pill, 12px);
      background: var(--secondary-background-color);
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
    }
    .key {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    .steps {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
    }
    .step {
      position: relative;
      display: flex;
      gap: var(--ha-space-3);
      padding-bottom: var(--ha-space-4);
    }
    .step:last-child {
      padding-bottom: 0;
    }
    .step:not(:last-child)::before {
      content: "";
      position: absolute;
      inset-inline-start: 15px;
      top: 36px;
      bottom: 4px;
      width: 2px;
      background: var(--divider-color);
    }
    .step.done:not(:last-child)::before {
      background: var(--success-color, #1f6a3b);
    }
    .dot {
      display: grid;
      place-items: center;
      flex: none;
      width: 32px;
      height: 32px;
      border-radius: var(--ha-border-radius-circle, 50%);
      background: var(--secondary-background-color);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
      --mdc-icon-size: 20px;
    }
    .step.active .dot {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
    }
    .step.done .dot {
      background: var(--success-color, #1f6a3b);
      color: var(--text-primary-color, #fff);
    }
    .step.failed .dot {
      background: var(--error-color);
      color: var(--text-primary-color, #fff);
    }
    .step-name {
      display: block;
      padding-top: var(--ha-space-1);
      font-weight: var(--ha-font-weight-medium);
    }
    .step.waiting .step-name,
    .step.not_started .step-name {
      color: var(--secondary-text-color);
      font-weight: var(--ha-font-weight-normal);
    }
    .step ha-progress-bar {
      margin-top: var(--ha-space-2);
    }
    .confirm {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
      padding: var(--ha-space-3);
      border-radius: var(--ha-border-radius-lg);
      background: var(--secondary-background-color);
    }
    .lock {
      display: flex;
      align-items: flex-start;
      gap: var(--ha-space-2);
    }
    .lock ha-svg-icon {
      --mdc-icon-size: 18px;
      flex: none;
    }
    .spin {
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .spin {
        animation: none;
      }
      .drop {
        transition: none;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "landing-page-restore": LandingPageRestore;
  }
}
