import { mdiChevronDown } from "@mdi/js";
import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { fireEvent } from "../common/dom/fire_event";
import { nextRender } from "../common/util/render-status";
import "./ha-svg-icon";

/** Parses one CSS time value ("0.25s", "250ms") to milliseconds; invalid is 0. */
const parseTimeMs = (value: string): number => {
  const text = value.trim();
  const num = parseFloat(text);
  if (!Number.isFinite(num) || num <= 0) {
    return 0;
  }
  return text.endsWith("ms") ? num : text.endsWith("s") ? num * 1000 : 0;
};

/**
 * The length in milliseconds of the height transition described by the
 * computed `transition-property` and `transition-duration` lists. Returns 0
 * when no height transition runs (a duration of 0s, "none" or an invalid
 * value), in which case no `transitionend` will ever fire.
 */
export const heightTransitionMs = (
  properties: string,
  durations: string
): number => {
  const props = properties.split(",").map((p) => p.trim());
  const times = durations.split(",").map(parseTimeMs);
  let longest = 0;
  props.forEach((prop, idx) => {
    if (prop === "height" || prop === "all") {
      longest = Math.max(longest, times[idx % times.length] ?? 0);
    }
  });
  return longest;
};

/** Extra time allowed past the transition before completion is forced. */
const COMPLETION_GRACE_MS = 50;

@customElement("ha-expansion-panel")
export class HaExpansionPanel extends LitElement {
  @property({ type: Boolean, reflect: true }) expanded = false;

  @property({ type: Boolean, reflect: true }) outlined = false;

  @property({ attribute: "left-chevron", type: Boolean, reflect: true })
  public leftChevron = false;

  @property({ attribute: "no-collapse", type: Boolean, reflect: true })
  public noCollapse = false;

  @property() header?: string;

  @property() secondary?: string;

  @state() _showContent = this.expanded;

  @query(".container") private _container!: HTMLDivElement;

  private _completionTimer?: number;

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._clearCompletionTimer();
  }

  private _clearCompletionTimer() {
    if (this._completionTimer !== undefined) {
      window.clearTimeout(this._completionTimer);
      this._completionTimer = undefined;
    }
  }

  protected render(): TemplateResult {
    const chevronIcon = this.noCollapse
      ? nothing
      : html`
          <ha-svg-icon
            .path=${mdiChevronDown}
            class="summary-icon ${classMap({ expanded: this.expanded })}"
          ></ha-svg-icon>
        `;
    return html`
      <div class="top ${classMap({ expanded: this.expanded })}">
        <div
          id="summary"
          class=${classMap({ noCollapse: this.noCollapse })}
          @click=${this._toggleContainer}
          @keydown=${this._toggleContainer}
          @focus=${this._focusChanged}
          @blur=${this._focusChanged}
          role="button"
          tabindex=${this.noCollapse ? -1 : 0}
          aria-expanded=${this.expanded}
          aria-controls="sect1"
          part="summary"
        >
          ${this.leftChevron ? chevronIcon : nothing}
          <slot name="leading-icon"></slot>
          <slot name="header">
            <div class="header">
              ${this.header}
              <slot class="secondary" name="secondary">${this.secondary}</slot>
            </div>
          </slot>
          <slot name="event"></slot>
          ${!this.leftChevron ? chevronIcon : nothing}
          <slot name="icons"></slot>
        </div>
      </div>
      <div
        class="container ${classMap({ expanded: this.expanded })}"
        @transitionend=${this._handleTransitionEnd}
        role="region"
        aria-labelledby="summary"
        aria-hidden=${!this.expanded}
        tabindex="-1"
      >
        ${this._showContent ? html`<slot></slot>` : ""}
      </div>
    `;
  }

  protected willUpdate(changedProps: PropertyValues<this>) {
    super.willUpdate(changedProps);
    if (changedProps.has("expanded")) {
      this._showContent = this.expanded;
      setTimeout(() => {
        // Verify we're still expanded
        this._container.style.overflow = this.expanded ? "initial" : "hidden";
      }, 300);
    }
  }

  private _handleTransitionEnd(ev: TransitionEvent) {
    // Only the panel's own height transition ends the toggle; transitions of
    // slotted content bubble up here and must not cut the animation short.
    if (ev.target !== this._container || ev.propertyName !== "height") {
      return;
    }
    this._completeToggle();
  }

  /** Ends a toggle once: drops the inline height and settles the overflow. */
  private _completeToggle() {
    this._clearCompletionTimer();
    const container = this._container;
    if (!container) {
      return;
    }
    container.style.removeProperty("height");
    container.style.overflow = this.expanded ? "initial" : "hidden";
    this._showContent = this.expanded;
  }

  private async _toggleContainer(ev): Promise<void> {
    if (ev.defaultPrevented) {
      return;
    }
    if (ev.type === "keydown" && ev.key !== "Enter" && ev.key !== " ") {
      return;
    }
    ev.preventDefault();
    if (this.noCollapse) {
      return;
    }
    const newExpanded = !this.expanded;
    fireEvent(this, "expanded-will-change", { expanded: newExpanded });

    this._container.style.overflow = "hidden";

    if (newExpanded) {
      this._showContent = true;
      // allow for dynamic content to be rendered
      await nextRender();
    }

    const scrollHeight = this._container.scrollHeight;
    this._container.style.height = `${scrollHeight}px`;

    // `transitionend` never fires when the duration is 0 (reduced motion or a
    // theme), the panel has no height to animate, or it is not displayed, so
    // complete directly or after a fallback timer, once either way.
    const style = getComputedStyle(this._container);
    const duration = heightTransitionMs(
      style.transitionProperty,
      style.transitionDuration
    );
    const instant = duration === 0 || scrollHeight === 0;

    this._clearCompletionTimer();
    if (!newExpanded && !instant) {
      setTimeout(() => {
        // Skip if the toggle already completed or was reversed meanwhile.
        if (!this.expanded && this._container.style.height) {
          this._container.style.height = "0px";
        }
      }, 0);
    }

    this.expanded = newExpanded;
    fireEvent(this, "expanded-changed", { expanded: this.expanded });

    if (instant) {
      this._completeToggle();
      return;
    }
    this._completionTimer = window.setTimeout(
      () => this._completeToggle(),
      duration + COMPLETION_GRACE_MS
    );
  }

  private _focusChanged(ev) {
    if (this.noCollapse) {
      return;
    }
    this.shadowRoot!.querySelector(".top")!.classList.toggle(
      "focused",
      ev.type === "focus"
    );
  }

  static styles = css`
    :host {
      display: block;
    }

    .top {
      display: flex;
      align-items: center;
      border-radius: var(--ha-card-border-radius, var(--ha-border-radius-lg));
    }

    .top.expanded {
      border-bottom-left-radius: 0px;
      border-bottom-right-radius: 0px;
    }

    .top.focused {
      background: var(--input-fill-color);
    }

    :host([outlined]) {
      box-shadow: none;
      border-width: 1px;
      border-style: solid;
      border-color: var(--outline-color);
      border-radius: var(--ha-card-border-radius, var(--ha-border-radius-lg));
    }

    .summary-icon {
      transition: transform var(--ha-animation-duration-fast, 150ms)
        var(--ha-expansion-easing, cubic-bezier(0.2, 0, 0, 1));
      direction: var(--direction);
      margin-left: 8px;
      margin-inline-start: 8px;
      margin-inline-end: initial;
      border-radius: var(--ha-border-radius-circle);
    }

    #summary:focus-visible ha-svg-icon.summary-icon {
      background-color: var(--ha-color-fill-neutral-normal-active);
    }

    :host([left-chevron]) .summary-icon,
    ::slotted([slot="leading-icon"]) {
      margin-left: 0;
      margin-right: 8px;
      margin-inline-start: 0;
      margin-inline-end: 8px;
    }

    #summary {
      flex: 1;
      display: flex;
      padding: var(--expansion-panel-summary-padding, 0 8px);
      min-height: 48px;
      align-items: center;
      cursor: pointer;
      overflow: hidden;
      font-weight: var(--ha-font-weight-medium);
      outline: none;
    }
    #summary.noCollapse {
      cursor: default;
    }

    .summary-icon.expanded {
      transform: rotate(180deg);
    }

    .header,
    ::slotted([slot="header"]) {
      flex: 1;
      overflow-wrap: anywhere;
      color: var(--primary-text-color);
    }

    .container {
      padding: var(--expansion-panel-content-padding, 0 8px);
      overflow: hidden;
      transition:
        height var(--ha-animation-duration-normal, 250ms)
          var(--ha-expansion-easing, cubic-bezier(0.2, 0, 0, 1)),
        opacity var(--ha-animation-duration-normal, 250ms)
          var(--ha-expansion-easing, cubic-bezier(0.2, 0, 0, 1));
      height: 0px;
      opacity: 0;
    }

    .container.expanded {
      height: auto;
      opacity: 1;
    }

    .secondary {
      display: block;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-expansion-panel": HaExpansionPanel;
  }

  // for fire event
  interface HASSDomEvents {
    "expanded-changed": {
      expanded: boolean;
    };
    "expanded-will-change": {
      expanded: boolean;
    };
  }
}
