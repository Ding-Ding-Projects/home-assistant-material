import { mdiClose, mdiRestore } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import type {
  TabAppearance,
  TabAppearanceProperty,
  TabAppearanceStore,
} from "../../common/tabs/tab-appearance-store";
import {
  appearanceFor,
  readTabAppearance,
  resetAllTabs,
  resetTab,
  resetTabProperty,
  setTabAppearance,
  writeTabAppearance,
} from "../../common/tabs/tab-appearance-store";
import type { DockEdge } from "../../common/tabs/tab-dock";
import type { HomeAssistant } from "../../types";
import "../appearance/ha-appearance-color-picker";
import "../ha-icon-button";
import "../ha-select";
import type { HaSelectSelectEvent } from "../ha-select";
import "../ha-slider";
import type { HaSlider } from "../ha-slider";
import "../ha-svg-icon";
import "../input/ha-input";
import type { HaInput } from "../input/ha-input";
import type { Placement } from "./tab-menu-placement";
import { placeBeside } from "./tab-menu-placement";
import { tabSharedStyles } from "./tab-shared-styles";

declare global {
  interface HTMLElementTagNameMap {
    "ha-tab-appearance-editor": HaTabAppearanceEditor;
  }
}

type FieldKind = "color" | "text" | "select" | "range";

interface Field {
  property: TabAppearanceProperty;
  kind: FieldKind;
  /** The choices of a select, as stored values. */
  options?: string[];
}

/** The most a corner can be rounded, in pixels. */
const MAX_RADIUS = 28;

const FIELDS: Field[] = [
  { property: "color", kind: "color" },
  { property: "background", kind: "color" },
  { property: "borderColor", kind: "color" },
  { property: "icon", kind: "text" },
  { property: "label", kind: "text" },
  {
    property: "fontWeight",
    kind: "select",
    options: ["400", "500", "600", "700"],
  },
  { property: "fontStyle", kind: "select", options: ["normal", "italic"] },
  { property: "radius", kind: "range" },
  {
    property: "density",
    kind: "select",
    options: ["compact", "comfortable", "spacious"],
  },
];

/** The select value that means "use the theme", which removes the property. */
const UNSET = "__unset";

const HEX = /^#[0-9a-f]{6}$/i;

export interface TabAppearanceTarget {
  surface: string;
  tabId: string;
  /** The visible label of the tab. */
  label: string;
  /** The element the editor opens beside. */
  anchor: HTMLElement;
  dock?: DockEdge;
}

/**
 * @element ha-tab-appearance-editor
 *
 * @summary
 * The look of one tab, edited beside the tab. It is not modal: the page stays
 * usable, every change is saved at once under the tab's stable id (so the look
 * follows the tab when it moves) and the strip shows it as it changes. Each
 * property has its own reset, and so does the tab and the whole strip. Escape
 * or the close button closes it and gives the focus back to the tab.
 */
@customElement("ha-tab-appearance-editor")
export class HaTabAppearanceEditor extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _target?: TabAppearanceTarget;

  @state() private _store: TabAppearanceStore = {};

  @state() private _placement?: Placement;

  @query("#panel") private _panel?: HTMLElement;

  private _lang = new LanguageModeController(this);

  private _t = (key: string, values?: Record<string, string | number>) =>
    this._lang.text(this.hass.localize, key, values);

  /** Opens the editor for a tab. */
  public async show(target: TabAppearanceTarget) {
    this._target = target;
    this._store = readTabAppearance();
    this._placement = undefined;
    await this.updateComplete;
    this._panel?.showPopover();
    window.addEventListener("resize", this._place);
    await this.updateComplete;
    this._place();
    this._panel?.focus();
  }

  public close(returnFocus = true) {
    window.removeEventListener("resize", this._place);
    if (this._panel?.matches(":popover-open")) {
      this._panel.hidePopover();
    }
    const anchor = this._target?.anchor;
    if (returnFocus && anchor?.isConnected) {
      anchor.focus();
    }
  }

  public get isOpen(): boolean {
    return Boolean(this._panel?.matches(":popover-open"));
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("resize", this._place);
  }

  private _place = () => {
    const target = this._target;
    if (!target || !this._panel) {
      return;
    }
    const size = this._panel.getBoundingClientRect();
    this._placement = placeBeside(
      target.anchor.getBoundingClientRect(),
      { width: Math.max(size.width, 320), height: size.height || 420 },
      {
        width: window.visualViewport?.width ?? window.innerWidth,
        height: window.visualViewport?.height ?? window.innerHeight,
      },
      target.dock ?? "left",
      document.dir === "rtl"
    );
  };

  private get _look(): TabAppearance {
    const target = this._target;
    return target
      ? appearanceFor(this._store, target.surface, target.tabId)
      : {};
  }

  private _save(next: TabAppearanceStore) {
    this._store = next;
    writeTabAppearance(next);
  }

  private _set(prop: TabAppearanceProperty, value: string | undefined) {
    const target = this._target;
    if (!target) {
      return;
    }
    this._save(
      value === undefined || value === ""
        ? resetTabProperty(this._store, target.surface, target.tabId, prop)
        : setTabAppearance(
            this._store,
            target.surface,
            target.tabId,
            prop,
            value
          )
    );
  }

  protected render(): TemplateResult {
    const target = this._target;
    const placement = this._placement;
    const base = "ui.page_tabs.tab_appearance.";
    return html`
      <div
        id="panel"
        popover="manual"
        role="dialog"
        tabindex="-1"
        aria-label=${
          target && this.hass
            ? this._t(`${base}title`, { name: target.label })
            : ""
        }
        class=${placement?.sheet ? "sheet" : ""}
        style=${styleMap(
          placement && !placement.sheet
            ? {
                left: `${placement.left}px`,
                top: `${placement.top}px`,
                "max-height": `${placement.maxHeight}px`,
                "max-width": `${placement.maxWidth}px`,
              }
            : {}
        )}
        @keydown=${this._keydown}
      >
        ${
          target && this.hass
            ? html`
                <div class="head">
                  <h2 class="title">
                    ${this._t(`${base}title`, { name: target.label })}
                  </h2>
                  <ha-icon-button
                    .path=${mdiClose}
                    .label=${this._t(`${base}close`)}
                    @click=${this._closeClicked}
                  ></ha-icon-button>
                </div>
                <p class="note">${this._t(`${base}hint`)}</p>
                ${FIELDS.map((field) => this._renderField(field))}
                <div class="buttons">
                  <button class="text-button" @click=${this._resetTab}>
                    ${this._t(`${base}reset_tab`)}
                  </button>
                  <button class="text-button" @click=${this._resetAll}>
                    ${this._t(`${base}reset_all`)}
                  </button>
                </div>
              `
            : nothing
        }
      </div>
    `;
  }

  private _renderField(field: Field): TemplateResult {
    const base = "ui.page_tabs.tab_appearance.";
    const value = this._look[field.property];
    const label = this._t(`${base}field_${field.property}`);
    return html`
      <div class="field">
        <div class="control">
          ${
            field.kind === "color"
              ? html`<ha-appearance-color-picker
                  .label=${label}
                  .value=${value && HEX.test(value) ? value : undefined}
                  .field=${field.property}
                  @appearance-color-changed=${this._colorChanged}
                ></ha-appearance-color-picker>`
              : field.kind === "text"
                ? html`<ha-input
                    appearance="outlined"
                    .label=${label}
                    .value=${value ?? ""}
                    .field=${field.property}
                    @input=${this._textChanged}
                    @change=${this._textChanged}
                  ></ha-input>`
                : field.kind === "select"
                  ? html`<ha-select
                      .label=${label}
                      .value=${value ?? UNSET}
                      .field=${field.property}
                      .options=${[
                        {
                          value: UNSET,
                          label: this._t(`${base}theme_default`),
                        },
                        ...(field.options ?? []).map((option) => ({
                          value: option,
                          label: this._t(`${base}option_${option}`),
                        })),
                      ]}
                      @selected=${this._selectChanged}
                    ></ha-select>`
                  : html`<div class="range">
                      <span class="range-label">${label}</span>
                      <ha-slider
                        .min=${0}
                        .max=${MAX_RADIUS}
                        .step=${1}
                        .value=${value ? parseInt(value, 10) || 0 : 0}
                        .field=${field.property}
                        aria-label=${label}
                        @input=${this._rangeChanged}
                        @change=${this._rangeChanged}
                      ></ha-slider>
                      <output
                        >${value ? `${parseInt(value, 10) || 0} px` : this._t(`${base}theme_default`)}</output
                      >
                    </div>`
          }
        </div>
        <ha-icon-button
          .path=${mdiRestore}
          .label=${this._t(`${base}reset_property`, { field: label })}
          .field=${field.property}
          ?disabled=${value === undefined}
          @click=${this._resetProperty}
        ></ha-icon-button>
      </div>
    `;
  }

  private _colorChanged(ev: Event) {
    ev.stopPropagation();
    const picker = ev.currentTarget as HTMLElement & {
      field: TabAppearanceProperty;
    };
    this._set(
      picker.field,
      (ev as CustomEvent<{ value: string }>).detail.value
    );
  }

  private _textChanged(ev: Event) {
    ev.stopPropagation();
    const input = ev.currentTarget as HaInput & {
      field: TabAppearanceProperty;
    };
    this._set(input.field, (input.value ?? "").trim());
  }

  private _selectChanged(ev: HaSelectSelectEvent<string>) {
    ev.stopPropagation();
    const select = ev.currentTarget as HTMLElement & {
      field: TabAppearanceProperty;
    };
    const chosen = String(ev.detail.value);
    this._set(select.field, chosen === UNSET ? undefined : chosen);
  }

  private _rangeChanged(ev: Event) {
    ev.stopPropagation();
    const slider = ev.currentTarget as HaSlider & {
      field: TabAppearanceProperty;
    };
    this._set(slider.field, `${Math.round(Number(slider.value))}px`);
  }

  private _resetProperty(ev: Event) {
    const button = ev.currentTarget as HTMLElement & {
      field: TabAppearanceProperty;
    };
    this._set(button.field, undefined);
  }

  private _resetTab() {
    const target = this._target;
    if (target) {
      this._save(resetTab(this._store, target.surface, target.tabId));
    }
  }

  private _resetAll() {
    const target = this._target;
    if (target) {
      this._save(resetAllTabs(this._store, target.surface));
    }
  }

  private _closeClicked() {
    this.close();
  }

  private _keydown(ev: KeyboardEvent) {
    if (ev.key === "Escape") {
      ev.stopPropagation();
      this.close();
    }
  }

  static styles: CSSResultGroup = [
    tabSharedStyles,
    css`
      #panel {
        position: fixed;
        inset: auto;
        margin: 0;
        box-sizing: border-box;
        width: min(360px, calc(100vw - 16px));
        padding: var(--ha-space-4);
        border: none;
        border-radius: var(--ha-border-radius-3xl);
        background: var(--card-background-color);
        color: var(--primary-text-color);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
        overflow-y: auto;
      }
      #panel:popover-open {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-3);
      }
      #panel:focus {
        outline: none;
      }
      #panel.sheet {
        inset: auto 0 0 0;
        width: 100%;
        max-width: none;
        max-height: 90vh;
        border-radius: var(--ha-border-radius-4xl) var(--ha-border-radius-4xl) 0
          0;
      }
      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--ha-space-2);
      }
      .title {
        margin: 0;
        font-size: var(--ha-font-size-l);
        font-weight: var(--ha-font-weight-medium);
        overflow-wrap: anywhere;
      }
      .note {
        margin: 0;
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
      }
      .field {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
      }
      .control {
        flex: 1;
        min-width: 0;
      }
      .control ha-input,
      .control ha-select {
        width: 100%;
      }
      .range {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: var(--ha-space-1) var(--ha-space-2);
      }
      .range-label {
        grid-column: 1 / -1;
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
      }
      .range ha-slider {
        width: 100%;
      }
      .buttons {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
      }
      .text-button {
        min-height: 44px;
      }
    `,
  ];
}
