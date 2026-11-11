import { mdiClose, mdiContentCopy, mdiDownload } from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { isComponentLoaded } from "../../../../common/config/is_component_loaded";
import { fireEvent } from "../../../../common/dom/fire_event";
import { copyToClipboard } from "../../../../common/util/copy-clipboard";
import "../../../../components/ha-button";
import "../../../../components/ha-dialog";
import "../../../../components/ha-dialog-footer";
import "../../../../components/ha-icon-button";
import "../../../../components/ha-icon-button-prev";
import "../../../../components/ha-icon-next";
import "../../../../components/ha-svg-icon";
import "../../../../components/ha-switch";
import type { HaSwitch } from "../../../../components/ha-switch";
import "../../../../components/item/ha-list-item-button";
import "../../../../components/item/ha-row-item";
import "../../../../components/list/ha-list-base";
import { DirtyStateProviderMixin } from "../../../../mixins/dirty-state-provider-mixin";
import type {
  BackupConfig,
  BackupMutableConfig,
} from "../../../../data/backup";
import {
  BackupScheduleRecurrence,
  downloadEmergencyKit,
  generateEncryptionKey,
  updateBackupConfig,
} from "../../../../data/backup";
import type { HassDialog } from "../../../../dialogs/make-dialog-manager";
import { haStyle, haStyleDialog } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import { showToast } from "../../../../util/toast";
import "../components/config/ha-backup-config-agents";
import "../components/config/ha-backup-config-data";
import type { BackupConfigData } from "../components/config/ha-backup-config-data";
import "../components/config/ha-backup-config-schedule";
import type { BackupConfigSchedule } from "../components/config/ha-backup-config-schedule";
import {
  agentsBlockedWithoutKey,
  defaultBackupAgentIds,
  dropAgentsRequiringEncryption,
  encryptionToggleAction,
} from "../helper/backup-encryption";
import { confirmTurnOffEncryption } from "../helper/confirm-turn-off-encryption";
import type { BackupOnboardingDialogParams } from "./show-dialog-backup_onboarding";

const STEPS = [
  "welcome",
  "encryption",
  "setup",
  "schedule",
  "data",
  "locations",
] as const;

type Step = (typeof STEPS)[number];

const FULL_DIALOG_STEPS = new Set<Step>(["setup"]);

const SAVE_STEPS = new Set<Step>([
  "encryption",
  "schedule",
  "data",
  "locations",
]);

/** Longest wait for one save before it counts as failed. */
const SAVE_TIMEOUT_MS = 30000;

const RECOMMENDED_CONFIG: BackupConfig = {
  automatic_backups_configured: false,
  create_backup: {
    agent_ids: [],
    include_folders: [],
    include_database: true,
    include_addons: [],
    include_all_addons: true,
    password: null,
    name: null,
  },
  retention: {
    copies: 3,
    days: null,
  },
  schedule: {
    recurrence: BackupScheduleRecurrence.DAILY,
    time: null,
    days: [],
  },
  agents: {},
  last_attempted_automatic_backup: null,
  last_completed_automatic_backup: null,
  next_automatic_backup: null,
  next_automatic_backup_additional: false,
};

@customElement("ha-dialog-backup-onboarding")
class DialogBackupOnboarding
  extends DirtyStateProviderMixin<BackupConfig>()(LitElement)
  implements HassDialog
{
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _open = false;

  @state() private _step?: Step;

  @state() private _params?: BackupOnboardingDialogParams;

  @state() private _config?: BackupConfig;

  /** True while a save is pending; presses that would save again are ignored. */
  @state() private _saving = false;

  @query("div") private _copyContainer?: HTMLElement;

  public showDialog(params: BackupOnboardingDialogParams): void {
    this._params = params;

    if (this._params.config?.create_backup.password) {
      // onboarding wizard was started before, but not finished.
      this._config = this._params.config;
      this._step = "setup";
    } else {
      this._step = this._firstStep;
      this._config = {
        ...RECOMMENDED_CONFIG,
        create_backup: {
          ...RECOMMENDED_CONFIG.create_backup,
          agent_ids: this._defaultAgents(
            !!this._params.config?.create_backup.password
          ),
          password: this._params.config?.create_backup.password ?? null,
        },
      };
    }

    this._open = true;
    this._initDirtyTracking({ type: "deep" }, this._config!);
  }

  public closeDialog() {
    this._open = false;
    return true;
  }

  private _dialogClosed() {
    if (this._params?.cancel) {
      this._params.cancel();
    }
    this._step = undefined;
    this._config = undefined;
    this._params = undefined;
    this._open = false;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private get _firstStep(): Step {
    return this._params?.skipWelcome ? STEPS[1] : STEPS[0];
  }

  private _saveQueue: Promise<unknown> = Promise.resolve();

  // Saves run one after another, in the order they were requested.
  private _enqueueSave(done = false): Promise<void> {
    const run = this._saveQueue.then(() => this._save(done));
    this._saveQueue = run.catch(() => undefined);
    return run;
  }

  private async _save(done = false) {
    if (!this._config) {
      return;
    }

    const params: BackupMutableConfig = {
      create_backup: {
        password: this._config.create_backup.password,
        include_database: this._config.create_backup.include_database,
        agent_ids: this._config.create_backup.agent_ids,
      },
      schedule: this._config.schedule,
      retention: this._config.retention,
      automatic_backups_configured: done,
    };

    if (isComponentLoaded(this.hass.config, "hassio")) {
      params.create_backup!.include_folders =
        this._config.create_backup.include_folders || [];
      params.create_backup!.include_all_addons =
        this._config.create_backup.include_all_addons;
      params.create_backup!.include_addons =
        this._config.create_backup.include_addons || [];
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        updateBackupConfig(this.hass, params),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error("The save took too long.")),
            SAVE_TIMEOUT_MS
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async _done() {
    if (this._saving) {
      return;
    }
    this._saving = true;
    try {
      await this._enqueueSave(true);
      this._params?.submit!(true);
      this._markDirtyStateClean();
      this.closeDialog();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      showToast(this, { message: "Failed to save backup configuration" });
    } finally {
      this._saving = false;
    }
  }

  private _previousStep() {
    const index = STEPS.indexOf(this._step!);
    if (index === 0) {
      return;
    }
    this._step = STEPS[index - 1];
  }

  private async _nextStep() {
    if (this._saving) {
      return;
    }
    if (this._step && SAVE_STEPS.has(this._step)) {
      this._saving = true;
      try {
        await this._enqueueSave();
      } catch (err: any) {
        showToast(this, { message: err?.message ?? String(err) });
        return;
      } finally {
        this._saving = false;
      }
    }
    const index = STEPS.indexOf(this._step!);
    if (index === STEPS.length - 1) {
      return;
    }
    this._step = STEPS[index + 1];
  }

  protected render() {
    if (!this._params || !this._step) {
      return nothing;
    }

    const isLastStep = this._step === STEPS[STEPS.length - 1];
    const isFirstStep = this._step === this._firstStep;

    return html`
      <ha-dialog
        .open=${this._open}
        header-title=${this._stepTitle}
        .preventScrimClose=${this.isDirtyState}
        @closed=${this._dialogClosed}
      >
        ${
          isFirstStep
            ? html`
                <ha-icon-button
                  slot="headerNavigationIcon"
                  data-dialog="close"
                  .label=${this.hass.localize("ui.common.close")}
                  .path=${mdiClose}
                ></ha-icon-button>
              `
            : html`
                <ha-icon-button-prev
                  slot="headerNavigationIcon"
                  @click=${this._previousStep}
                ></ha-icon-button-prev>
              `
        }
        <div>${this._renderStepContent()}</div>
        ${
          !FULL_DIALOG_STEPS.has(this._step)
            ? html`
                <ha-dialog-footer slot="footer">
                  ${
                    isLastStep
                      ? html`
                          <ha-button
                            slot="primaryAction"
                            @click=${this._done}
                            .disabled=${this._saving || !this._isStepValid()}
                          >
                            ${this.hass.localize(
                              "ui.panel.config.backup.dialogs.onboarding.save_and_create"
                            )}
                          </ha-button>
                        `
                      : html`
                          <ha-button
                            slot="primaryAction"
                            @click=${this._nextStep}
                            .disabled=${this._saving || !this._isStepValid()}
                          >
                            ${this.hass.localize("ui.common.next")}
                          </ha-button>
                        `
                  }
                </ha-dialog-footer>
              `
            : nothing
        }
      </ha-dialog>
    `;
  }

  // The local location, plus the cloud one when signed in and a key is set.
  private _defaultAgents(hasKey: boolean): string[] {
    return defaultBackupAgentIds(
      isComponentLoaded(this.hass.config, "hassio"),
      !!this._params?.cloudStatus?.logged_in,
      hasKey
    );
  }

  private _useRecommended() {
    const password = this._config!.create_backup.password;
    this._config = {
      ...RECOMMENDED_CONFIG,
      create_backup: {
        ...RECOMMENDED_CONFIG.create_backup,
        agent_ids: this._defaultAgents(!!password),
        password,
      },
    };
    this._updateDirtyState(this._config);
    this._done();
  }

  private get _stepTitle(): string {
    switch (this._step) {
      case "encryption":
      case "setup":
      case "schedule":
      case "data":
      case "locations":
        return this.hass.localize(
          `ui.panel.config.backup.dialogs.onboarding.${this._step}.title`
        );
      default:
        return "";
    }
  }

  private _isStepValid(): boolean {
    switch (this._step) {
      case "encryption":
        return true;
      case "setup":
        return true;
      case "schedule":
        return !!this._config?.schedule;
      case "data":
        return !!this._config?.schedule;
      case "locations":
        return !!this._config?.create_backup.agent_ids.length;
      default:
        return true;
    }
  }

  private _renderStepContent() {
    if (!this._config) {
      return nothing;
    }

    switch (this._step) {
      case "welcome":
        return html`
          <div class="welcome">
            <img
              src="/static/images/voice-assistant/hi.png"
              alt="Casita Home Assistant logo"
            />
            <h1>
              ${this.hass.localize(
                "ui.panel.config.backup.dialogs.onboarding.welcome.title"
              )}
            </h1>
            <p class="secondary">
              ${this.hass.localize(
                "ui.panel.config.backup.dialogs.onboarding.welcome.description"
              )}
            </p>
          </div>
        `;
      case "encryption": {
        const key = this._config.create_backup.password;
        return html`
          <p>
            ${this.hass.localize(
              "ui.panel.config.backup.dialogs.onboarding.encryption.description"
            )}
          </p>
          <ha-row-item>
            <span slot="headline">
              ${this.hass.localize(
                "ui.panel.config.backup.encryption_key.encrypt_backups"
              )}
            </span>
            <span slot="supporting-text">
              ${this.hass.localize(
                key
                  ? "ui.panel.config.backup.encryption_key.encrypt_backups_on_description"
                  : "ui.panel.config.backup.encryption_key.encrypt_backups_off_description"
              )}
            </span>
            <ha-switch
              slot="end"
              .checked=${!!key}
              @change=${this._encryptionToggled}
            ></ha-switch>
          </ha-row-item>
          ${
            key
              ? html`
                  <p>
                    ${this.hass.localize(
                      "ui.panel.config.backup.dialogs.onboarding.encryption.key_description"
                    )}
                  </p>
                  <div class="encryption-key">
                    <p>${key}</p>
                    <ha-icon-button
                      .label=${this.hass.localize("ui.common.copy")}
                      .path=${mdiContentCopy}
                      @click=${this._copyKeyToClipboard}
                    ></ha-icon-button>
                  </div>
                  <ha-row-item>
                    <span slot="headline">
                      ${this.hass.localize(
                        "ui.panel.config.backup.encryption_key.download_emergency_kit"
                      )}
                    </span>
                    <span slot="supporting-text">
                      ${this.hass.localize(
                        "ui.panel.config.backup.encryption_key.download_emergency_kit_description"
                      )}
                    </span>
                    <ha-button
                      size="s"
                      appearance="plain"
                      slot="end"
                      @click=${this._downloadKey}
                    >
                      <ha-svg-icon
                        .path=${mdiDownload}
                        slot="start"
                      ></ha-svg-icon>
                      ${this.hass.localize(
                        "ui.panel.config.backup.encryption_key.download_emergency_kit_action"
                      )}
                    </ha-button>
                  </ha-row-item>
                `
              : nothing
          }
        `;
      }
      case "setup":
        return html`
          <ha-list-base class="full">
            <ha-list-item-button @click=${this._useRecommended}>
              <span slot="headline">
                ${this.hass.localize(
                  "ui.panel.config.backup.dialogs.onboarding.setup.recommended_heading"
                )}
              </span>
              <span slot="supporting-text">
                ${this.hass.localize(
                  "ui.panel.config.backup.dialogs.onboarding.setup.recommended_description"
                )}
              </span>
              <ha-icon-next slot="end"></ha-icon-next>
            </ha-list-item-button>
            <ha-list-item-button @click=${this._nextStep}>
              <span slot="headline">
                ${this.hass.localize(
                  "ui.panel.config.backup.dialogs.onboarding.setup.custom_heading"
                )}
              </span>
              <span slot="supporting-text">
                ${this.hass.localize(
                  "ui.panel.config.backup.dialogs.onboarding.setup.custom_description"
                )}
              </span>
              <ha-icon-next slot="end"></ha-icon-next>
            </ha-list-item-button>
          </ha-list-base>
        `;
      case "schedule":
        return html`
          <p>
            ${this.hass.localize(
              "ui.panel.config.backup.dialogs.onboarding.schedule.description"
            )}
          </p>
          <ha-backup-config-schedule
            .hass=${this.hass}
            .value=${this._config}
            @value-changed=${this._scheduleChanged}
          ></ha-backup-config-schedule>
        `;
      case "data":
        return html`
          <p>
            ${this.hass.localize(
              "ui.panel.config.backup.dialogs.onboarding.data.description"
            )}
          </p>
          <ha-backup-config-data
            .hass=${this.hass}
            .value=${this._dataConfig(this._config)}
            @value-changed=${this._dataChanged}
            force-home-assistant
            hide-addon-version
          ></ha-backup-config-data>
        `;
      case "locations":
        return html`
          <p>
            ${this.hass.localize(
              "ui.panel.config.backup.dialogs.onboarding.locations.description"
            )}
          </p>
          <ha-backup-config-agents
            .hass=${this.hass}
            .value=${this._config.create_backup.agent_ids}
            .cloudStatus=${this._params!.cloudStatus}
            .hasEncryptionKey=${!!this._config.create_backup.password}
            @value-changed=${this._agentsConfigChanged}
          ></ha-backup-config-agents>
        `;
    }
    return nothing;
  }

  private async _encryptionToggled(ev: Event) {
    const target = ev.target as HaSwitch;
    const wantsOn = target.checked;
    const currentKey = this._config!.create_backup.password;
    // The switch follows the stored key, never the click.
    target.checked = !!currentKey;
    if (this._saving) {
      return;
    }

    const action = encryptionToggleAction(!!currentKey, wantsOn);
    if (action === "none") {
      return;
    }

    let password: string | null;
    if (action === "generate") {
      password = generateEncryptionKey();
    } else {
      const cloudWillBeRemoved =
        agentsBlockedWithoutKey(this._config!.create_backup.agent_ids, false)
          .length > 0;
      const confirmed = await confirmTurnOffEncryption(
        this,
        this.hass,
        currentKey!,
        cloudWillBeRemoved
      );
      if (!confirmed) {
        return;
      }
      password = null;
    }

    const previousConfig = this._config!;
    this._config = {
      ...this._config!,
      create_backup: {
        ...this._config!.create_backup,
        password,
        agent_ids: dropAgentsRequiringEncryption(
          this._config!.create_backup.agent_ids,
          !!password
        ),
      },
    };
    this._updateDirtyState(this._config);
    this._saving = true;
    try {
      await this._enqueueSave();
    } catch (err: any) {
      // The server kept the old key, so the dialog must show it again.
      this._config = previousConfig;
      this._updateDirtyState(this._config);
      showToast(this, { message: err?.message ?? String(err) });
    } finally {
      this._saving = false;
    }
  }

  private _downloadKey() {
    const key = this._config?.create_backup.password;
    if (!key) {
      return;
    }
    downloadEmergencyKit(this.hass, key);
  }

  private async _copyKeyToClipboard() {
    await copyToClipboard(
      this._config!.create_backup.password!,
      this._copyContainer!
    );
    showToast(this, {
      message: this.hass.localize("ui.common.copied_clipboard"),
    });
  }

  private _dataConfig(config: BackupConfig): BackupConfigData {
    const {
      include_addons,
      include_all_addons,
      include_database,
      include_folders,
    } = config.create_backup;

    return {
      include_homeassistant: true,
      include_database,
      include_folders: include_folders || undefined,
      include_all_addons,
      include_addons: include_addons || undefined,
    };
  }

  private _dataChanged(ev) {
    const data = ev.detail.value as BackupConfigData;
    this._config = {
      ...this._config!,
      create_backup: {
        ...this._config!.create_backup,
        include_database: data.include_database,
        include_folders: data.include_folders || null,
        include_all_addons: data.include_all_addons,
        include_addons: data.include_addons || null,
      },
    };
    this._updateDirtyState(this._config);
  }

  private _scheduleChanged(ev) {
    const value = ev.detail.value as BackupConfigSchedule;
    this._config = {
      ...this._config!,
      schedule: value.schedule,
      retention: value.retention,
    };
    this._updateDirtyState(this._config);
  }

  private _agentsConfigChanged(ev) {
    const agents = ev.detail.value as string[];
    this._config = {
      ...this._config!,
      create_backup: {
        ...this._config!.create_backup,
        agent_ids: agents,
      },
    };
    this._updateDirtyState(this._config);
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      haStyleDialog,
      css`
        ha-dialog {
          --dialog-content-padding: var(--ha-space-2) var(--ha-space-6);
          --ha-dialog-max-height: min(605px, 100% - 48px);
        }
        ha-row-item {
          --ha-row-item-padding-inline: 0;
        }
        ha-list-base.full {
          --ha-row-item-padding-inline: var(--ha-space-6);
          margin: 0 calc(-1 * var(--ha-space-6));
        }
        p {
          margin-top: 0;
        }
        .welcome {
          text-align: center;
        }
        .encryption-key {
          border: 1px solid var(--divider-color);
          background-color: var(--primary-background-color);
          border-radius: var(--ha-border-radius-md);
          padding: 16px;
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: var(--ha-space-6);
        }
        .encryption-key p {
          margin: 0;
          flex: 1;
          font-size: var(--ha-font-size-xl);
          font-family: var(--ha-font-family-code);
          font-style: normal;
          font-weight: var(--ha-font-weight-normal);
          line-height: var(--ha-line-height-condensed);
          text-align: center;
        }
        .encryption-key ha-icon-button {
          flex: none;
          margin: -16px;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-dialog-backup-onboarding": DialogBackupOnboarding;
  }
}
