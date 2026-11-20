import type { TemplateResult } from "lit";
import { css, html } from "lit";
import { BILINGUAL_SEPARATOR } from "./language-mode";

/**
 * Splits a "English · Cantonese" label into its two parts, or undefined.
 * Anything that is not a string (a page may pass a template as its title) is
 * never split.
 */
export const splitBilingualLabel = (
  label: unknown
): [string, string] | undefined => {
  if (typeof label !== "string") {
    return undefined;
  }
  const parts = label.split(BILINGUAL_SEPARATOR);
  return parts.length === 2 && parts[0] && parts[1]
    ? [parts[0], parts[1]]
    : undefined;
};

/** True when the label carries both languages. */
export const isBilingualLabel = (label: unknown): boolean =>
  !!label && splitBilingualLabel(label) !== undefined;

/**
 * Renders a control label. In both-language mode the English sits on one line
 * and the Cantonese, smaller, beneath it, so the control stays one row. Any
 * other label, including one that is not a string, is returned unchanged.
 * Pair with `stackedLabelStyles`.
 */
export function renderStackedLabel(label: string): TemplateResult | string;
export function renderStackedLabel<T>(label: T): TemplateResult | T;
export function renderStackedLabel(label: unknown): unknown {
  const parts = splitBilingualLabel(label);
  if (!parts) {
    return label;
  }
  return html`<span class="stacked-label"
    ><span class="stacked-main">${parts[0]}</span
    ><span class="stacked-sub">${parts[1]}</span></span
  >`;
}

/**
 * Renders a page title. In both-language mode the second language and the
 * separator before it form one unit that wraps as a whole, so a narrow
 * screen breaks the title at the separator and never inside a word. Any
 * other title, including a template a page passes as its header, is returned
 * unchanged. The styles live in `pageHeaderStyles`.
 */
export function renderBilingualTitle(title: string): TemplateResult | string;
export function renderBilingualTitle<T>(title: T): TemplateResult | T;
export function renderBilingualTitle(title: unknown): unknown {
  const parts = splitBilingualLabel(title);
  if (!parts) {
    return title;
  }
  return html`<span class="title-main">${parts[0]}</span>
    <span class="title-alt">·&nbsp;${parts[1]}</span>`;
}

/** Styles for `renderStackedLabel`; add to the control's own styles. */
export const stackedLabelStyles = css`
  .stacked-label {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    line-height: var(--ha-line-height-condensed, 1.2);
    white-space: nowrap;
  }

  .stacked-sub {
    font-size: var(--ha-font-size-xs, 12px);
    font-weight: var(--ha-font-weight-normal, 400);
    opacity: 0.8;
  }
`;
