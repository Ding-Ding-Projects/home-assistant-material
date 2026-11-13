import { css, unsafeCSS } from "lit";
import {
  MOTION_ENTERING_ATTRIBUTE,
  motionAppearStyles,
  motionKeyframes,
} from "./motion-styles";

export const SIDEBAR_MIN_WIDTH = 375;
export const CONTENT_MIN_WIDTH = 350;

export const rowSummaryStyles = css`
  :host {
    display: inline-flex;
    align-items: center;
    gap: var(--ha-space-2);
    vertical-align: middle;
    color: var(--ha-color-text-secondary);
  }
  :host([hidden]) {
    display: none;
  }
  .dot-separator {
    width: 2px;
    height: 2px;
    border-radius: var(--ha-border-radius-circle);
    background-color: currentColor;
  }
`;

export const rowStyles = css`
  ${motionKeyframes}
  ${motionAppearStyles}
  ha-icon-button {
    --mdc-theme-text-primary-on-background: var(--primary-text-color);
  }
  ha-expansion-panel {
    position: relative;
    --expansion-panel-summary-padding: 0 0 0 8px;
    --expansion-panel-content-padding: 0;
  }
  h3 {
    font-size: inherit;
    font-weight: inherit;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ha-space-2);
    padding: var(--ha-space-2) 0;
    min-height: 32px;
    max-width: 100%;
  }

  ha-card {
    transition: outline var(--ha-animation-duration-fast, 150ms);
  }
  .warning ul {
    margin: 4px 0;
  }
  ha-tooltip {
    cursor: default;
  }
  .hidden {
    display: none;
  }

  ha-automation-row-event-chip.event-chip {
    position: absolute;
  }

  .icon-badge-wrapper {
    position: relative;
    display: inline-flex;
  }

  .trigger-leading {
    display: inline-flex;
    align-items: center;
    gap: var(--ha-space-2);
  }

  .trigger-leading {
    color: var(--ha-color-on-neutral-quiet);
  }

  .trigger-leading ha-trigger-icon,
  .trigger-leading ha-svg-icon {
    --mdc-icon-size: 20px;
    flex-shrink: 0;
  }

  .trigger-index-badge {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    width: 22px;
    height: 22px;
    border: 2px dotted var(--ha-color-border-neutral-normal);
    border-radius: var(--ha-border-radius-circle);
    box-sizing: border-box;
    color: var(--ha-color-text-secondary);
    font-size: var(--ha-font-size-s);
    line-height: 1;
    text-box-trim: both;
    text-box-edge: cap alphabetic;
    overflow: hidden;
    transition:
      opacity var(--ha-animation-duration-fast) ease-out,
      transform var(--ha-animation-duration-fast) ease-out,
      width var(--ha-animation-duration-fast) ease-out,
      margin-inline-end var(--ha-animation-duration-fast) ease-out,
      border-width var(--ha-animation-duration-fast) ease-out;
  }

  .trigger-index-badge.hidden {
    opacity: 0;
    transform: translateX(calc(-8px * var(--scale-direction)));
    width: 0;
    margin-inline-end: 0;
    border-width: 0;
    pointer-events: none;
  }

  .note-indicator {
    color: var(--ha-color-on-neutral-normal);
  }
  .branch-count,
  .relation-chip {
    flex: none;
    padding: 0 var(--ha-space-2);
    border-radius: var(--ha-border-radius-pill, 999px);
    font-size: var(--ha-font-size-s, 0.875rem);
    line-height: 1.5rem;
    white-space: nowrap;
    background: var(
      --ha-color-surface-tone-2,
      var(--secondary-background-color)
    );
    color: var(--secondary-text-color);
  }
  .relation-chip {
    background: var(
      --ha-color-primary-container,
      var(--secondary-background-color)
    );
    color: var(--ha-color-on-primary-container, var(--primary-text-color));
  }
  .note-indicator + ha-tooltip::part(body) {
    cursor: default;
    max-width: 300px;
  }
  .note-indicator + ha-tooltip p {
    white-space: pre-wrap;
    margin: 0;
  }
`;

export const editorStyles = css`
  .disabled {
    pointer-events: none;
  }

  .card-content.card {
    padding: 16px;
  }
  .card-content.yaml {
    padding: 0 1px;
    border-top: 1px solid var(--divider-color);
    border-bottom: 1px solid var(--divider-color);
  }
`;

export const indentStyle = css`
  .card-content.indent,
  .selector-row,
  :host([indent]) ha-form {
    margin-inline-start: 12px;
    padding-top: 12px;
    padding-bottom: 16px;
    padding-inline-start: 16px;
    padding-inline-end: 0px;
    border-inline-start: 2px solid var(--ha-color-border-neutral-quiet);
    border-bottom: 2px solid var(--ha-color-border-neutral-quiet);
    border-radius: var(--ha-border-radius-square);
    border-end-start-radius: var(--ha-border-radius-lg);
  }
  .card-content.indent.selected,
  :host([selected]) .card-content.indent,
  .selector-row.parent-selected,
  :host([selected]) ha-form {
    border-color: var(--primary-color);
    background: var(--ha-color-fill-primary-quiet-resting);
    background: linear-gradient(
      to right,
      var(--ha-color-fill-primary-quiet-resting) 0%,
      var(--ha-color-fill-primary-quiet-resting) 80%,
      rgba(var(--rgb-primary-color), 0) 100%
    );
  }
`;

export const manualEditorStyles = css`
  ${motionKeyframes}
  :host {
    display: block;
    --sidebar-width: 0;
    --sidebar-gap: 0;
  }

  .has-sidebar {
    --sidebar-width: min(
      max(var(--sidebar-dynamic-width), ${SIDEBAR_MIN_WIDTH}px),
      100vw - ${CONTENT_MIN_WIDTH}px - var(--ha-sidebar-width, 0px),
      var(--ha-automation-editor-max-width) -
        ${CONTENT_MIN_WIDTH}px - var(--ha-sidebar-width, 0px)
    );
    --sidebar-gap: var(--ha-space-4);
  }

  /* The save bar follows the last field and sticks to the bottom edge only
     while that field is further down, so it never covers a field. It ends at
     the content column: the fixed sidebar owns the space beside it, and a bar
     reaching under the sidebar could cover its bottom buttons. */

  .content-wrapper {
    padding-right: calc(var(--sidebar-width) + var(--sidebar-gap));
    padding-inline-end: calc(var(--sidebar-width) + var(--sidebar-gap));
    padding-inline-start: 0;
  }

  .content {
    padding-top: var(--ha-space-3);
    padding-bottom: max(var(--safe-area-inset-bottom), 32px);
    transition: padding-bottom 180ms ease-in-out;
  }

  .has-bottom-sheet {
    --automation-bottom-sheet-height: 50vh;
    /* The backdrop covers the editor when the sheet is at full height */
    --automation-bottom-sheet-covered-height: min(
      var(--automation-bottom-sheet-settled-height, 100vh),
      var(--automation-bottom-sheet-height)
    );
  }
  /* A custom property can't fall back from dvh to vh by being declared twice */
  @supports (height: 1dvh) {
    .has-bottom-sheet {
      --automation-bottom-sheet-height: 50dvh;
    }
  }
  .has-bottom-sheet .content {
    padding-bottom: calc(
      var(--automation-bottom-sheet-covered-height) + var(--ha-space-4)
    );
  }
  /* Under the sidebar sheet the bar sticks above the sheet, so Save stays in
     reach and the sheet does not cover it */
  .has-bottom-sheet ha-editor-save-bar {
    bottom: var(--automation-bottom-sheet-covered-height);
    /* The sheet sits between the bar and the phone bar, so the bar needs only
       the real device inset */
    --ha-editor-save-bar-padding-bottom: env(safe-area-inset-bottom, 0px);
  }

  ha-automation-sidebar {
    position: fixed;
    top: calc(var(--header-height) + 16px);
    height: calc(-81px + 100vh - var(--safe-area-inset-top, 0px));
    height: calc(-81px + 100dvh - var(--safe-area-inset-top, 0px));
    width: var(--sidebar-width);
    display: block;
  }

  ha-automation-sidebar.hidden {
    display: none;
  }

  /* Plays each time the sidebar goes from hidden to shown */
  .has-sidebar ha-automation-sidebar:not(.hidden) {
    animation: ha-automation-slide-in-end
      var(--ha-animation-duration-normal, 250ms)
      var(--ha-automation-ease-enter, cubic-bezier(0.05, 0.7, 0.1, 1)) backwards;
  }

  .sidebar-positioner {
    display: flex;
    justify-content: flex-end;
  }

  .description {
    margin: 0;
  }
  .header a {
    color: var(--secondary-text-color);
  }
`;

export const automationRowsStyles = css`
  ${motionKeyframes}
  .rows > [${unsafeCSS(MOTION_ENTERING_ATTRIBUTE)}] {
    animation: ha-automation-enter var(--ha-animation-duration-normal, 250ms)
      var(--ha-automation-ease-enter, cubic-bezier(0.05, 0.7, 0.1, 1)) backwards;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: var(--ha-space-4);
  }
  .rows.no-sidebar {
    margin-inline-end: 0;
  }
  /* The editor search and the search of a list. A hidden row is not removed,
     so the order and the index of every row stay what they are. */
  .rows > [search-hidden] {
    display: none;
  }
  .rows > [search-match] {
    outline: 2px dashed var(--primary-color);
    outline-offset: 3px;
    border-radius: var(--ha-card-border-radius, var(--ha-border-radius-lg));
  }
  .rows > [search-match][search-current] {
    outline-style: solid;
    outline-width: 3px;
  }
  .list-search {
    display: flex;
    flex-direction: column;
    gap: var(--ha-space-1);
    margin-block-end: var(--ha-space-3);
  }
  .list-search-row {
    display: flex;
    align-items: center;
    gap: var(--ha-space-1);
  }
  .list-search-row ha-input-search {
    flex: 1 1 auto;
    min-width: 0;
    --ha-input-search-border-radius: var(--ha-border-radius-pill);
  }
  .list-search-row ha-icon-button,
  .buttons ha-icon-button {
    --ha-icon-button-size: 44px;
  }
  .list-search-note {
    margin: 0;
    font-size: var(--ha-font-size-s, 0.875rem);
    color: var(--secondary-text-color);
  }
  .list-search-note.error {
    color: var(--error-color);
  }
  .sortable-ghost {
    background: none;
    border-radius: var(--ha-card-border-radius, var(--ha-border-radius-lg));
  }
  .sortable-drag {
    background: none;
  }
  ha-automation-action-row {
    display: block;
  }
  /* The sticky search panel sits over the top of the editor, so a row that is
     scrolled to keeps room above it for its own toolbar. */
  ha-automation-trigger-row,
  ha-automation-condition-row,
  ha-automation-action-row,
  ha-automation-option-row {
    scroll-margin-top: var(--ha-automation-sticky-offset, 120px);
  }
  /* The part the open bottom sheet covers, see scrollRowIntoView */
  ha-automation-trigger-row,
  ha-automation-condition-row,
  ha-automation-action-row,
  ha-automation-option-row {
    scroll-margin-bottom: calc(
      var(--automation-bottom-sheet-height, 0px) +
        var(--ha-editor-save-bar-height, 80px)
    );
  }
  .handle {
    padding: 4px;
    cursor: move; /* fallback if grab cursor is unsupported */
    cursor: grab;
    border-radius: var(--ha-border-radius-pill);
  }
  .handle:focus {
    outline: var(--wa-focus-ring);
    background: var(--ha-color-fill-neutral-quiet-resting);
  }
  .handle.active {
    outline: var(--wa-focus-ring);
    background: var(--ha-color-fill-neutral-normal-active);
  }
  .handle ha-svg-icon {
    pointer-events: none;
    height: 24px;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ha-space-2);
    order: 1;
  }
  /* The gap between two steps. It takes no room of its own: it sits over the
     space between the rows and shows on hover and on keyboard focus. */
  .insert-slot {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 24px;
    margin-block: calc((var(--ha-space-4) + 24px) / -2);
    position: relative;
    z-index: 1;
    pointer-events: none;
  }
  .insert-button {
    display: inline-flex;
    align-items: center;
    gap: var(--ha-space-1);
    height: 24px;
    padding: 0 var(--ha-space-3);
    border: 1.5px dashed var(--primary-color);
    border-radius: var(--ha-border-radius-pill, 999px);
    background: var(--card-background-color);
    color: var(--primary-color);
    font: inherit;
    font-size: var(--ha-font-size-s, 0.875rem);
    cursor: pointer;
    opacity: 0;
    pointer-events: auto;
    transition: opacity var(--ha-animation-duration-fast, 150ms) ease;
  }
  .insert-button ha-svg-icon {
    --mdc-icon-size: 16px;
    width: 16px;
    height: 16px;
  }
  .insert-slot:hover .insert-button,
  .insert-button:hover,
  .insert-button:focus-visible {
    opacity: 1;
  }
  .insert-button:focus-visible {
    outline: var(--wa-focus-ring);
  }
  /* Touch screens have no hover: the target is always there, as a thin line. */
  @media (hover: none) {
    .insert-button {
      opacity: 0.7;
    }
    .insert-button .insert-text {
      display: none;
    }
    .insert-button {
      min-width: 56px;
      justify-content: center;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .insert-button {
      transition: none;
    }
  }
`;

export const sidebarEditorStyles = css`
  .sidebar-editor {
    display: block;
  }
  .description {
    padding-top: 16px;
  }
`;

export const overflowStyles = css`
  .overflow-label {
    display: flex;
    justify-content: space-between;
    gap: var(--ha-space-3);
    white-space: nowrap;
  }
  .overflow-label .shortcut {
    direction: ltr;
    --mdc-icon-size: 12px;
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    gap: 2px;
  }
  .overflow-label .shortcut span {
    font-size: var(--ha-font-size-s);
    font-family: var(--ha-font-family-code);
    color: var(--ha-color-text-secondary);
  }
  .shortcut-placeholder {
    display: inline-block;
    width: 60px;
  }
  .shortcut-placeholder.mac {
    width: 46px;
  }
  @media all and (max-width: 870px) {
    .shortcut-placeholder {
      display: none;
    }
  }
`;
