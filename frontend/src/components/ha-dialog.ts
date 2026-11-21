import "@home-assistant/webawesome/dist/components/dialog/dialog";
import type WaDialog from "@home-assistant/webawesome/dist/components/dialog/dialog";
import type { ContextType } from "@lit/context";
import { mdiClose } from "@mdi/js";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import {
  customElement,
  eventOptions,
  property,
  query,
  state,
} from "lit/decorators";
import { ifDefined } from "lit/directives/if-defined";
import { consume } from "../common/decorators/consume";
import type { HASSDomEvent } from "../common/dom/fire_event";
import { fireEvent } from "../common/dom/fire_event";
import {
  currentDialogMotionMode,
  shouldCloseSheet,
} from "../common/motion/dialog-entry";
import { withViewTransition } from "../common/util/view-transition";
import { configContext, internationalizationContext } from "../data/context";
import { ScrollableFadeMixin } from "../mixins/scrollable-fade-mixin";
import { haStyleScrollbar } from "../resources/styles";
import { isIosApp } from "../util/is_ios";
import "./dialog/ha-dialog-tools";
import { modeText } from "../common/language-mode/language-mode";
import "./ha-dialog-header";
import "./ha-icon-button";

export type DialogWidth = "small" | "medium" | "large" | "full";

type DialogHideEvent = CustomEvent<{ source?: Element }>;

/**
 * Home Assistant dialog component
 *
 * @element ha-dialog
 * @extends {LitElement}
 *
 * @summary
 * A stylable dialog built using the `wa-dialog` component, providing a standardized header (ha-dialog-header),
 * body, and footer (preferably using `ha-dialog-footer`) with slots
 *
 * You can open and close the dialog declaratively by using the `data-dialog="close"` attribute.
 * @see https://webawesome.com/docs/components/dialog/#opening-and-closing-dialogs-declaratively
 *
 * @slot header - Replace the entire header area.
 * @slot headerNavigationIcon - Leading header action (e.g. close/back button).
 * @slot headerTitle - Custom title content (used when header-title is not set).
 * @slot headerSubtitle - Custom subtitle content (used when header-subtitle is not set).
 * @slot headerActionItems - Trailing header actions (e.g. buttons, menus).
 * @slot - Dialog content body.
 * @slot footer - Dialog footer content.
 *
 * @csspart dialog - The dialog surface.
 * @csspart header - The header container.
 * @csspart body - The scrollable body container.
 * @csspart footer - The footer container.
 *
 * @cssprop --dialog-content-padding - Padding for the dialog content sections.
 * @cssprop --ha-dialog-show-duration - Show animation duration.
 * @cssprop --ha-dialog-hide-duration - Hide animation duration.
 * @cssprop --ha-dialog-surface-background - Dialog background color.
 * @cssprop --ha-dialog-surface-backdrop-filter - Dialog backdrop filter.
 * @cssprop --dialog-box-shadow - Dialog box shadow.
 * @cssprop --ha-dialog-border-radius - Border radius of the dialog surface.
 * @cssprop --ha-dialog-scrim-backdrop-filter - Dialog scrim backdrop filter.
 * @cssprop --dialog-backdrop-filter - Dialog scrim backdrop filter (legacy).
 * @cssprop --mdc-dialog-scrim-color - Dialog scrim color (legacy).
 * @cssprop --dialog-surface-margin-top - Top margin for the dialog surface.
 *
 * @attr {boolean} open - Controls the dialog open state.
 * @attr {("alert"|"standard")} type - Dialog type. Defaults to "standard".
 * @attr {("small"|"medium"|"large"|"full")} width - Preferred dialog width preset. Defaults to "medium".
 * @attr {boolean} prevent-scrim-close - Prevents closing the dialog by clicking the scrim/overlay. Defaults to false.
 * @attr {string} header-title - Header title text. If not set, the headerTitle slot is used.
 * @attr {string} header-subtitle - Header subtitle text. If not set, the headerSubtitle slot is used.
 * @attr {("above"|"below")} header-subtitle-position - Position of the subtitle relative to the title. Defaults to "below".
 * @attr {boolean} flexcontent - Makes the dialog body a flex container for flexible layouts.
 *
 * @event opened - Fired when the dialog is shown.
 * @event closed - Fired after the dialog is hidden.
 *
 * @remarks
 * **Focus Management:**
 * To automatically focus an element when the dialog opens, add the `autofocus` attribute to it.
 * Components with `delegatesFocus: true` (like `ha-form`) will forward focus to their first focusable child.
 * Example: `<ha-form autofocus .schema=${schema}></ha-form>`
 *
 * @see https://github.com/home-assistant/frontend/issues/27143
 */
@customElement("ha-dialog")
export class HaDialog extends ScrollableFadeMixin(LitElement) {
  @property({ attribute: "aria-labelledby" })
  public ariaLabelledBy?: string;

  @property({ attribute: "aria-describedby" })
  public ariaDescribedBy?: string;

  @property({ type: Boolean, reflect: true })
  public open = false;

  @property({ reflect: true })
  public type: "alert" | "standard" = "standard";

  @property({ type: String, reflect: true, attribute: "width" })
  public width: DialogWidth = "medium";

  @property({ type: Boolean, reflect: true, attribute: "prevent-scrim-close" })
  public preventScrimClose = false;

  @property({ attribute: "header-title" })
  public headerTitle?: string;

  /** Accessible name for dialogs that put their title in a slot. */
  @property({ attribute: false })
  public accessibleLabel?: string;

  @property({ attribute: "header-subtitle" })
  public headerSubtitle?: string;

  @property({ type: String, attribute: "header-subtitle-position" })
  public headerSubtitlePosition: "above" | "below" = "below";

  @property({ type: Boolean, reflect: true, attribute: "flexcontent" })
  public flexContent = false;

  @property({ type: Boolean, attribute: "without-header" })
  public withoutHeader = false;

  /**
   * Leaves out the tools at the foot of the dialog: search this dialog,
   * edit appearance and lock. Alerts never have them.
   */
  @property({ type: Boolean, attribute: "without-tools" })
  public withoutTools = false;

  /**
   * The dialog says it has a search of its own (for example inside a nested
   * component's shadow root), so the shared search is left out.
   */
  @property({ type: Boolean, attribute: "own-search" })
  public ownSearch = false;

  @state() private _locked = false;

  @state()
  private _open = false;

  @query(".body") public bodyContainer!: HTMLDivElement;

  @query("wa-dialog") private _waDialog?: WaDialog;

  /** The dialog has its own search at the top, so the shared one is left out. */
  @state() private _ownSearch = false;

  private _drag?: { startY: number; startTime: number; id: number };

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n?: ContextType<typeof internationalizationContext>;

  @state()
  @consume({ context: configContext, subscribe: true })
  private _hassConfig?: ContextType<typeof configContext>;

  @state()
  private _bodyScrolled = false;

  public connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener(
      "dialog-set-fullscreen",
      this._handleFullscreenChanged as EventListener
    );
  }

  protected get scrollableElement(): HTMLElement | null {
    return this.bodyContainer;
  }

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    super.willUpdate(changedProperties);
    if (changedProperties.has("open") && this.open) {
      // Chosen before the dialog is shown, so the first frame already moves
      // the way the personal "Confirmation drama" choice asks for.
      this.setAttribute("motion", currentDialogMotionMode());
    }
  }

  protected updated(changedProperties: PropertyValues<this>): void {
    super.updated(changedProperties);

    if (changedProperties.has("open")) {
      this._open = this.open;
    }
  }

  private _lockChanged(ev: CustomEvent<{ locked: boolean }>): void {
    this._locked = ev.detail.locked;
  }

  protected render() {
    // The title lives in a shadow root that an aria-labelledby IDREF on
    // wa-dialog's inner <dialog> can't reach. Name the dialog with the title
    // text instead, which wa-dialog uses as aria-label without its own header.
    return html`
      <wa-dialog
        .open=${this._open}
        .lightDismiss=${!this.preventScrimClose}
        without-header
        .label=${this.accessibleLabel ?? this.headerTitle ?? ""}
        aria-labelledby=${ifDefined(this.ariaLabelledBy)}
        aria-describedby=${ifDefined(this.ariaDescribedBy)}
        @keydown=${this._handleKeyDown}
        @wa-hide=${this._handleHide}
        @wa-show=${this._handleShow}
        @wa-after-show=${this._handleAfterShow}
        @wa-after-hide=${this._handleAfterHide}
      >
        <div
          class="handle"
          aria-hidden="true"
          @pointerdown=${this._handleDragStart}
          @pointermove=${this._handleDragMove}
          @pointerup=${this._handleDragEnd}
          @pointercancel=${this._handleDragEnd}
        ></div>
        ${
          !this.withoutHeader
            ? html`<slot name="header">
                <ha-dialog-header
                  .subtitlePosition=${this.headerSubtitlePosition}
                  .showBorder=${this._bodyScrolled}
                >
                  <slot name="headerNavigationIcon" slot="navigationIcon">
                    <ha-icon-button
                      data-dialog="close"
                      .label=${
                        this._i18n?.localize
                          ? modeText(this._i18n.localize, "ui.common.close")
                          : "Close"
                      }
                      .path=${mdiClose}
                    ></ha-icon-button>
                  </slot>
                  ${
                    this.headerTitle !== undefined
                      ? html`<span
                          slot="title"
                          class="title"
                          id="ha-dialog-title"
                        >
                          ${this.headerTitle}
                        </span>`
                      : html`<slot name="headerTitle" slot="title"></slot>`
                  }
                  ${
                    this.headerSubtitle !== undefined
                      ? html`<span slot="subtitle"
                          >${this.headerSubtitle}</span
                        >`
                      : html`<slot
                          name="headerSubtitle"
                          slot="subtitle"
                        ></slot>`
                  }
                  <slot
                    name="headerActionItems"
                    slot="actionItems"
                    ?inert=${this._locked}
                  ></slot>
                </ha-dialog-header>
              </slot>`
            : nothing
        }
        ${
          this.withoutTools || this.type === "alert"
            ? nothing
            : html`<ha-dialog-tools
                .hideSearch=${this._ownSearch || this.ownSearch}
                @dialog-lock-changed=${this._lockChanged}
              ></ha-dialog-tools>`
        }
        <div class="content-wrapper">
          <div
            class="body ha-scrollbar"
            ?inert=${this._locked}
            @scroll=${this._handleBodyScroll}
          >
            <slot @slotchange=${this._contentChanged}></slot>
          </div>
          ${this.renderScrollableFades()}
        </div>
        <slot name="footer" slot="footer" ?inert=${this._locked}></slot>
      </wa-dialog>
    `;
  }

  /** Looks for a search of the dialog's own at the top of its content. */
  private _contentChanged(ev: Event): void {
    // Flattened, so a dialog that passes its content on through a slot of its
    // own (ha-adaptive-dialog) is looked at too.
    const first = (ev.target as HTMLSlotElement).assignedElements({
      flatten: true,
    })[0];
    this._ownSearch =
      first !== undefined &&
      (first.localName === "ha-input-search" ||
        first.querySelector(
          ":scope > ha-input-search, :scope > * > ha-input-search"
        ) !== null);
  }

  private _handleDragStart(ev: PointerEvent): void {
    if (this.preventScrimClose || !this._waDialog?.dialog) {
      return;
    }
    this._drag = {
      startY: ev.clientY,
      startTime: ev.timeStamp,
      id: ev.pointerId,
    };
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    const surface = this._waDialog.dialog;
    surface.style.transition = "none";
  }

  private _handleDragMove(ev: PointerEvent): void {
    const surface = this._waDialog?.dialog;
    if (!this._drag || !surface || ev.pointerId !== this._drag.id) {
      return;
    }
    const distance = Math.max(0, ev.clientY - this._drag.startY);
    surface.style.translate = `0 ${distance}px`;
  }

  private _handleDragEnd(ev: PointerEvent): void {
    const surface = this._waDialog?.dialog;
    const drag = this._drag;
    if (!drag || !surface || ev.pointerId !== drag.id) {
      return;
    }
    this._drag = undefined;
    const distance = Math.max(0, ev.clientY - drag.startY);
    const velocity = distance / Math.max(1, ev.timeStamp - drag.startTime);
    if (ev.type === "pointerup" && shouldCloseSheet(distance, velocity)) {
      // The same path as Escape and the close button.
      this._waDialog!.open = false;
      return;
    }
    surface.style.transition = "translate 200ms cubic-bezier(0.2, 1.5, 0.3, 1)";
    surface.style.translate = "";
  }

  private _clearDrag(): void {
    const surface = this._waDialog?.dialog;
    if (surface) {
      surface.style.translate = "";
      surface.style.transition = "";
    }
    this._drag = undefined;
  }

  private _handleShow = async (ev: Event) => {
    if (ev.eventPhase !== Event.AT_TARGET) {
      return;
    }
    this._open = true;
    fireEvent(this, "opened");

    await this.updateComplete;

    requestAnimationFrame(() => {
      if (
        this._hassConfig?.auth.external &&
        isIosApp(this._hassConfig.auth.external)
      ) {
        const element = this.querySelector("[autofocus]");
        if (element !== null) {
          if (!element.id) {
            element.id = "ha-dialog-autofocus";
          }
          this._hassConfig.auth.external.fireMessage({
            type: "focus_element",
            payload: {
              element_id: element.id,
            },
          });
        }
        return;
      }
      (this.querySelector("[autofocus]") as HTMLElement | null)?.focus();
    });
  };

  private _handleAfterShow = (ev: Event) => {
    if (ev.eventPhase !== Event.AT_TARGET) {
      return;
    }
    fireEvent(this, "after-show");
  };

  private _handleAfterHide = (ev: DialogHideEvent) => {
    if (ev.eventPhase === Event.AT_TARGET) {
      this._open = false;
      this._clearDrag();
      this._setFullscreen(false);
      fireEvent(this, "closed");
    }
  };

  public disconnectedCallback(): void {
    this.removeEventListener(
      "dialog-set-fullscreen",
      this._handleFullscreenChanged as EventListener
    );
    this._setFullscreen(false);
    super.disconnectedCallback();
    this._open = false;
  }

  private _handleFullscreenChanged(ev: HASSDomEvent<boolean>): void {
    if (!this._open) {
      this._setFullscreen(ev.detail);
      return;
    }

    withViewTransition(() => {
      this._setFullscreen(ev.detail);
    });
  }

  private _setFullscreen(fullscreen: boolean): void {
    this.toggleAttribute("fullscreen", fullscreen);
  }

  @eventOptions({ passive: true })
  private _handleBodyScroll(ev: Event) {
    this._bodyScrolled = (ev.target as HTMLDivElement).scrollTop > 0;
  }

  private _handleKeyDown(ev: KeyboardEvent) {
    if (ev.key === "Escape") {
      if (this.preventScrimClose) {
        ev.preventDefault();
      }
      ev.stopPropagation();
      (ev.currentTarget as WaDialog).open = false;
    }
  }

  private _handleHide(ev: DialogHideEvent) {
    // Ignore wa-hide events bubbling up from nested overlays (pickers,
    // popovers, bottom sheets, nested dialogs); only handle this dialog's own
    // hide, like the sibling wa-* handlers above.
    if (ev.eventPhase !== Event.AT_TARGET) {
      return;
    }

    const sourceIsDialog = ev.detail?.source === (ev.target as WaDialog).dialog;

    // A dialog-sourced hide (Escape, native cancel, or scrim) while the host
    // still wants the dialog open is a user dismissal, not a programmatic
    // close. Block it when closing must be guarded, regardless of where focus
    // currently is — e.g. after a picker overlay took focus and dropped it
    // outside the dialog, the Escape keydown never reaches this element.
    if (this.preventScrimClose && sourceIsDialog && this.open) {
      ev.preventDefault();
    }
  }

  static get styles() {
    return [
      ...super.styles,
      haStyleScrollbar,
      css`
        wa-dialog {
          --full-width: var(
            --ha-dialog-width-full,
            min(95vw, var(--safe-width))
          );
          --width: min(var(--ha-dialog-width-md, 580px), var(--full-width));
          --spacing: var(--dialog-content-padding, var(--ha-space-6));
          --show-duration: var(--ha-dialog-show-duration, 200ms);
          --hide-duration: var(--ha-dialog-hide-duration, 200ms);
          --wa-color-surface-raised: var(
            --ha-dialog-surface-background,
            var(--card-background-color, var(--ha-color-surface-default))
          );
          --wa-panel-border-radius: var(--ha-dialog-border-radius, 36px);
          max-width: var(--ha-dialog-max-width, var(--safe-width));
        }
        @media (prefers-reduced-motion: reduce) {
          wa-dialog {
            --show-duration: 0ms;
            --hide-duration: 0ms;
          }
        }

        :host([width="small"]) wa-dialog {
          --width: min(var(--ha-dialog-width-sm, 320px), var(--full-width));
        }

        :host([width="large"]) wa-dialog {
          --width: min(var(--ha-dialog-width-lg, 1024px), var(--full-width));
        }

        :host([width="full"]) wa-dialog,
        :host([fullscreen]) wa-dialog {
          --width: var(--full-width);
        }

        :host([fullscreen]) wa-dialog::part(dialog) {
          min-height: var(--safe-height);
          max-height: var(--safe-height);
          margin-top: 0;
          transform: none;
        }

        :host([fullscreen]) .content-wrapper {
          overflow: hidden;
        }

        :host([fullscreen]) .body {
          overflow: hidden;
          padding: 0;
        }

        wa-dialog::part(dialog) {
          backdrop-filter: var(--ha-dialog-surface-backdrop-filter, none);
          box-shadow: var(
            --dialog-box-shadow,
            var(--ha-shadow-overlay, var(--wa-shadow-l))
          );
          color: var(--primary-text-color);
          min-width: var(--width, var(--full-width));
          max-width: var(--width, var(--full-width));
          max-height: var(
            --ha-dialog-max-height,
            calc(var(--safe-height) - var(--ha-space-20))
          );
          min-height: var(--ha-dialog-min-height);
          margin-top: var(--dialog-surface-margin-top, auto);
          /* Used to offset the dialog from the safe areas when space is limited */
          transform: translate(
            calc(
              var(--safe-area-offset-left, 0px) - var(
                  --safe-area-offset-right,
                  0px
                )
            ),
            calc(
              var(--safe-area-offset-top, 0px) - var(
                  --safe-area-offset-bottom,
                  0px
                )
            )
          );
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        wa-dialog::part(dialog)::backdrop {
          backdrop-filter: var(
            --ha-dialog-scrim-backdrop-filter,
            var(--dialog-backdrop-filter, none)
          );
          background-color: var(--mdc-dialog-scrim-color, none);
        }

        /* A short, wide screen such as a phone on its side keeps the full
           screen dialog. A narrow screen gets the bottom sheet further down. */
        @media all and (min-width: 601px) and (max-height: 500px) {
          :host([type="standard"]) {
            --ha-dialog-border-radius: 0;
          }

          :host([type="standard"]) wa-dialog {
            /* Make the container fill the whole screen width and not the safe width */
            --full-width: var(--ha-dialog-width-full, 100vw);
            --width: var(--full-width);
          }

          :host([type="standard"]) wa-dialog::part(dialog) {
            /* Make the dialog fill the whole screen height and not the safe height */
            min-height: var(--ha-dialog-min-height, 100vh);
            min-height: var(--ha-dialog-min-height, 100dvh);
            max-height: var(--ha-dialog-max-height, 100vh);
            max-height: var(--ha-dialog-max-height, 100dvh);
            margin-top: 0;
            margin-bottom: 0;
            /* Use safe area as padding instead of the container size */
            padding-top: var(--safe-area-inset-top);
            padding-bottom: var(--safe-area-inset-bottom);
            padding-left: var(--safe-area-inset-left);
            padding-right: var(--safe-area-inset-right);
            /* Reset the transform to center the dialog */
            transform: none;
          }
        }

        /* The bottom sheet: narrow screens anchor a standard dialog to the
           bottom edge, with a drag handle and a spring on the way in. */
        .handle {
          display: none;
          flex: none;
          height: 24px;
          align-items: center;
          justify-content: center;
          cursor: grab;
          touch-action: none;
        }
        .handle::after {
          content: "";
          width: 40px;
          height: 4px;
          border-radius: 2px;
          background: var(--ha-bottom-sheet-handle-color, var(--divider-color));
        }
        :host([prevent-scrim-close]) .handle {
          cursor: default;
        }
        @media (max-width: 600px) {
          :host([type="standard"]:not([fullscreen])) .handle {
            display: flex;
          }
          :host([type="standard"]:not([fullscreen])) wa-dialog {
            --full-width: var(--ha-dialog-width-full, 100vw);
            --width: var(--full-width);
            --ha-dialog-border-radius: 36px 36px 0 0;
          }
          :host([type="standard"]:not([fullscreen])) wa-dialog::part(dialog) {
            min-height: var(--ha-dialog-min-height, 0);
            max-height: var(--ha-dialog-max-height, 88vh);
            max-height: var(--ha-dialog-max-height, 88dvh);
            margin: auto 0 0 0;
            padding-bottom: var(--safe-area-inset-bottom);
            padding-left: var(--safe-area-inset-left);
            padding-right: var(--safe-area-inset-right);
            transform: none;
          }
          :host([type="standard"]:not([fullscreen]))
            ::slotted([slot="footer"]) {
            padding-bottom: var(--ha-space-4);
          }
        }

        /* Arrival, chosen by the personal confirmation drama setting. The
           motion attribute is set before the dialog is shown. */
        :host([motion="none"]) wa-dialog {
          --show-duration: 0ms;
          --hide-duration: 0ms;
        }
        :host([motion="fade"]) wa-dialog::part(dialog) {
          animation-name: ha-dialog-fade;
        }
        :host([motion="rise"]) wa-dialog::part(dialog) {
          animation-name: ha-dialog-rise;
        }
        :host([motion="rise-scale"]) wa-dialog::part(dialog) {
          animation-name: ha-dialog-rise-scale;
        }
        :host([motion="rise"]) wa-dialog,
        :host([motion="rise-scale"]) wa-dialog {
          --show-duration: var(--ha-dialog-show-duration, 320ms);
          --hide-duration: var(--ha-dialog-hide-duration, 160ms);
        }
        @media (max-width: 600px) {
          :host([type="standard"][motion="rise"]:not([fullscreen]))
            wa-dialog::part(dialog),
          :host([type="standard"][motion="rise-scale"]:not([fullscreen]))
            wa-dialog::part(dialog) {
            animation-name: ha-dialog-sheet-rise;
          }
          :host([type="standard"][motion="rise"]:not([fullscreen])) wa-dialog,
          :host([type="standard"][motion="rise-scale"]:not([fullscreen]))
            wa-dialog {
            --show-duration: var(--ha-dialog-show-duration, 350ms);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          :host([motion]) wa-dialog::part(dialog) {
            animation-name: none;
          }
        }
        @keyframes ha-dialog-fade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes ha-dialog-rise {
          from {
            opacity: 0;
            translate: 0 24px;
            animation-timing-function: cubic-bezier(0.2, 1.5, 0.3, 1);
          }
          to {
            opacity: 1;
            translate: 0 0;
          }
        }
        @keyframes ha-dialog-rise-scale {
          from {
            opacity: 0;
            translate: 0 24px;
            scale: 0.96;
            animation-timing-function: cubic-bezier(0.2, 1.5, 0.3, 1);
          }
          to {
            opacity: 1;
            translate: 0 0;
            scale: 1;
          }
        }
        @keyframes ha-dialog-sheet-rise {
          from {
            translate: 0 100%;
            animation-timing-function: cubic-bezier(0.2, 1.5, 0.3, 1);
          }
          to {
            translate: 0 0;
          }
        }

        /* The close button is a round tonal button. */
        ha-icon-button[data-dialog="close"] {
          --ha-icon-button-size: 48px;
          --mdc-icon-button-size: 48px;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background-color: var(
            --md-sys-color-secondary-container,
            var(--ha-color-fill-neutral-quiet-resting)
          );
          color: var(
            --md-sys-color-on-secondary-container,
            var(--primary-text-color)
          );
        }

        .header-title-container {
          display: flex;
          align-items: center;
        }

        .header-title {
          margin: 0;
          margin-bottom: 0;
          color: var(--ha-dialog-header-title-color, var(--primary-text-color));
          font-size: var(
            --ha-dialog-header-title-font-size,
            var(--ha-font-size-2xl)
          );
          line-height: var(
            --ha-dialog-header-title-line-height,
            var(--ha-line-height-condensed)
          );
          font-weight: var(
            --ha-dialog-header-title-font-weight,
            var(--ha-font-weight-title)
          );
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: var(--ha-dialog-header-white-space, nowrap);
          margin-right: var(--ha-space-3);
        }

        wa-dialog::part(body) {
          padding: 0;
          display: flex;
          flex-direction: column;
          max-width: 100%;
          overflow: hidden;
        }

        .content-wrapper {
          position: relative;
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }

        .body {
          position: var(--dialog-content-position, relative);
          padding: var(
            --dialog-content-padding,
            0 var(--ha-space-6) var(--ha-space-6) var(--ha-space-6)
          );
          overflow: auto;
          flex-grow: 1;
        }
        :host([flexcontent]) .body {
          max-width: 100%;
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        /* The title, the tools and the buttons stay put; only the middle
           scrolls, and a scroll that reaches its end never moves the page
           behind the dialog. */
        wa-dialog::part(footer) {
          padding: 0;
          flex: none;
        }
        wa-dialog::part(dialog) {
          overscroll-behavior: contain;
        }
        .handle,
        ha-dialog-header,
        ha-dialog-tools,
        slot[name="header"] {
          flex: none;
        }
        .body {
          overscroll-behavior: contain;
        }

        ::slotted([slot="footer"]) {
          display: flex;
          flex-wrap: wrap;
          box-sizing: border-box;
          padding: var(--ha-space-3) var(--ha-space-6) var(--ha-space-6)
            var(--ha-space-6);
          gap: var(--ha-space-3);
          justify-content: flex-end;
          align-items: center;
          width: 100%;
        }

        /* Phone: a 22 px title, 16 px padding and 48 px footer buttons. */
        @media (max-width: 600px) {
          :host([type="standard"]:not([fullscreen])) wa-dialog {
            --ha-dialog-border-radius: 28px 28px 0 0;
          }
          .header-title {
            font-size: var(--ha-dialog-header-title-font-size, 22px);
          }
          .body {
            padding: var(
              --dialog-content-padding,
              0 var(--ha-space-4) var(--ha-space-4) var(--ha-space-4)
            );
          }
          ::slotted([slot="footer"]) {
            padding: var(--ha-space-2) var(--ha-space-4) var(--ha-space-4)
              var(--ha-space-4);
            gap: var(--ha-space-2);
            --ha-button-height: 48px;
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-dialog": HaDialog;
  }

  interface HASSDomEvents {
    "dialog-set-fullscreen": boolean;
    opened: undefined;
    "after-show": undefined;
    closed: undefined;
  }
}
