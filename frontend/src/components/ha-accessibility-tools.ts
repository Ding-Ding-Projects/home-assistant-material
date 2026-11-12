import {
  mdiAccountVoice,
  mdiChevronRight,
  mdiContrastCircle,
  mdiEyeOff,
  mdiFocusField,
  mdiFormatSize,
  mdiFormatLineSpacing,
  mdiFormatLetterCase,
  mdiFormatFont,
  mdiGestureTapButton,
  mdiHuman,
  mdiKeyboard,
  mdiMinus,
  mdiMotionPauseOutline,
  mdiPlay,
  mdiPlus,
  mdiRestore,
  mdiStop,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import type {
  AccessibilityContrast,
  AccessibilitySettings,
} from "../common/accessibility/accessibility-tools";
import {
  ACCESSIBILITY_STORAGE_KEY,
  canReadAloud,
  collectReadableText,
  DEFAULT_ACCESSIBILITY_SETTINGS,
  normalizeAccessibilitySettings,
  readAloud,
  stopReadingAloud,
  TEXT_SCALE_STEPS,
} from "../common/accessibility/accessibility-tools";
import {
  DEFAULT_READING_OPTIONS,
  getReadingOptions,
  isDefaultReadingOptions,
  LINE_SPACINGS,
  setReadingOptions,
  startReadingOptions,
  subscribeReadingOptions,
} from "../common/appearance/reading-options";
import type {
  LineSpacing,
  ReadingOptions,
} from "../common/appearance/reading-options";
import { startTypeScale } from "../common/appearance/type-scale";
import { storage } from "../common/decorators/storage";
import { showConfirmationDialog } from "../dialogs/generic/show-dialog-box";
import { showShortcutsDialog } from "../dialogs/shortcuts/show-shortcuts-dialog";
import type { HomeAssistant } from "../types";
import { isMac } from "../util/is_mac";
import { showToast } from "../util/toast";
import "./ha-svg-icon";
import "./ha-switch";

const CONTRASTS: AccessibilityContrast[] = ["standard", "more", "most"];

type SwitchSetting = "reduceMotion" | "showFocus" | "largerTargets";

/**
 * @element ha-accessibility-tools
 *
 * @summary
 * The accessibility tools panel: text size, contrast, reduced motion, a ring
 * on the focused control, larger targets, reading the page aloud and keyboard
 * help. Opened from the top bar button or with Alt+A. The choices are kept in
 * this browser and applied by the main layout, also while the button is
 * hidden.
 */
@customElement("ha-accessibility-tools")
export class HaAccessibilityTools extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** Returns the part of the page that Read aloud reads. */
  @property({ attribute: false }) public pageRoot?: () => Node | null;

  @state()
  @storage({ key: ACCESSIBILITY_STORAGE_KEY, state: true, subscribe: true })
  private _stored?: Partial<AccessibilitySettings>;

  @state() private _reading = false;

  @state() private _options: ReadingOptions = getReadingOptions();

  @state() private _fontsOpen = false;

  private _stopReadingOptions?: () => void;

  private _stopTypeScale?: () => void;

  private _unsubReadingOptions?: () => void;

  @query("#panel") private _panel?: HTMLElement;

  private _closedAt = 0;

  /** The control that opened the panel, so focus can go back to it. */
  private _trigger?: HTMLElement;

  /** Opens the panel, or closes it when it is open. */
  public toggle() {
    if (!this._panel) {
      return;
    }
    if (this._panel.matches(":popover-open")) {
      this._panel.hidePopover();
      return;
    }
    // A press on the button that opened the panel first dismisses it. Do not
    // open it again for that same press.
    if (Date.now() - this._closedAt < 250) {
      return;
    }
    this._rememberTrigger();
    this._panel.showPopover();
  }

  public connectedCallback() {
    super.connectedCallback();
    // Line spacing, letter spacing and typefaces are applied from here, so
    // they hold also while the button is hidden.
    this._stopReadingOptions = startReadingOptions();
    // A stored type scale holds from the start, not only while the fonts
    // dialog is open.
    this._stopTypeScale = startTypeScale();
    this._unsubReadingOptions = subscribeReadingOptions((options) => {
      this._options = options;
    });
    this._options = getReadingOptions();
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._stopReadingOptions?.();
    this._stopTypeScale?.();
    this._unsubReadingOptions?.();
    if (this._reading) {
      stopReadingAloud();
      this._reading = false;
    }
  }

  private get _settings(): AccessibilitySettings {
    return normalizeAccessibilitySettings(this._stored);
  }

  private _update(change: Partial<AccessibilitySettings>) {
    this._stored = { ...this._settings, ...change };
  }

  protected render(): TemplateResult {
    const settings = this._settings;
    const localize = this.hass.localize;
    const stepIndex = TEXT_SCALE_STEPS.indexOf(settings.textScale);
    const isDefault =
      JSON.stringify(settings) ===
        JSON.stringify(DEFAULT_ACCESSIBILITY_SETTINGS) &&
      isDefaultReadingOptions(this._options);

    return html`
      <div
        id="panel"
        popover
        role="dialog"
        aria-label=${localize("ui.accessibility_tools.title")}
        @toggle=${this._toggled}
      >
        <div class="header">
          <ha-svg-icon .path=${mdiHuman}></ha-svg-icon>
          <h2>${localize("ui.accessibility_tools.title")}</h2>
          <kbd>${isMac ? "⌥ A" : "Alt A"}</kbd>
        </div>

        <div class="row">
          <span class="lead"
            ><ha-svg-icon .path=${mdiFormatSize}></ha-svg-icon
          ></span>
          <span class="text">
            <span class="name"
              >${localize("ui.accessibility_tools.text_size")}</span
            >
          </span>
          <span class="stepper">
            <button
              class="round"
              aria-label=${localize("ui.accessibility_tools.text_smaller")}
              ?disabled=${stepIndex <= 0}
              @click=${this._textSmaller}
            >
              <ha-svg-icon .path=${mdiMinus}></ha-svg-icon>
            </button>
            <span class="value" role="status" aria-live="polite"
              >${Math.round(settings.textScale * 100)}%</span
            >
            <button
              class="round"
              aria-label=${localize("ui.accessibility_tools.text_larger")}
              ?disabled=${stepIndex >= TEXT_SCALE_STEPS.length - 1}
              @click=${this._textLarger}
            >
              <ha-svg-icon .path=${mdiPlus}></ha-svg-icon>
            </button>
          </span>
        </div>

        <div class="row">
          <span class="lead"
            ><ha-svg-icon .path=${mdiContrastCircle}></ha-svg-icon
          ></span>
          <span class="text">
            <span class="name" id="contrast-label"
              >${localize("ui.accessibility_tools.contrast")}</span
            >
          </span>
          <div
            class="segments"
            role="radiogroup"
            aria-labelledby="contrast-label"
          >
            ${CONTRASTS.map(
              (contrast) => html`
                <button
                  role="radio"
                  aria-checked=${
                    settings.contrast === contrast ? "true" : "false"
                  }
                  .contrast=${contrast}
                  @click=${this._contrastChanged}
                >
                  ${localize(`ui.accessibility_tools.contrast_${contrast}`)}
                </button>
              `
            )}
          </div>
        </div>

        <div class="row">
          <span class="lead"
            ><ha-svg-icon .path=${mdiFormatLineSpacing}></ha-svg-icon
          ></span>
          <span class="text">
            <span class="name" id="spacing-label"
              >${localize("ui.accessibility_tools.line_spacing")}</span
            >
          </span>
          <div
            class="segments"
            role="radiogroup"
            aria-labelledby="spacing-label"
          >
            ${LINE_SPACINGS.map(
              (spacing) => html`
                <button
                  role="radio"
                  aria-checked=${
                    this._options.lineSpacing === spacing ? "true" : "false"
                  }
                  .spacing=${spacing}
                  @click=${this._lineSpacingChanged}
                >
                  ${localize(`ui.accessibility_tools.line_spacing_${spacing}`)}
                </button>
              `
            )}
          </div>
        </div>

        <label class="row">
          <span class="lead"
            ><ha-svg-icon .path=${mdiFormatLetterCase}></ha-svg-icon
          ></span>
          <span class="text">
            <span class="name"
              >${localize("ui.accessibility_tools.wide_spacing")}</span
            >
            <span class="note"
              >${localize("ui.accessibility_tools.wide_spacing_note")}</span
            >
          </span>
          <ha-switch
            .checked=${this._options.wideSpacing}
            @change=${this._wideSpacingChanged}
          ></ha-switch>
        </label>

        ${this._renderSwitch(
          "reduceMotion",
          mdiMotionPauseOutline,
          settings.reduceMotion
        )}
        ${this._renderSwitch("showFocus", mdiFocusField, settings.showFocus)}
        ${this._renderSwitch(
          "largerTargets",
          mdiGestureTapButton,
          settings.largerTargets
        )}
        ${
          canReadAloud()
            ? html`
                <div class="row">
                  <span class="lead"
                    ><ha-svg-icon .path=${mdiAccountVoice}></ha-svg-icon
                  ></span>
                  <span class="text">
                    <span class="name"
                      >${localize("ui.accessibility_tools.read_aloud")}</span
                    >
                    <span class="note"
                      >${localize("ui.accessibility_tools.read_aloud_note")}</span
                    >
                  </span>
                  <button class="tonal" @click=${this._toggleReading}>
                    <ha-svg-icon
                      .path=${this._reading ? mdiStop : mdiPlay}
                    ></ha-svg-icon>
                    ${localize(
                      this._reading
                        ? "ui.accessibility_tools.read_stop"
                        : "ui.accessibility_tools.read_start"
                    )}
                  </button>
                </div>
              `
            : nothing
        }

        <button class="row link" @click=${this._openFonts}>
          <span class="lead"
            ><ha-svg-icon .path=${mdiFormatFont}></ha-svg-icon
          ></span>
          <span class="text">
            <span class="name"
              >${localize("ui.accessibility_tools.fonts")}</span
            >
            <span class="note"
              >${localize("ui.accessibility_tools.fonts_note")}</span
            >
          </span>
          <ha-svg-icon class="chevron" .path=${mdiChevronRight}></ha-svg-icon>
        </button>

        <button class="row link" @click=${this._keyboardHelp}>
          <span class="lead"
            ><ha-svg-icon .path=${mdiKeyboard}></ha-svg-icon
          ></span>
          <span class="text">
            <span class="name"
              >${localize("ui.accessibility_tools.keyboard_help")}</span
            >
            <span class="note"
              >${localize("ui.accessibility_tools.keyboard_help_note")}</span
            >
          </span>
          <ha-svg-icon class="chevron" .path=${mdiChevronRight}></ha-svg-icon>
        </button>

        <div class="footer">
          <button
            class="text-button"
            ?disabled=${isDefault}
            @click=${this._reset}
          >
            <ha-svg-icon .path=${mdiRestore}></ha-svg-icon>
            ${localize("ui.accessibility_tools.reset")}
          </button>
          <button class="text-button" @click=${this._toggleButton}>
            <ha-svg-icon .path=${mdiEyeOff}></ha-svg-icon>
            ${localize(
              settings.hideButton
                ? "ui.accessibility_tools.show_button"
                : "ui.accessibility_tools.hide_button"
            )}
          </button>
        </div>
        <p class="kept">${localize("ui.accessibility_tools.kept")}</p>
      </div>
      ${
        this._fontsOpen
          ? html`<ha-appearance-fonts
              .hass=${this.hass}
              @closed=${this._fontsClosed}
            ></ha-appearance-fonts>`
          : nothing
      }
    `;
  }

  private _renderSwitch(
    setting: SwitchSetting,
    icon: string,
    checked: boolean
  ) {
    const key = {
      reduceMotion: "reduce_motion",
      showFocus: "show_focus",
      largerTargets: "larger_targets",
    }[setting] as "reduce_motion" | "show_focus" | "larger_targets";
    return html`
      <label class="row">
        <span class="lead"><ha-svg-icon .path=${icon}></ha-svg-icon></span>
        <span class="text">
          <span class="name"
            >${this.hass.localize(`ui.accessibility_tools.${key}`)}</span
          >
          <span class="note"
            >${this.hass.localize(`ui.accessibility_tools.${key}_note`)}</span
          >
        </span>
        <ha-switch
          .checked=${checked}
          .setting=${setting}
          @change=${this._switchChanged}
        ></ha-switch>
      </label>
    `;
  }

  private _toggled(ev: ToggleEvent) {
    if (ev.newState === "closed") {
      this._closedAt = Date.now();
      return;
    }
    // Move focus into the panel, to its first usable control.
    this._panel?.querySelector<HTMLElement>("button:not([disabled])")?.focus();
  }

  private _rememberTrigger() {
    let active: Element | null = document.activeElement;
    while (active?.shadowRoot?.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    this._trigger =
      active instanceof HTMLElement && active !== document.body
        ? active
        : undefined;
  }

  private _textSmaller() {
    const index = TEXT_SCALE_STEPS.indexOf(this._settings.textScale);
    this._update({ textScale: TEXT_SCALE_STEPS[Math.max(0, index - 1)] });
  }

  private _textLarger() {
    const index = TEXT_SCALE_STEPS.indexOf(this._settings.textScale);
    this._update({
      textScale:
        TEXT_SCALE_STEPS[Math.min(TEXT_SCALE_STEPS.length - 1, index + 1)],
    });
  }

  private _contrastChanged(ev: Event) {
    this._update({
      contrast: (
        ev.currentTarget as HTMLElement & { contrast: AccessibilityContrast }
      ).contrast,
    });
  }

  private _switchChanged(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      checked: boolean;
      setting: SwitchSetting;
    };
    this._update({ [target.setting]: target.checked });
  }

  private _toggleReading() {
    if (this._reading) {
      stopReadingAloud();
      this._reading = false;
      return;
    }
    const root = this.pageRoot?.();
    if (!root) {
      return;
    }
    this._reading = true;
    const started = readAloud(
      collectReadableText(root),
      this.hass.language,
      () => {
        this._reading = false;
      },
      () => {
        showToast(this, {
          message: this.hass.localize("ui.accessibility_tools.no_device_voice"),
        });
      }
    );
    if (!started) {
      showToast(this, {
        message: this.hass.localize("ui.accessibility_tools.no_device_voice"),
      });
    }
  }

  private _lineSpacingChanged(ev: Event) {
    setReadingOptions({
      ...this._options,
      lineSpacing: (ev.currentTarget as HTMLElement & { spacing: LineSpacing })
        .spacing,
    });
  }

  private _wideSpacingChanged(ev: Event) {
    setReadingOptions({
      ...this._options,
      wideSpacing: (ev.currentTarget as HTMLElement & { checked: boolean })
        .checked,
    });
  }

  private async _openFonts() {
    this._panel?.hidePopover();
    await import("./appearance/ha-appearance-fonts");
    this._fontsOpen = true;
  }

  private _fontsClosed() {
    this._fontsOpen = false;
    if (this._trigger?.isConnected) {
      this._trigger.focus();
    }
  }

  private _keyboardHelp() {
    this._panel?.hidePopover();
    showShortcutsDialog(this);
  }

  private _reset() {
    setReadingOptions({ ...DEFAULT_READING_OPTIONS });
    this._stored = {
      ...DEFAULT_ACCESSIBILITY_SETTINGS,
      hideButton: this._settings.hideButton,
    };
  }

  private async _toggleButton() {
    if (this._settings.hideButton) {
      this._update({ hideButton: false });
      return;
    }
    this._panel?.hidePopover();
    const confirmed = await showConfirmationDialog(this, {
      title: this.hass.localize("ui.accessibility_tools.hide_title"),
      text: this.hass.localize("ui.accessibility_tools.hide_text", {
        shortcut: isMac ? "⌥ A" : "Alt+A",
      }),
      confirmText: this.hass.localize("ui.accessibility_tools.hide_confirm"),
    });
    if (confirmed) {
      this._update({ hideButton: true });
    }
  }

  static styles: CSSResultGroup = css`
    :host {
      font-family: var(--ha-font-family-body);
    }
    button {
      font: inherit;
      color: inherit;
      border: none;
      background: none;
      cursor: pointer;
      padding: 0;
    }
    button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    button[disabled] {
      opacity: 0.4;
      cursor: default;
    }
    #panel {
      position: fixed;
      inset: auto;
      --ha-access-panel-top: calc(
        var(--ha-page-tabs-top, 12px) + var(--ha-page-tabs-height, 0px) +
          var(--ha-space-1)
      );
      top: var(--ha-access-panel-top);
      inset-inline-end: calc(var(--ha-pane-gap, 0px) + var(--ha-space-3));
      margin: 0;
      width: min(440px, calc(100vw - 24px));
      /* Uses the room below the panel's top edge, so the closing note is
         inside it whenever the window is tall enough; the panel scrolls
         when it is not. */
      max-height: calc(100dvh - var(--ha-access-panel-top) - var(--ha-space-3));
      box-sizing: border-box;
      padding: var(--ha-space-4);
      border: var(--ha-pane-outline, none);
      border-radius: var(--ha-border-radius-4xl);
      background-color: var(--primary-background-color);
      color: var(--primary-text-color);
      box-shadow:
        0 4px 8px 3px rgba(0, 0, 0, 0.1),
        0 1px 3px rgba(0, 0, 0, 0.2);
      overflow-y: auto;
      flex-direction: column;
      gap: var(--ha-space-1);
    }
    #panel:popover-open {
      display: flex;
    }
    /* The panel scrolls. Its rows keep their full height: a row squeezed to
       fit would spill its wrapped controls over the row below. */
    #panel > * {
      flex-shrink: 0;
    }
    /* On a phone the panel is a sheet above the bottom bar. */
    @media (max-width: 700px) {
      #panel {
        top: auto;
        inset-inline: var(--ha-space-3);
        /* The bar's height counts only while the bar is shown. */
        bottom: calc(
          var(--ha-phone-bar-visible-height, var(--ha-phone-bar-height, 0px)) +
            var(--ha-space-2) +
            var(--app-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))
        );
        width: auto;
        max-height: calc(100dvh - 140px);
      }
    }
    .header {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      padding: var(--ha-space-1) var(--ha-space-2) var(--ha-space-3);
    }
    h2 {
      flex: 1;
      margin: 0;
      font-size: var(--ha-font-size-xl);
      font-weight: var(--ha-font-weight-medium);
      line-height: var(--ha-line-height-condensed);
    }
    kbd {
      font-family: var(--ha-font-family-body);
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
      padding: var(--ha-space-1) var(--ha-space-2);
      border-radius: var(--ha-border-radius-md);
      border: 1px solid var(--outline-hover-color);
      color: var(--secondary-text-color);
      white-space: nowrap;
    }
    /* A touch screen has no keyboard to press the shortcut on. */
    @media (pointer: coarse) {
      kbd {
        display: none;
      }
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-3);
      min-height: var(--ha-space-14);
      padding: var(--ha-space-1) var(--ha-space-2);
      border-radius: var(--ha-border-radius-2xl);
      box-sizing: border-box;
      width: 100%;
      text-align: start;
    }
    label.row,
    .row.link {
      cursor: pointer;
    }
    label.row:hover,
    .row.link:hover {
      background-color: var(--card-background-color);
    }
    .lead {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: none;
      width: var(--ha-space-10);
      height: var(--ha-space-10);
      border-radius: var(--ha-border-radius-xl);
      background-color: var(--secondary-background-color);
      border: var(--ha-card-border-width, 0px) solid
        var(--ha-card-border-color, transparent);
      box-sizing: border-box;
      --mdc-icon-size: 20px;
    }
    .text {
      display: flex;
      flex-direction: column;
      flex: 1 1 8em;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .name {
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
    }
    .note {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    /* The smaller, value and larger controls stay together on one line. */
    .stepper {
      display: flex;
      align-items: center;
      flex: none;
      gap: var(--ha-space-2);
    }
    .value {
      min-width: var(--ha-space-14);
      text-align: center;
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
      font-variant-numeric: tabular-nums;
    }
    .round {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: none;
      width: var(--ha-space-11, 44px);
      height: var(--ha-space-11, 44px);
      border-radius: var(--ha-border-radius-circle);
      background-color: var(--card-background-color);
      border: var(--ha-card-border-width, 0px) solid
        var(--ha-card-border-color, transparent);
      --mdc-icon-size: 20px;
    }
    .segments {
      display: flex;
      flex-wrap: wrap;
      flex: 0 1 auto;
      min-width: 0;
      justify-content: flex-end;
      padding: var(--ha-space-1);
      gap: var(--ha-space-1);
      border-radius: var(--ha-border-radius-pill);
      background-color: var(--card-background-color);
      border: var(--ha-card-border-width, 0px) solid
        var(--ha-card-border-color, transparent);
    }
    .segments button {
      min-height: 44px;
      padding: 0 var(--ha-space-3);
      border-radius: var(--ha-border-radius-pill);
      font-size: var(--ha-font-size-m);
      font-weight: var(--ha-font-weight-medium);
      color: var(--secondary-text-color);
    }
    .segments button[aria-checked="true"] {
      background-color: var(--primary-text-color);
      color: var(--primary-background-color);
    }
    .tonal,
    .text-button {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-height: 44px;
      padding: 0 var(--ha-space-4);
      border-radius: var(--ha-border-radius-pill);
      font-weight: var(--ha-font-weight-medium);
      white-space: nowrap;
      --mdc-icon-size: 18px;
    }
    .tonal {
      background-color: var(--ha-color-fill-primary-normal-resting);
      color: var(--ha-color-on-primary-normal, var(--primary-text-color));
    }
    .text-button:hover {
      background-color: var(--card-background-color);
    }
    .chevron {
      color: var(--secondary-text-color);
    }
    .footer {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: var(--ha-space-2);
      margin-top: var(--ha-space-2);
      padding-top: var(--ha-space-2);
      border-top: 1px solid var(--divider-color);
    }
    .kept {
      margin: 0;
      padding: var(--ha-space-1) var(--ha-space-2) 0;
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-accessibility-tools": HaAccessibilityTools;
  }
}
