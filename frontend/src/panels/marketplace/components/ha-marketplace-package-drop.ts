import { mdiPackageDown } from "@mdi/js";
import type { ContextType } from "@lit/context";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../../../common/decorators/consume";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/ha-svg-icon";
import { isArchiveFileName } from "../../../data/marketplace/archive-upload";
import type { MarketplaceData } from "../../../data/marketplace/marketplace";
import { internationalizationContext } from "../../../data/context";
import type { HomeAssistant } from "../../../types";
import { showMarketplaceAddFromLink } from "../tools/add-from-link";

const PREFIX = "ui.panel.marketplace.package_drop";

const hasFiles = (ev: DragEvent): boolean =>
  !!ev.dataTransfer && Array.from(ev.dataTransfer.types).includes("Files");

// Drop a package file anywhere on the Marketplace panel to install it. The
// dropped file goes to the same dialog as a file chosen with the button.
@customElement("ha-marketplace-package-drop")
export class HaMarketplacePackageDrop extends LitElement {
  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: ContextType<typeof internationalizationContext>;

  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public marketplace!: MarketplaceData;

  // The element a file may be dropped on
  @property({ attribute: false }) public target?: HTMLElement;

  @state() private _over = false;

  @state() private _area = "";

  private _depth = 0;

  private _bound?: HTMLElement;

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unbind();
  }

  protected updated(changed: PropertyValues<this>): void {
    if (changed.has("target")) {
      this._unbind();
      this._bind();
    }
  }

  private _bind() {
    if (!this.target) {
      return;
    }
    this._bound = this.target;
    this._bound.addEventListener("dragenter", this._dragEnter);
    this._bound.addEventListener("dragover", this._dragOver);
    this._bound.addEventListener("dragleave", this._dragLeave);
    this._bound.addEventListener("drop", this._drop);
  }

  private _unbind() {
    this._bound?.removeEventListener("dragenter", this._dragEnter);
    this._bound?.removeEventListener("dragover", this._dragOver);
    this._bound?.removeEventListener("dragleave", this._dragLeave);
    this._bound?.removeEventListener("drop", this._drop);
    this._bound = undefined;
    this._over = false;
    this._depth = 0;
  }

  private get _isAdmin(): boolean {
    return !!this.hass.user?.is_admin;
  }

  private _dragEnter = (ev: DragEvent) => {
    if (!hasFiles(ev)) {
      return;
    }
    ev.preventDefault();
    this._depth += 1;
    if (this._isAdmin && this.target) {
      const rect = this.target.getBoundingClientRect();
      this._area = `top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;height:${rect.height}px`;
      this._over = true;
    }
  };

  private _dragOver = (ev: DragEvent) => {
    if (!hasFiles(ev)) {
      return;
    }
    // Without this the browser opens the file instead of handing it over
    ev.preventDefault();
    if (ev.dataTransfer) {
      ev.dataTransfer.dropEffect = this._isAdmin ? "copy" : "none";
    }
  };

  private _dragLeave = (ev: DragEvent) => {
    if (!hasFiles(ev)) {
      return;
    }
    this._depth = Math.max(0, this._depth - 1);
    if (this._depth === 0) {
      this._over = false;
    }
  };

  private _drop = (ev: DragEvent) => {
    if (!hasFiles(ev)) {
      return;
    }
    ev.preventDefault();
    this._depth = 0;
    this._over = false;

    const localize = this._i18n.localize;
    if (!this._isAdmin) {
      this._notify(localize(`${PREFIX}.admin_only`));
      return;
    }
    const files = Array.from(ev.dataTransfer?.files ?? []);
    if (files.length !== 1) {
      this._notify(localize(`${PREFIX}.one_file`));
      return;
    }
    const [file] = files;
    if (!isArchiveFileName(file.name)) {
      this._notify(localize(`${PREFIX}.wrong_file`, { name: file.name }));
      return;
    }
    showMarketplaceAddFromLink(this, localize, this.marketplace, file);
  };

  private _notify(message: string) {
    fireEvent(this, "hass-notification", { message });
  }

  protected render() {
    if (!this._over) {
      return nothing;
    }
    const localize = this._i18n.localize;
    return html`
      <div class="overlay" style=${this._area} aria-hidden="true">
        <div class="card">
          <ha-svg-icon .path=${mdiPackageDown}></ha-svg-icon>
          <div class="title">${localize(`${PREFIX}.title`)}</div>
          <div class="hint">${localize(`${PREFIX}.hint`)}</div>
        </div>
      </div>
    `;
  }

  static styles = css`
    :host {
      display: contents;
    }
    .overlay {
      position: fixed;
      z-index: 20;
      display: grid;
      place-items: center;
      box-sizing: border-box;
      background: color-mix(
        in srgb,
        var(--ha-color-primary-container, var(--primary-color)) 82%,
        transparent
      );
      border: 3px dashed var(--primary-color);
      border-radius: var(--ha-border-radius-xl);
      /* Dropping is handled on the panel, not on this cover */
      pointer-events: none;
      animation: appear 160ms ease-out;
    }
    .card {
      display: grid;
      justify-items: center;
      gap: var(--ha-space-2);
      padding: var(--ha-space-6);
      text-align: center;
      color: var(--ha-color-on-primary-container, var(--primary-text-color));
    }
    ha-svg-icon {
      --mdc-icon-size: 56px;
    }
    .title {
      font-size: var(--ha-font-size-xl);
      font-weight: var(--ha-font-weight-medium);
    }
    .hint {
      color: var(--secondary-text-color);
    }
    @keyframes appear {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .overlay {
        animation: none;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-marketplace-package-drop": HaMarketplacePackageDrop;
  }
}
