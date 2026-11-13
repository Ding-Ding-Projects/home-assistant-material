import { html } from "lit";
import { showConfirmationDialog } from "../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../types";
import { mainWindow } from "../dom/get_main_window";
import {
  decideLinkAction,
  readExternalLinkMode,
  type LinkInfo,
} from "./external-link-mode";

type Host = HTMLElement & { hass?: HomeAssistant };

const linkInfoOf = (anchor: HTMLAnchorElement): LinkInfo => ({
  href: anchor.href,
  origin: window.location.origin,
  target: anchor.target,
  download: anchor.hasAttribute("download"),
  rel: anchor.getAttribute("rel"),
});

const openAddress = (target: "_blank" | "_self", url: string) => {
  if (target === "_self") {
    mainWindow.location.assign(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
};

/**
 * Applies the person's choice for links to outside addresses. This is the one
 * place that decides how such a link is followed: every link in the interface,
 * in markdown text, cards and dialogs included, passes through here when it is
 * activated with a plain click. A click with Ctrl, Cmd or Shift, or with a
 * non-primary button, keeps the browser's own behaviour.
 */
export const installExternalLinkHandling = (host: Host): (() => void) => {
  const listener = (ev: MouseEvent) => {
    if (
      ev.defaultPrevented ||
      ev.button !== 0 ||
      ev.metaKey ||
      ev.ctrlKey ||
      ev.shiftKey ||
      ev.altKey
    ) {
      return;
    }
    const anchor = ev
      .composedPath()
      .find((node) => (node as HTMLElement).tagName === "A") as
      HTMLAnchorElement | undefined;
    if (!anchor || !anchor.href) {
      return;
    }
    const action = decideLinkAction(readExternalLinkMode(), linkInfoOf(anchor));
    if (action.type === "default") {
      return;
    }
    ev.preventDefault();
    if (action.type === "open") {
      openAddress(action.target, action.url);
      return;
    }
    const { hass } = host;
    const t = (key: string) => hass?.localize(key as any) || "";
    showConfirmationDialog(host, {
      title: t("ui.external_links.ask_title"),
      text: html`${t("ui.external_links.ask_text")}<br /><br /><code
          >${action.url}</code
        >`,
      confirmText: t("ui.external_links.ask_open"),
      dismissText: t("ui.external_links.ask_cancel"),
    }).then((confirmed) => {
      if (confirmed) {
        openAddress("_blank", action.url);
      }
    });
  };
  window.addEventListener("click", listener, true);
  return () => window.removeEventListener("click", listener, true);
};
