import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import type { LocalizeKeys } from "../../../../common/translations/localize";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-form/ha-form";
import type { HaFormSchema } from "../../../../components/ha-form/types";
import type { LovelaceCardConfig } from "../../../../data/lovelace/config/card";
import "../card-editor/hui-card-style-editor";
import type { LovelaceConfig } from "../../../../data/lovelace/config/types";
import type { HomeAssistant } from "../../../../types";
import type { CopiedStyle } from "./dashboard-edit";
import { copyStyle, pasteStyle, setViewTheme } from "./dashboard-edit";

const SCHEMAS: Record<string, readonly HaFormSchema[]> = {
  tile: [
    { name: "color", selector: { ui_color: {} } },
    { name: "vertical", selector: { boolean: {} } },
    { name: "hide_state", selector: { boolean: {} } },
    { name: "show_entity_picture", selector: { boolean: {} } },
  ],
  button: [
    { name: "show_name", selector: { boolean: {} } },
    { name: "show_icon", selector: { boolean: {} } },
    { name: "show_state", selector: { boolean: {} } },
  ],
  heading: [
    {
      name: "heading_style",
      selector: {
        select: {
          mode: "dropdown",
          options: ["title", "subtitle"],
        },
      },
    },
  ],
};

/**
 * Style of one card and the theme of its view. Only properties the card type
 * really supports are offered. Copy and paste move those same properties,
 * and paste skips anything the target card does not support.
 */
@customElement("hui-dashboard-style")
export class HuiDashboardStyle extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public config!: LovelaceConfig;

  @property({ attribute: false }) public card?: LovelaceCardConfig;

  @property({ type: Number }) public view = 0;

  @property({ attribute: false }) public copied?: CopiedStyle;

  @state() private _message?: string;

  private _t(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.lovelace.editor.dashboard_tools.editing.style.${key}` as LocalizeKeys,
      values
    );
  }

  private _label = (schema: HaFormSchema): string =>
    this._t(`fields.${schema.name}`);

  protected render() {
    if (!this.card) {
      return nothing;
    }
    const schema = SCHEMAS[this.card.type];
    const viewTheme = this.config.views[this.view]?.theme;
    return html`
      <p class="hint">${this._t("intro")}</p>
      <section>
        <h3>${this._t("card")}</h3>
        ${
          schema
            ? html`<ha-form
                .hass=${this.hass}
                .data=${this.card}
                .schema=${schema}
                .computeLabel=${this._label}
                @value-changed=${this._valueChanged}
              ></ha-form>`
            : html`<p class="hint">
                ${this._t("none", { type: this.card.type })}
              </p>`
        }
        <hui-card-style-editor
          .hass=${this.hass}
          .config=${this.card}
          @value-changed=${this._cardStyleChanged}
        ></hui-card-style-editor>
        <div class="actions">
          <ha-button appearance="outlined" size="s" @click=${this._copy}>
            ${this._t("copy")}
          </ha-button>
          <ha-button
            appearance="outlined"
            size="s"
            .disabled=${!this.copied}
            @click=${this._paste}
          >
            ${this._t("paste")}
          </ha-button>
        </div>
        ${
          this._message
            ? html`<p class="hint" aria-live="polite">${this._message}</p>`
            : nothing
        }
      </section>
      <section>
        <h3>${this._t("view_theme")}</h3>
        <ha-form
          .hass=${this.hass}
          .data=${{ theme: viewTheme }}
          .schema=${[{ name: "theme", selector: { theme: {} } }]}
          .computeLabel=${this._label}
          @value-changed=${this._themeChanged}
        ></ha-form>
      </section>
    `;
  }

  private _valueChanged(ev: CustomEvent<{ value: LovelaceCardConfig }>) {
    ev.stopPropagation();
    this._message = undefined;
    fireEvent(this, "dashboard-card-change", { card: ev.detail.value });
  }

  private _cardStyleChanged(ev: CustomEvent<{ value: LovelaceCardConfig }>) {
    ev.stopPropagation();
    this._message = undefined;
    fireEvent(this, "dashboard-card-change", { card: ev.detail.value });
  }

  private _themeChanged(ev: CustomEvent<{ value: { theme?: string } }>) {
    ev.stopPropagation();
    const theme = ev.detail.value.theme;
    fireEvent(this, "dashboard-config-change", {
      config: setViewTheme(
        this.config,
        this.view,
        theme === "remove" ? undefined : theme || undefined
      ),
    });
  }

  private _copy() {
    const style = copyStyle(this.card!);
    fireEvent(this, "dashboard-style-copied", { style });
    this._message = this._t("copied", {
      count: Object.keys(style.values).length,
    });
  }

  private _paste() {
    const { card, applied, skipped } = pasteStyle(this.card!, this.copied!);
    fireEvent(this, "dashboard-card-change", { card });
    this._message = this._t("pasted", {
      applied: applied.length,
      skipped: skipped.length,
    });
  }

  static styles = css`
    .hint {
      margin-top: 0;
      color: var(--secondary-text-color);
    }
    section {
      margin-bottom: var(--ha-space-3);
      padding: var(--ha-space-4);
      border-radius: var(--ha-border-radius-xl);
      background: var(
        --ha-color-surface-tone-1,
        var(--secondary-background-color)
      );
    }
    h3 {
      margin: 0 0 var(--ha-space-3);
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-semibold);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
      margin-top: var(--ha-space-3);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-dashboard-style": HuiDashboardStyle;
  }
}
