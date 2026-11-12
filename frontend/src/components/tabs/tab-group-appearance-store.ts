import { getStorage } from "../../common/decorators/storage";
import {
  cleanSurface,
  isSafeKey,
  safeEntries,
  surfaceEntries,
  LIST_LIMIT,
} from "../../common/tabs/tab-validate";

/**
 * How a tab group's header looks beyond the name and colour the group model
 * keeps. A group keeps its look when it moves because the look is stored under
 * the group's stable id. The same validation style and limits as the per-tab
 * look (`common/tabs/tab-appearance-store.ts`) apply: stored data can come from
 * the instance through the settings sync, so every value is checked, lengths
 * are bounded, unknown fields are dropped and unsafe keys are refused.
 *
 * Stored under the key `pageTabsGroupAppearance` as
 * `{ [surface]: { [groupId]: { [property]: value } } }`.
 *
 * A decoration never replaces the group's name or state: the strip keeps the
 * accessible name, the member count and the collapsed state in text.
 */

export const GROUP_APPEARANCE_STORAGE_KEY = "pageTabsGroupAppearance";

export const GROUP_APPEARANCE_PROPERTIES = [
  "fontWeight",
  "fontStyle",
  "icon",
  "color",
  "background",
  "borderColor",
  "borderWidth",
  "shape",
  "radius",
  "spacing",
  "collapsedLook",
  "expandedLook",
] as const;

export type GroupAppearanceProperty =
  (typeof GROUP_APPEARANCE_PROPERTIES)[number];

export type GroupAppearance = Partial<Record<GroupAppearanceProperty, string>>;

/** Stored shape: strip name, then group id, then its changed properties. */
export type GroupAppearanceStore = Record<
  string,
  Record<string, GroupAppearance>
>;

/** Properties that take one of a fixed list of words. */
export const GROUP_APPEARANCE_CHOICES: Partial<
  Record<GroupAppearanceProperty, readonly string[]>
> = {
  fontWeight: ["normal", "medium", "bold"],
  fontStyle: ["normal", "italic"],
  shape: ["pill", "rounded", "square"],
  collapsedLook: ["chip", "compact", "dot"],
  expandedLook: ["chip", "underline", "bracket"],
};

/** Properties that take a whole number of pixels, with their range. */
export const GROUP_APPEARANCE_NUMBERS: Partial<
  Record<GroupAppearanceProperty, { min: number; max: number }>
> = {
  borderWidth: { min: 0, max: 6 },
  radius: { min: 0, max: 48 },
  spacing: { min: 0, max: 24 },
};

export const GROUP_VALUE_LIMIT = 200;

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const THEME_VAR = /^var\(--[a-z0-9-]{1,60}\)$/;
const MDI_NAME = /^mdi:[a-z0-9-]{1,60}$/;
/** An emoji sequence: pictographs, joiners, variation selectors and skin tones. */
const EMOJI = /^(?:\p{Extended_Pictographic}|‍|️|[\u{1F3FB}-\u{1F3FF}]){1,16}$/u;

export const isGroupAppearanceProperty = (
  value: unknown
): value is GroupAppearanceProperty =>
  typeof value === "string" &&
  (GROUP_APPEARANCE_PROPERTIES as readonly string[]).includes(value);

/**
 * A usable value for one property, or undefined. Anything that could break out
 * of a style declaration is refused: colours are hex or a theme variable,
 * numbers are whole pixels in range, choices are fixed words, and the icon is
 * a `mdi:` name or an emoji.
 */
export const cleanGroupAppearanceValue = (
  property: GroupAppearanceProperty,
  raw: unknown
): string | undefined => {
  const text =
    typeof raw === "number" && Number.isFinite(raw)
      ? String(raw)
      : typeof raw === "string"
        ? raw.trim()
        : undefined;
  if (!text || text.length > GROUP_VALUE_LIMIT) {
    return undefined;
  }
  const choices = GROUP_APPEARANCE_CHOICES[property];
  if (choices) {
    return choices.includes(text) ? text : undefined;
  }
  const range = GROUP_APPEARANCE_NUMBERS[property];
  if (range) {
    if (!/^\d{1,3}$/.test(text)) {
      return undefined;
    }
    const number = Number(text);
    return number >= range.min && number <= range.max
      ? String(number)
      : undefined;
  }
  if (property === "icon") {
    return MDI_NAME.test(text) || EMOJI.test(text) ? text : undefined;
  }
  // color, background, borderColor
  if (HEX.test(text)) {
    return text.toLowerCase();
  }
  return THEME_VAR.test(text) ? text : undefined;
};

export const normalizeGroupAppearance = (raw: unknown): GroupAppearance => {
  const result: GroupAppearance = {};
  safeEntries(raw).forEach(([key, value]) => {
    if (!isGroupAppearanceProperty(key)) {
      return;
    }
    const clean = cleanGroupAppearanceValue(key, value);
    if (clean !== undefined) {
      result[key] = clean;
    }
  });
  return result;
};

export const normalizeGroupAppearanceStore = (
  raw: unknown
): GroupAppearanceStore => {
  const store: GroupAppearanceStore = {};
  surfaceEntries(raw).forEach(([surface, groups]) => {
    const entries: Record<string, GroupAppearance> = {};
    safeEntries(groups)
      .slice(0, LIST_LIMIT)
      .forEach(([id, value]) => {
        const look = normalizeGroupAppearance(value);
        if (Object.keys(look).length) {
          entries[id] = look;
        }
      });
    if (Object.keys(entries).length) {
      store[surface] = entries;
    }
  });
  return store;
};

export const groupAppearanceFor = (
  store: GroupAppearanceStore,
  surface: string | undefined,
  groupId: string
): GroupAppearance => store[cleanSurface(surface)]?.[groupId] ?? {};

const tidy = (store: GroupAppearanceStore): GroupAppearanceStore =>
  normalizeGroupAppearanceStore(store);

/** Sets one property of one group. An unusable value changes nothing. */
export const setGroupAppearance = (
  store: GroupAppearanceStore,
  surface: string | undefined,
  groupId: string,
  property: GroupAppearanceProperty,
  value: string
): GroupAppearanceStore => {
  const clean = isGroupAppearanceProperty(property)
    ? cleanGroupAppearanceValue(property, value)
    : undefined;
  if (!isSafeKey(groupId) || clean === undefined) {
    return store;
  }
  const key = cleanSurface(surface);
  return tidy({
    ...store,
    [key]: {
      ...store[key],
      [groupId]: { ...store[key]?.[groupId], [property]: clean },
    },
  });
};

/** Puts one property of one group back to its default. */
export const resetGroupProperty = (
  store: GroupAppearanceStore,
  surface: string | undefined,
  groupId: string,
  property: GroupAppearanceProperty
): GroupAppearanceStore => {
  const key = cleanSurface(surface);
  const look = { ...store[key]?.[groupId] };
  delete look[property];
  return tidy({ ...store, [key]: { ...store[key], [groupId]: look } });
};

/** Puts every property of one group back to the default. */
export const resetGroup = (
  store: GroupAppearanceStore,
  surface: string | undefined,
  groupId: string
): GroupAppearanceStore => {
  const key = cleanSurface(surface);
  const groups = { ...store[key] };
  delete groups[groupId];
  return tidy({ ...store, [key]: groups });
};

/** Resets every group of one strip, or of all strips when none is given. */
export const resetAllGroups = (
  store: GroupAppearanceStore,
  surface?: string
): GroupAppearanceStore => {
  if (surface === undefined) {
    return {};
  }
  const next = { ...store };
  delete next[cleanSurface(surface)];
  return tidy(next);
};

/** Ids of groups that have a changed look. */
export const customisedGroups = (
  store: GroupAppearanceStore,
  surface?: string
): string[] => Object.keys(store[cleanSurface(surface)] ?? {});

export const readGroupAppearance = (): GroupAppearanceStore =>
  normalizeGroupAppearanceStore(
    getStorage().getValue(GROUP_APPEARANCE_STORAGE_KEY)
  );

export const writeGroupAppearance = (store: GroupAppearanceStore): void => {
  const clean = normalizeGroupAppearanceStore(store);
  getStorage().setValue(
    GROUP_APPEARANCE_STORAGE_KEY,
    Object.keys(clean).length ? clean : undefined
  );
};

const WEIGHTS: Record<string, string> = {
  normal: "400",
  medium: "500",
  bold: "700",
};

const SHAPE_RADIUS: Record<string, string> = {
  pill: "999px",
  rounded: "12px",
  square: "2px",
};

/**
 * The inline style values of a group header chip for one look, ready for a
 * `styleMap`. Only properties that were changed appear, so every other value
 * keeps the theme default. `collapsed` picks nothing here: the strip reads the
 * `collapsedLook` and `expandedLook` words itself to choose the chip layout.
 */
export const groupChipStyle = (
  look: GroupAppearance
): Record<string, string> => {
  const style: Record<string, string> = {};
  if (look.fontWeight) {
    style["font-weight"] = WEIGHTS[look.fontWeight];
  }
  if (look.fontStyle) {
    style["font-style"] = look.fontStyle;
  }
  if (look.color) {
    style.color = look.color;
  }
  if (look.background) {
    style["background-color"] = look.background;
  }
  if (look.borderColor || look.borderWidth) {
    style["border-style"] = "solid";
    style["border-color"] = look.borderColor ?? "currentColor";
    style["border-width"] = `${look.borderWidth ?? "1"}px`;
  }
  if (look.radius) {
    style["border-radius"] = `${look.radius}px`;
  } else if (look.shape) {
    style["border-radius"] = SHAPE_RADIUS[look.shape];
  }
  if (look.spacing) {
    style.gap = `${look.spacing}px`;
    style["padding-inline"] = `${look.spacing}px`;
  }
  return style;
};

const COLOUR_CSS: Record<string, string> = {
  grey: "#9e9e9e",
  blue: "#4285f4",
  green: "#34a853",
  red: "#ea4335",
  yellow: "#fbbc04",
  orange: "#fa7b17",
  purple: "#a142f4",
  pink: "#e91e8c",
  teal: "#12b5cb",
};

/** The CSS colour of a group colour: a palette name or a hex colour. */
export const groupColourCss = (colour: string): string =>
  COLOUR_CSS[colour] ?? (HEX.test(colour) ? colour : COLOUR_CSS.blue);
