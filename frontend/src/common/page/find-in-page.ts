import { regexQuery, regexRanges } from "../regex/filter";

/**
 * Find in page: marks every place a search text occurs in the text of a
 * page, through component boundaries, without changing the page.
 *
 * The marks are CSS custom highlights, so nothing is inserted into the
 * page. The search text is plain (case is ignored) or a regular expression
 * written as /pattern/flags.
 */

export const FIND_HIGHLIGHT = "ha-page-find";
export const FIND_HIGHLIGHT_CURRENT = "ha-page-find-current";

/** Most places marked; more than this is not useful to step through. */
export const FIND_LIMIT = 2000;

const STYLE_ID = "ha-page-find-style";

const SKIPPED = new Set(["style", "script", "template", "noscript"]);

const supportsHighlights = (): boolean =>
  typeof CSS !== "undefined" &&
  "highlights" in CSS &&
  typeof Highlight !== "undefined";

/** Where a plain search text occurs in a text, ignoring case. */
export const plainRanges = (
  needle: string,
  text: string
): [start: number, end: number][] => {
  const ranges: [number, number][] = [];
  const wanted = needle.toLowerCase();
  if (!wanted) {
    return ranges;
  }
  const haystack = text.toLowerCase();
  let from = 0;
  while (from <= haystack.length) {
    const index = haystack.indexOf(wanted, from);
    if (index === -1) {
      break;
    }
    ranges.push([index, index + wanted.length]);
    from = index + wanted.length;
  }
  return ranges;
};

/** Where a search text, plain or a pattern, occurs in a text. */
export const textRanges = (
  query: string,
  text: string
): [start: number, end: number][] =>
  regexRanges(query, text) ?? plainRanges(query.trim(), text);

/**
 * The text nodes of a page that a person can see, in reading order,
 * through shadow roots. `skip` leaves out parts such as the search field
 * itself.
 */
export const visibleTextNodes = (
  root: Node,
  skip: (element: Element) => boolean = () => false
): Text[] => {
  const nodes: Text[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if ((node as Text).data.trim()) {
        nodes.push(node as Text);
      }
      return;
    }
    if (node instanceof Element) {
      if (
        SKIPPED.has(node.localName) ||
        node.hasAttribute("hidden") ||
        node.getAttribute("aria-hidden") === "true" ||
        skip(node)
      ) {
        return;
      }
      if (
        node instanceof HTMLElement &&
        typeof node.checkVisibility === "function" &&
        !node.checkVisibility()
      ) {
        return;
      }
      if (node.shadowRoot) {
        node.shadowRoot.childNodes.forEach(visit);
      }
    }
    node.childNodes.forEach(visit);
  };
  visit(root);
  return nodes;
};

/** Finds every place the search text occurs under a root. */
export const findInPage = (
  root: Node,
  query: string,
  skip?: (element: Element) => boolean
): Range[] => {
  const ranges: Range[] = [];
  if (!query.trim() || regexQuery(query)?.error) {
    return ranges;
  }
  for (const node of visibleTextNodes(root, skip)) {
    for (const [start, end] of textRanges(query, node.data)) {
      const range = new Range();
      range.setStart(node, start);
      range.setEnd(node, end);
      ranges.push(range);
      if (ranges.length >= FIND_LIMIT) {
        return ranges;
      }
    }
  }
  return ranges;
};

const ensureStyle = () => {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  // A page-level highlight rule also applies inside components.
  style.textContent = `::highlight(${FIND_HIGHLIGHT}) { background-color: #ffe08a; color: #1b1b1f; }
::highlight(${FIND_HIGHLIGHT_CURRENT}) { background-color: #005c9c; color: #ffffff; }`;
  document.head.append(style);
};

/** Marks the found places and scrolls the current one into view. */
export const showFindResults = (ranges: Range[], current: number): void => {
  if (!supportsHighlights()) {
    return;
  }
  ensureStyle();
  if (!ranges.length) {
    clearFindResults();
    return;
  }
  CSS.highlights.set(FIND_HIGHLIGHT, new Highlight(...ranges));
  const active = ranges[current];
  if (active) {
    CSS.highlights.set(FIND_HIGHLIGHT_CURRENT, new Highlight(active));
    active.startContainer.parentElement?.scrollIntoView({
      block: "center",
      inline: "nearest",
    });
  }
};

export const clearFindResults = (): void => {
  if (!supportsHighlights()) {
    return;
  }
  CSS.highlights.delete(FIND_HIGHLIGHT);
  CSS.highlights.delete(FIND_HIGHLIGHT_CURRENT);
};

/** The state of one search of one page: the places found and which is current. */
export class PageFinder {
  public ranges: Range[] = [];

  public current = 0;

  public query = "";

  private _root?: Node;

  private _skip?: (element: Element) => boolean;

  public search(
    root: Node,
    query: string,
    skip?: (element: Element) => boolean
  ): void {
    this._root = root;
    this._skip = skip;
    this.query = query;
    this.ranges = findInPage(root, query, skip);
    this.current = 0;
    showFindResults(this.ranges, this.current);
  }

  /** Moves to the next or the previous place, around the ends. */
  public step(direction: 1 | -1): void {
    if (
      this._root &&
      this.ranges.some((range) => !range.startContainer.isConnected)
    ) {
      // The page was redrawn since the search: look again.
      const position = this.current;
      this.ranges = findInPage(this._root, this.query, this._skip);
      this.current = Math.min(position, Math.max(this.ranges.length - 1, 0));
    }
    if (!this.ranges.length) {
      clearFindResults();
      return;
    }
    this.current =
      (this.current + direction + this.ranges.length) % this.ranges.length;
    showFindResults(this.ranges, this.current);
  }

  public clear(): void {
    this.ranges = [];
    this.current = 0;
    this.query = "";
    clearFindResults();
  }

  public get invalid(): boolean {
    return !!regexQuery(this.query)?.error;
  }
}
