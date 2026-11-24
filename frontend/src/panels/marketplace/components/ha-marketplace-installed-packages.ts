import type { ContextType } from "@lit/context";
import {
  mdiAlertCircleOutline,
  mdiPackageVariantClosed,
  mdiRefresh,
} from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import { consume } from "../../../common/decorators/consume";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-icon-button";
import "../../../components/progress/ha-progress-bar";
import "../../../components/ha-svg-icon";
import "../../../components/ha-switch";
import { apiContext, internationalizationContext } from "../../../data/context";
import type { InstalledPackage } from "../../../data/marketplace/packages";
import {
  checkPackageUpdate,
  fetchInstalledPackages,
  installPackageUpdate,
  setPackageAutoUpdate,
} from "../../../data/marketplace/packages";
import { marketplaceErrorMessage } from "../../../data/marketplace/websocket";

const PREFIX = "ui.panel.marketplace.installed_packages";

// The packages that were installed from a file, with their update state.
// Shows nothing while there are none.
@customElement("ha-marketplace-installed-packages")
export class HaMarketplaceInstalledPackages extends LitElement {
  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: ContextType<typeof internationalizationContext>;

  @state()
  @consume({ context: apiContext, subscribe: true })
  private _api!: ContextType<typeof apiContext>;

  @state() private _packages: InstalledPackage[] = [];

  // The keys with a request running
  @state() private _busy: string[] = [];

  @state() private _error?: string;

  public connectedCallback(): void {
    super.connectedCallback();
    this._load();
  }

  private async _load() {
    try {
      this._packages = await fetchInstalledPackages(this._api);
    } catch (_err) {
      // Without the list there is nothing to show, the rest of the page works
      this._packages = [];
    }
  }

  protected render() {
    if (!this._packages.length) {
      return nothing;
    }
    return html`
      <section aria-labelledby="heading">
        <h2 id="heading">${this._i18n.localize(`${PREFIX}.title`)}</h2>
        ${
          this._error
            ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
            : nothing
        }
        ${this._packages.map((pkg) => this._renderPackage(pkg))}
      </section>
    `;
  }

  private _renderPackage(pkg: InstalledPackage) {
    const localize = this._i18n.localize;
    const busy = this._busy.includes(pkg.key) || pkg.state === "updating";
    return html`
      <div class="package" data-state=${pkg.state}>
        <div class="tile">
          <ha-svg-icon .path=${mdiPackageVariantClosed}></ha-svg-icon>
        </div>
        <div class="body">
          <div class="head">
            <span class="name">${pkg.title}</span>
            <span class="version"
              >${localize(`${PREFIX}.installed_version`, {
                version: pkg.version,
              })}</span
            >
          </div>
          ${this._renderState(pkg, busy)}
          <div class="auto">
            <ha-switch
              .checked=${pkg.auto_update}
              .disabled=${busy}
              .ariaLabel=${localize(`${PREFIX}.auto_update`)}
              data-key=${pkg.key}
              @change=${this._autoChanged}
            ></ha-switch>
            <span>${localize(`${PREFIX}.auto_update`)}</span>
            <span class="muted"
              >${
                pkg.auto_update
                  ? localize(`${PREFIX}.auto_on`)
                  : localize(`${PREFIX}.auto_off`)
              }</span
            >
          </div>
        </div>
        <ha-icon-button
          .label=${localize(`${PREFIX}.check`)}
          .path=${mdiRefresh}
          .disabled=${busy}
          data-key=${pkg.key}
          @click=${this._checkClicked}
        ></ha-icon-button>
      </div>
    `;
  }

  private _renderState(pkg: InstalledPackage, busy: boolean) {
    const localize = this._i18n.localize;
    if (pkg.state === "updating") {
      return html`<div class="line">
          ${localize(`${PREFIX}.updating`, { version: pkg.latest_version ?? "" })}
        </div>
        <ha-progress-bar indeterminate></ha-progress-bar>`;
    }
    if (pkg.state === "restart") {
      return html`<ha-alert alert-type="info">
        ${localize(`${PREFIX}.restart`, { version: pkg.version })}
      </ha-alert>`;
    }
    const failed =
      pkg.state === "failed"
        ? html`<ha-alert alert-type="error">
            <ha-svg-icon
              slot="icon"
              .path=${mdiAlertCircleOutline}
            ></ha-svg-icon>
            ${localize(`${PREFIX}.failed`, { error: pkg.error ?? "" })}
          </ha-alert>`
        : nothing;
    if (pkg.latest_version) {
      return html`${failed}
        <div class="line">
          ${localize(`${PREFIX}.available`, { version: pkg.latest_version })}
        </div>
        ${
          pkg.notes
            ? html`<details>
                <summary>${localize(`${PREFIX}.notes`)}</summary>
                <p class="notes">${pkg.notes}</p>
              </details>`
            : nothing
        }
        <ha-button
          size="s"
          .disabled=${busy}
          data-key=${pkg.key}
          @click=${this._installClicked}
        >
          ${
            pkg.state === "failed"
              ? localize(`${PREFIX}.try_again`)
              : localize(`${PREFIX}.update_now`)
          }
        </ha-button>`;
    }
    return html`${failed}
      <div class="line muted">${localize(`${PREFIX}.up_to_date`)}</div>`;
  }

  private _replace(updated: InstalledPackage) {
    this._packages = this._packages.map((pkg) =>
      pkg.key === updated.key ? updated : pkg
    );
  }

  private async _run(
    key: string,
    action: () => Promise<InstalledPackage | undefined>
  ) {
    this._busy = [...this._busy, key];
    this._error = undefined;
    try {
      const updated = await action();
      if (updated) {
        this._replace(updated);
      } else {
        await this._load();
      }
    } catch (err: unknown) {
      this._error = marketplaceErrorMessage(err, this._i18n.localize);
      await this._load();
    } finally {
      this._busy = this._busy.filter((value) => value !== key);
    }
  }

  private _autoChanged(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    this._run(input.dataset.key!, async () => {
      await setPackageAutoUpdate(this._api, input.dataset.key!, input.checked);
      return undefined;
    });
  }

  private _checkClicked(ev: Event) {
    const key = (ev.currentTarget as HTMLElement).dataset.key!;
    this._run(key, () => checkPackageUpdate(this._api, key));
  }

  private _installClicked(ev: Event) {
    const key = (ev.currentTarget as HTMLElement).dataset.key!;
    this._run(key, () => installPackageUpdate(this._api, key));
  }

  static styles = css`
    :host {
      display: block;
    }
    section {
      padding: var(--ha-space-4);
    }
    h2 {
      margin: 0 0 var(--ha-space-2);
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
    }
    ha-alert {
      display: block;
      margin-block: var(--ha-space-2);
    }
    .package {
      display: flex;
      gap: var(--ha-space-3);
      align-items: flex-start;
      padding: var(--ha-space-3);
      margin-block-end: var(--ha-space-2);
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-border-radius-lg);
      background: var(--card-background-color);
    }
    .tile {
      flex: none;
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: var(--ha-border-radius-md);
      background: var(--ha-color-primary-container);
      color: var(--ha-color-on-primary-container);
    }
    .body {
      min-width: 0;
      flex: 1;
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--ha-space-2);
    }
    .name {
      font-weight: var(--ha-font-weight-semibold);
      overflow-wrap: anywhere;
    }
    .version,
    .muted {
      color: var(--secondary-text-color);
    }
    .line {
      margin-block: var(--ha-space-1);
    }
    .notes {
      margin: var(--ha-space-1) 0 var(--ha-space-2);
      white-space: pre-wrap;
    }
    .auto {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2);
      margin-block-start: var(--ha-space-2);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-marketplace-installed-packages": HaMarketplaceInstalledPackages;
  }
}
