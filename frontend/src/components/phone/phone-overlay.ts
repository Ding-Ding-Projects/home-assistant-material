import { css } from "lit";

/**
 * Shared by the panels that open over the Pages sheet: the per-page actions
 * and the bulk close review. The panel fills the sheet, which is a fixed
 * element, and its content sits at the bottom with a scrim above it.
 */
export const phoneOverlayStyles = css`
  :host {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    min-width: 0;
    font-family: var(--ha-font-family-body);
    color: var(--primary-text-color);
  }
  .scrim {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.32);
    border: none;
    padding: 0;
    cursor: default;
  }
  .panel {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--ha-space-2);
    box-sizing: border-box;
    min-width: 0;
    max-height: 100%;
    padding: var(--ha-space-3);
    border-radius: var(--ha-border-radius-4xl) var(--ha-border-radius-4xl) 0 0;
    background-color: var(--primary-background-color);
    box-shadow: 0 -4px 8px 3px rgba(0, 0, 0, 0.1);
    overflow-y: auto;
  }
  @media (prefers-reduced-motion: no-preference) {
    .panel {
      animation: rise var(--ha-animation-duration-normal, 250ms) ease-out;
    }
    @keyframes rise {
      from {
        transform: translateY(24px);
        opacity: 0;
      }
    }
  }
  button {
    font: inherit;
    color: inherit;
    border: none;
    background: none;
    cursor: pointer;
    padding: 0;
  }
  button:focus-visible {
    outline: 3px solid var(--primary-color);
    outline-offset: 2px;
  }
  .panel-head {
    display: flex;
    align-items: center;
    gap: var(--ha-space-2);
    min-width: 0;
  }
  .panel-title {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: var(--ha-font-size-l);
    font-weight: var(--ha-font-weight-medium);
    overflow-wrap: break-word;
    word-break: normal;
  }
  .round {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 44px;
    height: 44px;
    border-radius: var(--ha-border-radius-circle);
    color: var(--secondary-text-color);
  }
  .text-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--ha-space-2);
    min-height: 44px;
    padding: 0 var(--ha-space-4);
    border-radius: var(--ha-border-radius-pill);
    background-color: var(--ha-color-fill-primary-normal-resting);
    font-weight: var(--ha-font-weight-medium);
    --mdc-icon-size: 18px;
  }
  .text-button[disabled],
  .text-button[aria-disabled="true"] {
    opacity: 0.4;
    cursor: default;
  }
  .note {
    font-size: var(--ha-font-size-s);
    color: var(--secondary-text-color);
    overflow-wrap: break-word;
    word-break: normal;
  }
`;

/**
 * Keeps Tab inside a panel: from the last control it goes to the first and
 * from the first, backwards, to the last. Returns true when it moved focus.
 */
export const trapTab = (ev: KeyboardEvent, root: ShadowRoot): boolean => {
  if (ev.key !== "Tab") {
    return false;
  }
  const controls = Array.from(
    root.querySelectorAll<HTMLElement>(
      "button:not([disabled]):not(.scrim), ha-input-search"
    )
  );
  if (!controls.length) {
    return false;
  }
  const first = controls[0];
  const last = controls[controls.length - 1];
  const active = root.activeElement;
  if (ev.shiftKey && (active === first || !active)) {
    ev.preventDefault();
    last.focus();
    return true;
  }
  if (!ev.shiftKey && active === last) {
    ev.preventDefault();
    first.focus();
    return true;
  }
  return false;
};
