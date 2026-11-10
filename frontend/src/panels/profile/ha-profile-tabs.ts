import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import { isNavigationClick } from "../../common/dom/is-navigation-click";
import { navigate } from "../../common/navigate";
import type { HomeAssistant } from "../../types";

/** The two tabs at the top of the profile: General and Security. */
@customElement("ha-profile-tabs")
class HaProfileTabs extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property() public active: "general" | "security" = "general";

  protected render(): TemplateResult {
    return html`
      <nav
        aria-label=${this.hass.localize("panel.profile")}
        @click=${this._tabClicked}
      >
        <a
          href="/profile"
          class=${this.active === "general" ? "active" : ""}
          aria-current=${this.active === "general" ? "page" : "false"}
          >${this.hass.localize("ui.panel.profile.tabs.general")}</a
        >
        <a
          href="/profile/security"
          class=${this.active === "security" ? "active" : ""}
          aria-current=${this.active === "security" ? "page" : "false"}
          >${this.hass.localize("ui.panel.profile.tabs.security")}</a
        >
      </nav>
    `;
  }

  private async _tabClicked(ev: MouseEvent): Promise<void> {
    const href = isNavigationClick(ev);
    if (!href) {
      return;
    }
    await navigate(href, { replace: true });
  }

  static styles: CSSResultGroup = css`
    nav {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
    }

    a {
      display: inline-flex;
      align-items: center;
      min-height: var(--ha-space-10);
      padding: 0 var(--ha-space-5);
      border-radius: var(--ha-border-radius-pill);
      color: var(--secondary-text-color);
      font-weight: var(--ha-font-weight-medium);
      text-decoration: none;
    }

    a:hover {
      background: var(--secondary-background-color);
    }

    a.active {
      background: var(--primary-text-color);
      color: var(--card-background-color);
    }

    a:focus-visible {
      outline: 3px solid var(--primary-color);
      outline-offset: 2px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-profile-tabs": HaProfileTabs;
  }
}
