import type {
  AppearanceScope,
  AppearanceStore,
  ElementAppearance,
} from "./element-appearance";
import {
  applyStore,
  getChoice,
  isEmptyStore,
  notifyAppearanceChanged,
  readAppearanceStore,
  setChoice,
  writeAppearanceStore,
} from "./element-appearance";

/**
 * The appearance choices in use on this page: the stored choices and the
 * elements that currently carry one. One instance per window.
 */

let store: AppearanceStore | undefined;

const tracked = new Set<HTMLElement>();

const current = (): AppearanceStore => {
  store ??= readAppearanceStore();
  return store;
};

export const hasAppearanceChoices = (): boolean => !isEmptyStore(current());

export const choiceFor = (
  element: HTMLElement,
  scope: AppearanceScope
): ElementAppearance => getChoice(current(), element, scope);

/** Applies every choice to the elements on the page now. */
export const reapplyAppearance = (): void => {
  if (!hasAppearanceChoices() && !tracked.size) {
    return;
  }
  // Elements that left the page are forgotten so they can be collected.
  tracked.forEach((element) => {
    if (!element.isConnected) {
      tracked.delete(element);
    }
  });
  applyStore(current(), tracked);
};

/** Saves a choice (an empty one removes it) and applies it at once. */
export const updateChoice = (
  element: HTMLElement,
  scope: AppearanceScope,
  appearance: ElementAppearance
): void => {
  store = setChoice(current(), element, scope, appearance);
  writeAppearanceStore(store);
  applyStore(store, tracked);
};

/** Removes every choice and restores the theme everywhere. */
export const resetAllAppearance = (): void => {
  store = { kinds: {}, elements: {} };
  writeAppearanceStore(store);
  applyStore(store, tracked);
};

/** How many choices are stored, for the summary in the editor. */
export const appearanceChoiceCount = (): number => {
  const value = current();
  return (
    Object.keys(value.kinds).length +
    Object.values(value.elements).reduce(
      (total, paths) => total + Object.keys(paths).length,
      0
    )
  );
};

/** Reads the stored choices again, after they were put back from history. */
export const reloadAppearance = (): void => {
  store = undefined;
  applyStore(current(), tracked);
  notifyAppearanceChanged();
};
