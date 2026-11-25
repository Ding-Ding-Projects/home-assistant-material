import type { ContextType } from "@lit/context";
import { initialState } from "@lit/task";
import { mdiPuzzleOutline } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../common/decorators/consume";
import { AsyncValueTask } from "../common/controllers/async-value-task";
import {
  brandsAccessTokenContext,
  configContext,
  connectionContext,
  uiContext,
} from "../data/context";
import {
  DEFAULT_DOMAIN_ICON,
  domainIcon,
  FALLBACK_DOMAIN_ICONS,
} from "../data/icons";
import { brandsUrl } from "../util/brands-url";
import "./ha-icon";
import "./ha-svg-icon";

@customElement("ha-domain-icon")
export class HaDomainIcon extends LitElement {
  @property() public domain?: string;

  @property({ attribute: false }) public deviceClass?: string;

  @property({ attribute: false }) public state?: string;

  @property() public icon?: string;

  @property({ attribute: "brand-fallback", type: Boolean })
  public brandFallback?: boolean;

  @state()
  @consume({ context: configContext, subscribe: true })
  private _hassConfig?: ContextType<typeof configContext>;

  @state()
  @consume({ context: connectionContext, subscribe: true })
  private _connection?: ContextType<typeof connectionContext>;

  @state()
  @consume({ context: uiContext, subscribe: true })
  private _hassUi?: ContextType<typeof uiContext>;

  @state()
  @consume({ context: brandsAccessTokenContext, subscribe: true })
  // @ts-ignore re-render trigger only, its value is never read
  private _brandsAccessToken?: string;

  /** The domain whose brand image was reported missing by the server. */
  @state() private _brandMissingFor?: string;

  private _iconTask = new AsyncValueTask(this, {
    task: ([icon, connection, config, domain, deviceClass, domainState]) => {
      if (icon || !connection || !config || !domain) {
        return initialState;
      }
      return domainIcon(
        connection.connection,
        config.config,
        domain,
        deviceClass,
        domainState
      );
    },
    args: () =>
      [
        this.icon,
        this._connection,
        this._hassConfig,
        this.domain,
        this.deviceClass,
        this.state,
      ] as const,
  });

  protected render() {
    if (this.icon) {
      return html`<ha-icon .icon=${this.icon}></ha-icon>`;
    }

    if (!this.domain) {
      return nothing;
    }

    if (!this._connection || !this._hassConfig) {
      return this._renderFallback();
    }

    if (!this._iconTask.resolved) {
      return nothing;
    }
    return this._iconTask.value
      ? html`<ha-icon .icon=${this._iconTask.value}></ha-icon>`
      : this._renderFallback();
  }

  private _renderFallback() {
    if (this.domain && this.domain in FALLBACK_DOMAIN_ICONS) {
      return html`
        <ha-svg-icon .path=${FALLBACK_DOMAIN_ICONS[this.domain!]}></ha-svg-icon>
      `;
    }
    if (this.brandFallback) {
      if (this._brandMissingFor === this.domain) {
        // The brands server has no image for this domain: show a neutral icon
        // instead of the "icon not available" picture it would send otherwise.
        return html`<ha-svg-icon .path=${mdiPuzzleOutline}></ha-svg-icon>`;
      }
      const image = this._withoutPlaceholder(
        brandsUrl(
          {
            domain: this.domain!,
            type: "icon",
            darkOptimized: this._hassUi?.themes.darkMode,
          },
          this._hassConfig?.auth.data.hassUrl
        )
      );
      return html`
        <img
          alt=""
          src=${image}
          @error=${this._handleBrandError}
          crossorigin="anonymous"
          referrerpolicy="no-referrer"
        />
      `;
    }
    return html`<ha-svg-icon .path=${DEFAULT_DOMAIN_ICON}></ha-svg-icon>`;
  }

  // Ask the server for a 404 instead of its placeholder picture, so a missing
  // image reaches the error handler.
  private _withoutPlaceholder(url: string): string {
    if (!url || __DEMO__) {
      return url;
    }
    try {
      const parsed = new URL(url);
      parsed.searchParams.set("placeholder", "no");
      return parsed.toString();
    } catch {
      return url;
    }
  }

  private _handleBrandError(ev: Event) {
    // An empty src (no token yet) also errors; only a real request counts.
    if ((ev.target as HTMLImageElement).getAttribute("src")) {
      this._brandMissingFor = this.domain;
    }
  }

  static styles = css`
    img {
      width: var(--mdc-icon-size, 24px);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-domain-icon": HaDomainIcon;
  }
}
