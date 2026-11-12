import { css, LitElement } from "lit";
import { property, query, state } from "lit/decorators";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import { computeRTL } from "../../common/util/compute_rtl";
import type { HomeAssistant } from "../../types";
import {
  anchorStyle,
  besideStyle,
  isNarrow,
  onNarrowChange,
} from "../locks/lock-text";
import { lockPanelStyles } from "../locks/lock-panel-styles";

/** What the elements that open a panel send when they ask for one. */
export interface TabGroupPanelOpen {
  anchor: HTMLElement;
  surface: string;
}

/**
 * The shared part of the group picker, the group menu and the group editor:
 * a panel anchored to the element it was opened from, shown as a bottom sheet
 * on a phone width, closed by Escape, with focus returned to the element it
 * came from. The panels are listening for their own opening event on
 * `window` and ignore events for another strip (`surface`), so the shell only
 * has to render each element once.
 */
export abstract class TabGroupPanel extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** The strip this panel works for. */
  @property() public surface = "main";

  @state() protected _open = false;

  @state() protected _narrow = isNarrow();

  @state() protected _position: Record<string, string> = {};

  protected _anchor?: HTMLElement;

  @query(".panel") private _panelElement?: HTMLElement;

  @query(".live") private _liveRegion?: HTMLElement;

  protected _lang = new LanguageModeController(this);

  /** The window event that opens this panel. */
  protected abstract readonly openEvent: string;

  /** Whether a press outside the panel closes it. The editor stays open. */
  protected readonly closeOnOutside: boolean = true;

  /** The width of the panel at wide layouts, in pixels. */
  protected readonly panelWidth: number = 360;

  /** Whether the panel opens beside its anchor rather than under it. */
  protected readonly beside: boolean = false;

  private _stopNarrow?: () => void;

  protected _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.hass.localize, key, values);
  }

  protected get _rtl(): boolean {
    return computeRTL(
      this.hass.language,
      this.hass.translationMetadata.translations
    );
  }

  public connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener(this.openEvent, this._onOpenEvent);
    window.addEventListener("pointerdown", this._onPointerDown, true);
    window.addEventListener("resize", this._reposition);
    this._stopNarrow = onNarrowChange((narrow) => {
      this._narrow = narrow;
      this._reposition();
    });
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener(this.openEvent, this._onOpenEvent);
    window.removeEventListener("pointerdown", this._onPointerDown, true);
    window.removeEventListener("resize", this._reposition);
    this._stopNarrow?.();
  }

  private _onOpenEvent = (ev: Event) => {
    const detail = (ev as CustomEvent<TabGroupPanelOpen & Record<string, any>>)
      .detail;
    if (!detail || (detail.surface ?? "main") !== this.surface) {
      return;
    }
    if (this._beforeOpen(detail) === false) {
      return;
    }
    this._anchor = detail.anchor;
    this._open = true;
    this._reposition();
    this.updateComplete.then(() => this._focusFirst());
  };

  /** Reads the event's own details before the panel is shown. */
  protected abstract _beforeOpen(detail: any): boolean;

  /** Puts focus on the first useful control after the panel opens. */
  protected abstract _focusFirst(): void;

  private _onPointerDown = (ev: PointerEvent) => {
    if (!this._open || !this.closeOnOutside) {
      return;
    }
    const path = ev.composedPath();
    const panel = this._panelElement;
    if (panel && path.includes(panel)) {
      return;
    }
    // A press on the anchor itself is its own toggle; close without refocusing.
    this.close(false);
  };

  private _reposition = () => {
    if (!this._open) {
      return;
    }
    this._position = this.beside
      ? besideStyle(this._anchor, this.panelWidth).panel
      : anchorStyle(this._anchor, this.panelWidth);
  };

  /** Closes the panel; focus goes back to the element it came from. */
  public close(returnFocus = true): void {
    if (!this._open) {
      return;
    }
    this._open = false;
    this._afterClose();
    const target = this._anchor;
    if (returnFocus && target?.isConnected) {
      target.focus();
    }
  }

  protected _afterClose(): void {
    // Subclasses clear their own state.
  }

  protected _panelKeydown = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") {
      ev.stopPropagation();
      ev.preventDefault();
      this.close();
    }
  };

  protected _announce(message: string): void {
    const live = this._liveRegion;
    if (live) {
      live.textContent = "";
      requestAnimationFrame(() => {
        live.textContent = message;
      });
    }
  }

  public static panelStyles = [
    lockPanelStyles,
    css`
      .panel {
        z-index: 8;
        max-width: calc(100vw - 16px);
      }
      .panel.sheet.bottom {
        max-height: 88dvh;
        width: auto;
      }
      .live {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
      }
      .list {
        display: grid;
        gap: var(--ha-space-1);
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .row {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3);
        width: 100%;
        min-height: 44px;
        box-sizing: border-box;
        padding: var(--ha-space-2) var(--ha-space-3);
        border: 0;
        border-radius: var(--ha-border-radius-xl, 16px);
        background: none;
        color: var(--primary-text-color);
        font: inherit;
        text-align: start;
        cursor: pointer;
      }
      .row:hover,
      .row:focus-visible,
      .row[aria-selected="true"] {
        background: var(--secondary-background-color);
      }
      .row:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: -2px;
      }
      .row:disabled,
      .row[aria-disabled="true"] {
        opacity: 0.55;
        cursor: default;
      }
      .row .grow {
        flex: 1;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .swatch {
        flex: none;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 1px solid var(--divider-color);
      }
      .count {
        flex: none;
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s, 0.85rem);
      }
      .destructive {
        color: var(--error-color);
      }
      @media (prefers-reduced-motion: reduce) {
        .panel {
          transition: none;
          animation: none;
        }
      }
    `,
  ];
}
