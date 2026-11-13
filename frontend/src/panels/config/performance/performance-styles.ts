import { css } from "lit";

/** Layout shared by the two performance pages: the page column, tinted tiles, cards and rows. */
export const performanceStyles = css`
  :host {
    display: block;
    height: 100%;
  }
  .page {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--ha-space-4);
    max-width: 1100px;
    margin: 0 auto;
    padding: var(--ha-space-2) var(--ha-space-8) var(--ha-space-8);
  }
  :host([narrow]) .page {
    padding: var(--ha-space-2) var(--ha-space-3) var(--ha-space-6);
  }
  ha-alert {
    display: block;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--ha-space-2);
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: var(--ha-space-4);
  }
  .stat {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--ha-space-2);
    padding: var(--ha-space-5) var(--ha-space-6);
    border-radius: var(--ha-border-radius-3xl);
    color: var(--ha-color-on-primary-container);
    background: var(--ha-color-primary-container);
    text-decoration: none;
  }
  a.stat:focus-visible {
    outline: 3px solid var(--primary-color);
    outline-offset: 2px;
  }
  .stat .label {
    display: flex;
    align-items: center;
    gap: var(--ha-space-2);
    font-size: var(--ha-font-size-s);
    font-weight: var(--ha-font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .stat .value {
    font-size: var(--ha-font-size-3xl);
    font-weight: var(--ha-font-weight-medium);
    line-height: var(--ha-line-height-condensed);
  }
  .stat.tone-success,
  .tile.tone-success {
    color: var(--ha-color-on-success-container);
    background: var(--ha-color-success-container);
  }
  .stat.tone-warning,
  .tile.tone-warning {
    color: var(--ha-color-on-warning-container);
    background: var(--ha-color-warning-container);
  }
  .stat.tone-error,
  .tile.tone-error {
    color: var(--ha-color-on-error-container);
    background: var(--ha-color-error-container);
  }
  .stat.tone-neutral,
  .tile.tone-neutral {
    color: var(--primary-text-color);
    background: var(
      --ha-color-surface-tone-2,
      var(--secondary-background-color)
    );
  }
  .card {
    box-sizing: border-box;
    padding: var(--ha-space-5) var(--ha-space-6);
    border-radius: var(--ha-border-radius-3xl);
    background: var(--card-background-color);
    box-shadow: var(--ha-shadow-card, none);
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    align-items: start;
    gap: var(--ha-space-4);
  }
  h3 {
    margin: 0 0 var(--ha-space-3);
    font-size: var(--ha-font-size-l);
    font-weight: var(--ha-font-weight-title, var(--ha-font-weight-medium));
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--ha-space-4);
    padding: var(--ha-space-3) 0;
  }
  li + li > .row,
  .row + .row {
    border-top: 1px solid var(--divider-color);
  }
  .tile {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--ha-border-radius-xl);
    color: var(--ha-color-on-primary-container);
    background: var(--ha-color-primary-container);
  }
  .text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--ha-space-1);
    min-width: 0;
  }
  .title {
    font-weight: var(--ha-font-weight-semibold);
    overflow-wrap: anywhere;
  }
  .sub {
    font-size: var(--ha-font-size-s);
    color: var(--secondary-text-color);
    overflow-wrap: anywhere;
  }
  .note {
    margin: 0;
    font-size: var(--ha-font-size-s);
    color: var(--secondary-text-color);
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--ha-space-3);
    padding: var(--ha-space-6) var(--ha-space-4);
    text-align: center;
    color: var(--secondary-text-color);
  }
  .empty ha-svg-icon {
    padding: var(--ha-space-4);
    border-radius: var(--ha-border-radius-circle);
    background: var(--secondary-background-color);
  }
  .facts {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--ha-space-2) var(--ha-space-4);
    margin: 0;
  }
  .facts dt {
    color: var(--secondary-text-color);
  }
  .facts dd {
    margin: 0;
    font-weight: var(--ha-font-weight-semibold);
    text-align: end;
  }
  @media (prefers-reduced-motion: reduce) {
    * {
      transition: none !important;
      animation: none !important;
    }
  }
`;
