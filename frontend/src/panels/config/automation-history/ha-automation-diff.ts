import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";

/**
 * A text diff as the server writes it, one line per row, additions and
 * removals coloured. Lines are set as text, so nothing in a version of an
 * automation can add markup to the page.
 */
@customElement("ha-automation-diff")
export class HaAutomationDiff extends LitElement {
  @property() public text = "";

  protected render(): TemplateResult {
    return html`<div class="diff-text" role="group">
      ${this.text
        .split("\n")
        .map(
          (line) =>
            html`<div
              class=${
                line.startsWith("+") && !line.startsWith("+++")
                  ? "added"
                  : line.startsWith("-") && !line.startsWith("---")
                    ? "removed"
                    : ""
              }
              .textContent=${line}
            ></div>`
        )}
    </div>`;
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    .diff-text {
      padding: var(--ha-space-4);
      border-radius: var(--ha-border-radius-xl);
      background: var(--ha-color-fill-neutral-quiet-resting);
      font-family: var(--ha-font-family-code);
      font-size: var(--ha-font-size-s);
      overflow-x: auto;
    }
    /* Lines are set as text, so only their own spaces show. */
    .diff-text > div {
      white-space: pre;
      min-height: 1.4em;
    }
    .diff-text .added {
      color: var(--success-color);
    }
    .diff-text .removed {
      color: var(--error-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-diff": HaAutomationDiff;
  }
}
