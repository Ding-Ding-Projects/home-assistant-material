import { css } from "lit";

/** What the lock wizard and the unlock prompt share: the panel, its header and the sheet on a phone. */
export const lockPanelStyles = css`
  :host {
    display: contents;
  }
  .panel {
    position: fixed;
    z-index: 1000;
    box-sizing: border-box;
    overflow: auto;
    padding: var(--ha-space-4);
    border-radius: var(--ha-border-radius-3xl);
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
    border: 1px solid var(--divider-color);
    display: grid;
    gap: var(--ha-space-3);
    align-content: start;
  }
  .panel.sheet {
    inset: 0;
    width: auto;
    max-height: none;
    border-radius: 0;
    border: 0;
    animation: lock-sheet-in 200ms ease-out;
  }
  .panel.sheet.bottom {
    inset: auto 0 0 0;
    max-height: 100dvh;
    border-radius: var(--ha-border-radius-3xl) var(--ha-border-radius-3xl) 0 0;
  }
  @keyframes lock-sheet-in {
    from {
      transform: translateY(24px);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .panel.sheet {
      animation: none;
    }
  }
  header {
    display: flex;
    align-items: flex-start;
    gap: var(--ha-space-2);
  }
  .titles {
    flex: 1;
    min-width: 0;
  }
  h2 {
    margin: 0;
    font-size: var(--ha-font-size-l, 1.1rem);
    overflow-wrap: anywhere;
  }
  p {
    margin: 0;
  }
  .sub {
    color: var(--secondary-text-color);
    font-size: var(--ha-font-size-s, 0.85rem);
    overflow-wrap: anywhere;
  }
  .close {
    flex: none;
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--primary-text-color);
    cursor: pointer;
  }
  .note {
    color: var(--secondary-text-color);
    font-size: var(--ha-font-size-s, 0.85rem);
  }
  .callout {
    display: flex;
    gap: var(--ha-space-3);
    align-items: flex-start;
    padding: var(--ha-space-3);
    border-radius: var(--ha-border-radius-xl, 16px);
    background: var(--secondary-background-color);
    overflow-wrap: anywhere;
  }
  .callout ha-svg-icon {
    flex: none;
    color: var(--secondary-text-color);
  }
  .error {
    color: var(--error-color);
  }
  .ok {
    color: var(--success-color);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ha-space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .chips li {
    display: inline-flex;
    align-items: center;
    gap: var(--ha-space-1);
    padding: 2px var(--ha-space-3);
    border-radius: var(--ha-border-radius-pill);
    background: var(--secondary-background-color);
    color: var(--secondary-text-color);
    font-size: var(--ha-font-size-s, 0.85rem);
  }
  .chips li[aria-current="step"] {
    background: color-mix(in srgb, var(--primary-color) 18%, transparent);
    color: var(--primary-text-color);
    font-weight: 600;
  }
  .chips li.done {
    background: color-mix(in srgb, var(--success-color) 22%, transparent);
    color: var(--primary-text-color);
  }
  .chips ha-svg-icon {
    --mdc-icon-size: 14px;
  }
  .buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--ha-space-2);
  }
  button {
    min-height: 48px;
    border: 1px solid var(--divider-color);
    border-radius: var(--ha-border-radius-pill, 24px);
    background: var(--secondary-background-color);
    color: var(--primary-text-color);
    font: inherit;
    cursor: pointer;
  }
  button.text {
    border-color: transparent;
    background: none;
    color: var(--primary-color);
    justify-self: start;
    padding: 0 var(--ha-space-3);
  }
  button.primary {
    background: var(--primary-color);
    color: var(--text-primary-color, #fff);
    border-color: var(--primary-color);
    justify-self: end;
    padding: 0 var(--ha-space-6);
  }
  .buttons.equal button {
    justify-self: stretch;
  }
  button:focus-visible,
  input:focus-visible,
  a:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;
