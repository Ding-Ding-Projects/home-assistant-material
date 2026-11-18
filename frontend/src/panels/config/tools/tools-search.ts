import { fireEvent } from "../../../common/dom/fire_event";

/**
 * What a developer tools tab tells the tools page about its main search, so
 * the page can draw the search in its top bar. The tab owns the text and the
 * matching; the page only draws the control and passes back what was typed.
 */
export interface ToolsSearchState {
  /** The tab that reports, as its route name, for example "state". */
  panel: string;
  /** Whether the tab has a search. False takes the search out of the bar. */
  searchable: boolean;
  label?: string;
  value?: string;
  /** Short count shown in the open field, for example "2 of 3". */
  countText?: string;
  /** Items of the list, offered as test text for the pattern builder. */
  samples?: string[];
  /** Called with the new text while the person types in the bar. */
  onInput?: (value: string) => void;
  /** Called when the person steps to the next or previous match. */
  onStep?: (direction: 1 | -1) => void;
  /** Called when the bar's search is closed; the words stay. */
  onClose?: () => void;
}

declare global {
  interface HASSDomEvents {
    "tools-search-state": ToolsSearchState;
    /** A tab's own shortcut asks the page to open the search in its bar. */
    "tools-search-open": undefined;
  }
}

/** Asks the tools page to open the search in its top bar. */
export const openToolsSearch = (element: HTMLElement): void => {
  fireEvent(element, "tools-search-open");
};

/** Reports the tab's search to the tools page. Safe to call on every update. */
export const reportToolsSearch = (
  element: HTMLElement,
  state: ToolsSearchState
): void => {
  fireEvent(element, "tools-search-state", state);
};
