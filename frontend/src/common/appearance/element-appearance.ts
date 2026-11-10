/**
 * Appearance choices for single elements of the interface.
 *
 * A person can pick any element (right-click, long press, the keyboard, or
 * the pick tool) and change how it looks: fill layers, text, shape, accent
 * colour, size and opacity. A choice applies to that one element, or to every
 * element of the same kind. Choices are kept in this browser only and are
 * applied as inline styles, so removing a choice restores the theme.
 */

export const APPEARANCE_STORAGE_KEY = "elementAppearance";

/** Bounds that keep stored choices small and values sane. */
export const APPEARANCE_LIMITS = {
  layers: 8,
  entries: 400,
  url: 2000,
  radius: 64,
  borderWidth: 12,
  zoomMin: 0.75,
  zoomMax: 1.5,
  opacityMin: 0.2,
};

export const BLEND_MODES = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "soft-light",
  "hard-light",
  "darken",
  "lighten",
  "color",
  "luminosity",
] as const;

export type BlendMode = (typeof BLEND_MODES)[number];

interface LayerBase {
  /** 0 to 1. */
  opacity: number;
  blend: BlendMode;
  visible: boolean;
}

export interface ColorLayer extends LayerBase {
  type: "color";
  color: string;
}

export interface GradientLayer extends LayerBase {
  type: "gradient";
  /** Degrees, 0 to 360. */
  angle: number;
  from: string;
  to: string;
}

export interface ImageLayer extends LayerBase {
  type: "image";
  url: string;
  size: "cover" | "contain" | "auto";
  position: "center" | "top" | "bottom" | "left" | "right";
  repeat: boolean;
}

export type FillLayer = ColorLayer | GradientLayer | ImageLayer;

export const FONT_FAMILIES = [
  "theme",
  "Google Sans Flex",
  "Roboto",
  "system-ui",
  "Georgia",
  "monospace",
] as const;

export const FONT_WEIGHTS = [300, 400, 500, 600, 700, 800] as const;

export interface ElementAppearance {
  /** Fill layers, top first. */
  layers?: FillLayer[];
  textColor?: string;
  accentColor?: string;
  fontFamily?: string;
  fontWeight?: number;
  /** 1 is the normal size. */
  zoom?: number;
  /** Corner radius in pixels. */
  radius?: number;
  borderWidth?: number;
  borderColor?: string;
  /** 0 none, 1 low, 2 medium, 3 high. */
  shadow?: number;
  /** 0 to 1. */
  opacity?: number;
}

export interface AppearanceStore {
  /** Choices for every element of a kind, by tag name. */
  kinds: Record<string, ElementAppearance>;
  /** Choices for one element: page path, then the element's path. */
  elements: Record<string, Record<string, ElementAppearance>>;
}

const HEX = /^#[0-9a-f]{6}$/i;

const clamp = (value: unknown, min: number, max: number): number | undefined =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : undefined;

const color = (value: unknown): string | undefined =>
  typeof value === "string" && HEX.test(value)
    ? value.toLowerCase()
    : undefined;

const normalizeLayer = (raw: unknown): FillLayer | undefined => {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const layer = raw as Record<string, unknown>;
  const base: LayerBase = {
    opacity: clamp(layer.opacity, 0, 1) ?? 1,
    blend: (BLEND_MODES as readonly unknown[]).includes(layer.blend)
      ? (layer.blend as BlendMode)
      : "normal",
    visible: layer.visible !== false,
  };
  if (layer.type === "color") {
    const value = color(layer.color);
    return value ? { ...base, type: "color", color: value } : undefined;
  }
  if (layer.type === "gradient") {
    const from = color(layer.from);
    const to = color(layer.to);
    return from && to
      ? {
          ...base,
          type: "gradient",
          angle: clamp(layer.angle, 0, 360) ?? 160,
          from,
          to,
        }
      : undefined;
  }
  if (layer.type === "image") {
    const url = typeof layer.url === "string" ? layer.url.trim() : "";
    if (!url || url.length > APPEARANCE_LIMITS.url || !isSafeImageUrl(url)) {
      return undefined;
    }
    return {
      ...base,
      type: "image",
      url,
      size:
        layer.size === "contain" || layer.size === "auto"
          ? layer.size
          : "cover",
      position: (["top", "bottom", "left", "right"] as unknown[]).includes(
        layer.position
      )
        ? (layer.position as ImageLayer["position"])
        : "center",
      repeat: layer.repeat === true,
    };
  }
  return undefined;
};

/**
 * A picture layer may point at a web address, a path on this server or an
 * embedded picture. Anything that could run script is refused.
 */
export const isSafeImageUrl = (url: string): boolean =>
  /^(https?:\/\/|\/(?!\/)|data:image\/(png|jpeg|webp|gif|avif);base64,)/i.test(
    url
  ) && !/["\\\n\r]/.test(url);

/** Returns a clean copy of a choice, dropping anything not understood. */
export const normalizeAppearance = (raw: unknown): ElementAppearance => {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const value = raw as Record<string, unknown>;
  const result: ElementAppearance = {};
  if (Array.isArray(value.layers)) {
    const layers = value.layers
      .map(normalizeLayer)
      .filter((layer): layer is FillLayer => !!layer)
      .slice(0, APPEARANCE_LIMITS.layers);
    if (layers.length) {
      result.layers = layers;
    }
  }
  const textColor = color(value.textColor);
  if (textColor) {
    result.textColor = textColor;
  }
  const accentColor = color(value.accentColor);
  if (accentColor) {
    result.accentColor = accentColor;
  }
  if (
    typeof value.fontFamily === "string" &&
    (FONT_FAMILIES as readonly string[]).includes(value.fontFamily) &&
    value.fontFamily !== "theme"
  ) {
    result.fontFamily = value.fontFamily;
  }
  if ((FONT_WEIGHTS as readonly unknown[]).includes(value.fontWeight)) {
    result.fontWeight = value.fontWeight as number;
  }
  const zoom = clamp(
    value.zoom,
    APPEARANCE_LIMITS.zoomMin,
    APPEARANCE_LIMITS.zoomMax
  );
  if (zoom !== undefined && zoom !== 1) {
    result.zoom = zoom;
  }
  const radius = clamp(value.radius, 0, APPEARANCE_LIMITS.radius);
  if (radius !== undefined) {
    result.radius = radius;
  }
  const borderWidth = clamp(
    value.borderWidth,
    0,
    APPEARANCE_LIMITS.borderWidth
  );
  if (borderWidth !== undefined) {
    result.borderWidth = borderWidth;
  }
  const borderColor = color(value.borderColor);
  if (borderColor) {
    result.borderColor = borderColor;
  }
  const shadow = clamp(value.shadow, 0, 3);
  if (shadow !== undefined) {
    result.shadow = Math.round(shadow);
  }
  const opacity = clamp(value.opacity, APPEARANCE_LIMITS.opacityMin, 1);
  if (opacity !== undefined && opacity !== 1) {
    result.opacity = opacity;
  }
  return result;
};

export const isEmptyAppearance = (appearance: ElementAppearance): boolean =>
  Object.keys(appearance).length === 0;

const emptyStore = (): AppearanceStore => ({ kinds: {}, elements: {} });

export const normalizeStore = (raw: unknown): AppearanceStore => {
  const store = emptyStore();
  if (!raw || typeof raw !== "object") {
    return store;
  }
  const value = raw as Record<string, unknown>;
  let entries = 0;
  if (value.kinds && typeof value.kinds === "object") {
    for (const [tag, choice] of Object.entries(value.kinds)) {
      const appearance = normalizeAppearance(choice);
      if (
        /^[a-z][a-z0-9-]*$/.test(tag) &&
        !isEmptyAppearance(appearance) &&
        entries < APPEARANCE_LIMITS.entries
      ) {
        store.kinds[tag] = appearance;
        entries++;
      }
    }
  }
  if (value.elements && typeof value.elements === "object") {
    for (const [page, paths] of Object.entries(value.elements)) {
      if (!paths || typeof paths !== "object") {
        continue;
      }
      for (const [path, choice] of Object.entries(paths)) {
        const appearance = normalizeAppearance(choice);
        if (
          !isEmptyAppearance(appearance) &&
          entries < APPEARANCE_LIMITS.entries
        ) {
          store.elements[page] ??= {};
          store.elements[page][path] = appearance;
          entries++;
        }
      }
    }
  }
  return store;
};

export const readAppearanceStore = (): AppearanceStore => {
  try {
    return normalizeStore(
      JSON.parse(window.localStorage.getItem(APPEARANCE_STORAGE_KEY) || "null")
    );
  } catch (_err) {
    return emptyStore();
  }
};

export const writeAppearanceStore = (store: AppearanceStore): void => {
  try {
    window.localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify(normalizeStore(store))
    );
  } catch (_err) {
    // Storage can be full or unavailable; the choice still applies until
    // the page is closed.
  }
};

// ---- Colour ----

const channels = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

export const withAlpha = (hex: string, alpha: number): string => {
  const [red, green, blue] = channels(hex);
  return alpha >= 1
    ? hex
    : `rgba(${red}, ${green}, ${blue}, ${Math.round(alpha * 100) / 100})`;
};

const luminance = (hex: string): number => {
  const [red, green, blue] = channels(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

/** WCAG contrast ratio between two colours, from 1 to 21. */
export const contrastRatio = (first: string, second: string): number => {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

/** Turns any CSS colour the browser computed into `#rrggbb`, if opaque enough to judge. */
export const cssColorToHex = (value: string): string | undefined => {
  const match =
    /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,/\s]+([\d.]+%?))?\s*\)$/.exec(
      value.trim()
    );
  if (!match) {
    return HEX.test(value.trim()) ? value.trim().toLowerCase() : undefined;
  }
  const alpha =
    match[4] === undefined
      ? 1
      : match[4].endsWith("%")
        ? parseFloat(match[4]) / 100
        : parseFloat(match[4]);
  if (alpha < 0.5) {
    return undefined;
  }
  return `#${[match[1], match[2], match[3]]
    .map((part) => Number(part).toString(16).padStart(2, "0"))
    .join("")}`;
};

// ---- Styles ----

const SHADOWS = [
  "none",
  "0 1px 3px rgba(0, 0, 0, 0.2)",
  "0 4px 12px rgba(0, 0, 0, 0.22)",
  "0 12px 32px rgba(0, 0, 0, 0.28)",
];

const layerImage = (layer: FillLayer): string => {
  if (layer.type === "color") {
    const value = withAlpha(layer.color, layer.opacity);
    return `linear-gradient(${value}, ${value})`;
  }
  if (layer.type === "gradient") {
    return `linear-gradient(${layer.angle}deg, ${withAlpha(
      layer.from,
      layer.opacity
    )}, ${withAlpha(layer.to, layer.opacity)})`;
  }
  return `url("${layer.url}")`;
};

/**
 * The inline styles for a choice.
 *
 * `card` is true for an element that draws itself with `ha-card`: its fill,
 * border and shadow then go through the card's own variables, so the card's
 * shape keeps clipping them.
 */
export const appearanceToStyles = (
  appearance: ElementAppearance,
  card = false
): Record<string, string> => {
  const styles: Record<string, string> = {};
  const layers = (appearance.layers ?? []).filter((layer) => layer.visible);
  if (layers.length) {
    styles["background-image"] = layers.map(layerImage).join(", ");
    styles["background-blend-mode"] = layers
      .map((layer) => layer.blend)
      .join(", ");
    styles["background-size"] = layers
      .map((layer) => (layer.type === "image" ? layer.size : "auto"))
      .join(", ");
    styles["background-position"] = layers
      .map((layer) => (layer.type === "image" ? layer.position : "center"))
      .join(", ");
    styles["background-repeat"] = layers
      .map((layer) =>
        layer.type === "image" && !layer.repeat ? "no-repeat" : "repeat"
      )
      .join(", ");
    styles["background-color"] = "transparent";
    if (card) {
      // The inner card becomes clear so these layers show through it.
      styles["--ha-card-background"] = "transparent";
    }
  }
  if (card && (layers.length || appearance.radius !== undefined)) {
    styles["border-radius"] =
      appearance.radius !== undefined
        ? `${appearance.radius}px`
        : "var(--ha-card-border-radius, var(--ha-border-radius-3xl))";
  }
  if (appearance.radius !== undefined) {
    styles["border-radius"] = `${appearance.radius}px`;
    styles["--ha-card-border-radius"] = `${appearance.radius}px`;
  }
  if (appearance.textColor) {
    styles.color = appearance.textColor;
    styles["--primary-text-color"] = appearance.textColor;
    styles["--secondary-text-color"] = withAlpha(appearance.textColor, 0.72);
  }
  if (appearance.accentColor) {
    styles["--primary-color"] = appearance.accentColor;
    styles["--accent-color"] = appearance.accentColor;
  }
  if (appearance.fontFamily) {
    const family = `"${appearance.fontFamily}", var(--ha-font-family-body)`;
    styles["font-family"] = family;
    styles["--ha-font-family-body"] = family;
    styles["--ha-font-family-heading"] = family;
  }
  if (appearance.fontWeight) {
    const weight = String(appearance.fontWeight);
    styles["font-weight"] = weight;
    styles["--ha-font-weight-normal"] = weight;
    styles["--ha-font-weight-medium"] = weight;
  }
  if (appearance.zoom !== undefined) {
    styles.zoom = String(appearance.zoom);
  }
  if (
    appearance.borderWidth !== undefined ||
    appearance.borderColor !== undefined
  ) {
    const width = `${appearance.borderWidth ?? 1}px`;
    const borderColor = appearance.borderColor ?? "var(--outline-color)";
    if (card) {
      styles["--ha-card-border-width"] = width;
      styles["--ha-card-border-color"] = borderColor;
    } else {
      styles.border = `${width} solid ${borderColor}`;
    }
  }
  if (appearance.shadow !== undefined) {
    const shadow = SHADOWS[appearance.shadow] ?? "none";
    if (card) {
      styles["--ha-card-box-shadow"] = shadow;
    } else {
      styles["box-shadow"] = shadow;
    }
  }
  if (appearance.opacity !== undefined) {
    styles.opacity = String(appearance.opacity);
  }
  return styles;
};

/** Later choices win: the choice for one element is laid over its kind's. */
export const mergeAppearance = (
  ...choices: (ElementAppearance | undefined)[]
): ElementAppearance =>
  Object.assign({}, ...choices.filter(Boolean)) as ElementAppearance;

// ---- Elements ----

const applied = new WeakMap<HTMLElement, string[]>();

/** True for an element that draws itself with `ha-card`. */
export const drawsACard = (element: HTMLElement): boolean =>
  element.localName !== "ha-card" &&
  !!element.shadowRoot?.querySelector(":scope > ha-card, ha-card");

/** Applies a choice to an element, replacing what was applied before. */
export const applyAppearance = (
  element: HTMLElement,
  appearance: ElementAppearance | undefined
): void => {
  const styles =
    appearance && !isEmptyAppearance(appearance)
      ? appearanceToStyles(appearance, drawsACard(element))
      : {};
  const previous = applied.get(element) ?? [];
  previous.forEach((property) => {
    if (!(property in styles)) {
      element.style.removeProperty(property);
    }
  });
  Object.entries(styles).forEach(([property, value]) => {
    if (element.style.getPropertyValue(property) !== value) {
      element.style.setProperty(property, value);
    }
  });
  const properties = Object.keys(styles);
  if (properties.length) {
    applied.set(element, properties);
  } else {
    applied.delete(element);
  }
};

export const hasAppliedAppearance = (element: HTMLElement): boolean =>
  applied.has(element);

/** The parent of a node, stepping out of a shadow root to its host. */
export const composedParent = (node: Node): Node | null => {
  if (node instanceof Element && node.assignedSlot) {
    return node.assignedSlot;
  }
  if (node.parentNode instanceof ShadowRoot) {
    return node.parentNode.host;
  }
  return node.parentNode;
};

const structuralParent = (
  element: Element
): { parent: Element | ShadowRoot; viaShadow: boolean } | undefined => {
  const parent = element.parentNode;
  if (parent instanceof ShadowRoot) {
    return { parent, viaShadow: true };
  }
  if (parent instanceof Element) {
    return { parent, viaShadow: false };
  }
  return undefined;
};

/**
 * A path that finds an element again on the same page: tag names and
 * positions from the document body down, through shadow roots.
 * `/` enters a shadow root, `>` goes to a child.
 */
export const elementPath = (element: Element): string => {
  const segments: string[] = [];
  let current: Element | undefined = element;
  while (current && current !== document.body) {
    const step = structuralParent(current);
    if (!step) {
      break;
    }
    const tag = current.localName;
    const siblings = Array.from(step.parent.children).filter(
      (sibling) => sibling.localName === tag
    );
    const index = siblings.indexOf(current);
    segments.unshift(
      `${step.viaShadow ? "/" : ">"}${tag}${siblings.length > 1 ? `:${index}` : ""}`
    );
    current =
      step.parent instanceof ShadowRoot
        ? step.parent.host
        : (step.parent as Element);
  }
  return segments.join("");
};

/** Finds the element a path points at, if the page still has it. */
export const resolveElementPath = (path: string): HTMLElement | undefined => {
  let current: Element = document.body;
  const pattern = /([/>])([a-z][a-z0-9-]*)(?::(\d+))?/g;
  let consumed = 0;
  for (const match of path.matchAll(pattern)) {
    if (match.index !== consumed) {
      return undefined;
    }
    consumed += match[0].length;
    const container: Element | ShadowRoot | null =
      match[1] === "/" ? current.shadowRoot : current;
    if (!container) {
      return undefined;
    }
    const siblings = Array.from(container.children).filter(
      (child) => child.localName === match[2]
    );
    const next = siblings[match[3] === undefined ? 0 : Number(match[3])];
    if (!next || (match[3] === undefined && siblings.length > 1)) {
      return undefined;
    }
    current = next;
  }
  return consumed === path.length && current instanceof HTMLElement
    ? current
    : undefined;
};

/** Calls back for every element under a root, through shadow roots. */
export const walkDeep = (
  root: Element | ShadowRoot,
  visit: (element: HTMLElement) => void
): void => {
  const stack: (Element | ShadowRoot)[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    for (const child of Array.from(node.children)) {
      if (child instanceof HTMLElement) {
        visit(child);
      }
      stack.push(child);
      if (child.shadowRoot) {
        stack.push(child.shadowRoot);
      }
    }
  }
};

/** A short name for a kind of element: `hui-tile-card` reads "Tile card". */
export const kindLabel = (tag: string): string => {
  const words = tag
    .replace(/^(ha|hui|hass|wa|md|mwc)-/, "")
    .split("-")
    .filter(Boolean);
  if (!words.length) {
    return tag;
  }
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** The page a single-element choice belongs to. */
export const currentPageKey = (): string =>
  window.location.pathname.replace(/\/+$/, "") || "/";

// ---- Choices in the store ----

export type AppearanceScope = "element" | "kind";

/** The stored choice for an element, in one scope. */
export const getChoice = (
  store: AppearanceStore,
  element: HTMLElement,
  scope: AppearanceScope
): ElementAppearance =>
  (scope === "kind"
    ? store.kinds[element.localName]
    : store.elements[currentPageKey()]?.[elementPath(element)]) ?? {};

/** Returns a new store with the choice set, or removed when it is empty. */
export const setChoice = (
  store: AppearanceStore,
  element: HTMLElement,
  scope: AppearanceScope,
  appearance: ElementAppearance
): AppearanceStore => {
  const clean = normalizeAppearance(appearance);
  const next: AppearanceStore = {
    kinds: { ...store.kinds },
    elements: { ...store.elements },
  };
  if (scope === "kind") {
    if (isEmptyAppearance(clean)) {
      delete next.kinds[element.localName];
    } else {
      next.kinds[element.localName] = clean;
    }
    return next;
  }
  const page = currentPageKey();
  const paths = { ...next.elements[page] };
  const path = elementPath(element);
  if (isEmptyAppearance(clean)) {
    delete paths[path];
  } else {
    paths[path] = clean;
  }
  if (Object.keys(paths).length) {
    next.elements[page] = paths;
  } else {
    delete next.elements[page];
  }
  return next;
};

export const isEmptyStore = (store: AppearanceStore): boolean =>
  !Object.keys(store.kinds).length && !Object.keys(store.elements).length;

/**
 * Applies every stored choice that has an element on the page now, and
 * clears elements whose choice is gone. `tracked` remembers which elements
 * carry a choice between calls.
 */
export const applyStore = (
  store: AppearanceStore,
  tracked: Set<HTMLElement>
): void => {
  const targets = new Map<HTMLElement, ElementAppearance>();
  if (Object.keys(store.kinds).length) {
    walkDeep(document.body, (element) => {
      const choice = store.kinds[element.localName];
      if (choice) {
        targets.set(element, choice);
      }
    });
  }
  Object.entries(store.elements[currentPageKey()] ?? {}).forEach(
    ([path, choice]) => {
      const element = resolveElementPath(path);
      if (element) {
        targets.set(element, mergeAppearance(targets.get(element), choice));
      }
    }
  );
  tracked.forEach((element) => {
    if (!targets.has(element)) {
      applyAppearance(element, undefined);
      tracked.delete(element);
    }
  });
  targets.forEach((choice, element) => {
    applyAppearance(element, choice);
    tracked.add(element);
  });
};
