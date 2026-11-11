import type { HASSDomEvent } from "../../common/dom/fire_event";
import { fireEvent } from "../../common/dom/fire_event";
import type { HomeAssistant } from "../../types";
import {
  isBlockedHelpAddress,
  isHelpArticleAddress,
  parseHelpAddress,
} from "./help-article-path";

export interface HelpArticleDialogParams {
  /**
   * Article path, for example `/docs/automation/modes`. `/` opens the list
   * of all help articles.
   */
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

export interface HelpDoorOptions {
  /**
   * For pages that have no dialog manager (the sign-in page): the door
   * puts the reader on the page itself.
   */
  standalone?: boolean;
}

let standalone = false;

const openStandalone = async (params: HelpArticleDialogParams) => {
  await import("./dialog-help-article");
  let dialog = document.querySelector("dialog-help-article");
  if (!dialog) {
    dialog = document.createElement("dialog-help-article");
    // The sign-in page has no `hass`: the reader falls back to its own text.
    dialog.hass = { localize: () => "" } as unknown as HomeAssistant;
    dialog.addEventListener("dialog-closed", () => dialog?.remove());
    document.body.appendChild(dialog);
  }
  dialog.showDialog(params);
};

/**
 * The single door for help: opens the offline article for a path in the
 * reader. Never opens the website.
 */
export const openHelpArticle = (element: HTMLElement, path: string): void => {
  const ref = parseHelpAddress(path);
  if (!ref) {
    return;
  }
  const dialogParams: HelpArticleDialogParams = {
    path: ref.path,
    hash: ref.hash,
  };
  if (standalone) {
    openStandalone(dialogParams);
    return;
  }
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-help-article",
    dialogImport: () => import("./dialog-help-article"),
    dialogParams,
  });
};

/** Opens the reader on the list of every bundled help article. */
export const openAllHelpArticles = (element: HTMLElement): void =>
  openHelpArticle(element, "/");

/**
 * For code that opens an address itself. A documentation address opens the
 * reader, an outside help or community address opens nothing, anything else
 * keeps the old behaviour (`window.open`).
 */
export const openHelpUrl = (
  element: HTMLElement,
  url: string,
  target?: string,
  features?: string
): void => {
  if (isHelpArticleAddress(url)) {
    openHelpArticle(element, url);
    return;
  }
  if (isBlockedHelpAddress(url)) {
    return;
  }
  window.open(url, target, features);
};

let installed = false;

const anchorOf = (ev: Event): HTMLAnchorElement | undefined =>
  ev
    .composedPath()
    .find(
      (node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement
    );

const readerOf = (ev: Event): HTMLElement | undefined =>
  ev
    .composedPath()
    .find(
      (node): node is HTMLElement =>
        node instanceof HTMLElement && node.hasAttribute(HELP_READER_ATTRIBUTE)
    );

/** Whether the door owns this anchor: a help address, or inside the reader. */
const isOwned = (ev: Event): boolean => {
  const anchor = anchorOf(ev);
  if (!anchor?.href) {
    return false;
  }
  return (
    isHelpArticleAddress(anchor.href) ||
    isBlockedHelpAddress(anchor.href) ||
    Boolean(readerOf(ev))
  );
};

const handleClick = (ev: MouseEvent): void => {
  if (ev.defaultPrevented || ev.button !== 0) {
    return;
  }
  const anchor = anchorOf(ev);
  if (!anchor || !anchor.href) {
    return;
  }
  const reader = readerOf(ev);
  if (!isHelpArticleAddress(anchor.href)) {
    // Inside the reader nothing may open another site, for example a bare
    // address that the article text contains.
    if (reader || isBlockedHelpAddress(anchor.href)) {
      ev.preventDefault();
      ev.stopPropagation();
      const href = anchor.getAttribute("href") ?? "";
      if (reader && href.startsWith("#")) {
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
 * of an outside address. Middle click, the context menu ("open in new
 * tab", "copy link") and dragging the link are stopped too, for help
 * addresses, for community and developer addresses, and for every link
 * inside the reader. Installed at application start by every entry point,
 * and again, harmlessly, whenever a documentation address is built.
 */
export const installHelpLinkDoor = (options: HelpDoorOptions = {}): void => {
  if (options.standalone) {
    standalone = true;
  }
  if (installed || typeof document === "undefined") {
    return;
  }
  installed = true;
  document.addEventListener("click", handleClick, true);
  const stop = (ev: Event) => {
    if (isOwned(ev)) {
      ev.preventDefault();
    }
  };
  for (const type of ["auxclick", "contextmenu", "dragstart", "mousedown"]) {
    document.addEventListener(
      type,
      (ev) => {
        // Only the middle button of `mousedown` is stopped (autoscroll).
        if (type === "mousedown" && (ev as MouseEvent).button !== 1) {
          return;
        }
        stop(ev);
      },
      true
    );
  }
};
