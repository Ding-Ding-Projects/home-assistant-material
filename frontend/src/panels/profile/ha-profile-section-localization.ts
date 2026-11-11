import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, query } from "lit/decorators";
import "../../components/ha-card";
import "../../layouts/hass-subpage";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant, Route } from "../../types";
import type { HaPersonalWordingCard } from "./ha-personal-wording-card";
import "./ha-personal-wording-card";
import "./ha-pick-date-format-row";
import "./ha-pick-first-weekday-row";
import "./ha-pick-language-row";
import "./ha-pick-number-format-row";
import "./ha-pick-time-format-row";
import "./ha-pick-time-zone-row";

@customElement("ha-profile-section-localization")
class HaProfileSectionLocalization extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  @query("ha-personal-wording-card")
  private _wordingCard?: HaPersonalWordingCard;

  public connectedCallback() {
    super.connectedCallback();
    // The search of everything opens this page with `#personal_wording`. A
    // page that is open already is not drawn again, so the address is watched.
    window.addEventListener("hashchange", this._goToWording);
    window.addEventListener("location-changed", this._goToWording);
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("hashchange", this._goToWording);
    window.removeEventListener("location-changed", this._goToWording);
  }

  protected firstUpdated() {
    this._goToWording();
  }

  /** Scrolls to the personal wording card and focuses its title. */
  private _goToWording = async () => {
    if (
      decodeURIComponent(window.location.hash.replace(/^#/, "")) !==
      "personal_wording"
    ) {
      return;
    }
    await this.updateComplete;
    await this._wordingCard?.updateComplete;
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    this._wordingCard?.focusTitle(reduce ? "auto" : "smooth");
  };

  protected render(): TemplateResult {
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/profile"
        .header=${this.hass.localize("ui.panel.profile.localization_header")}
      >
        <div class="container">
          <ha-card
            .header=${this.hass.localize(
              "ui.panel.profile.localization_header"
            )}
          >
            <div class="card-content">
              ${this.hass.localize("ui.panel.profile.localization_detail")}
            </div>
            <ha-pick-language-row
              .narrow=${this.narrow}
              .hass=${this.hass}
            ></ha-pick-language-row>
            <ha-pick-time-zone-row
              .narrow=${this.narrow}
              .hass=${this.hass}
            ></ha-pick-time-zone-row>
            <ha-pick-number-format-row
              .narrow=${this.narrow}
              .hass=${this.hass}
            ></ha-pick-number-format-row>
            <ha-pick-time-format-row
              .narrow=${this.narrow}
              .hass=${this.hass}
            ></ha-pick-time-format-row>
            <ha-pick-date-format-row
              .narrow=${this.narrow}
              .hass=${this.hass}
            ></ha-pick-date-format-row>
            <ha-pick-first-weekday-row
              .narrow=${this.narrow}
              .hass=${this.hass}
            ></ha-pick-first-weekday-row>
          </ha-card>
          <ha-personal-wording-card
            .hass=${this.hass}
          ></ha-personal-wording-card>
        </div>
      </hass-subpage>
    `;
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          user-select: initial;
        }

        .container {
          padding: var(--ha-space-2) var(--ha-space-4)
            calc(var(--ha-space-4) + var(--safe-area-inset-bottom));
        }

        ha-card {
          margin: 0 auto var(--ha-space-4);
          max-width: 600px;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-profile-section-localization": HaProfileSectionLocalization;
  }
}
