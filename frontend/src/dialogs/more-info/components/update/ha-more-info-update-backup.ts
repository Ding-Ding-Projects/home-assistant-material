import "../../../../components/skeleton/ha-skeleton";
import "../../../../components/skeleton/ha-skeleton-text";
import type { HassConfig } from "home-assistant-js-websocket";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../../../../common/decorators/consume";
import { isComponentLoaded } from "../../../../common/config/is_component_loaded";
import { relativeTime } from "../../../../common/datetime/relative_time";
import { consumeLocalize } from "../../../../common/decorators/consume-context-entry";
import { transform } from "../../../../common/decorators/transform";
import { supportsFeature } from "../../../../common/entity/supports-feature";
import type { LocalizeFunc } from "../../../../common/translations/localize";
import "../../../../components/animation/ha-fade-in";
import "../../../../components/ha-switch";
import "../../../../components/item/ha-row-item";
import type { AutoUpdateInfo } from "../../../../data/auto-update";
import type { BackupConfig } from "../../../../data/backup";
import {
  SYSTEM_BACKUP_KINDS,
  settingsFromInfo,
  subjectFor,
  subjectWantsBackup,
} from "../../../../panels/config/core/updates/backup-choice";
import { showConfirmationDialog } from "../../../generic/show-dialog-box";
import { fetchBackupConfig } from "../../../../data/backup";
import {
  apiContext,
  configContext,
  internationalizationContext,
  statesContext,
} from "../../../../data/context";
import type { EntitySources } from "../../../../data/entity/entity_sources";
import { fetchEntitySourcesWithCache } from "../../../../data/entity/entity_sources";
import { getSupervisorUpdateConfig } from "../../../../data/supervisor/update";
import type { FrontendLocaleData } from "../../../../data/translation";
import type { UpdateEntity, UpdateType } from "../../../../data/update";
import {
  getUpdateType,
  UpdateEntityFeature,
  updateIsInstalling,
} from "../../../../data/update";
import type {
  HomeAssistant,
  HomeAssistantApi,
  HomeAssistantConfig,
  HomeAssistantInternationalization,
} from "../../../../types";

@customElement("ha-more-info-update-backup")
export class HaMoreInfoUpdateBackup extends LitElement {
  @property({ attribute: false }) public stateObj?: UpdateEntity;

  @property({ type: Boolean }) public disabled = false;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  @transform<HomeAssistantInternationalization, FrontendLocaleData>({
    transformer: ({ locale }) => locale,
  })
  private _locale!: FrontendLocaleData;

  @state() private _backupConfigLoading = true;

  @state() private _backupConfig?: BackupConfig;

  @state() private _createBackupLoading = true;

  @state() private _createBackup = false;

  @state() private _entitySources?: EntitySources;

  // What the stored choice says for this update, and whether it is a system one.
  @state() private _choiceDefault?: boolean;

  private _systemKind = false;

  @consume({ context: apiContext, subscribe: true })
  private _api!: HomeAssistantApi;

  @consume({ context: statesContext, subscribe: true })
  private _states!: HomeAssistant["states"];

  @consume({ context: configContext, subscribe: true })
  @transform<HomeAssistantConfig, HassConfig>({
    transformer: ({ config }) => config,
  })
  private _config!: HassConfig;

  public get createBackup(): boolean {
    if (
      !this.stateObj ||
      !supportsFeature(this.stateObj, UpdateEntityFeature.BACKUP)
    ) {
      return false;
    }
    return this._createBackup;
  }

  protected firstUpdated(): void {
    this._setupBackup();
  }

  protected render() {
    if (
      !this.stateObj ||
      !supportsFeature(this.stateObj, UpdateEntityFeature.BACKUP)
    ) {
      return nothing;
    }

    const createBackupTexts = this._computeCreateBackupTexts();

    if (!createBackupTexts && !this._backupConfigLoading) {
      return nothing;
    }

    return html`
      <ha-row-item
        .headline=${createBackupTexts ? createBackupTexts.title : undefined}
        .supportingText=${
          createBackupTexts ? createBackupTexts.description : undefined
        }
      >
        ${
          !createBackupTexts
            ? html`<ha-fade-in slot="headline" .delay=${500}
                ><ha-skeleton-text></ha-skeleton-text
              ></ha-fade-in>`
            : nothing
        }
        ${
          this._createBackupLoading
            ? html`<ha-fade-in class="skeleton-end" slot="end" .delay=${500}
                ><ha-skeleton></ha-skeleton
              ></ha-fade-in>`
            : html`<ha-switch
                slot="end"
                .checked=${this._createBackup}
                @change=${this._createBackupChanged}
                .disabled=${this.disabled || updateIsInstalling(this.stateObj)}
              ></ha-switch>`
        }
      </ha-row-item>
      ${
        this._choiceDefault !== undefined &&
        this._createBackup !== this._choiceDefault
          ? html`<p class="only-this">
              ${(this._localize as LocalizeFunc<string>)(
                "ui.panel.config.updates.backup_choice.only_this_update"
              )}
            </p>`
          : nothing
      }
    `;
  }

  private async _setupBackup(): Promise<void> {
    if (!supportsFeature(this.stateObj!, UpdateEntityFeature.BACKUP)) {
      this._createBackupLoading = false;
      this._backupConfigLoading = false;
      return;
    }

    let type: UpdateType | undefined = undefined;

    try {
      this._entitySources = await fetchEntitySourcesWithCache(
        this._api.callWS,
        this._states
      );
      type = getUpdateType(this.stateObj!, this._entitySources!);
    } catch (err) {
      // ignore error, because the generic backup option remains available
      // eslint-disable-next-line no-console
      console.error(err);
    }

    if (type === undefined) {
      this._createBackupLoading = false;
      this._backupConfigLoading = false;
      await this._applyChoice();
      return;
    }

    await Promise.all([
      this._fetchUpdateBackupConfig(type),
      this._fetchBackupConfig(type),
    ]);
    await this._applyChoice();
  }

  // The same decision as the Updates page and the automatic updates: the
  // switch starts where the stored choice puts this update.
  private async _applyChoice(): Promise<void> {
    try {
      const info = await this._api.callWS<AutoUpdateInfo>({
        type: "auto_update/info",
      });
      if (!info.backup_kinds || !this.stateObj) {
        return;
      }
      const subject = subjectFor(this.stateObj, undefined, info);
      this._systemKind = SYSTEM_BACKUP_KINDS.includes(subject.kind);
      this._createBackup = subjectWantsBackup(subject, settingsFromInfo(info));
      this._choiceDefault = this._createBackup;
    } catch (_err) {
      // Not an administrator or an older server: the switch keeps its own start.
    }
  }

  private async _fetchUpdateBackupConfig(type: UpdateType) {
    try {
      if (
        isComponentLoaded(this._config, "hassio") &&
        ["addon", "home_assistant", "home_assistant_os"].includes(type)
      ) {
        const config = await getSupervisorUpdateConfig(this._api);

        // for home assistant and OS updates
        if (this._isHaOrOsUpdate(type)) {
          this._createBackup = config.core_backup_before_update;
          return;
        }

        if (type === "addon") {
          this._createBackup = config.add_on_backup_before_update;
        }
      }
    } catch (err) {
      // ignore error, because user can still set the config
      // eslint-disable-next-line no-console
      console.error(err);
      this._createBackup = false;
    } finally {
      this._createBackupLoading = false;
    }
  }

  private async _fetchBackupConfig(type: UpdateType): Promise<void> {
    try {
      if (this._isHaOrOsUpdate(type)) {
        const { config } = await fetchBackupConfig(this._api);
        this._backupConfig = config;
      }
    } catch (err) {
      // ignore error, because user can still set the config
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      this._backupConfigLoading = false;
    }
  }

  private _isHaOrOsUpdate(type: UpdateType): boolean {
    return ["home_assistant", "home_assistant_os"].includes(type);
  }

  private _computeCreateBackupTexts():
    { title: string; description?: string } | undefined {
    const updateType = this._entitySources
      ? getUpdateType(this.stateObj!, this._entitySources)
      : "generic";

    if (this._isHaOrOsUpdate(updateType)) {
      if (this._backupConfigLoading) {
        return undefined;
      }

      const isBackupConfigValid =
        !!this._backupConfig &&
        !!this._backupConfig.automatic_backups_configured &&
        this._backupConfig.create_backup.agent_ids.length > 0;

      if (!isBackupConfigValid) {
        return {
          title: this._localize(
            "ui.dialogs.more_info_control.update.create_backup.manual"
          ),
          description: this._localize(
            "ui.dialogs.more_info_control.update.create_backup.manual_description"
          ),
        };
      }

      const lastAutomaticBackupDate = this._backupConfig
        ?.last_completed_automatic_backup
        ? new Date(this._backupConfig?.last_completed_automatic_backup)
        : null;
      const now = new Date();

      return {
        title: this._localize(
          "ui.dialogs.more_info_control.update.create_backup.automatic"
        ),
        description: lastAutomaticBackupDate
          ? this._localize(
              "ui.dialogs.more_info_control.update.create_backup.automatic_description_last",
              {
                relative_time: relativeTime(
                  lastAutomaticBackupDate,
                  this._locale,
                  now,
                  true
                ),
              }
            )
          : this._localize(
              "ui.dialogs.more_info_control.update.create_backup.automatic_description_none"
            ),
      };
    }

    // App backup
    if (updateType === "addon") {
      const version = this.stateObj!.attributes.installed_version;
      return {
        title: this._localize(
          "ui.dialogs.more_info_control.update.create_backup.app"
        ),
        description: version
          ? this._localize(
              "ui.dialogs.more_info_control.update.create_backup.app_description",
              { version: version }
            )
          : undefined,
      };
    }

    // Fallback to generic UI
    return {
      title: this._localize(
        "ui.dialogs.more_info_control.update.create_backup.generic"
      ),
    };
  }

  private async _createBackupChanged(ev) {
    const checked = ev.target.checked as boolean;
    if (
      !checked &&
      this._createBackup &&
      this._systemKind &&
      !(await showConfirmationDialog(this, {
        title: this._localize(
          "ui.panel.config.updates.backup_choice.confirm_title"
        ),
        text: this._localize(
          "ui.panel.config.updates.backup_choice.confirm_text"
        ),
        confirmText: this._localize(
          "ui.panel.config.updates.backup_choice.confirm_button"
        ),
        dismissText: this._localize("ui.common.cancel"),
        destructive: true,
      }))
    ) {
      ev.target.checked = true;
      return;
    }
    this._createBackup = checked;
  }

  static styles = css`
    :host {
      display: block;
      width: 100%;
    }
    ha-row-item {
      width: 100%;
      --ha-row-item-padding-inline: var(--ha-space-6);
    }
    .only-this {
      margin: 0;
      padding: 0 var(--ha-space-6) var(--ha-space-2);
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .skeleton-end {
      width: 48px;
      height: 24px;
      display: block;
      --ha-skeleton-border-radius: var(--ha-border-radius-pill);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-more-info-update-backup": HaMoreInfoUpdateBackup;
  }
}
