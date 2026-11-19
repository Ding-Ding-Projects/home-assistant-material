import { css } from "lit";

/**
 * The card around each game follows the theme. The games themselves are
 * drawn objects (grass, a blue rack, a brass coin, a baked cookie) and keep
 * their own colours in the light theme too. Everything is drawn with
 * gradients and shadows: no picture, font or sound file is loaded.
 */
export const gameCardStyles = css`
  :host {
    display: block;
  }
  .gcard {
    box-sizing: border-box;
    width: 100%;
    max-width: 420px;
    border-radius: var(--ha-border-radius-6xl, 28px);
    background: var(--secondary-background-color);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .ghead {
    min-height: 56px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ha-space-2) var(--ha-space-3);
    padding: var(--ha-space-2) var(--ha-space-4);
  }
  .gtitle {
    flex: 1 1 auto;
    font-size: var(--ha-font-size-l);
    font-weight: var(--ha-font-weight-bold);
  }
  .score {
    font-family: var(--ha-font-family-code, monospace);
    font-variant-numeric: tabular-nums;
    color: var(--secondary-text-color);
  }
  .gfoot {
    padding: var(--ha-space-3) var(--ha-space-4) var(--ha-space-4);
    display: flex;
    flex-direction: column;
    gap: var(--ha-space-2);
  }
  .status {
    margin: 0;
    min-height: 20px;
    font-weight: var(--ha-font-weight-medium, 500);
    overflow-wrap: anywhere;
  }
  .hint {
    margin: 0;
    font-size: var(--ha-font-size-s);
    color: var(--secondary-text-color);
  }
  .gbtn {
    min-height: 44px;
    padding: 0 var(--ha-space-5);
    border-radius: var(--ha-border-radius-pill, 22px);
    border: none;
    box-shadow: inset 0 0 0 1px var(--divider-color);
    background: transparent;
    color: var(--primary-color);
    font: inherit;
    font-weight: var(--ha-font-weight-bold);
    cursor: pointer;
  }
  .gbtn.filled {
    box-shadow: none;
    background: var(--primary-color);
    color: var(--text-primary-color, #fff);
  }
  .gbtn[disabled] {
    cursor: default;
    opacity: 0.5;
  }
  .gbtn[aria-pressed="true"] {
    background: color-mix(in srgb, var(--primary-color) 18%, transparent);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ha-space-2);
  }
  .row .gbtn {
    flex: 1 1 140px;
  }
  button:focus-visible {
    outline: 3px solid var(--primary-color);
    outline-offset: 2px;
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
`;
