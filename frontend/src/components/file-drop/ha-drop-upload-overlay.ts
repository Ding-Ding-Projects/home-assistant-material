import { mdiImageMultiple, mdiMultimedia } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, queryAll } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import type { DropZone } from "../../common/file-drop/drop-routing";
import "../ha-svg-icon";

export interface DropUploadZone {
  id: DropZone;
  title: string;
  hint: string;
  /** The zone a drop outside every zone goes to. It is drawn larger. */
  primary?: boolean;
}

/**
 * A full-window notice shown while files are dragged over the app. It says
 * what a drop will do and where the files will go. When every file is a
 * picture it offers a second place, the image store, as a smaller zone beside
 * the media library.
 *
 * It only shows. It takes no focus and no pointer input, so it can never
 * trap the pointer or hide a page's own drop target: the controller picks the
 * zone from the pointer position with `zoneAt`.
 */
@customElement("ha-drop-upload-overlay")
export class HaDropUploadOverlay extends LitElement {
  @property() public heading = "";

  @property() public summary = "";

  @property() public note = "";

  @property({ attribute: false }) public zones: DropUploadZone[] = [];

  @property() public active: DropZone = "media";

  /** Where a drop goes when the pointer is outside every zone. */
  @property({ attribute: "default-zone" }) public defaultZone: DropZone =
    "media";

  @queryAll(".zone") private _zoneElements!: NodeListOf<HTMLElement>;

  /** The zone under a pointer position, or the default zone outside all. */
  public zoneAt(x: number, y: number): DropZone {
    for (const element of this._zoneElements) {
      const rect = element.getBoundingClientRect();
      if (
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom
      ) {
        return element.dataset.zone === "image" ? "image" : "media";
      }
    }
    return this.defaultZone;
  }

  protected render(): TemplateResult {
    return html`
      <div class="frame" role="status" aria-live="polite" aria-atomic="true">
        <div class="panel">
          <div class="heading">${this.heading}</div>
          <div class="summary">${this.summary}</div>
          <div class="zones">
            ${this.zones.map(
              (zone) => html`
                <div
                  class=${classMap({
                    zone: true,
                    primary: Boolean(zone.primary),
                    active: zone.id === this.active,
                  })}
                  data-zone=${zone.id}
                >
                  <ha-svg-icon
                    .path=${zone.id === "image" ? mdiImageMultiple : mdiMultimedia}
                  ></ha-svg-icon>
                  <div class="zone-title">${zone.title}</div>
                  <div class="zone-hint">${zone.hint}</div>
                </div>
              `
            )}
          </div>
          ${this.note ? html`<div class="note">${this.note}</div>` : nothing}
        </div>
      </div>
    `;
  }

  static styles: CSSResultGroup = css`
    :host {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      max-width: none;
      max-height: none;
      margin: 0;
      padding: 0;
      border: none;
      background: transparent;
      color: inherit;
      overflow: hidden;
      pointer-events: none;
    }
    .frame {
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--ha-space-4, 16px);
      border: 4px dashed var(--primary-color);
      border-radius: var(--ha-border-radius-xl, 24px);
      background: color-mix(in srgb, var(--primary-color) 14%, transparent);
    }
    @media (prefers-reduced-motion: no-preference) {
      .frame {
        animation: fade-in 120ms ease-out;
      }
    }
    @keyframes fade-in {
      from {
        opacity: 0;
      }
    }
    .panel {
      box-sizing: border-box;
      width: min(720px, 100%);
      max-height: 100%;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3, 12px);
      padding: var(--ha-space-5, 20px);
      border-radius: var(--ha-border-radius-xl, 24px);
      background: var(--card-background-color, var(--primary-background-color));
      color: var(--primary-text-color);
      box-shadow: var(--ha-box-shadow-l, 0 8px 24px rgba(0, 0, 0, 0.3));
      text-align: center;
    }
    .heading {
      font-size: var(--ha-font-size-xl, 22px);
      font-weight: var(--ha-font-weight-medium, 500);
    }
    .summary,
    .note {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-m, 14px);
    }
    .zones {
      display: flex;
      gap: var(--ha-space-3, 12px);
    }
    .zone {
      flex: 1 1 0;
      min-width: 0;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--ha-space-1, 4px);
      padding: var(--ha-space-4, 16px);
      border: 2px dashed var(--divider-color);
      border-radius: var(--ha-border-radius-lg, 16px);
      overflow-wrap: anywhere;
    }
    .zone.primary {
      flex: 2 1 0;
    }
    .zone.active {
      border-color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 16%, transparent);
    }
    .zone ha-svg-icon {
      --mdc-icon-size: 36px;
      color: var(--primary-color);
    }
    .zone-title {
      font-weight: var(--ha-font-weight-medium, 500);
    }
    .zone-hint {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 12px);
    }
    @media (max-width: 600px) {
      .zones {
        flex-direction: column;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-drop-upload-overlay": HaDropUploadOverlay;
  }
}
