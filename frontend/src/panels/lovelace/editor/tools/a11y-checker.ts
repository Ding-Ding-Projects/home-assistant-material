import type { Rgba } from "./contrast";
import {
  compose,
  contrastRatio,
  parseColor,
  requiredContrast,
} from "./contrast";
import type { CardLike } from "./deep-dom";
import {
  composedParent,
  findRenderedCards,
  renderedCardLabel,
  walkDeep,
} from "./deep-dom";

/**
 * Accessibility checker. It measures the dashboard as this browser renders
 * it right now: the computed colour of text against the colour behind it,
 * the rendered size of controls, and controls without a name. Text over an
 * image or gradient, and anything else it cannot measure, is counted as not
 * judged and never reported as passing.
 */

export type A11yKind = "contrast" | "target" | "name";
export type A11ySeverity = "fail" | "advice";

export interface A11yFinding {
  kind: A11yKind;
  severity: A11ySeverity;
  card: string;
  /** What was measured, as numbers (never prose, so it can be localized). */
  ratio?: number;
  required?: number;
  width?: number;
  height?: number;
  /** A short text sample or tag name that identifies the element. */
  sample: string;
  element: Element;
}

export interface A11yReport {
  cards: number;
  textChecked: number;
  textNotJudged: number;
  controlsChecked: number;
  /** True when the element limit stopped the scan early. */
  truncated: boolean;
  findings: A11yFinding[];
}

/** WCAG 2.2 asks for 24 px at least; 44 px is the comfortable size on touch screens. */
export const TARGET_MIN = 24;
export const TARGET_COMFORT = 44;

const CONTROLS =
  "button, a[href], input, select, textarea, [role='button'], [role='switch'], [role='checkbox'], ha-icon-button, ha-button, ha-switch, ha-checkbox";
const NAMED_CONTROLS =
  "button, a[href], [role='button'], ha-icon-button, ha-button";

export const isVisible = (element: Element): DOMRect | undefined => {
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return undefined;
  }
  const style = getComputedStyle(element);
  if (
    style.visibility === "hidden" ||
    style.display === "none" ||
    Number(style.opacity) === 0
  ) {
    return undefined;
  }
  return rect;
};

/** The colour actually behind an element, or undefined when it cannot be known. */
export const backgroundOf = (element: Element): Rgba | undefined => {
  const layers: Rgba[] = [];
  let node: Element | null = element;
  while (node) {
    const style = getComputedStyle(node);
    if (style.backgroundImage && style.backgroundImage !== "none") {
      return undefined;
    }
    const color = parseColor(style.backgroundColor);
    if (!color) {
      return undefined;
    }
    if (color.a > 0) {
      layers.push(color);
      if (color.a >= 1) {
        break;
      }
    }
    node = composedParent(node);
  }
  let result: Rgba = { r: 255, g: 255, b: 255, a: 1 };
  // The page canvas is white when nothing opaque is found.
  for (let i = layers.length - 1; i >= 0; i--) {
    result = compose(layers[i], result);
  }
  return result;
};

export const hasOwnText = (element: Element): string => {
  let text = "";
  element.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent ?? "";
    }
  });
  return text.trim();
};

const accessibleName = (element: Element): string => {
  const aria = element.getAttribute("aria-label")?.trim();
  if (aria) {
    return aria;
  }
  const by = element.getAttribute("aria-labelledby");
  if (by) {
    const root = element.getRootNode() as Document | ShadowRoot;
    const text = by
      .split(/\s+/)
      .map((id) => root.getElementById?.(id)?.textContent?.trim() ?? "")
      .join(" ")
      .trim();
    if (text) {
      return text;
    }
  }
  const title = element.getAttribute("title")?.trim();
  if (title) {
    return title;
  }
  const label = (element as HTMLElement & { label?: unknown }).label;
  if (typeof label === "string" && label.trim()) {
    return label.trim();
  }
  let inner = (element.textContent ?? "").trim();
  if (!inner && element.shadowRoot) {
    inner = (element.shadowRoot.textContent ?? "").trim();
  }
  return inner;
};

export const scanDashboardAccessibility = (): A11yReport => {
  const cards = findRenderedCards();
  const report: A11yReport = {
    cards: cards.length,
    textChecked: 0,
    textNotJudged: 0,
    controlsChecked: 0,
    truncated: false,
    findings: [],
  };
  const reportedContrast = new Set<string>();
  cards.forEach((card) => {
    const label = renderedCardLabel(card as CardLike);
    const controls = new Set<Element>();
    const complete = walkDeep(
      card,
      (element) => {
        if (element.matches(CONTROLS)) {
          // A control inside another control (the button inside an icon
          // button) is the same control.
          let parent = composedParent(element);
          let nested = false;
          while (parent && parent !== card) {
            if (controls.has(parent)) {
              nested = true;
              break;
            }
            parent = composedParent(parent);
          }
          if (!nested) {
            controls.add(element);
            const rect = isVisible(element);
            if (rect) {
              report.controlsChecked++;
              const small = rect.width < TARGET_MIN || rect.height < TARGET_MIN;
              const uncomfortable =
                rect.width < TARGET_COMFORT || rect.height < TARGET_COMFORT;
              if (uncomfortable) {
                report.findings.push({
                  kind: "target",
                  severity: small ? "fail" : "advice",
                  card: label,
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                  sample: element.localName,
                  element,
                });
              }
              if (element.matches(NAMED_CONTROLS) && !accessibleName(element)) {
                report.findings.push({
                  kind: "name",
                  severity: "fail",
                  card: label,
                  sample: element.localName,
                  element,
                });
              }
            }
          }
        }
        const text = hasOwnText(element);
        if (!text || element.matches("script, style")) {
          return;
        }
        const rect = isVisible(element);
        if (!rect) {
          return;
        }
        const style = getComputedStyle(element);
        const color = parseColor(style.color);
        const background = backgroundOf(element);
        if (!color || !background) {
          report.textNotJudged++;
          return;
        }
        report.textChecked++;
        const foreground = compose(color, background);
        const ratio = contrastRatio(foreground, background);
        const required = requiredContrast(
          parseFloat(style.fontSize),
          Number(style.fontWeight) || 400
        );
        if (ratio < required) {
          const key = `${label}|${Math.round(ratio * 10)}|${style.color}`;
          if (!reportedContrast.has(key)) {
            reportedContrast.add(key);
            report.findings.push({
              kind: "contrast",
              severity: "fail",
              card: label,
              ratio: Math.round(ratio * 10) / 10,
              required,
              sample: text.slice(0, 40),
              element,
            });
          }
        }
      },
      4000
    );
    if (!complete) {
      report.truncated = true;
    }
  });
  report.findings.sort(
    (a, b) =>
      Number(b.severity === "fail") - Number(a.severity === "fail") ||
      a.kind.localeCompare(b.kind)
  );
  return report;
};

/** Scrolls an element into view and outlines it for a moment. */
export const locateElement = (element: Element): void => {
  const target = element as HTMLElement;
  target.scrollIntoView?.({ block: "center", behavior: "auto" });
  const previous = target.style.outline;
  const previousOffset = target.style.outlineOffset;
  target.style.outline = "3px solid var(--error-color, #db4437)";
  target.style.outlineOffset = "2px";
  window.setTimeout(() => {
    target.style.outline = previous;
    target.style.outlineOffset = previousOffset;
  }, 3000);
};
