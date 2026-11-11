import type { HASSDomEvent } from "../../common/dom/fire_event";
import { fireEvent } from "../../common/dom/fire_event";
import { isHelpArticleAddress, parseHelpAddress } from "./help-article-path";

export interface HelpArticleDialogParams {
  /** Article path, for example `/docs/automation/modes`. */
  path: string;
  /** Section to scroll to, without the hash. */
  hash?: string;
}

export interface HelpArticleNavigateDetail {
  path: string;
  hash: string;
}

declare global {
  interface HASSDomEvents {
    "help-article-navigate": HelpArticleNavigateDetail;
  }
  interface HTMLElementEventMap {
    "help-article-navigate": HASSDomEvent<HelpArticleNavigateDetail>;
  }
}

/** Marks the reader's own content, whose links stay inside the reader. */
export const HELP_READER_ATTRIBUTE = "data-help-reader";

/**
 * The single door for help: opens the offline article for a path in the
 * reader. Never opens the website.
 */
export const openHelpArticle = (element: HTMLElement, path: string): void => {
  const ref = parseHelpAddress(path);
  if (!ref) {
    return;
  }
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-help-article",
    dialogImport: () => import("./dialog-help-article"),
    dialogParams: { path: ref.path, hash: ref.hash } as HelpArticleDialogParams,
  });
};

let installed = false;

const handleClick = (ev: MouseEvent): void => {
  if (ev.defaultPrevented || ev.button !== 0) {
    return;
  }
  const path = ev.composedPath();
  const anchor = path.find(
    (node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement
  );
  if (!anchor || !anchor.href) {
    return;
  }
  const reader = path.find(
    (node): node is HTMLElement =>
      node instanceof HTMLElement && node.hasAttribute(HELP_READER_ATTRIBUTE)
  );
  if (!isHelpArticleAddress(anchor.href)) {
    // Inside the reader nothing may open another site, for example a bare
    // address that the article text contains.
    if (reader) {
      ev.preventDefault();
      ev.stopPropagation();
      const href = anchor.getAttribute("href") ?? "";
      if (href.startsWith("#")) {
        fireEvent(reader, "help-article-navigate", {
          path: "",
          hash: href.slice(1),
        });
      }
    }
    return;
  }
  const ref = parseHelpAddress(anchor.href)!;
  ev.preventDefault();
  ev.stopPropagation();
  if (reader) {
    fireEvent(reader, "help-article-navigate", ref);
    return;
  }
  openHelpArticle(anchor, ref.path + (ref.hash ? `#${ref.hash}` : ""));
};

/**
 * Sends every click on a link to a documentation article, wherever it is
 * rendered (templates, translated text, Markdown), to the reader instead
 * of an outside address. Installed once, when the first help address is
 * built.
 */
export const installHelpLinkDoor = (): void => {
  if (installed || typeof document === "undefined") {
    return;
  }
  installed = true;
  document.addEventListener("click", handleClick, true);
  document.addEventListener(
    "auxclick",
    (ev) => {
      const anchor = ev
        .composedPath()
        .find(
          (node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement
        );
      if (anchor?.href && isHelpArticleAddress(anchor.href)) {
        ev.preventDefault();
      }
    },
    true
  );
};
