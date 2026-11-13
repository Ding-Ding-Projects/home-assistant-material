import type { ContextType } from "@lit/context";
import {
  mdiApplicationBracesOutline,
  mdiCodeBraces,
  mdiFileDocumentOutline,
  mdiPackageVariant,
  mdiPalette,
  mdiSourceRepository,
  mdiViewDashboard,
} from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../../../common/decorators/consume";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/ha-alert";
import "../../../components/ha-checkbox";
import type { HaCheckbox } from "../../../components/ha-checkbox";
import "../../../components/ha-svg-icon";
import type {
  ArchiveItem,
  ArchiveItemKind,
} from "../../../data/marketplace/archive-detect";
import {
  CODE_KINDS,
  isInstallable,
  LOOKED_FOR,
} from "../../../data/marketplace/archive-detect";
import type { ArchiveInspection } from "../../../data/marketplace/archive-upload";
import { internationalizationContext } from "../../../data/context";

declare global {
  interface HASSDomEvents {
    "archive-selection-changed": { selected: string[] };
  }
}

const KIND_ICONS: Record<ArchiveItemKind, string> = {
  integration: mdiPackageVariant,
  plugin: mdiViewDashboard,
  theme: mdiPalette,
  template: mdiCodeBraces,
  blueprint: mdiFileDocumentOutline,
  app_repository: mdiSourceRepository,
  app: mdiApplicationBracesOutline,
};

const PREFIX = "ui.panel.marketplace.dialog_custom_repositories.file";

// What was found in an archive, and what adding each thing would do
@customElement("ha-marketplace-archive-found")
export class HaMarketplaceArchiveFound extends LitElement {
  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: ContextType<typeof internationalizationContext>;

  @property({ attribute: false }) public inspection!: ArchiveInspection;

  @property({ attribute: false }) public selected: string[] = [];

  @property({ type: Boolean }) public disabled = false;

  protected render() {
    const { items, git } = this.inspection;
    if (!items.length) {
      return this._renderNothing();
    }
    const runsCode = items.filter(
      (item) => isInstallable(item) && CODE_KINDS.includes(item.kind)
    ).length;
    return html`
      ${items.map((item) => this._renderItem(item))}
      ${
        items.some(isInstallable)
          ? nothing
          : html`<ha-alert alert-type="info">
              ${this._i18n.localize(`${PREFIX}.found.none_addable`)}
            </ha-alert>`
      }
      ${
        runsCode
          ? html`<ha-alert alert-type="warning">
              ${this._i18n.localize(`${PREFIX}.found.runs_code`, {
                count: runsCode,
              })}
            </ha-alert>`
          : nothing
      }
      <p class="history">
        ${
          git
            ? html`${this._i18n.localize(`${PREFIX}.found.history_yes`)}
              ${
                git.origin
                  ? this._i18n.localize(`${PREFIX}.found.history_origin`, {
                      origin: git.origin,
                    })
                  : nothing
              }
              ${
                git.branch
                  ? this._i18n.localize(`${PREFIX}.found.history_branch`, {
                      branch: git.branch,
                    })
                  : nothing
              }`
            : this._i18n.localize(`${PREFIX}.found.history_no`)
        }
      </p>
    `;
  }

  private _renderNothing() {
    return html`
      <p>
        ${this._i18n.localize(`${PREFIX}.found.none_intro`, {
          name: this.inspection.fileName,
        })}
      </p>
      <ul class="looked-for">
        ${LOOKED_FOR.map((path) => html`<li><code>${path}</code></li>`)}
      </ul>
      <p class="muted">${this._i18n.localize(`${PREFIX}.found.none_hint`)}</p>
    `;
  }

  private _renderItem(item: ArchiveItem) {
    const localize = this._i18n.localize;
    const installable = isInstallable(item);
    const location = item.source || localize(`${PREFIX}.found.top_level`);
    return html`
      <div class="item" data-kind=${item.kind}>
        <div class="tile">
          <ha-svg-icon .path=${KIND_ICONS[item.kind]}></ha-svg-icon>
        </div>
        <div class="body">
          <div class="head">
            <span class="name">${item.name}</span>
            <span class="kind">${localize(`${PREFIX}.kind.${item.kind}`)}</span>
            ${
              item.version
                ? html`<span class="version"
                    >${localize(`${PREFIX}.found.version`, {
                      version: item.version,
                    })}</span
                  >`
                : nothing
            }
          </div>
          <div class="line">
            ${localize(`${PREFIX}.found.location`, { path: location })}
          </div>
          <div class="line">
            ${localize(`${PREFIX}.rule.${item.rule}`, { file: item.marker })}
          </div>
          ${
            item.themes.length
              ? html`<div class="line">
                  ${localize(`${PREFIX}.found.themes`, {
                    themes: item.themes.join(", "),
                  })}
                </div>`
              : nothing
          }
          ${
            item.kind === "app_repository"
              ? html`<div class="line">
                  ${
                    item.apps.length
                      ? localize(`${PREFIX}.found.apps`, {
                          apps: item.apps.join(", "),
                        })
                      : localize(`${PREFIX}.found.no_apps`)
                  }
                </div>`
              : nothing
          }
          ${item.problems.map(
            (problem) =>
              html`<ha-alert alert-type="warning">
                ${localize(`${PREFIX}.problem.${problem}`)}
              </ha-alert>`
          )}
          <div class="line will">
            ${localize(`${PREFIX}.will.${item.kind}`, {
              domain: item.domain ?? "",
              file: item.file ?? "",
            })}
          </div>
          ${
            installable
              ? html`<ha-checkbox
                  .checked=${this.selected.includes(item.id)}
                  .disabled=${this.disabled}
                  .value=${item.id}
                  @change=${this._toggle}
                >
                  ${localize(`${PREFIX}.found.select`, { name: item.name })}
                </ha-checkbox>`
              : nothing
          }
        </div>
      </div>
    `;
  }

  private _toggle(ev: Event) {
    const checkbox = ev.currentTarget as HaCheckbox;
    const id = checkbox.value as string;
    const selected = checkbox.checked
      ? [...this.selected.filter((value) => value !== id), id]
      : this.selected.filter((value) => value !== id);
    fireEvent(this, "archive-selection-changed", { selected });
  }

  static styles = css`
    :host {
      display: block;
    }
    ha-alert {
      display: block;
      margin-block: var(--ha-space-2);
    }
    .item {
      display: flex;
      gap: var(--ha-space-3);
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
    .kind,
    .version,
    .line,
    .muted,
    .history {
      color: var(--secondary-text-color);
    }
    .line {
      margin-block-start: var(--ha-space-1);
      overflow-wrap: anywhere;
    }
    .line.will {
      color: var(--primary-text-color);
    }
    ha-checkbox {
      margin-block-start: var(--ha-space-2);
    }
    .history {
      margin-block: var(--ha-space-3) 0;
    }
    .looked-for {
      margin: 0 0 var(--ha-space-2);
      padding-inline-start: var(--ha-space-5);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-marketplace-archive-found": HaMarketplaceArchiveFound;
  }
}
