import type { TemplateResult } from "lit";
import { LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { isComponentLoaded } from "../../../../common/config/is_component_loaded";
import { navigate } from "../../../../common/navigate";
import type { HomeAssistant, Route } from "../../../../types";
import { discoveryTabs } from "./discovery-counts";

/**
 * The address of the Discovery page. The page itself is the three discovery
 * browsers behind one segmented switch, each browser at its own address; this
 * element sends a visitor to the first browser that is available.
 */
@customElement("discovery-config-panel")
export class DiscoveryConfigPanel extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public route!: Route;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  protected firstUpdated(): void {
    const tabs = discoveryTabs();
    const target =
      tabs.find((tab) =>
        [tab.component]
          .flat()
          .some(
            (component) =>
              component && isComponentLoaded(this.hass.config, component)
          )
      ) ?? tabs[0];
    if (target) {
      navigate(`${target.path}${window.location.search}`, { replace: true });
    }
  }

  protected render(): TemplateResult | typeof nothing {
    return nothing;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "discovery-config-panel": DiscoveryConfigPanel;
  }
}
