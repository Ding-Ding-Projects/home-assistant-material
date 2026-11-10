import { mdiEarth, mdiTune } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { isComponentLoaded } from "../../common/config/is_component_loaded";
import { fireEvent } from "../../common/dom/fire_event";
import "../../components/ha-button";
import "../../components/ha-card";
import "../../components/ha-config-navigation-list";
import "../../components/user/ha-user-badge";
import { isExternal } from "../../data/external";
import { showConfirmationDialog } from "../../dialogs/generic/show-dialog-box";
import "../../layouts/hass-subpage";
import type { PageNavigation } from "../../layouts/hass-tabs-subpage";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant, Route } from "../../types";
import { isMobileClient } from "../../util/is_mobile";
import "./ha-enable-shortcuts-row";
import "./ha-force-narrow-row";
import "./ha-pick-dashboard-row";
import "./ha-pick-date-format-row";
import "./ha-pick-first-weekday-row";
import "./ha-pick-language-row";
import "./ha-pick-number-format-row";
import "./ha-pick-theme-row";
import "./ha-pick-time-format-row";
import "./ha-pick-time-zone-row";
import "./ha-profile-tabs";
import "./ha-push-notifications-row";
import "./ha-set-suspend-row";
import "./ha-set-vibrate-row";
import { showEditProfileDialog } from "./show-dialog-edit-profile";

@customElement("ha-profile-dashboard")
class HaProfileDashboard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  protected render(): TemplateResult {
    // Everything that used to be reached through the list of sub pages is
    // still reachable: the rows that fit a card are shown here, and the pages
    // that hold more are listed under the cards.
    const pages: PageNavigation[] = [
      {
        path: "/profile/preferences",
        name: this.hass.localize("ui.panel.profile.user_preferences_header"),
        description: this.hass.localize(
          "ui.panel.profile.user_preferences_description"
        ),
        iconPath: mdiTune,
      },
      {
        path: "/profile/localization",
        name: this.hass.localize("ui.panel.profile.localization_header"),
        description: this.hass.localize(
          "ui.panel.profile.localization_description"
        ),
        iconPath: mdiEarth,
      },
    ];

    return html`
      <hass-subpage
        main-page
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${this.hass.localize("panel.profile")}
      >
        <div class="container">
          <section class="hero">
            <ha-user-badge .user=${this.hass.user}></ha-user-badge>
            <div class="details">
              <h2>${this.hass.user!.name}</h2>
              ${
                this.hass.user!.is_owner
                  ? html`<p>
                      ${this.hass.localize("ui.panel.profile.is_owner")}
                    </p>`
                  : nothing
              }
            </div>
            <div class="actions">
              ${
                isComponentLoaded(this.hass.config, "person")
                  ? html`<ha-button
                      appearance="plain"
                      @click=${this._handleEditProfile}
                    >
                      ${this.hass.localize(
                        "ui.panel.profile.edit_profile.button"
                      )}
                    </ha-button>`
                  : nothing
              }
              <ha-button
                variant="danger"
                appearance="plain"
                @click=${this._handleLogOut}
              >
                ${this.hass.localize("ui.panel.profile.logout")}
              </ha-button>
            </div>
          </section>

          <ha-profile-tabs
            .hass=${this.hass}
            active="general"
          ></ha-profile-tabs>

          <div class="cards">
            <ha-card
              .header=${this.hass.localize(
                "ui.panel.profile.language_and_region"
              )}
            >
              <ha-pick-language-row
                .narrow=${this.narrow}
                .hass=${this.hass}
              ></ha-pick-language-row>
              <ha-pick-time-format-row
                .narrow=${this.narrow}
                .hass=${this.hass}
              ></ha-pick-time-format-row>
              <ha-pick-date-format-row
                .narrow=${this.narrow}
                .hass=${this.hass}
              ></ha-pick-date-format-row>
              <ha-pick-number-format-row
                .narrow=${this.narrow}
                .hass=${this.hass}
              ></ha-pick-number-format-row>
              <ha-pick-first-weekday-row
                .narrow=${this.narrow}
                .hass=${this.hass}
              ></ha-pick-first-weekday-row>
              <ha-pick-time-zone-row
                .narrow=${this.narrow}
                .hass=${this.hass}
              ></ha-pick-time-zone-row>
            </ha-card>

            <ha-card
              .header=${this.hass.localize(
                isExternal
                  ? "ui.panel.profile.mobile_app_settings"
                  : "ui.panel.profile.browser_settings"
              )}
            >
              <ha-pick-dashboard-row
                .narrow=${this.narrow}
                .hass=${this.hass}
              ></ha-pick-dashboard-row>
              <ha-pick-theme-row
                .narrow=${this.narrow}
                .hass=${this.hass}
              ></ha-pick-theme-row>
              ${
                !isMobileClient
                  ? html`<ha-enable-shortcuts-row
                      id="shortcuts"
                      .hass=${this.hass}
                    ></ha-enable-shortcuts-row>`
                  : nothing
              }
              ${
                !isExternal &&
                isComponentLoaded(this.hass.config, "html5.notify")
                  ? html`<ha-push-notifications-row
                      .hass=${this.hass}
                    ></ha-push-notifications-row>`
                  : nothing
              }
              ${
                "vibrate" in navigator
                  ? html`<ha-set-vibrate-row
                      .hass=${this.hass}
                    ></ha-set-vibrate-row>`
                  : nothing
              }
              ${
                this.hass.dockedSidebar !== "auto" || !this.narrow
                  ? html`<ha-force-narrow-row
                      .hass=${this.hass}
                    ></ha-force-narrow-row>`
                  : nothing
              }
              <ha-set-suspend-row .hass=${this.hass}></ha-set-suspend-row>
            </ha-card>
          </div>

          <ha-card outlined class="more">
            <ha-config-navigation-list
              .pages=${pages}
              has-secondary
              .label=${this.hass.localize("panel.profile")}
            ></ha-config-navigation-list>
          </ha-card>
        </div>
      </hass-subpage>
    `;
  }

  private _handleEditProfile() {
    showEditProfileDialog(this);
  }

  private _handleLogOut() {
    showConfirmationDialog(this, {
      title: this.hass.localize("ui.panel.profile.logout_title"),
      text: this.hass.localize("ui.panel.profile.logout_text"),
      confirmText: this.hass.localize("ui.panel.profile.logout"),
      confirm: () => fireEvent(this, "hass-logout"),
      destructive: true,
    });
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          user-select: initial;
        }

        .container {
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
          max-width: 1100px;
          margin: 0 auto;
          padding: var(--ha-space-4) var(--ha-space-5)
            calc(var(--ha-space-4) + var(--safe-area-inset-bottom));
        }

        :host([narrow]) .container {
          padding: var(--ha-space-2) var(--ha-space-3)
            calc(var(--ha-space-4) + var(--safe-area-inset-bottom));
        }

        .hero {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2) var(--ha-space-5);
        }

        ha-user-badge {
          flex-shrink: 0;
          width: 88px;
          height: 88px;
        }

        :host([narrow]) ha-user-badge {
          width: 56px;
          height: 56px;
        }

        .details {
          flex: 1 1 200px;
          min-width: 0;
        }

        .details h2 {
          margin: 0;
          overflow-wrap: anywhere;
          font-family: var(--ha-font-family-heading, inherit);
          font-size: var(--ha-font-size-3xl);
          font-weight: var(--ha-font-weight-medium);
          line-height: var(--ha-line-height-condensed);
          color: var(--primary-text-color);
        }

        .details p {
          margin: var(--ha-space-1) 0 0;
          color: var(--secondary-text-color);
        }

        .actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          margin-inline-start: auto;
        }

        .cards {
          display: grid;
          grid-template-columns: repeat(
            auto-fit,
            minmax(min(100%, 340px), 1fr)
          );
          align-items: start;
          gap: var(--ha-space-4);
        }

        ha-card[outlined] {
          overflow: hidden;
        }

        .more {
          width: 100%;
          box-sizing: border-box;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-profile-dashboard": HaProfileDashboard;
  }
}
