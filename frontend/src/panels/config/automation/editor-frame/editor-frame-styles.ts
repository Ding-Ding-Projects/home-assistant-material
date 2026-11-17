import { css } from "lit";

/**
 * Chrome shared by the manual editors: numbered tonal blocks, tall rounded
 * rows and the segmented pill. Sections count themselves with a CSS counter,
 * so a hidden "Only if" block never leaves a gap in the numbers.
 */
export const editorFrameStyles = css`
  :host {
    counter-reset: frame-block;
  }
  .section,
  .card {
    counter-increment: frame-block;
    position: relative;
    border-radius: var(--ha-border-radius-3xl, 32px);
    padding: var(--ha-space-5, 20px) var(--ha-space-5, 20px)
      var(--ha-space-5, 20px);
  }
  .section .header .name::before,
  .card .header .name::before {
    content: counter(frame-block);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 40px;
    height: 40px;
    margin-inline-end: var(--ha-space-1);
    border-radius: 50%;
    font-size: var(--ha-font-size-xl, 1.375rem);
    font-weight: 800;
    background: var(--ha-color-primary-container, var(--primary-color));
    color: var(--ha-color-on-primary-container, var(--text-primary-color));
  }
  .section .chip {
    font-weight: 800;
    font-stretch: 112%;
  }
  .section {
    margin-block: 0 var(--ha-space-4);
  }
  .starting-points,
  .quick-add {
    margin-block: 0 var(--ha-space-4);
  }
  ha-automation-trigger,
  ha-automation-condition,
  ha-automation-action {
    --ha-card-border-radius: 20px;
    --ha-automation-row-radius: 20px;
  }
`;
