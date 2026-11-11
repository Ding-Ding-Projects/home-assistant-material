import {
  mdiHome,
  mdiHomeAutomation,
  mdiHomeHeart,
  mdiLightbulb,
} from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import type {
  Identity,
  LogoAccent,
  LogoMark,
} from "../../../common/identity/identity";
import {
  IDENTITY_CHANGED_EVENT,
  readIdentity,
} from "../../../common/identity/identity";
import "../../../components/ha-svg-icon";

export const MARK_PATHS: Record<LogoMark, string> = {
  house: mdiHome,
  heart: mdiHomeHeart,
  network: mdiHomeAutomation,
  bulb: mdiLightbulb,
};

/**
 * The logo tile: a bundled mark or a picture the person chose, on the chosen
 * background. Without an `identity` it follows the stored one and updates when
 * it changes. With `custom-only` it draws nothing until a logo is chosen.
 */
@customElement("ha-identity-logo")
export class HaIdentityLogo extends LitElement {
  @property({ attribute: false }) public identity?: Identity;

  @property({ type: Boolean, attribute: "custom-only" })
  public customOnly = false;

  @state() private _stored: Identity = {};

  public connectedCallback(): void {
    super.connectedCallback();
    this._stored = readIdentity();
    window.addEventListener(IDENTITY_CHANGED_EVENT, this._changed);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener(IDENTITY_CHANGED_EVENT, this._changed);
  }

  private _changed = () => {
    this._stored = readIdentity();
  };

  protected render(): TemplateResult | typeof nothing {
    const identity = this.identity ?? this._stored;
    if (this.customOnly && !identity.logo) {
      return nothing;
    }
    const accent: LogoAccent = identity.accent ?? "tonal";
    const logo = identity.logo ?? {
      kind: "mark" as const,
      mark: "heart" as const,
    };
    return html`<span class="tile ${accent}" aria-hidden="true">
      ${
        logo.kind === "image"
          ? html`<img src=${logo.dataUrl} alt="" draggable="false" />`
          : html`<ha-svg-icon .path=${MARK_PATHS[logo.mark]}></ha-svg-icon>`
      }
    </span>`;
  }

  static styles = css`
    :host {
      display: inline-flex;
      flex: none;
    }
    .tile {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      width: var(--identity-logo-size, 40px);
      height: var(--identity-logo-size, 40px);
      border-radius: var(--identity-logo-radius, var(--ha-border-radius-xl));
      --mdc-icon-size: calc(var(--identity-logo-size, 40px) * 0.6);
      color: var(--primary-color);
    }
    .tonal {
      background: color-mix(
        in srgb,
        var(--primary-color) 22%,
        var(--card-background-color)
      );
    }
    .white {
      background: #fff;
      color: #1b1b1f;
    }
    .outline {
      background: var(--card-background-color);
      border: 2px solid var(--outline-color);
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-identity-logo": HaIdentityLogo;
  }
}
