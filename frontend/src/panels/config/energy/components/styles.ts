import { css } from "lit";

export const energyCardStyles = css`
  ha-card {
    --ha-card-border-radius: var(--ha-border-radius-3xl);
    height: 100%;
    box-sizing: border-box;
    border: none;
    background: var(--secondary-background-color);
  }
  .card-header {
    display: flex;
    align-items: center;
    margin: 0;
    padding: var(--ha-space-5) var(--ha-space-5) 0;
    font-size: var(--ha-font-size-xl);
    font-weight: var(--ha-font-weight-medium);
    line-height: var(--ha-line-height-condensed);
  }
  .card-header ha-svg-icon {
    height: 32px;
    width: 32px;
    margin-right: 8px;
    margin-inline-end: 8px;
    margin-inline-start: initial;
    direction: var(--direction);
  }
  .card-content {
    padding: var(--ha-space-3) var(--ha-space-5) var(--ha-space-5);
  }
  h3 {
    margin-top: 24px;
    margin-bottom: 4px;
    font-size: var(--ha-font-size-m);
    font-weight: var(--ha-font-weight-medium);
  }
  .row {
    display: flex;
    align-items: center;
    min-height: 48px;
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
    min-width: 0;
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
    border: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ha-space-2);
  }
  /* Each item is a rounded tile with its icon on a small tile of its own. */
  .items-container .row {
    padding-inline: var(--ha-space-3);
    border-radius: var(--ha-border-radius-xl);
    background: var(--card-background-color);
  }
  .items-container .row > ha-svg-icon,
  .items-container .row > ha-icon {
    box-sizing: content-box;
    padding: var(--ha-space-2);
    border-radius: var(--ha-border-radius-lg);
    background: var(--secondary-background-color);
  }
  .items-container .row > img {
    box-sizing: content-box;
    padding: var(--ha-space-2);
    border-radius: var(--ha-border-radius-lg);
    background: var(--secondary-background-color);
  }
`;
