import type { AppearanceScope } from "../../../../common/appearance/element-appearance";
import {
  currentPageKey,
  cssColorToHex,
  elementPath,
  readAppearanceStore,
} from "../../../../common/appearance/element-appearance";
import type { HomeAssistant } from "../../../../types";
import { backgroundOf, hasOwnText, isVisible } from "./a11y-checker";
import type { Rgba } from "./contrast";
import {
  compose,
  contrastRatio,
  luminance,
  parseColor,
  requiredContrast,
} from "./contrast";
import type { CardLike } from "./deep-dom";
import { composedParent, renderedCardLabel, walkDeep } from "./deep-dom";

/**
 * Dark mode readability check. It measures the page as this browser draws it
 * now: the computed colour of each piece of text against the colour behind it,
 * with the same contrast logic as the accessibility checker (4.5 to 1, or 3 to
 * 1 for large text). For each failing text it looks for where the colour comes
 * from, so a fix can change the real source:
 *
 * - a colour this person chose in the appearance tools,
 * - the `style` block of the card the text is in,
 * - a variable of the theme in use.
 *
 * Text over an image or gradient cannot be measured and is counted as not
 * judged. Nothing here changes a colour; the fixes are separate functions that
 * the page calls when the person asks.
 */

export type DarkCause =
  | {
      kind: "override";
      scope: AppearanceScope;
      /** The element the choice is stored for. */
      target: HTMLElement;
      color: string;
    }
  | { kind: "card_style"; card: HTMLElement; color: string }
  | { kind: "theme"; theme: string; variable: string }
  | { kind: "none" };

export interface DarkFinding {
  key: string;
  element: Element;
  /** A short sample of the text. */
  sample: string;
  /** The label of the card the text is in, when it is in one. */
  card?: string;
  ratio: number;
  required: number;
  foreground: Rgba;
  background: Rgba;
  /** How many places have this same pair of colours. */
  count: number;
  cause: DarkCause;
}

export interface DarkReport {
  darkMode: boolean;
  textChecked: number;
  textNotJudged: number;
  truncated: boolean;
  findings: DarkFinding[];
}

const toHex = (value: number) =>
  Math.round(Math.min(255, Math.max(0, value)))
    .toString(16)
    .padStart(2, "0");

export const rgbaToHex = (color: Rgba): string =>
  `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;

/**
 * The colour closest to `foreground` that reads on `background`: the text
 * colour is moved toward white on a dark background (toward black on a light
 * one) until it reaches the required contrast, so the hue stays recognisable.
 */
export const nearestReadable = (
  foreground: Rgba,
  background: Rgba,
  required: number
): string => {
  const target: Rgba =
    luminance(background) < 0.5
      ? { r: 255, g: 255, b: 255, a: 1 }
      : { r: 0, g: 0, b: 0, a: 1 };
  const base = compose(foreground, background);
  for (let step = 0; step <= 100; step++) {
    const t = step / 100;
    const candidate: Rgba = {
      r: base.r + (target.r - base.r) * t,
      g: base.g + (target.g - base.g) * t,
      b: base.b + (target.b - base.b) * t,
      a: 1,
    };
    if (contrastRatio(candidate, background) >= required + 0.05) {
      return rgbaToHex(candidate);
    }
  }
  return rgbaToHex(target);
};

/** The colour variables of the theme in use, for the current light or dark mode. */
export const activeThemeColors = (
  hass: Pick<HomeAssistant, "themes">
): { theme: string; colors: Record<string, string> } | undefined => {
  const name = hass.themes?.theme;
  const theme = name ? hass.themes.themes?.[name] : undefined;
  if (!name || !theme) {
    return undefined;
  }
  const { modes, ...base } = theme;
  const mode = modes?.[hass.themes.darkMode ? "dark" : "light"] ?? {};
  const colors: Record<string, string> = {};
  Object.entries({ ...base, ...mode }).forEach(([variable, value]) => {
    if (typeof value === "string" && /color$/.test(variable)) {
      const hex = cssColorToHex(value);
      if (hex) {
        colors[variable] = hex;
      }
    }
  });
  return { theme: name, colors };
};

const MAX_DEPTH = 14;

const ancestorsOf = function* (element: Element) {
  let node: Element | null = element;
  for (let depth = 0; node && depth < MAX_DEPTH; depth++) {
    yield node;
    node = composedParent(node);
  }
};

/** Where the colour of a failing text comes from. */
export const detectCause = (
  element: Element,
  foreground: Rgba,
  theme: ReturnType<typeof activeThemeColors>
): DarkCause => {
  const hex = rgbaToHex(foreground);
  const store = readAppearanceStore();
  const page = currentPageKey();
  for (const node of ancestorsOf(element)) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }
    const kind = store.kinds[node.localName]?.textColor;
    if (kind) {
      return { kind: "override", scope: "kind", target: node, color: kind };
    }
    const own = store.elements[page]?.[elementPath(node)]?.textColor;
    if (own) {
      return { kind: "override", scope: "element", target: node, color: own };
    }
  }
  for (const node of ancestorsOf(element)) {
    if (node.localName === "hui-card") {
      const style = (node as CardLike).config?.style as
        { text_color?: unknown } | undefined;
      if (style && typeof style.text_color === "string") {
        return {
          kind: "card_style",
          card: node as HTMLElement,
          color: style.text_color,
        };
      }
      break;
    }
  }
  if (theme) {
    const variable = Object.keys(theme.colors).find(
      (name) => theme.colors[name] === hex
    );
    if (variable) {
      return { kind: "theme", theme: theme.theme, variable };
    }
  }
  return { kind: "none" };
};

const insideAny = (element: Element, roots: Element[]): boolean => {
  if (!roots.length) {
    return false;
  }
  for (const node of ancestorsOf(element)) {
    if (roots.includes(node)) {
      return true;
    }
  }
  return false;
};

export const scanDarkReadability = (options: {
  hass: Pick<HomeAssistant, "themes">;
  /** Parts of the page that are not measured, such as the tool itself. */
  exclude: Element[];
}): DarkReport => {
  const theme = activeThemeColors(options.hass);
  const report: DarkReport = {
    darkMode: Boolean(options.hass.themes?.darkMode),
    textChecked: 0,
    textNotJudged: 0,
    truncated: false,
    findings: [],
  };
  const groups = new Map<string, DarkFinding>();
  const complete = walkDeep(document.body, (element) => {
    const text = hasOwnText(element);
    if (!text || element.matches("script, style, noscript")) {
      return;
    }
    if (!isVisible(element) || insideAny(element, options.exclude)) {
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
    if (ratio >= required) {
      return;
    }
    const key = `${rgbaToHex(foreground)}|${rgbaToHex(background)}|${required}`;
    const known = groups.get(key);
    if (known) {
      known.count++;
      return;
    }
    let card: string | undefined;
    for (const node of ancestorsOf(element)) {
      if (node.localName === "hui-card") {
        card = renderedCardLabel(node as CardLike);
        break;
      }
    }
    groups.set(key, {
      key,
      element,
      sample: text.slice(0, 40),
      card,
      ratio: Math.round(ratio * 10) / 10,
      required,
      foreground,
      background,
      count: 1,
      cause: detectCause(element, foreground, theme),
    });
  });
  report.truncated = !complete;
  report.findings = [...groups.values()].sort((a, b) => a.ratio - b.ratio);
  return report;
};
