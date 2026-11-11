import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import { getStorage } from "../decorators/storage";
import { syncCacheUsable } from "../instance-sync/sync-owner";

/**
 * Reading options: the typefaces of the interface, the weight of headings,
 * line spacing and wider spacing between letters and words.
 *
 * The choices live in this browser's storage. A style element in the document
 * head turns them into theme variables, which inherit into every component,
 * so a change reaches the whole interface at once. Only typefaces that are
 * bundled with the project or installed on the device are offered; nothing is
 * ever fetched from the internet.
 */

export const READING_STORAGE_KEY = "readingOptions";

export type LineSpacing = "standard" | "roomy" | "roomiest";

export type HeadingWeight = 400 | 500 | 700;

export interface ReadingOptions {
  /** A key of {@link FONT_CHOICES.body}. */
  bodyFont: string;
  /** A key of {@link FONT_CHOICES.heading}. */
  headingFont: string;
  /** A key of {@link FONT_CHOICES.code}. */
  codeFont: string;
  headingWeight: HeadingWeight;
  lineSpacing: LineSpacing;
  /** Extra space between letters and words, as recommended for dyslexia. */
  wideSpacing: boolean;
}

export const DEFAULT_READING_OPTIONS: ReadingOptions = {
  bodyFont: "theme",
  headingFont: "theme",
  codeFont: "theme",
  headingWeight: 500,
  lineSpacing: "standard",
  wideSpacing: false,
};

export const LINE_SPACINGS: LineSpacing[] = ["standard", "roomy", "roomiest"];

export const HEADING_WEIGHTS: HeadingWeight[] = [400, 500, 700];

export interface FontChoice {
  key: string;
  /** The name shown. Typeface names are proper names and are not translated. */
  name: string;
  /** The CSS family list. Empty for the typeface the theme already sets. */
  stack: string;
  /** Where it comes from: shipped with the project, or the device's own. */
  source: "bundled" | "device";
  /** A family name to look for on the device. Absent when always present. */
  probe?: string[];
}

const SANS_FALLBACK = "Roboto, Noto, sans-serif";
const MONO_FALLBACK = "monospace";

const THEME_BODY = '"Google Sans Flex"';

export const FONT_CHOICES: Record<"body" | "heading" | "code", FontChoice[]> = {
  body: [
    {
      key: "theme",
      name: "Google Sans Flex",
      stack: `${THEME_BODY}, ${SANS_FALLBACK}`,
      source: "bundled",
    },
    {
      key: "system",
      name: "System interface font",
      stack: `system-ui, ${SANS_FALLBACK}`,
      source: "device",
    },
    {
      key: "atkinson",
      name: "Atkinson Hyperlegible",
      stack: `"Atkinson Hyperlegible Next", "Atkinson Hyperlegible", ${SANS_FALLBACK}`,
      source: "device",
      probe: ["Atkinson Hyperlegible Next", "Atkinson Hyperlegible"],
    },
    {
      key: "georgia",
      name: "Georgia",
      stack: `Georgia, "Times New Roman", serif`,
      source: "device",
      probe: ["Georgia"],
    },
  ],
  heading: [],
  code: [
    {
      key: "theme",
      name: "Theme code font",
      stack: MONO_FALLBACK,
      source: "bundled",
    },
    {
      key: "roboto-mono",
      name: "Roboto Mono",
      stack: `"Roboto Mono", ${MONO_FALLBACK}`,
      source: "device",
      probe: ["Roboto Mono"],
    },
    {
      key: "cascadia",
      name: "Cascadia Mono",
      stack: `"Cascadia Mono", "Cascadia Code", ${MONO_FALLBACK}`,
      source: "device",
      probe: ["Cascadia Mono", "Cascadia Code"],
    },
    {
      key: "consolas",
      name: "Consolas",
      stack: `Consolas, ${MONO_FALLBACK}`,
      source: "device",
      probe: ["Consolas"],
    },
    {
      key: "menlo",
      name: "Menlo",
      stack: `Menlo, Monaco, ${MONO_FALLBACK}`,
      source: "device",
      probe: ["Menlo", "Monaco"],
    },
  ],
};

// Headings may use any body typeface.
FONT_CHOICES.heading = FONT_CHOICES.body;

export const normalizeReadingOptions = (
  stored?: Partial<ReadingOptions> | null
): ReadingOptions => {
  // Build from the six known fields only, so stray stored keys never survive.
  const source: Partial<ReadingOptions> =
    stored && typeof stored === "object" && !Array.isArray(stored)
      ? stored
      : {};
  const options: ReadingOptions = {
    bodyFont: source.bodyFont ?? DEFAULT_READING_OPTIONS.bodyFont,
    headingFont: source.headingFont ?? DEFAULT_READING_OPTIONS.headingFont,
    codeFont: source.codeFont ?? DEFAULT_READING_OPTIONS.codeFont,
    headingWeight:
      source.headingWeight ?? DEFAULT_READING_OPTIONS.headingWeight,
    lineSpacing: source.lineSpacing ?? DEFAULT_READING_OPTIONS.lineSpacing,
    wideSpacing: source.wideSpacing ?? DEFAULT_READING_OPTIONS.wideSpacing,
  };
  const known = (list: FontChoice[], key: unknown) =>
    typeof key === "string" && list.some((choice) => choice.key === key);
  if (!known(FONT_CHOICES.body, options.bodyFont)) {
    options.bodyFont = "theme";
  }
  if (!known(FONT_CHOICES.heading, options.headingFont)) {
    options.headingFont = "theme";
  }
  if (!known(FONT_CHOICES.code, options.codeFont)) {
    options.codeFont = "theme";
  }
  if (!HEADING_WEIGHTS.includes(options.headingWeight)) {
    options.headingWeight = 500;
  }
  if (!LINE_SPACINGS.includes(options.lineSpacing)) {
    options.lineSpacing = "standard";
  }
  options.wideSpacing = options.wideSpacing === true;
  return options;
};

export const isDefaultReadingOptions = (options: ReadingOptions): boolean =>
  JSON.stringify(options) === JSON.stringify(DEFAULT_READING_OPTIONS);

const LINE_HEIGHTS: Record<
  LineSpacing,
  { condensed: number; normal: number; expanded: number }
> = {
  standard: { condensed: 1.2, normal: 1.6, expanded: 2 },
  roomy: { condensed: 1.4, normal: 1.8, expanded: 2.2 },
  roomiest: { condensed: 1.6, normal: 2, expanded: 2.4 },
};

/**
 * Whether a typeface is installed on this device. A name that is not
 * installed falls back to the same face as the baseline, so the text keeps
 * the baseline's width.
 */
export const isFontInstalled = (families: string[]): boolean => {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) {
    return false;
  }
  const sample = "mmmmmmmmmmlli0Oo";
  const width = (font: string) => {
    context.font = `72px ${font}`;
    return context.measureText(sample).width;
  };
  const baselines = ["monospace", "serif", "sans-serif"];
  return families.some((family) =>
    baselines.some(
      (baseline) => width(`"${family}", ${baseline}`) !== width(baseline)
    )
  );
};

export interface FontAvailability {
  /** The choices that can be used here, with where each comes from. */
  body: FontChoice[];
  heading: FontChoice[];
  code: FontChoice[];
}

/** Which choices are really available: bundled ones, and installed ones. */
export const availableFonts = (
  isInstalled: (families: string[]) => boolean = isFontInstalled
): FontAvailability => {
  const filter = (list: FontChoice[]) =>
    list.filter((choice) => !choice.probe || isInstalled(choice.probe));
  return {
    body: filter(FONT_CHOICES.body),
    heading: filter(FONT_CHOICES.heading),
    code: filter(FONT_CHOICES.code),
  };
};

const stackFor = (list: FontChoice[], key: string): string =>
  (list.find((choice) => choice.key === key) ?? list[0]).stack;

/** The stylesheet for a set of options. Only catalogue values are written. */
export const readingOptionsToCss = (options: ReadingOptions): string => {
  const rules: string[] = [];
  const fontsChanged =
    options.bodyFont !== "theme" || options.headingFont !== "theme";
  if (fontsChanged) {
    rules.push(
      `--ha-font-family-body: ${stackFor(FONT_CHOICES.body, options.bodyFont)} !important;`,
      `--ha-font-family-heading: ${stackFor(FONT_CHOICES.heading, options.headingFont)} !important;`
    );
  }
  if (options.codeFont !== "theme") {
    rules.push(
      `--ha-font-family-code: ${stackFor(FONT_CHOICES.code, options.codeFont)} !important;`
    );
  }
  if (options.headingWeight !== 500) {
    rules.push(
      `--ha-font-weight-heading: ${options.headingWeight} !important;`
    );
  }
  if (options.lineSpacing !== "standard") {
    const heights = LINE_HEIGHTS[options.lineSpacing];
    rules.push(
      `--ha-line-height-condensed: ${heights.condensed} !important;`,
      `--ha-line-height-normal: ${heights.normal} !important;`,
      `--ha-line-height-expanded: ${heights.expanded} !important;`,
      `line-height: ${heights.normal};`
    );
  }
  if (options.wideSpacing) {
    rules.push("letter-spacing: 0.12em;", "word-spacing: 0.16em;");
  }
  return rules.length ? `html {\n  ${rules.join("\n  ")}\n}\n` : "";
};

const STYLE_ID = "ha-reading-options";

export const applyReadingOptions = (options: ReadingOptions) => {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  const css = readingOptionsToCss(options);
  if (!css) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = css;
};

/** The stored choices, as they are now. */
export const getReadingOptions = (): ReadingOptions => {
  // A cache that belongs to a recorded account is not applied until that
  // account is confirmed; until then the defaults hold.
  if (!syncCacheUsable()) {
    return normalizeReadingOptions(undefined);
  }
  // A damaged or blocked store must not stop the page: fall back to defaults.
  try {
    return normalizeReadingOptions(
      getStorage().getValue<Partial<ReadingOptions>>(READING_STORAGE_KEY)
    );
  } catch (_err) {
    return normalizeReadingOptions(undefined);
  }
};

export const setReadingOptions = (options: ReadingOptions) => {
  getStorage().setValue(READING_STORAGE_KEY, options);
};

export const subscribeReadingOptions = (
  callback: (options: ReadingOptions) => void
): UnsubscribeFunc =>
  getStorage().subscribeChanges(READING_STORAGE_KEY, () =>
    callback(getReadingOptions())
  );

/**
 * Applies the stored options now and whenever they change, in this tab or
 * another. Returns the function that stops it.
 */
export const startReadingOptions = (): UnsubscribeFunc => {
  applyReadingOptions(getReadingOptions());
  return subscribeReadingOptions(applyReadingOptions);
};
