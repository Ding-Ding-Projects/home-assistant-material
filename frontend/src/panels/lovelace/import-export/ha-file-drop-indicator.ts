import type { CSSResultGroup } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";

/**
 * A full-window notice shown while a file is dragged over the app. It says
 * only that a drop imports, never which kind of file, because the file has
 * not been read yet. It takes no focus and no pointer input.
 */
@customElement("ha-file-drop-indicator")
export class HaFileDropIndicator extends LitElement {
  @property() public label = "";

  protected render() {
    return html`<div class="frame" role="status" aria-live="polite">
      <div class="label">${this.label}</div>
    </div>`;
  }

  static styles: CSSResultGroup = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 2000;
      pointer-events: none;
      display: block;
    }
    .frame {
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--ha-space-4);
      border: 4px dashed var(--primary-color);
      border-radius: var(--ha-border-radius-xl, 24px);
      background: color-mix(in srgb, var(--primary-color) 12%, transparent);
    }
    .label {
      padding: var(--ha-space-3) var(--ha-space-6);
      border-radius: var(--ha-border-radius-pill, 999px);
      background: var(--primary-color);
      color: var(--text-primary-color);
      font-size: var(--ha-font-size-l, 18px);
      font-weight: var(--ha-font-weight-medium, 500);
      text-align: center;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-file-drop-indicator": HaFileDropIndicator;
  }
}

let hideTimer: number | undefined;

const HIDE_AFTER_MS = 400;

/** Shows the indicator, and hides it again when drag events stop arriving. */
export const showFileDropIndicator = (label: string): void => {
  let indicator = document.querySelector("ha-file-drop-indicator");
  if (!indicator) {
    indicator = document.createElement("ha-file-drop-indicator");
    document.body.append(indicator);
  }
  indicator.label = label;
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(hideFileDropIndicator, HIDE_AFTER_MS);
};

export const hideFileDropIndicator = (): void => {
  window.clearTimeout(hideTimer);
  document
    .querySelectorAll("ha-file-drop-indicator")
    .forEach((el) => el.remove());
};
