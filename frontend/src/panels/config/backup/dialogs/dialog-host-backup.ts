import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import type { HASSDomCurrentTargetEvent } from "../../../../common/dom/fire_event";
import { modeText } from "../../../../common/language-mode/language-mode";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-dialog";
import "../../../../components/ha-dialog-footer";
import "../../../../components/ha-select";
import type { HaSelectSelectEvent } from "../../../../components/ha-select";
import "../../../../components/input/ha-input";
import type { HaInput } from "../../../../components/input/ha-input";
import { getPreferredAgentForDownload } from "../../../../data/backup";
import {
  availableHostingTargets,
  canAutoStartHosting,
  backupHostingStatus,
  backupHostingJobs,
  cancelBackupHosting,
  hostingJobActive,
  hostingJobNeedsKey,
  pairBackupHosting,
  readyHostingUrl,
  signInHostingUrl,
  startBackupHosting,
} from "../../../../data/backup_hosting";
import type {
  BackupHostingBridge,
  BackupHostingJob,
  BackupHostingTarget,
} from "../../../../data/backup_hosting";
import type { HassDialog } from "../../../../dialogs/make-dialog-manager";
import { haStyleDialog } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import type { HostBackupDialogParams } from "./show-dialog-host-backup";

@customElement("dialog-host-backup")
class HostBackupDialog
  extends LitElement
  implements HassDialog<HostBackupDialogParams>
{
  @state() private _params?: HostBackupDialogParams;
  @state() private _open = false;
  private _generation = 0;
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _bridges: BackupHostingBridge[] = [];
  @state() private _bridgeId = "";
  @state() private _target: BackupHostingTarget = "docker";
  @state() private _job?: BackupHostingJob;
  @state() private _busy = true;
  @state() private _message = "";
  @state() private _password = "";
  @state() private _url = "";
  @state() private _fingerprint = "";
  private _pairingBridgeId?: string;
  private _requestId = crypto.randomUUID();
  private _timer?: ReturnType<typeof setTimeout>;
  private _loaded = false;
  private _submitting = false;

  private _text = (key: string) =>
    modeText(this.hass.localize, `ui.panel.config.backup.hosting.${key}`);
  private get _bridge() {
    return this._bridges.find((item) => item.id === this._bridgeId);
  }
  private get _targets() {
    return availableHostingTargets(this._bridge).filter(
      (target): target is BackupHostingTarget =>
        this._params?.kind === "docker"
          ? target === "docker"
          : target === "virtualbox" || target === "vmware"
    );
  }
  private get _agentId() {
    return getPreferredAgentForDownload(
      Object.keys(this._params!.backup.agents).filter(
        (id) => !this._params!.backup.failed_agent_ids?.includes(id)
      )
    );
  }
  private get _protected() {
    return Boolean(this._params?.backup.agents[this._agentId]?.protected);
  }

  public showDialog(params: HostBackupDialogParams) {
    clearTimeout(this._timer);
    this._generation++;
    this._params = params;
    this._open = true;
    this._loaded = false;
    this._submitting = false;
    this._busy = true;
    this._message = "";
    this._password = "";
    this._job = undefined;
    this._bridges = [];
    this._bridgeId = "";
    this._url = "";
    this._fingerprint = "";
    this._pairingBridgeId = undefined;
    this._requestId = crypto.randomUUID();
  }

  protected updated() {
    if (this.hass && this._params && this._open && !this._loaded) {
      this._loaded = true;
      void this._load(true);
    }
  }
  public closeDialog() {
    this._password = "";
    this._open = false;
    this._generation++;
    clearTimeout(this._timer);
    return true;
  }

  private _dialogClosed() {
    this.closeDialog();
    this._params?.onBusy?.(Boolean(this._job && hostingJobActive(this._job)));
    this._params = undefined;
    this._loaded = false;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._generation++;
    clearTimeout(this._timer);
    this._password = "";
    this._params?.onBusy?.(Boolean(this._job && hostingJobActive(this._job)));
  }
  private async _load(autoStart = false) {
    const generation = this._generation;
    this._busy = true;
    this._message = "";
    try {
      const status = await backupHostingStatus(this.hass);
      if (generation !== this._generation || !this._open) return;
      this._bridges = status.bridges.filter((bridge) => bridge.paired);
      // A stored selection identifies the computer explicitly paired by this browser.
      let saved: { bridge_id?: string; target?: BackupHostingTarget } = {};
      try {
        const stored: unknown = JSON.parse(
          localStorage.getItem(
            `backup-hosting:${this.hass.auth.data.hassUrl}:${this._params!.kind}`
          ) || "{}"
        );
        if (stored && typeof stored === "object") {
          if ("bridge_id" in stored && typeof stored.bridge_id === "string")
            saved.bridge_id = stored.bridge_id;
          if (
            "target" in stored &&
            (stored.target === "docker" ||
              stored.target === "virtualbox" ||
              stored.target === "vmware")
          )
            saved.target = stored.target;
        }
      } catch {
        /* no usable selection */
      }
      this._bridgeId = this._bridges.some(
        (bridge) => bridge.id === saved.bridge_id
      )
        ? saved.bridge_id!
        : "";
      this._target = this._targets.includes(saved.target!)
        ? saved.target!
        : this._targets[0] || "docker";
      if (this._bridgeId) {
        const { jobs } = await backupHostingJobs(this.hass, this._bridgeId);
        if (generation !== this._generation || !this._open) return;
        this._job = [...jobs]
          .reverse()
          .find(
            (job) =>
              job.backup_id === this._params!.backup.backup_id &&
              (this._params!.kind === "docker"
                ? job.target === "docker"
                : job.target === "virtualbox" || job.target === "vmware")
          );
        if (this._job) this._target = this._job.target;
      }
      if (!this.isConnected) return;
      if (this._job) this._poll();
      else if (
        canAutoStartHosting({
          explicitAction: autoStart,
          savedBridge: Boolean(this._bridgeId),
          targets: this._targets,
          savedTarget: saved.target,
          protectedBackup: this._protected,
          existingJob: this._job,
        })
      )
        await this._start();
    } catch {
      if (generation === this._generation) this._message = "unavailable";
    } finally {
      if (generation === this._generation) this._busy = false;
    }
  }
  private _poll() {
    clearTimeout(this._timer);
    this._params?.onBusy?.(Boolean(this._job && hostingJobActive(this._job)));
    if (
      !this._open ||
      !this._job ||
      !hostingJobActive(this._job) ||
      !this.isConnected
    )
      return;
    const generation = this._generation;
    this._timer = setTimeout(async () => {
      try {
        const { jobs } = await backupHostingJobs(this.hass, this._bridgeId);
        if (generation !== this._generation || !this._open) return;
        this._job = jobs.find((job) => job.id === this._job?.id) || this._job;
        this._message = "";
      } catch {
        if (generation !== this._generation || !this._open) return;
        this._message = "reconnecting";
      }
      this._poll();
    }, 3000);
  }
  private async _start() {
    const generation = this._generation;
    if (
      !this.isConnected ||
      !this._open ||
      this._submitting ||
      !this._bridge?.paired ||
      !this._targets.includes(this._target) ||
      !this._agentId ||
      (this._job &&
        hostingJobActive(this._job) &&
        !hostingJobNeedsKey(this._job))
    )
      return;
    this._busy = true;
    this._submitting = true;
    this._params?.onBusy?.(true);
    this._message = "";
    try {
      localStorage.setItem(
        `backup-hosting:${this.hass.auth.data.hassUrl}:${this._params!.kind}`,
        JSON.stringify({ bridge_id: this._bridgeId, target: this._target })
      );
      const job = await startBackupHosting(this.hass, {
        request_id: this._job?.request_id || this._requestId,
        backup_id: this._params!.backup.backup_id,
        agent_id: this._agentId,
        bridge_id: this._bridgeId,
        target: this._target,
        options: {},
        ...(this._password ? { password: this._password } : {}),
      });
      if (generation !== this._generation || !this._open) return;
      this._job = job;
      this._poll();
    } catch {
      if (generation === this._generation) this._message = "start_failed";
    } finally {
      if (generation === this._generation) {
        this._password = "";
        this._submitting = false;
        this._busy = false;
      }
    }
  }
  private async _pair() {
    const generation = this._generation;
    this._busy = true;
    try {
      const result = await pairBackupHosting(
        this.hass,
        this._pairingBridgeId
          ? { bridge_id: this._pairingBridgeId }
          : { url: this._url, fingerprint: this._fingerprint }
      );
      if (generation !== this._generation || !this._open) return;
      this._pairingBridgeId = result.bridge_id;
      this._message = result.state === "paired" ? "paired" : "pairing";
      if (result.state === "paired") {
        const status = await backupHostingStatus(this.hass);
        if (generation !== this._generation || !this._open) return;
        this._bridges = status.bridges.filter((bridge) => bridge.paired);
        this._bridgeId = result.bridge_id;
        this._target = this._targets[0] || "docker";
      }
    } catch {
      if (generation === this._generation) this._message = "pair_failed";
    } finally {
      if (generation === this._generation) this._busy = false;
    }
  }
  private async _cancel() {
    const generation = this._generation;
    if (!this._job) return;
    this._busy = true;
    try {
      const job = await cancelBackupHosting(
        this.hass,
        this._bridgeId,
        this._job.id
      );
      if (generation !== this._generation || !this._open) return;
      this._job = job;
    } catch {
      if (generation === this._generation) this._message = "unavailable";
    } finally {
      if (generation === this._generation) this._busy = false;
    }
  }
  protected render() {
    if (!this.hass || !this._params) return nothing;
    const link = readyHostingUrl(this._job);
    const signInLink = signInHostingUrl(this._job);
    const active = this._job && hostingJobActive(this._job);
    return html`<ha-dialog
      .open=${this._open}
      @closed=${this._dialogClosed}
      width="medium"
      .headerTitle=${this._text("title")}
    >
      <div class="content">
        ${
          signInLink
            ? html`<ha-alert alert-type="info">
                <p>${this._text("sign_in_pending")}</p>
                <a href=${signInLink} target="_blank" rel="noopener noreferrer"
                  >${this._text("sign_in_verify")}</a
                >
              </ha-alert>`
            : nothing
        }
        <p>${this._params.backup.name}</p>
        <ha-alert alert-type="info">${this._text("original")}</ha-alert>
        ${this._message ? html`<ha-alert>${this._text(this._message)}</ha-alert>` : nothing}
        ${
          this._job
            ? html`<section aria-live="polite">
                <h3>
                  ${this._text(`states.${this._job.state}`) || this._text("pending")}
                </h3>
                <p>
                  ${this._text(`phases.${this._job.phase}`) || this._text("pending")}
                </p>
                ${this._job.error_code ? html`<ha-alert alert-type="error">${this._text("job_failed")} <code>${this._job.error_code}</code></ha-alert>` : nothing}
                ${link ? html`<a href=${link} target="_blank" rel="noopener noreferrer">${link}</a>` : html`<p>${this._text("not_verified")}</p>`}
                ${active ? html`<ha-button .disabled=${this._busy} @click=${this._cancel}>${this._text("cancel")}</ha-button>` : nothing}
              </section>`
            : nothing
        }
        ${
          hostingJobNeedsKey(this._job)
            ? html`<ha-input
                type="password"
                password-toggle
                autocomplete="off"
                .label=${this._text("key")}
                .value=${this._password}
                @input=${this._passwordChanged}
              ></ha-input>`
            : nothing
        }
        ${
          !this._job
            ? html` <ha-select
                  autofocus
                  .label=${this._text("computer")}
                  .value=${this._bridgeId}
                  .disabled=${this._busy}
                  .options=${[
                    { value: "", label: this._text("choose_computer") },
                    ...this._bridges.map((bridge) => ({
                      value: bridge.id,
                      label: bridge.url,
                    })),
                  ]}
                  @selected=${this._bridgeChanged}
                ></ha-select>
                ${
                  this._bridgeId
                    ? html`<ha-select
                          .label=${this._text("target")}
                          .value=${this._target}
                          .options=${this._targets.map((target) => ({
                            value: target,
                            label:
                              target === "docker"
                                ? this._text("container")
                                : target === "virtualbox"
                                  ? "VirtualBox"
                                  : "VMware",
                          }))}
                          @selected=${this._targetChanged}
                        ></ha-select
                        >${!this._targets.length ? html`<ha-alert alert-type="warning">${this._text("setup_required")}</ha-alert>` : nothing}`
                    : nothing
                }
                ${
                  this._protected
                    ? html`<ha-input
                        type="password"
                        password-toggle
                        autocomplete="off"
                        .label=${this._text("key")}
                        .value=${this._password}
                        @input=${this._passwordChanged}
                      ></ha-input>`
                    : nothing
                }
                <details>
                  <summary>${this._text("setup")}</summary>
                  <p>${this._text("pair_help")}</p>
                  ${(["url", "fingerprint"] as const).map(
                    (key) =>
                      html`<ha-input
                        autocomplete="off"
                        .label=${this._text(key)}
                        .value=${this[`_${key}`]}
                        .field=${key}
                        @input=${this._pairFieldChanged}
                      ></ha-input>`
                  )}
                  <ha-button
                    .disabled=${this._busy || (!this._pairingBridgeId && (!this._url || !this._fingerprint))}
                    @click=${this._pair}
                    >${this._text(this._pairingBridgeId ? "check_pairing" : "pair")}</ha-button
                  >
                </details>`
            : nothing
        }
      </div>
      <ha-dialog-footer slot="footer"
        ><ha-button
          slot="secondaryAction"
          appearance="plain"
          @click=${this.closeDialog}
          >${this._text("close")}</ha-button
        >
        ${!this._job || hostingJobNeedsKey(this._job) ? html`<ha-button slot="primaryAction" .disabled=${this._busy || !this._bridgeId || !this._targets.includes(this._target) || ((this._protected || hostingJobNeedsKey(this._job)) && !this._password)} @click=${this._start}>${this._text("start")}</ha-button>` : nothing}</ha-dialog-footer
      >
    </ha-dialog>`;
  }
  private _passwordChanged(ev: HASSDomCurrentTargetEvent<HaInput>) {
    this._password = ev.currentTarget.value ?? "";
  }

  private _pairFieldChanged(
    ev: HASSDomCurrentTargetEvent<HaInput & { field: "url" | "fingerprint" }>
  ) {
    this[`_${ev.currentTarget.field}`] = ev.currentTarget.value ?? "";
  }

  private _bridgeChanged(ev: HaSelectSelectEvent) {
    this._bridgeId = String(ev.detail.value ?? "");
    this._target = this._targets[0] || "docker";
  }

  private _targetChanged(ev: HaSelectSelectEvent) {
    this._target = String(ev.detail.value ?? "docker") as BackupHostingTarget;
  }

  static styles = [
    haStyleDialog,
    css`
      .content {
        display: grid;
        gap: var(--ha-space-4);
      }
      ha-input,
      ha-select {
        display: block;
        margin-block: var(--ha-space-2);
      }
      summary,
      a {
        min-height: 48px;
        overflow-wrap: anywhere;
      }
      summary:focus-visible,
      a:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }
    `,
  ];
}
declare global {
  interface HTMLElementTagNameMap {
    "dialog-host-backup": HostBackupDialog;
  }
}
