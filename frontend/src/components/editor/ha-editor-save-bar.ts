import { mdiContentSave } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { fireEvent } from "../../common/dom/fire_event";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import { ctrlOrCmdLabel } from "../../common/keyboard/ctrl-or-cmd";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import { isMac } from "../../util/is_mac";
import "../ha-button";
import "../ha-svg-icon";
import {
  isDiscardEnabled,
  isSaveBarVisible,
  isSaveEnabled,
  saveBarAnnouncement,
  saveBarState,
  type SaveBarAnnouncement,
} from "./save-bar-logic";

declare global {
  interface HASSDomEvents {
    "save-bar-save": undefined;
    "save-bar-discard": undefined;
  }
  interface HTMLElementTagNameMap {
    "ha-editor-save-bar": HaEditorSaveBar;
  }
}

const PREFIX = "ui.components.editor_save_bar.";

/** The keyboard is up when the visible height drops by more than this. */
const KEYBOARD_PX = 150;

/**
 * The bar that stays at the bottom of an editor's scroll area. It shows
 * whether there are unsaved changes (or how many problems must be fixed first)
 * and holds Save as the primary button. It never saves by itself: it fires
 * `save-bar-save` and the editor saves the way it always did.
 *
 * Put it as the last child of the scrolling content. It sits in the flow after
 * the last form field and sticks to the bottom edge only while that field is
 * further down, so it never covers a field. Extra buttons go in the `start`
 * and `end` slots.
 *
 * @slot start - Buttons on the leading side, such as a test run.
 * @slot end - Buttons beside Save, such as discard.
 */
@customElement("ha-editor-save-bar")
export class HaEditorSaveBar extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** True while the editor holds changes that are not saved yet. */
  @property({ type: Boolean }) public dirty = false;

  /** True while a save is running. */
  @property({ type: Boolean }) public saving = false;

  /** Turns Save off, for a read-only editor. */
  @property({ type: Boolean }) public disabled = false;

  /** Number of validation problems the editor reports; 0 when none. */
  @property({ type: Number, attribute: "error-count" }) public errorCount = 0;

  /** Shows the hint for the save shortcut the editor listens for. */
  @property({ type: Boolean, attribute: "show-shortcut" }) public showShortcut =
    false;

  /** Replaces the Save label, for an editor with its own wording. */
  @property({ attribute: false }) public saveLabel?: string;

  /** Hides the bar while nothing changed, is saving or needs fixing. */
  @property({ type: Boolean, attribute: "hide-when-clean" })
  public hideWhenClean = false;

  /** Adds a Discard changes button that fires `save-bar-discard`. */
  @property({ type: Boolean, attribute: "show-discard" })
  public showDiscard = false;

  /** Set when the last save failed; it is announced as an alert. */
  @property({ attribute: false }) public errorMessage?: string;

  @state() private _announcement?: SaveBarAnnouncement;

  /**
   * True while the on-screen keyboard is up. The extra room kept for the phone
   * bar is dropped then, so the bar rests on the keyboard instead of leaving a
   * blank strip above it.
   */
  @property({ type: Boolean, reflect: true }) public keyboard = false;

  private _lang = new LanguageModeController(this);

  public connectedCallback() {
    super.connectedCallback();
    window.visualViewport?.addEventListener("resize", this._handleViewport);
    this._handleViewport();
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    window.visualViewport?.removeEventListener("resize", this._handleViewport);
  }

  protected willUpdate(changed: PropertyValues<this>) {
    if (changed.has("saving") && changed.get("saving") !== undefined) {
      const announcement = saveBarAnnouncement(
        { saving: changed.get("saving") as boolean },
        this._input(),
        Boolean(this.errorMessage) || this.errorCount > 0
      );
      if (announcement) {
        this._announcement = announcement;
      }
    } else if (changed.has("dirty") && this.dirty) {
      this._announcement = undefined;
    }
  }

  private _input() {
    return {
      dirty: this.dirty,
      saving: this.saving,
      readOnly: this.disabled,
      errorCount: this.errorCount,
    };
  }

  private _handleViewport = () => {
    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }
    this.keyboard = window.innerHeight - viewport.height > KEYBOARD_PX;
  };

  private _text(key: string, values?: Record<string, string | number>) {
    return this._lang.text(
      this.hass.localize as any,
      `${PREFIX}${key}`,
      values
    );
  }

  protected render(): TemplateResult {
    const input = this._input();
    const errors = this.errorCount > 0;
    const stateKey = saveBarState(input);
    const visible = isSaveBarVisible(input, this.hideWhenClean);
    this.toggleAttribute("bar-hidden", !visible);
    const keys = `${ctrlOrCmdLabel(this.hass.localize)}${isMac ? "" : " "}S`;
    return html`
      <span class="sr-only" role="status" aria-live="polite"
        >${this._announcement === "saved" ? this._text("saved") : ""}</span
      >
      <span class="sr-only" role="alert"
        >${
          this._announcement === "error"
            ? this._text("save_failed", {
                message: this.errorMessage ?? "",
              })
            : ""
        }</span
      >
      <div
        ?hidden=${!visible}
        class="bar ${classMap({
          dirty: this.dirty,
          error: errors,
        })}"
        role="group"
        aria-label=${this._text("label")}
      >
        <slot name="start"></slot>
        <span class="state">
          <span class="dot" aria-hidden="true"></span>
          ${
            errors
              ? this._text("errors", { count: this.errorCount })
              : this._text(stateKey)
          }
        </span>
        ${
          this.showShortcut && !this.disabled
            ? html`<span class="hint"
                >${this._text("shortcut", { keys })}</span
              >`
            : ""
        }
        <span class="end">
          <slot name="end"></slot>
          ${
            this.showDiscard
              ? html`<ha-button
                  appearance="plain"
                  .disabled=${!isDiscardEnabled(input)}
                  @click=${this._discard}
                >
                  ${this._text("discard")}
                </ha-button>`
              : ""
          }
          <ha-button
            .disabled=${!isSaveEnabled(input)}
            .loading=${this.saving}
            @click=${this._save}
          >
            <ha-svg-icon slot="start" .path=${mdiContentSave}></ha-svg-icon>
            ${this.saveLabel ?? this.hass.localize("ui.common.save")}
          </ha-button>
        </span>
      </div>
    `;
  }

  private _discard() {
    fireEvent(this, "save-bar-discard");
  }

  private _save() {
    fireEvent(this, "save-bar-save");
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          display: block;
          position: sticky;
          bottom: 0;
          z-index: 2;
          box-sizing: border-box;
          /* The layout's inset already includes the phone bar, which a bar
             above the keyboard or above a sheet must not add again. */
          /* The inset counts the phone bar; the bar's height is taken off
             while the bar is hidden (it publishes its visible height). */
          padding-bottom: var(
            --ha-editor-save-bar-padding-bottom,
            calc(
              var(--safe-area-inset-bottom, 0px) - var(
                  --ha-phone-bar-height,
                  0px
                ) +
                var(
                  --ha-phone-bar-visible-height,
                  var(--ha-phone-bar-height, 0px)
                )
            )
          );
          background: var(
            --ha-color-surface-container,
            var(--card-background-color)
          );
          border-top: var(--ha-border-width-sm, 1px) solid var(--divider-color);
        }
        :host([bar-hidden]) {
          padding: 0;
          border-top: none;
          background: none;
        }
        .bar[hidden] {
          display: none;
        }
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip-path: inset(50%);
          white-space: nowrap;
        }
        :host([keyboard]) {
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
        .bar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-3);
          box-sizing: border-box;
          width: 100%;
          max-width: var(--ha-editor-save-bar-max-width, none);
          margin: 0 auto;
          padding: var(--ha-space-3) var(--ha-space-4);
        }
        .state {
          display: inline-flex;
          align-items: center;
          gap: var(--ha-space-2);
          min-width: 0;
          overflow-wrap: anywhere;
          font-size: var(--ha-font-size-m, 0.9375rem);
          color: var(--secondary-text-color);
        }
        .dirty .state {
          color: var(--primary-text-color);
          font-weight: var(--ha-font-weight-medium, 500);
        }
        .error .state {
          color: var(--error-color);
        }
        .dot {
          flex: none;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--disabled-text-color);
        }
        .dirty .dot {
          background: var(--warning-color, var(--primary-color));
        }
        .error .dot {
          background: var(--error-color);
        }
        .hint {
          font-size: var(--ha-font-size-s, 0.875rem);
          color: var(--secondary-text-color);
        }
        .end {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
          gap: var(--ha-space-2);
          margin-inline-start: auto;
        }
        ha-button {
          min-height: 44px;
        }
        @media (max-width: 480px) {
          .bar {
            padding-inline: var(--ha-space-3);
          }
          .hint {
            display: none;
          }
          .end {
            flex: 1 1 100%;
          }
          .end ha-button {
            flex: 1 1 auto;
          }
        }
      `,
    ];
  }
}
