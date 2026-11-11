import { css } from "lit";

/**
 * Shared presentation for the entity dialog bodies: segmented selectors,
 * outlined chips, small fact tiles and the large status headline.
 */
export const moreInfoBoardStyle = css`
  .headline {
    margin: 0;
    text-align: center;
    font-size: 48px;
    line-height: var(--ha-line-height-condensed);
    font-weight: var(--ha-font-weight-normal);
    color: var(--primary-text-color);
  }
  .headline.accent {
    color: var(--primary-color);
  }
  .headline.ok {
    color: var(--success-color);
  }
  .headline.warn {
    color: var(--warning-color);
  }
  .headline.bad {
    color: var(--error-color);
  }
  .subline {
    margin: var(--ha-space-1) 0 var(--ha-space-5);
    text-align: center;
    color: var(--secondary-text-color);
    font-size: var(--ha-font-size-m);
  }

  .segmented {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--ha-space-1);
    padding: var(--ha-space-1);
    border-radius: var(--ha-border-radius-3xl);
    background: var(--secondary-background-color);
    align-self: center;
    max-width: 100%;
    box-sizing: border-box;
  }
  .segmented button {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--secondary-text-color);
    font: inherit;
    font-weight: var(--ha-font-weight-medium);
    padding: var(--ha-space-2) var(--ha-space-4);
    min-height: 40px;
    border-radius: var(--ha-border-radius-3xl);
    cursor: pointer;
  }
  .segmented button[aria-pressed="true"] {
    background: var(--card-background-color);
    color: var(--primary-text-color);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }
  .segmented button:disabled,
  .chip:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--ha-space-2);
    align-self: center;
  }
  .chip {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: var(--ha-space-2);
    min-height: 36px;
    padding: 0 var(--ha-space-4);
    border-radius: var(--ha-border-radius-lg);
    border: 1px solid var(--outline-color, var(--divider-color));
    background: transparent;
    color: var(--primary-text-color);
    font: inherit;
    font-weight: var(--ha-font-weight-medium);
    cursor: pointer;
  }
  .chip[aria-pressed="true"] {
    background: var(
      --ha-color-fill-primary-quiet-resting,
      rgba(3, 169, 244, 0.2)
    );
    border-color: transparent;
  }
  .chip ha-svg-icon {
    --mdc-icon-size: 18px;
    width: 18px;
    height: 18px;
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
    gap: var(--ha-space-2);
    align-self: stretch;
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: var(--ha-space-1);
    padding: var(--ha-space-3) var(--ha-space-4);
    border-radius: var(--ha-border-radius-xl);
    background: var(--secondary-background-color);
    min-width: 0;
  }
  .tile .label {
    color: var(--secondary-text-color);
    font-size: var(--ha-font-size-s);
  }
  .tile .value {
    font-weight: var(--ha-font-weight-medium);
    overflow-wrap: anywhere;
  }

  .round-buttons {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--ha-space-3);
  }
  .round-buttons .round {
    appearance: none;
    border: none;
    width: 56px;
    height: 56px;
    border-radius: var(--ha-border-radius-circle);
    background: var(--secondary-background-color);
    color: var(--primary-text-color);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    --mdc-icon-size: 24px;
  }
  .round-buttons .round.primary {
    background: var(--primary-color);
    color: var(--text-primary-color, #fff);
  }
  .round-buttons .round:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--ha-space-4);
  }
`;
