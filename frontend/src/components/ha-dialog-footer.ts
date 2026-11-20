import { css, html, LitElement } from "lit";
import { customElement } from "lit/decorators";

/** Slotted buttons of this kind are plain text buttons. */
const PLAIN_APPEARANCE = "plain";

/**
 * Home Assistant dialog footer component
 *
 * @element ha-dialog-footer
 * @extends {LitElement}
 *
 * @summary
 * A simple footer container for dialog actions,
 * typically used as the `footer` slot in `ha-dialog`.
 *
 * @slot primaryAction - Primary action button(s), aligned to the end.
 * @slot secondaryAction - Secondary action button(s), placed before the primary action.
 *
 * @remarks
 * **Button Styling Guidance:**
 * - `primaryAction` slot: Use the default `appearance="accent"`
 * - `secondaryAction` slot: Use `appearance="plain"`
 */
@customElement("ha-dialog-footer")
export class HaDialogFooter extends LitElement {
  protected render() {
    return html`
      <footer>
        <slot name="secondaryAction"></slot>
        <slot name="primaryAction" @slotchange=${this._primaryChanged}></slot>
      </footer>
    `;
  }

  /**
   * A text-only primary action is shown filled, so the main choice of every
   * dialog reads as a pill. Only the primaryAction slot is touched.
   */
  private _primaryChanged(ev: Event): void {
    for (const element of (ev.target as HTMLSlotElement).assignedElements()) {
      if (
        element.localName === "ha-button" &&
        element.getAttribute("appearance") === PLAIN_APPEARANCE
      ) {
        element.setAttribute("appearance", "accent");
      }
    }
  }

  static get styles() {
    return [
      css`
        ::slotted([slot="primaryAction"]),
        ::slotted([slot="secondaryAction"]) {
          --ha-button-border-radius: var(--ha-border-radius-pill);
          --ha-button-height: 48px;
          max-width: 100%;
        }
        /* At 320 px or with a large font the buttons wrap onto a new line
           instead of running off the dialog. */
        footer {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-3);
          justify-content: flex-end;
          align-items: center;
          width: 100%;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-dialog-footer": HaDialogFooter;
  }
}
