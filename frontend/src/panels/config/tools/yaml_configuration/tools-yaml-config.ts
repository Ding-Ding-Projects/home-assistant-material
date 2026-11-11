import {
  mdiAlertOutline,
  mdiCheck,
  mdiHelpCircleOutline,
  mdiRestart,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { componentsWithService } from "../../../../common/config/components_with_service";
import type { HASSDomTargetEvent } from "../../../../common/dom/fire_event";
import { computeDomain } from "../../../../common/entity/compute_domain";
import { searchMatcher } from "../../../../common/regex/filter";
import { stringCompare } from "../../../../common/string/compare";
import "../../../../components/buttons/ha-call-service-button";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-relative-time";
import "../../../../components/ha-spinner";
import "../../../../components/ha-svg-icon";
import "../../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../../components/input/ha-input-search";
import type { CheckConfigResult } from "../../../../data/core";
import { checkCoreConfig } from "../../../../data/core";
import { domainToName } from "../../../../data/integration";
import { showRestartDialog } from "../../../../dialogs/restart/show-dialog-restart";
import { haStyle } from "../../../../resources/styles";
import type { HomeAssistant, Route, TranslationDict } from "../../../../types";

type ReloadableDomain = Exclude<
  keyof TranslationDict["ui"]["panel"]["config"]["tools"]["tabs"]["yaml"]["section"]["reloading"],
  "heading" | "introduction" | "reload"
>;

interface TranslatedReloadableItem {
  domain: ReloadableDomain | "frontend";
  name: string;
  service?: string;
}

// How many kinds are listed before the rest are folded away
const COLLAPSED_COUNT = 6;

@customElement("tools-yaml-config")
export class ToolsYamlConfig extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  @state() private _validating = false;

  @state() private _reloadableItems: TranslatedReloadableItem[] = [];

  @state() private _validateResult?: CheckConfigResult;

  @state() private _checkedAt?: Date;

  @state() private _filter = "";

  @state() private _showAll = false;

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._validateResult = undefined;
    this._checkedAt = undefined;
  }

  protected updated(changedProperties: PropertyValues<this>) {
    const oldHass = changedProperties.get("hass");
    if (
      changedProperties.has("hass") &&
      (!oldHass ||
        oldHass.config.components !== this.hass.config.components ||
        oldHass.localize !== this.hass.localize)
    ) {
      this._reloadableItems = (
        componentsWithService(this.hass, "reload") as ReloadableDomain[]
      )
        .map<TranslatedReloadableItem>((domain) => ({
          domain,
          name:
            this.hass.localize(
              `ui.panel.config.tools.tabs.yaml.section.reloading.${domain}`
            ) ||
            this.hass.localize(
              "ui.panel.config.tools.tabs.yaml.section.reloading.reload",
              { domain: domainToName(this.hass.localize, domain) }
            ),
        }))
        .concat([
          {
            domain: "frontend",
            service: "reload_themes",
            name: this.hass.localize(
              `ui.panel.config.tools.tabs.yaml.section.reloading.themes`
            ),
          },
        ])
        .sort((a, b) =>
          stringCompare(a.name, b.name, this.hass.locale.language)
        );
    }
  }

  protected render(): TemplateResult {
    return html`
      <div class="content">
        <div class="column">
          ${this._renderValidation()} ${this._renderRestart()}
        </div>
        ${this._renderReloading()}
      </div>
    `;
  }

  private _renderValidation(): TemplateResult {
    const localize = this.hass.localize;
    const result = this._validateResult;
    const invalid = result?.result === "invalid";
    const status = this._validating
      ? "checking"
      : !result
        ? "unchecked"
        : invalid
          ? "invalid"
          : "valid";

    const title = {
      checking: localize(
        "ui.panel.config.tools.tabs.yaml.validation_status.checking"
      ),
      unchecked: localize(
        "ui.panel.config.tools.tabs.yaml.validation_status.not_checked"
      ),
      invalid: localize(
        "ui.panel.config.tools.tabs.yaml.validation_status.invalid_title"
      ),
      valid: localize(
        "ui.panel.config.tools.tabs.yaml.validation_status.valid_title"
      ),
    }[status];

    const detail =
      status === "unchecked" || status === "checking"
        ? localize(
            "ui.panel.config.tools.tabs.yaml.section.validation.introduction"
          )
        : html`${localize(
            "ui.panel.config.tools.tabs.yaml.validation_status.checked",
            {
              time: html`<ha-relative-time
                .datetime=${this._checkedAt}
              ></ha-relative-time>`,
            }
          )}
          ${
            result?.errors
              ? ""
              : localize(
                  "ui.panel.config.tools.tabs.yaml.validation_status.no_errors"
                )
          }
          ${
            result?.warnings
              ? ""
              : localize(
                  "ui.panel.config.tools.tabs.yaml.validation_status.no_warnings"
                )
          }`;

    return html`
      <section class="card">
        <div class="status">
          <div class="tile ${classMap({ [status]: true })}">
            ${
              status === "checking"
                ? html`<ha-spinner size="small"></ha-spinner>`
                : html`<ha-svg-icon
                    .path=${
                      status === "valid"
                        ? mdiCheck
                        : status === "invalid"
                          ? mdiAlertOutline
                          : mdiHelpCircleOutline
                    }
                  ></ha-svg-icon>`
            }
          </div>
          <div class="status-text">
            <h2>${title}</h2>
            <p>${detail}</p>
          </div>
          <ha-button
            appearance="filled"
            .disabled=${this._validating}
            @click=${this._validateConfig}
          >
            ${localize(
              result
                ? "ui.panel.config.tools.tabs.yaml.validation_status.check_again"
                : "ui.panel.config.tools.tabs.yaml.section.validation.check_config"
            )}
          </ha-button>
        </div>
        ${
          result?.errors
            ? html`<ha-alert
                alert-type="error"
                .title=${localize(
                  "ui.panel.config.tools.tabs.yaml.section.validation.errors"
                )}
              >
                <!-- prettier-ignore -->
                <pre class="validate-log">${result.errors}</pre>
              </ha-alert>`
            : nothing
        }
        ${
          result?.warnings
            ? html`<ha-alert
                alert-type="warning"
                .title=${localize(
                  "ui.panel.config.tools.tabs.yaml.section.validation.warnings"
                )}
              >
                <!-- prettier-ignore -->
                <pre class="validate-log">${result.warnings}</pre>
              </ha-alert>`
            : nothing
        }
      </section>
    `;
  }

  private _renderRestart(): TemplateResult {
    const localize = this.hass.localize;
    return html`
      <section class="card">
        <h2>
          ${localize(
            "ui.panel.config.tools.tabs.yaml.section.server_management.restart"
          )}
        </h2>
        <p class="hint">
          ${localize("ui.panel.config.tools.tabs.yaml.restart_hint")}
        </p>
        <div class="actions">
          <ha-button
            variant="danger"
            appearance="outlined"
            .disabled=${this._validateResult?.result === "invalid"}
            @click=${this._restart}
          >
            <ha-svg-icon slot="start" .path=${mdiRestart}></ha-svg-icon>
            ${localize("ui.panel.config.tools.tabs.yaml.restart_home_assistant")}
          </ha-button>
          <ha-button appearance="plain" @click=${this._moreRestartOptions}>
            ${localize("ui.panel.config.tools.tabs.yaml.more_options")}
          </ha-button>
        </div>
      </section>
    `;
  }

  private _renderReloading(): TemplateResult {
    const localize = this.hass.localize;
    const filtering = this._filter.trim() !== "";
    const matches = searchMatcher(this._filter);
    const items = filtering
      ? this._reloadableItems.filter((item) => matches(item.name))
      : this._reloadableItems;
    const visible =
      filtering || this._showAll ? items : items.slice(0, COLLAPSED_COUNT);
    const hidden = items.length - visible.length;

    return html`
      <section class="reloading">
        <h2 class="section-title">
          ${localize("ui.panel.config.tools.tabs.yaml.reload_heading")}
        </h2>
        <p class="hint">
          ${localize(
            "ui.panel.config.tools.tabs.yaml.section.reloading.introduction"
          )}
        </p>
        <div class="reload-toolbar">
          <ha-input-search
            .label=${localize(
              "ui.panel.config.tools.tabs.yaml.search_reloadable"
            )}
            .value=${this._filter}
            @input=${this._filterChanged}
          ></ha-input-search>
          <ha-call-service-button
            domain="homeassistant"
            service="reload_all"
            appearance="filled"
            >${localize(
              "ui.panel.config.tools.tabs.yaml.reload_everything"
            )}</ha-call-service-button
          >
        </div>
        <ul class="reload-list">
          ${
            !filtering ||
            matches(
              localize("ui.panel.config.tools.tabs.yaml.section.reloading.core")
            )
              ? this._renderReloadRow(
                  localize(
                    "ui.panel.config.tools.tabs.yaml.section.reloading.core"
                  ),
                  "homeassistant",
                  "reload_core_config"
                )
              : nothing
          }
          ${visible.map((item) =>
            this._renderReloadRow(
              item.name,
              item.domain,
              item.service || "reload"
            )
          )}
        </ul>
        ${
          filtering && !items.length
            ? html`<p class="hint">
                ${localize("ui.panel.config.tools.tabs.yaml.no_reloadable")}
              </p>`
            : nothing
        }
        ${
          !filtering && items.length > COLLAPSED_COUNT
            ? html`<ha-button
                appearance="plain"
                size="small"
                @click=${this._toggleShowAll}
              >
                ${
                  this._showAll
                    ? localize("ui.panel.config.tools.tabs.yaml.show_fewer")
                    : localize("ui.panel.config.tools.tabs.yaml.more_kinds", {
                        count: hidden,
                      })
                }
              </ha-button>`
            : nothing
        }
      </section>
    `;
  }

  private _renderReloadRow(name: string, domain: string, service: string) {
    // Entities of the same domain are the only count the instance reports
    const count =
      domain === "homeassistant" || domain === "frontend"
        ? 0
        : Object.keys(this.hass.states).filter(
            (entityId) => computeDomain(entityId) === domain
          ).length;
    return html`
      <li class="reload-row">
        <span class="reload-name">${name}</span>
        ${count ? html`<span class="reload-count">${count}</span>` : nothing}
        <ha-call-service-button .domain=${domain} .service=${service}>
          ${this.hass.localize("ui.panel.config.tools.tabs.yaml.reload")}
        </ha-call-service-button>
      </li>
    `;
  }

  private _filterChanged(ev: HASSDomTargetEvent<HaInputSearch>) {
    this._filter = ev.target.value ?? "";
  }

  private _toggleShowAll() {
    this._showAll = !this._showAll;
  }

  private async _validateConfig() {
    this._validating = true;
    this._validateResult = undefined;

    this._validateResult = await checkCoreConfig(this.hass);
    this._checkedAt = new Date();
    this._validating = false;
  }

  private async _restart() {
    await this._validateConfig();
    if (this._validateResult?.result === "invalid") {
      return;
    }
    showRestartDialog(this);
  }

  private _moreRestartOptions() {
    showRestartDialog(this);
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          display: block;
          user-select: initial;
        }

        .content {
          display: grid;
          /* One column until two of at least 420px fit. The narrow attribute
             is not reflected on this element, so the width decides. */
          grid-template-columns: repeat(
            auto-fit,
            minmax(min(100%, 420px), 1fr)
          );
          gap: var(--ha-space-4);
          align-items: start;
          padding: var(--ha-space-4);
          max-width: 1400px;
          margin: 0 auto;
          box-sizing: border-box;
        }

        .column {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
          min-width: 0;
        }

        .card {
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
          padding: var(--ha-space-5);
          border-radius: var(--ha-border-radius-3xl);
          background: var(--card-background-color);
        }

        h2 {
          margin: 0;
          font-family: var(--ha-font-family-heading, inherit);
          font-size: var(--ha-font-size-xl);
          font-weight: var(--ha-font-weight-medium);
        }

        p {
          margin: 0;
        }

        .hint {
          color: var(--secondary-text-color);
        }

        .status {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-4);
        }

        .status-text {
          flex: 1;
          min-width: 160px;
        }

        .status-text p {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
        }

        .tile {
          display: flex;
          align-items: center;
          justify-content: center;
          flex: none;
          width: 56px;
          height: 56px;
          border-radius: var(--ha-border-radius-xl);
          background: var(--secondary-background-color);
          color: var(--secondary-text-color);
        }

        .tile.valid {
          background: var(--ha-color-fill-success-quiet-resting, #c8f0cf);
          color: var(--success-color);
        }

        .tile.invalid {
          background: var(--ha-color-fill-danger-quiet-resting, #f9d6d2);
          color: var(--error-color);
        }

        .actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-3);
        }

        .validate-log {
          white-space: pre-wrap;
          direction: ltr;
          margin: 0;
        }

        .reloading {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
          min-width: 0;
        }

        .section-title {
          padding: 0 var(--ha-space-2);
        }

        .reloading .hint {
          padding: 0 var(--ha-space-2);
        }

        .reload-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-3);
        }

        .reload-toolbar ha-input-search {
          flex: 1;
          min-width: 200px;
        }

        .reload-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }

        .reload-row {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          padding: var(--ha-space-2) var(--ha-space-4);
          border-radius: var(--ha-border-radius-xl);
          background: var(--card-background-color);
        }

        .reload-name {
          flex: 1;
          min-width: 0;
          font-weight: var(--ha-font-weight-medium);
          overflow-wrap: anywhere;
        }

        .reload-count {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "tools-yaml-config": ToolsYamlConfig;
  }
}
