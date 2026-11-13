import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { property, state } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import type { LocalizeKeys } from "../../../../common/translations/localize";
import "../../../../components/ha-alert";
import type { LovelaceConfig } from "../../../../data/lovelace/config/types";
import type { HomeAssistant } from "../../../../types";
import type { Lovelace } from "../../types";
import type { DashboardToolsDialogParams } from "../dashboard-tools-dialog/show-dashboard-tools-dialog";

/** Shared parts of the dashboard tool views: text, saving, messages and styles. */
export abstract class ToolView extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public params!: DashboardToolsDialogParams;

  @state() protected _error?: string;

  @state() protected _notice?: string;

  @state() protected _busy = false;

  protected _t(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.lovelace.editor.dashboard_tools.more.${key}` as LocalizeKeys,
      values
    );
  }

  protected get _lovelace(): Lovelace | undefined {
    return this.params.lovelace();
  }

  protected get _config(): LovelaceConfig | undefined {
    return this._lovelace?.config;
  }

  protected _fail(err: unknown): void {
    this._error = this.hass.localize(
      "ui.panel.lovelace.editor.dashboard_tools.failed" as LocalizeKeys,
      { error: err instanceof Error ? err.message : String(err) }
    );
  }

  /** Saves a changed dashboard through the editor, so it joins undo and redo. */
  protected async _save(
    change: (config: LovelaceConfig) => LovelaceConfig,
    notice: string
  ): Promise<boolean> {
    const lovelace = this._lovelace;
    if (!lovelace) {
      return false;
    }
    this._busy = true;
    this._error = undefined;
    this._notice = undefined;
    try {
      await lovelace.saveConfig(change(lovelace.config));
      this._notice = notice;
      return true;
    } catch (err: unknown) {
      this._fail(err);
      return false;
    } finally {
      this._busy = false;
    }
  }

  protected _openView(view: number): void {
    this.params.openView(view);
    fireEvent(this, "close-tool");
  }

  protected _renderMessages(): TemplateResult | typeof nothing {
    return html`${
      this._error
        ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
        : nothing
    }${
      this._notice
        ? html`<ha-alert alert-type="success">${this._notice}</ha-alert>`
        : nothing
    }`;
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    .intro,
    .hint,
    .muted {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .intro {
      margin: 0 0 var(--ha-space-3);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2);
      margin: var(--ha-space-3) 0;
    }
    .grow {
      flex: 1 1 200px;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .list > li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-3);
      padding: var(--ha-space-3);
      margin-bottom: var(--ha-space-2);
      border-radius: var(--ha-border-radius-lg);
      background: var(--secondary-background-color);
    }
    .main {
      flex: 1 1 220px;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
    }
    .main b {
      overflow-wrap: anywhere;
    }
    code,
    .mono {
      font-family: var(--ha-font-family-code);
      font-size: var(--ha-font-size-s);
    }
    .pill {
      display: inline-flex;
      align-items: center;
      padding: 0 var(--ha-space-3);
      min-height: 24px;
      border-radius: var(--ha-border-radius-pill);
      font-size: var(--ha-font-size-s);
      background: var(--ha-color-surface-tone-2, var(--divider-color));
      color: var(--primary-text-color);
    }
    .pill.error {
      background: var(--ha-color-error-container, var(--error-color));
      color: var(--ha-color-on-error-container, var(--text-primary-color));
    }
    .pill.warning {
      background: var(--ha-color-warning-container, var(--warning-color));
      color: var(--ha-color-on-warning-container, var(--primary-text-color));
    }
    .pill.success {
      background: var(--ha-color-success-container, var(--success-color));
      color: var(--ha-color-on-success-container, var(--text-primary-color));
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: var(--ha-space-3);
      margin-bottom: var(--ha-space-3);
    }
    .stat {
      display: flex;
      flex-direction: column;
      padding: var(--ha-space-3);
      border-radius: var(--ha-border-radius-lg);
      background: var(--secondary-background-color);
    }
    .stat strong {
      font-size: var(--ha-font-size-2xl);
    }
    .empty {
      padding: var(--ha-space-6) var(--ha-space-3);
      text-align: center;
      color: var(--secondary-text-color);
    }
    .link {
      background: none;
      border: none;
      padding: 0;
      font: inherit;
      color: var(--primary-color);
      cursor: pointer;
      text-decoration: underline;
    }
    .link:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    ha-input,
    ha-select {
      flex: 1 1 200px;
    }
  `;
}

declare global {
  interface HASSDomEvents {
    "close-tool": undefined;
  }
}
