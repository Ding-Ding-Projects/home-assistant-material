import { css } from "lit";

/**
 * Rounded tonal rows for the side pane of the To-do and Calendar pages: a
 * 40 px icon tile, the name, a supporting line and a filled row when picked.
 * Use with `ha-list-nav` and `ha-list-item-button` children that carry the
 * `pane-row` class.
 */
export const paneListStyles = css`
  .pane-list {
    display: block;
    padding: var(--ha-space-2);
    box-sizing: border-box;
  }
  .pane-footer {
    display: block;
    padding: var(--ha-space-2);
    box-sizing: border-box;
  }
  .pane-row {
    --ha-row-item-min-height: 56px;
    --ha-row-item-padding-block: var(--ha-space-2);
    --ha-row-item-padding-inline: var(--ha-space-3);
    --ha-row-item-gap: var(--ha-space-3);
  }
  .pane-row::part(base) {
    border-radius: var(--ha-border-radius-xl);
  }
  .pane-row.selected::part(base) {
    background-color: var(
      --md-sys-color-primary-container,
      var(--ha-color-fill-primary-normal-resting)
    );
    color: var(--md-sys-color-on-primary-container, var(--primary-text-color));
  }
  .pane-row.selected::part(supporting-text) {
    color: inherit;
  }
  .pane-tile {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--ha-border-radius-lg);
    background: var(--ha-color-fill-primary-quiet-resting);
    color: var(--ha-color-on-primary-quiet, var(--primary-color));
    flex: none;
  }
  .pane-row.selected .pane-tile {
    background: var(--md-sys-color-surface, var(--card-background-color));
  }
  .pane-check {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--primary-color);
    --mdc-icon-size: 20px;
  }
  @media (prefers-reduced-motion: reduce) {
    .pane-row::part(base) {
      transition: none;
    }
  }
`;
