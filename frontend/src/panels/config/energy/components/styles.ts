import { css } from "lit";

/**
 * Shared by the Energy settings components. The rules in the first block are
 * the original look, used wherever these components are embedded (for example
 * the setup wizard on the Energy dashboard). The rules under `:host([page])`
 * apply only when the settings page sets the `page` attribute on a component.
 */
export const energyCardStyles = css`
  .card-header ha-svg-icon {
    height: 32px;
    width: 32px;
    margin-right: 8px;
    margin-inline-end: 8px;
    margin-inline-start: initial;
    direction: var(--direction);
  }
  h3 {
    margin-top: 24px;
    margin-bottom: 4px;
  }
  .row {
    display: flex;
    align-items: center;
    height: 48px;
    box-sizing: border-box;
  }
  .row ha-svg-icon,
  .row ha-icon,
  .row img {
    margin-right: 16px;
    margin-inline-end: 16px;
    margin-inline-start: initial;
    direction: var(--direction);
  }
  .row img {
    height: 24px;
  }
  .row .content {
    flex-grow: 1;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  ha-icon-button {
    color: var(--secondary-text-color);
  }
  p {
    color: var(--secondary-text-color);
  }
  p a {
    color: var(--primary-color);
  }
  hr {
    border: none;
    border-top: 1px solid var(--divider-color);
    margin: 24px calc(var(--ha-space-4) * -1);
  }
  .items-container {
    border: 1px solid var(--ha-color-border-neutral-quiet);
    border-radius: var(--ha-border-radius-lg);
    padding: var(--ha-space-2);
    display: flex;
    flex-direction: column;
    gap: var(--ha-space-2);
  }

  :host([page]) ha-card {
    --ha-card-border-radius: var(--ha-border-radius-3xl);
    height: 100%;
    box-sizing: border-box;
    border: none;
    background: var(--secondary-background-color);
  }
  :host([page]) .card-header {
    display: flex;
    align-items: center;
    margin: 0;
    padding: var(--ha-space-5) var(--ha-space-5) 0;
    font-size: var(--ha-font-size-xl);
    font-weight: var(--ha-font-weight-medium);
    line-height: var(--ha-line-height-condensed);
  }
  :host([page]) .card-content {
    padding: var(--ha-space-3) var(--ha-space-5) var(--ha-space-5);
  }
  :host([page]) h3 {
    font-size: var(--ha-font-size-m);
    font-weight: var(--ha-font-weight-medium);
  }
  :host([page]) .row {
    height: auto;
    min-height: 48px;
  }
  :host([page]) .row .content {
    min-width: 0;
  }
  :host([page]) .items-container {
    border: none;
    padding: 0;
  }
  /* Each item is a rounded tile with its icon on a small tile of its own. */
  :host([page]) .items-container .row {
    padding-inline: var(--ha-space-3);
    border-radius: var(--ha-border-radius-xl);
    background: var(--card-background-color);
  }
  :host([page]) .items-container .row > ha-svg-icon,
  :host([page]) .items-container .row > ha-icon,
  :host([page]) .items-container .row > img {
    box-sizing: content-box;
    padding: var(--ha-space-2);
    border-radius: var(--ha-border-radius-lg);
    background: var(--secondary-background-color);
  }
`;
