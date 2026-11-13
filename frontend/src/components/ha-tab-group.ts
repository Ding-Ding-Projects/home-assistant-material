import TabGroup from "@home-assistant/webawesome/dist/components/tab-group/tab-group";
import { css, type CSSResultGroup, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators";
import { DragScrollController } from "../common/controllers/drag-scroll-controller";

@customElement("ha-tab-group")
export class HaTabGroup extends TabGroup {
  private _dragScrollController = new DragScrollController(this, {
    selector: ".nav",
  });

  @property({ attribute: "tab-tag" }) override tabTag = "ha-tab-group-tab";

  @property({ attribute: "tab-only", type: Boolean }) tabOnly = true;

  connectedCallback(): void {
    super.connectedCallback();
    // Prevent the tab group from consuming Alt+Arrow and Cmd+Arrow keys,
    // which browsers use for back/forward navigation.
    this.addEventListener("keydown", this._handleKeyDown, true);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener("keydown", this._handleKeyDown, true);
    this._fadeObserver?.disconnect();
    this._fadeObserver = undefined;
    this.nav?.removeEventListener("scroll", this._updateFade);
  }

  private _fadeObserver?: ResizeObserver;

  protected override firstUpdated(changedProps: PropertyValues<this>): void {
    super.firstUpdated(changedProps);
    // Fade the strip at each end that has more tabs, so a tab is never
    // sliced hard at the edge. The scroll buttons sit outside the strip.
    this.nav.addEventListener("scroll", this._updateFade, { passive: true });
    if (typeof ResizeObserver !== "undefined") {
      this._fadeObserver = new ResizeObserver(this._updateFade);
      this._fadeObserver.observe(this.nav);
      const tabs = this.nav.querySelector(".tabs");
      if (tabs) {
        this._fadeObserver.observe(tabs);
      }
    }
    this._updateFade();
  }

  private _updateFade = () => {
    const nav = this.nav;
    if (!nav) {
      return;
    }
    const overflows = nav.scrollWidth > nav.clientWidth + 1;
    const rtl = getComputedStyle(nav).direction === "rtl";
    const fromStart = Math.abs(nav.scrollLeft);
    const more = {
      start: overflows && fromStart > 1,
      end: overflows && fromStart + nav.clientWidth < nav.scrollWidth - 1,
    };
    // The mask is drawn in physical directions, so map start and end to them.
    this.toggleAttribute("fade-left", rtl ? more.end : more.start);
    this.toggleAttribute("fade-right", rtl ? more.start : more.end);
  };

  private _handleKeyDown = (event: KeyboardEvent) => {
    if (event.altKey || event.metaKey) {
      event.stopPropagation();
    }
  };

  protected override handleClick(event: MouseEvent) {
    if (this._dragScrollController.scrolled) {
      return;
    }
    super.handleClick(event);
  }

  static get styles(): CSSResultGroup {
    return [
      TabGroup.styles,
      css`
        :host {
          /* Tabs are pills: the active tab is filled, so there is no track. */
          --track-width: 0px;
          --track-color: var(--ha-tab-track-color, var(--divider-color));
          --indicator-color: var(
            --ha-tab-indicator-color,
            var(--primary-color)
          );
          --wa-color-neutral-on-quiet: var(--indicator-color);
        }

        .tab-group-top .nav {
          align-items: center;
          gap: var(--ha-space-1);
        }

        .tab-group-start ::slotted(ha-tab-group-tab[active]) {
          border-inline-end: solid var(--track-width) var(--indicator-color);
          margin-inline-end: calc(-1 * var(--track-width));
        }

        .tab-group-end ::slotted(ha-tab-group-tab[active]) {
          border-inline-start: solid var(--track-width) var(--indicator-color);
          margin-inline-start: calc(-1 * var(--track-width));
        }

        /* The strip fades where more tabs wait beyond its edge. Nothing here
           animates, so reduced motion needs no change. */
        :host([fade-left]) .nav,
        :host([fade-right]) .nav {
          --_fade-left: 0px;
          --_fade-right: 0px;
          -webkit-mask-image: linear-gradient(
            to right,
            transparent 0,
            #000 var(--_fade-left),
            #000 calc(100% - var(--_fade-right)),
            transparent 100%
          );
          mask-image: linear-gradient(
            to right,
            transparent 0,
            #000 var(--_fade-left),
            #000 calc(100% - var(--_fade-right)),
            transparent 100%
          );
        }
        :host([fade-left]) .nav {
          --_fade-left: var(--ha-tab-fade-size, 28px);
        }
        :host([fade-right]) .nav {
          --_fade-right: var(--ha-tab-fade-size, 28px);
        }

        .scroll-button::part(base):hover {
          background-color: transparent;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-tab-group": HaTabGroup;
  }
}
