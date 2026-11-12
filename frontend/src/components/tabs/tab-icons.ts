import { html, nothing } from "lit";
import "../ha-icon";
import "../ha-svg-icon";
import type { PageTab } from "./tab-types";

/** The icon of a page, from its icon path or its icon name. */
export const renderTabIcon = (tab: PageTab) => {
  if (tab.iconPath) {
    return html`<ha-svg-icon .path=${tab.iconPath}></ha-svg-icon>`;
  }
  if (tab.icon) {
    return html`<ha-icon .icon=${tab.icon}></ha-icon>`;
  }
  return nothing;
};
