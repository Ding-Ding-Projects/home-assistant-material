/**
 * Walking the rendered page through shadow roots. The tools that measure the
 * dashboard (accessibility, performance) need to look inside cards, whose
 * content lives in nested shadow roots.
 */

/** Calls `visit` for every element below `root`, shadow roots included. Returns false when `limit` stopped the walk. */
export const walkDeep = (
  root: Element | ShadowRoot | Document,
  visit: (element: Element) => void,
  limit = 20000
): boolean => {
  let seen = 0;
  const go = (node: Element | ShadowRoot | Document): boolean => {
    for (const child of Array.from(node.children)) {
      if (++seen > limit) {
        return false;
      }
      visit(child);
      if (child.shadowRoot && !go(child.shadowRoot)) {
        return false;
      }
      if (!go(child)) {
        return false;
      }
    }
    return true;
  };
  if (root instanceof Element && root.shadowRoot && !go(root.shadowRoot)) {
    return false;
  }
  return go(root);
};

/** The parent in the composed tree: crosses out of a shadow root to its host. */
export const composedParent = (element: Element): Element | null => {
  if (element.parentElement) {
    return element.parentElement;
  }
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
};

/** Every rendered card on the page (the `hui-card` wrappers). */
export const findRenderedCards = (): HTMLElement[] => {
  const found: HTMLElement[] = [];
  walkDeep(document.body, (element) => {
    if (element.localName === "hui-card") {
      found.push(element as HTMLElement);
    }
  });
  return found;
};

export interface CardLike extends HTMLElement {
  config?: Record<string, unknown>;
}

/** A short name for a rendered card, from its configuration. */
export const renderedCardLabel = (card: CardLike): string => {
  const config = card.config ?? {};
  const title = config.title ?? config.name ?? config.heading;
  const type = String(config.type ?? "card");
  return typeof title === "string" && title.trim()
    ? `${title.trim()} (${type})`
    : type;
};
