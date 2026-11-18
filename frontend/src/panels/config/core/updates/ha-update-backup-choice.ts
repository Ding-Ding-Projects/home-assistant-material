import { mdiChevronDown, mdiChevronUp } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { LanguageModeController } from "../../../../common/language-mode/language-mode-controller";
import { searchMatcher } from "../../../../common/regex/filter";
import "../../../../components/ha-checkbox";
import "../../../../components/ha-svg-icon";
import "../../../../components/input/ha-input-search";
import type { AutoUpdateInfo, BackupKind } from "../../../../data/auto-update";
import {
  setAutoUpdateBackupApps,
  setAutoUpdateBackupChoice,
  setAutoUpdateBackupKind,
} from "../../../../data/auto-update";
import { extractApiErrorMessage } from "../../../../data/hassio/common";
import type { HassioAddonInfo } from "../../../../data/hassio/addon";
import { fetchHassioAddonsInfo } from "../../../../data/hassio/addon";
import { showConfirmationDialog } from "../../../../dialogs/generic/show-dialog-box";
import { haStyle } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import { showToast } from "../../../../util/toast";
import type {
  BackupAppSizeSource,
  BackupSettings,
  PresetChoice,
} from "./backup-choice";
import {
  appSizesFromBackups,
  formatAppSizeMb,
  BACKUP_KINDS,
  PRESET_CHOICES,
  choiceFor,
  needsSystemConfirmation,
  presetSettings,
  pruneApps,
  settingsFromInfo,
  summaryKey,
} from "./backup-choice";

const PREFIX = "ui.panel.config.updates.backup_choice.";

/**
 * "Make a backup first for": one choice for which updates get a backup, the
 * same one the update buttons, "Update everything" and the automatic updates
 * use. Under it the choice kind by kind and, for apps, one by one.
 */
@customElement("ha-update-backup-choice")
export class HaUpdateBackupChoice extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public info!: AutoUpdateInfo;

  /** Without a Supervisor there are no apps. */
  @property({ attribute: false }) public hasSupervisor = false;

  @state() private _apps?: HassioAddonInfo[];

  @state() private _appsOpen = false;

  // MB per app slug in the newest backups that hold the app.
  @state() private _sizes: Record<string, number> = {};

  @state() private _query = "";

  @query(".apps") private _appsPanel?: HTMLElement;

  @query(".kinds") private _kindsPanel?: HTMLElement;

  private _lang = new LanguageModeController(this);

  private _loadedApps = false;

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("hasSupervisor") && this.hasSupervisor) {
      this._loadApps();
    }
  }

  private async _loadApps(): Promise<void> {
    if (this._loadedApps) {
      return;
    }
    this._loadedApps = true;
    try {
      this._apps = (await fetchHassioAddonsInfo(this.hass)).addons;
    } catch (_err) {
      this._loadedApps = false;
      this._apps = [];
      return;
    }
    await this._loadSizes();
  }

  // What the last backups say each app weighs; nothing is shown when none says.
  private async _loadSizes(): Promise<void> {
    try {
      const list = await this.hass.callWS<{
        backups?: {
          slug: string;
          date: string;
          content?: { addons?: string[] };
        }[];
      }>({ type: "supervisor/api", endpoint: "/backups", method: "get" });
      const withApps = (list.backups ?? [])
        .filter((backup) => backup.content?.addons?.length)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 3);
      const infos = await Promise.all(
        withApps.map((backup) =>
          this.hass.callWS<{ addons?: BackupAppSizeSource["addons"] }>({
            type: "supervisor/api",
            endpoint: `/backups/${backup.slug}/info`,
            method: "get",
          })
        )
      );
      this._sizes = appSizesFromBackups(
        infos.map((info, index) => ({
          date: withApps[index].date,
          addons: info.addons,
        }))
      );
    } catch (_err) {
      this._sizes = {};
    }
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.hass.localize, `${PREFIX}${key}`, values);
  }

  private get _settings(): BackupSettings {
    return settingsFromInfo(this.info);
  }

  private get _installed(): string[] {
    return (this._apps ?? []).map((app) => app.slug);
  }

  protected render(): TemplateResult {
    const settings = this._settings;
    const choice = choiceFor(settings);
    return html`
      <div class="choice" role="group" aria-labelledby="choice-title">
        <h3 id="choice-title">${this._t("title")}</h3>
        <div class="radios" role="radiogroup" aria-labelledby="choice-title">
          ${[...PRESET_CHOICES, "custom" as const].map((name) =>
            this._renderChoice(name, choice)
          )}
        </div>
        <p class="summary" aria-live="polite">
          ${this._t(summaryKey(choice, this.hasSupervisor))}
        </p>
        ${this.hasSupervisor ? this._renderAppsRow(settings) : nothing}
        ${
          this.hasSupervisor && this._appsOpen
            ? this._renderApps(settings)
            : nothing
        }
        <h4>${this._t("kinds_title")}</h4>
        <p class="note">${this._t("kinds_hint")}</p>
        <div class="kinds">
          ${BACKUP_KINDS.filter(
            (kind) => kind !== "app" || this.hasSupervisor
          ).map((kind) => this._renderKind(kind, settings))}
        </div>
      </div>
    `;
  }

  /**
   * A plain row that is always there: which apps get a backup first, and how
   * many. It opens the app list directly.
   */
  private _renderAppsRow(settings: BackupSettings): TemplateResult {
    const apps = this._apps;
    const chosen = apps
      ? settings.kinds.app
        ? apps.length
        : pruneApps(settings.apps, this._installed).length
      : undefined;
    return html`
      <button
        class="apps-row"
        aria-expanded=${this._appsOpen ? "true" : "false"}
        @click=${this._toggleAppsOpen}
      >
        <span class="text">
          <span class="name">${this._t("apps_row_title")}</span>
          <span class="sub"
            >${
              chosen === undefined
                ? this._t("apps_row_loading")
                : this._t("apps_count", { chosen, total: apps!.length })
            }</span
          >
        </span>
        <ha-svg-icon
          .path=${this._appsOpen ? mdiChevronUp : mdiChevronDown}
        ></ha-svg-icon>
      </button>
    `;
  }

  private _renderChoice(
    name: PresetChoice | "custom",
    current: string
  ): TemplateResult {
    const selected = name === current;
    return html`
      <button
        class=${classMap({ radio: true, selected })}
        role="radio"
        aria-checked=${selected ? "true" : "false"}
        .choice=${name}
        @click=${this._pickChoice}
      >
        <span class="dot"></span>
        <span class="text">
          <span class="name">${this._t(`preset_${name}`)}</span>
          <span class="sub">${this._t(`preset_${name}_help`)}</span>
        </span>
      </button>
    `;
  }

  private _renderKind(
    kind: BackupKind,
    settings: BackupSettings
  ): TemplateResult {
    const on = settings.kinds[kind];
    const chosen = kind === "app" && !on ? settings.apps.length : 0;
    const label = on
      ? this._t("backup_first")
      : chosen
        ? this._t("apps_chosen", { count: chosen })
        : this._t("no_backup");
    return html`
      <div class="kind">
        <button
          class="kind-main"
          role="switch"
          aria-checked=${on ? "true" : "false"}
          .kind=${kind}
          @click=${this._toggleKind}
        >
          <span class="text">
            <span class="name">${this._t(`kind_${kind}`)}</span>
            <span class="sub">${this._t(`kind_${kind}_help`)}</span>
          </span>
          <span class=${classMap({ pill: true, yes: on || chosen > 0 })}
            >${label}</span
          >
        </button>
        ${
          kind === "app"
            ? html`<button
                class="open-apps"
                aria-expanded=${this._appsOpen ? "true" : "false"}
                aria-label=${this._t(this._appsOpen ? "hide_apps" : "choose_apps")}
                @click=${this._toggleAppsOpen}
              >
                <ha-svg-icon
                  .path=${this._appsOpen ? mdiChevronUp : mdiChevronDown}
                ></ha-svg-icon>
              </button>`
            : nothing
        }
      </div>
    `;
  }

  private _renderApps(settings: BackupSettings): TemplateResult {
    const apps = this._apps ?? [];
    const matches = searchMatcher(this._query);
    const shown = apps.filter((app) => matches(app.name, app.slug));
    const wholeKind = settings.kinds.app;
    const chosen = wholeKind
      ? apps.length
      : pruneApps(settings.apps, this._installed).length;
    return html`
      <div class="apps">
        <h4>${this._t("apps_title")}</h4>
        <ha-input-search
          appearance="outlined"
          .value=${this._query}
          .label=${this._t("apps_search")}
          .placeholder=${this._t("apps_search")}
          @input=${this._queryChanged}
        ></ha-input-search>
        <p class="note">
          ${this._t("apps_count", { chosen, total: apps.length })}
        </p>
        ${
          !apps.length
            ? html`<p class="note">${this._t("apps_empty")}</p>`
            : !shown.length
              ? html`<p class="note">${this._t("apps_no_match")}</p>`
              : html`<ul class="app-list">
                  ${shown.map((app) => {
                    const ticked =
                      wholeKind || settings.apps.includes(app.slug);
                    return html`<li>
                      <ha-checkbox
                        class="app"
                        .checked=${ticked}
                        .slug=${app.slug}
                        @change=${this._toggleApp}
                      >
                        ${app.name}
                        <span slot="hint"
                          >${this._t("app_line")}${
                            app.slug in this._sizes
                              ? ` ${this._t("app_size", { size: formatAppSizeMb(this._sizes[app.slug]) })}`
                              : ""
                          }</span
                        >
                      </ha-checkbox>
                    </li>`;
                  })}
                </ul>`
        }
        <div class="later">
          <span class="text">
            <span class="name">${this._t("apps_later")}</span>
          </span>
          <span
            class="segments"
            role="radiogroup"
            aria-label=${this._t("apps_later")}
          >
            ${[true, false].map(
              (value) =>
                html`<button
                  class=${classMap({
                    segment: true,
                    selected: settings.later === value,
                  })}
                  role="radio"
                  aria-checked=${settings.later === value ? "true" : "false"}
                  .later=${value}
                  @click=${this._setLater}
                >
                  ${this._t(value ? "later_chosen" : "later_not")}
                </button>`
            )}
          </span>
        </div>
        <p class="note">${this._t("apps_hint")}</p>
      </div>
    `;
  }

  private _queryChanged(ev: Event): void {
    this._query = (ev.target as HTMLInputElement).value ?? "";
  }

  private _toggleAppsOpen(): void {
    this._appsOpen = !this._appsOpen;
  }

  private async _confirmSystemOff(): Promise<boolean> {
    return showConfirmationDialog(this, {
      title: this._t("confirm_title"),
      text: this._t("confirm_text"),
      confirmText: this._t("confirm_button"),
      dismissText: this._lang.text(this.hass.localize, "ui.common.cancel"),
      destructive: true,
    });
  }

  private async _save(
    after: BackupSettings,
    action: () => Promise<void>
  ): Promise<void> {
    if (
      needsSystemConfirmation(this._settings, after) &&
      !(await this._confirmSystemOff())
    ) {
      return;
    }
    try {
      await action();
    } catch (err: any) {
      showToast(this, {
        message: `${this._t("save_failed")} ${extractApiErrorMessage(err)}`,
        duration: 8000,
        dismissable: true,
      });
    }
  }

  private async _pickChoice(ev: Event): Promise<void> {
    const choice = (ev.currentTarget as HTMLElement & { choice: string })
      .choice as PresetChoice | "custom";
    if (choice === "custom") {
      // Custom is the state of the kinds and apps below. Tapping it takes the
      // person there: the app list opens, ready to be set by hand.
      // Without a Supervisor there are no apps, so it goes to the kinds.
      this._appsOpen = this.hasSupervisor;
      await this.updateComplete;
      (this._appsPanel ?? this._kindsPanel)?.scrollIntoView({
        block: "nearest",
      });
      return;
    }
    if (choice === choiceFor(this._settings)) {
      return;
    }
    await this._save(presetSettings(choice), () =>
      setAutoUpdateBackupChoice(this.hass, choice)
    );
  }

  private async _toggleKind(ev: Event): Promise<void> {
    const kind = (ev.currentTarget as HTMLElement & { kind: BackupKind }).kind;
    const before = this._settings;
    const enabled = !before.kinds[kind];
    const after = {
      ...before,
      kinds: { ...before.kinds, [kind]: enabled },
    };
    await this._save(after, () =>
      setAutoUpdateBackupKind(this.hass, kind, enabled)
    );
  }

  private async _toggleApp(ev: Event): Promise<void> {
    const input = ev.currentTarget as HTMLElement & {
      slug: string;
      checked: boolean;
    };
    const before = this._settings;
    const installed = this._installed;
    const base = before.kinds.app ? installed : before.apps;
    const apps = input.checked
      ? [...new Set([...base, input.slug])]
      : base.filter((slug) => slug !== input.slug);
    await this._save(before, () =>
      setAutoUpdateBackupApps(
        this.hass,
        pruneApps(apps, installed),
        installed,
        before.kinds.app ? true : before.later
      )
    );
  }

  private async _setLater(ev: Event): Promise<void> {
    const later = (ev.currentTarget as HTMLElement & { later: boolean }).later;
    const before = this._settings;
    const installed = this._installed;
    await this._save(before, () =>
      setAutoUpdateBackupApps(
        this.hass,
        pruneApps(before.kinds.app ? installed : before.apps, installed),
        installed,
        later
      )
    );
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          display: block;
        }
        h3,
        h4 {
          margin: 0;
          font-weight: var(--ha-font-weight-medium);
        }
        h3 {
          font-size: var(--ha-font-size-m);
        }
        h4 {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-top: var(--ha-space-3);
        }
        .choice {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        .radios,
        .kinds,
        .app-list {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
          margin: 0;
          padding: 0;
          list-style: none;
        }
        button {
          font: inherit;
          color: inherit;
          cursor: pointer;
          border: 0;
          text-align: start;
        }
        .radio,
        .kind-main,
        .apps-row {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          min-height: 52px;
          padding: var(--ha-space-2) var(--ha-space-3);
          border-radius: var(--ha-border-radius-lg);
          background: var(--secondary-background-color);
          flex: 1;
          min-width: 0;
        }
        .radio.selected {
          background: var(--primary-color);
          color: var(--text-primary-color);
        }
        .radio.selected .sub {
          color: inherit;
          opacity: 0.85;
        }
        .dot {
          flex: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          box-shadow: inset 0 0 0 2px currentColor;
        }
        .selected .dot {
          box-shadow: inset 0 0 0 6px currentColor;
        }
        .text {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }
        .name {
          font-size: var(--ha-font-size-m);
        }
        .sub,
        .note,
        .summary {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
          margin: 0;
        }
        .summary {
          color: var(--primary-text-color);
        }
        .kind {
          display: flex;
          gap: var(--ha-space-1);
        }
        .pill {
          flex: none;
          padding: 2px 10px;
          border-radius: 14px;
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-medium);
          background: var(--card-background-color);
          color: var(--secondary-text-color);
        }
        .pill.yes {
          background: var(--success-color);
          color: var(--text-primary-color);
        }
        .open-apps {
          flex: none;
          width: 48px;
          border-radius: var(--ha-border-radius-lg);
          background: var(--secondary-background-color);
          display: grid;
          place-items: center;
        }
        .apps {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        .app {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          min-height: 52px;
          padding: var(--ha-space-1) var(--ha-space-2);
        }
        .later {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          min-height: 48px;
        }
        .segments {
          display: flex;
          gap: 2px;
        }
        .segment {
          min-height: 40px;
          padding: 0 var(--ha-space-3);
          background: var(--secondary-background-color);
        }
        .segment.selected {
          background: var(--primary-color);
          color: var(--text-primary-color);
        }
        button:focus-visible,
        input:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: no-preference) {
          .radio,
          .pill {
            transition: background-color 0.2s;
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-update-backup-choice": HaUpdateBackupChoice;
  }
}
