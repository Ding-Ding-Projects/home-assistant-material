import { mdiClose, mdiInformationOutline } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import { parseHelpAddress } from "../help/help-article-path";
import { openHelpArticle } from "../help/open-help-article";
import type { HomeAssistant } from "../../types";
import "../ha-svg-icon";

/** The words the popover uses for its own headings and buttons. */
export interface SettingInfoLabels {
  /** The accessible name of the button, with `{name}` for the setting. */
  button: string;
  close: string;
  what: string;
  defaultValue: string;
  reach: string;
  holding: string;
  holdingNothing: string;
  openHelp: string;
}

let nextId = 0;

/**
 * An information button for one setting or field. It opens a small panel that
 * says what the setting does, its default, where it takes effect, what holds
 * it right now (School mode, a schedule, a shared default) and, when there is
 * a bundled help article for it, a link to that article.
 *
 * The button is a real button: Enter and Space open it, Escape closes it and
 * puts the focus back on the button, and so does the close button. The panel
 * never holds the focus captive, and it stays inside the screen on a phone.
 * Text arrives already localized; only the headings are the component's own,
 * and a page can replace them through `labels`.
 */
@customElement("ha-setting-info")
export class HaSettingInfo extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  /** The name of the setting, used for the button name and the panel title. */
  @property() public label = "";

  /** What the setting does. */
  @property() public description = "";

  /** The default as words, or empty when there is none to show. */
  @property({ attribute: "default-text" }) public defaultText = "";

  /** Where the setting takes effect. */
  @property() public reach = "";

  /** What holds the value right now, or empty when nothing does. */
  @property() public holding = "";

  /** A bundled help article path. The link is left out when it is not one. */
  @property({ attribute: "help-path" }) public helpPath = "";

  /** Replaces the headings, for a page that has its own language mode. */
  @property({ attribute: false }) public labels?: Partial<SettingInfoLabels>;

  @state() private _open = false;

  @state() private _placement: Record<string, string> = {};

  @query(".trigger") private _trigger?: HTMLButtonElement;

  @query(".panel") private _panel?: HTMLElement;

  private _id = `setting-info-${nextId++}`;

  private _lang = new LanguageModeController(this);

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._unlisten();
  }

  private _text(key: keyof SettingInfoLabels, values?: Record<string, string>) {
    const override = this.labels?.[key];
    const names: Record<keyof SettingInfoLabels, string> = {
      button: "button",
      close: "close",
      what: "what",
      defaultValue: "default",
      reach: "reach",
      holding: "holding",
      holdingNothing: "holding_nothing",
      openHelp: "open_help",
    };
    const raw =
      override ??
      (this.hass
        ? this._lang.text(
            this.hass.localize as any,
            `ui.components.setting_info.${names[key]}`,
            values
          )
        : "");
    return values && override
      ? Object.entries(values).reduce(
          (text, [name, value]) => text.split(`{${name}}`).join(value),
          override
        )
      : raw;
  }

  protected updated(changed: PropertyValues) {
    if (changed.has("_open")) {
      if (this._open) {
        this._listen();
        this._place();
        this._panel?.focus({ preventScroll: true });
      } else {
        this._unlisten();
      }
    }
  }

  private _listen() {
    document.addEventListener("pointerdown", this._outside, true);
    document.addEventListener("keydown", this._escape, true);
    window.addEventListener("resize", this._place);
    window.addEventListener("scroll", this._place, true);
  }

  private _unlisten() {
    document.removeEventListener("pointerdown", this._outside, true);
    document.removeEventListener("keydown", this._escape, true);
    window.removeEventListener("resize", this._place);
    window.removeEventListener("scroll", this._place, true);
  }

  /** Puts the panel under the button and keeps it inside the screen. */
  private _place = () => {
    const trigger = this._trigger;
    if (!trigger) {
      return;
    }
    const margin = 16;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - margin * 2);
    const left = Math.max(
      margin,
      Math.min(rect.left, window.innerWidth - margin - width)
    );
    const below = rect.bottom + 4;
    const room = window.innerHeight - below - margin;
    const above = rect.top - 4 - margin;
    const placeAbove = room < 160 && above > room;
    this._placement = placeAbove
      ? {
          left: `${left}px`,
          width: `${width}px`,
          bottom: `${window.innerHeight - rect.top + 4}px`,
          maxHeight: `${Math.max(120, above)}px`,
        }
      : {
          left: `${left}px`,
          width: `${width}px`,
          top: `${below}px`,
          maxHeight: `${Math.max(120, room)}px`,
        };
  };

  private _outside = (ev: Event) => {
    if (!ev.composedPath().includes(this)) {
      this._close(false);
    }
  };

  private _escape = (ev: KeyboardEvent) => {
    if (ev.key === "Escape" && this._open) {
      ev.stopPropagation();
      this._close(true);
    }
  };

  private _focusOut = (ev: FocusEvent) => {
    const next = ev.relatedTarget as Node | null;
    if (
      this._open &&
      next &&
      !this.shadowRoot?.contains(next) &&
      next !== this
    ) {
      this._close(false);
    }
  };

  private _toggle() {
    if (this._open) {
      this._close(true);
    } else {
      this._open = true;
    }
  }

  private _close(returnFocus: boolean) {
    this._open = false;
    if (returnFocus) {
      this._trigger?.focus();
    }
  }

  private _closeButton = () => {
    this._close(true);
  };

  private _openHelp = () => {
    this._close(false);
    openHelpArticle(this, this.helpPath);
  };

  protected render(): TemplateResult {
    const name = this._text("button", { name: this.label });
    const hasHelp = !!this.helpPath && !!parseHelpAddress(this.helpPath);
    const panelId = `${this._id}-panel`;
    const titleId = `${this._id}-title`;
    return html`
      <button
        type="button"
        class="trigger"
        aria-label=${name}
        aria-haspopup="dialog"
        aria-expanded=${this._open ? "true" : "false"}
        aria-controls=${panelId}
        @click=${this._toggle}
      >
        <ha-svg-icon .path=${mdiInformationOutline}></ha-svg-icon>
      </button>
      ${
        this._open
          ? html`<div
              class="panel"
              id=${panelId}
              role="dialog"
              aria-labelledby=${titleId}
              tabindex="-1"
              style=${styleMap(this._placement)}
              @focusout=${this._focusOut}
            >
              <div class="head">
                <h3 id=${titleId}>${this.label}</h3>
                <button
                  type="button"
                  class="close"
                  aria-label=${this._text("close")}
                  @click=${this._closeButton}
                >
                  <ha-svg-icon .path=${mdiClose}></ha-svg-icon>
                </button>
              </div>
              ${this._section("what", this.description)}
              ${this._section("defaultValue", this.defaultText)}
              ${this._section("reach", this.reach)}
              ${this._section(
                "holding",
                this.holding || this._text("holdingNothing")
              )}
              ${
                hasHelp
                  ? html`<button
                      type="button"
                      class="help"
                      @click=${this._openHelp}
                    >
                      ${this._text("openHelp")}
                    </button>`
                  : nothing
              }
            </div>`
          : nothing
      }
    `;
  }

  private _section(
    heading: keyof SettingInfoLabels,
    body: string
  ): TemplateResult | typeof nothing {
    if (!body) {
      return nothing;
    }
    return html`<div class="section">
      <span class="heading">${this._text(heading)}</span>
      <p>${body}</p>
    </div>`;
  }

  static styles: CSSResultGroup = css`
    :host {
      display: inline-flex;
    }
    .trigger,
    .close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 44px;
      min-height: 44px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--secondary-text-color);
      font: inherit;
      cursor: pointer;
    }
    .trigger:hover,
    .close:hover {
      background: var(--secondary-background-color);
    }
    .trigger:focus-visible,
    .close:focus-visible,
    .help:focus-visible,
    .panel:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .trigger[aria-expanded="true"] {
      color: var(--primary-color);
    }
    .panel {
      position: fixed;
      z-index: 8;
      box-sizing: border-box;
      overflow-y: auto;
      padding: var(--ha-space-3) var(--ha-space-4) var(--ha-space-4);
      border-radius: 16px;
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
      text-align: start;
      font-size: var(--ha-font-size-s);
      line-height: var(--ha-line-height-normal, 1.4);
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-2);
    }
    h3 {
      margin: 0;
      min-width: 0;
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
    }
    .section {
      margin-top: var(--ha-space-2);
    }
    .heading {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-xs, 12px);
      font-weight: var(--ha-font-weight-medium);
    }
    p {
      margin: var(--ha-space-1) 0 0;
      overflow-wrap: anywhere;
      white-space: pre-line;
    }
    .help {
      min-height: 44px;
      margin-top: var(--ha-space-2);
      padding: 0 var(--ha-space-2);
      border: 0;
      background: none;
      color: var(--primary-color);
      font: inherit;
      cursor: pointer;
    }
    @media (prefers-reduced-motion: reduce) {
      * {
        transition: none !important;
        animation: none !important;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-setting-info": HaSettingInfo;
  }
}
