import { resolveHassUrl } from "../common/url/hass-url";

// Browsers and embedded WebViews can open the blob after the click returns.
const BLOB_REVOKE_DELAY_MS = 10_000;

export const fileDownload = (href: string, filename = ""): void => {
  const element = document.createElement("a");
  element.target = "_blank";
  element.rel = "noopener";
  element.href = resolveHassUrl(href);
  element.download = filename;
  element.style.display = "none";
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);

  if (href.startsWith("blob:")) {
    setTimeout(() => URL.revokeObjectURL(href), BLOB_REVOKE_DELAY_MS);
  }
};
