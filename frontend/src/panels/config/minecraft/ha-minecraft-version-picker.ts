import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/input/ha-input";
import type {
  MinecraftVersionEntry,
  MinecraftVersionKind,
} from "../../../data/minecraft_manager";
import { filterMinecraftVersions } from "../../../data/minecraft_manager";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";

const KINDS: MinecraftVersionKind[] = ["all", "release", "snapshot"];
const MAX_SHOWN = 60;

/**
 * The version field of a server. It is a typed field that also shows the
 * fetched list below it, narrowed by what is typed and by release or snapshot.
 * A typed version is always accepted; the list never limits the choice.
 */
@customElement("ha-minecraft-version-picker")
export class HaMinecraftVersionPicker extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property() public value = "";

  /** The list for the chosen server type; undefined when there is none. */
  @property({ attribute: false }) public versions?: MinecraftVersionEntry[];

  @property({ attribute: false }) public fetchedAt: string | null = null;

  @property({ type: Boolean }) public busy = false;

  @property() public error?: string;

  @property() public hint = "";

  @property({ attribute: false }) public invalidText?: string;

  @state() private _kind: MinecraftVersionKind = "release";

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.minecraft.version_picker.${key}` as any,
      values
    );
  }

  private _input(ev: Event): void {
    fireEvent(this, "value-changed", {
      value: ((ev.target as HTMLInputElement).value ?? "").trim(),
    });
  }

  private _pick(ev: Event): void {
    fireEvent(this, "value-changed", {
      value: (ev.currentTarget as HTMLElement).dataset.version!,
    });
  }

  private _setKind(ev: Event): void {
    this._kind = (ev.currentTarget as HTMLElement).dataset
      .kind as MinecraftVersionKind;
  }

  private _refresh(): void {
    fireEvent(this, "refresh-versions");
  }

  private _fetchedText(): string {
    if (!this.fetchedAt) {
      return this._l("never_fetched");
    }
    const when = new Date(this.fetchedAt);
    return this._l("fetched_at", {
      time: Number.isNaN(when.getTime())
        ? this.fetchedAt
        : when.toLocaleString(this.hass.locale?.language),
    });
  }

  protected render(): TemplateResult {
    return html`
      <ha-input
        .label=${this.hass.localize("ui.panel.config.minecraft.field.version")}
        .value=${this.value}
        .invalid=${Boolean(this.invalidText)}
        .hint=${this.invalidText ?? this.hint}
        @input=${this._input}
      ></ha-input>
      <div class="bar">
        <span class="detail" role="status">${this._fetchedText()}</span>
        <ha-button
          appearance="plain"
          size="small"
          .disabled=${this.busy}
          @click=${this._refresh}
          >${this._l(this.busy ? "refreshing" : "refresh")}</ha-button
        >
      </div>
      ${
        this.error
          ? html`<ha-alert alert-type="error">${this.error}</ha-alert>`
          : nothing
      }
      ${this._renderList()}
    `;
  }

  private _renderList(): TemplateResult | typeof nothing {
    if (this.versions === undefined) {
      return html`<p class="detail">${this._l("no_list")}</p>`;
    }
    if (!this.versions.length) {
      return nothing;
    }
    const matches = filterMinecraftVersions(
      this.versions,
      this._kind,
      // The typed text narrows the list unless it is an exact pick.
      this.versions.some((entry) => entry.id === this.value) ? "" : this.value
    );
    const shown = matches.slice(0, MAX_SHOWN);
    return html`
      <div class="kinds" role="group" aria-label=${this._l("filter")}>
        ${KINDS.map(
          (kind) =>
            html`<button
              type="button"
              class=${classMap({ kind: true, active: this._kind === kind })}
              aria-pressed=${this._kind === kind ? "true" : "false"}
              data-kind=${kind}
              @click=${this._setKind}
            >
              ${this._l(`filter_${kind}`)}
            </button>`
        )}
      </div>
      ${
        shown.length
          ? html`<ul class="list" aria-label=${this._l("list_label")}>
              ${shown.map(
                (entry) =>
                  html`<li>
                    <button
                      type="button"
                      class=${classMap({
                        option: true,
                        selected: entry.id === this.value,
                      })}
                      aria-pressed=${entry.id === this.value ? "true" : "false"}
                      data-version=${entry.id}
                      @click=${this._pick}
                    >
                      <span class="id">${entry.id}</span>
                      <span class="detail"
                        >${this._l(entry.type)}${
                          entry.released ? `, ${entry.released}` : ""
                        }</span
                      >
                    </button>
                  </li>`
              )}
            </ul>`
          : html`<p class="detail">${this._l("no_match")}</p>`
      }
      ${
        matches.length > shown.length
          ? html`<p class="detail">
              ${this._l("more", { count: matches.length - shown.length })}
            </p>`
          : nothing
      }
    `;
  }

  static styles = [
    haStyle,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
        min-width: 0;
      }
      ha-input {
        width: 100%;
      }
      .bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--ha-space-2);
      }
      .bar .detail {
        flex: 1 1 200px;
      }
      .detail {
        margin: 0;
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
        overflow-wrap: anywhere;
      }
      .kinds {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
      }
      .kind {
        min-height: 44px;
        min-width: 44px;
        padding: 0 var(--ha-space-4);
        border: 1px solid var(--divider-color);
        border-radius: 22px;
        background: none;
        color: var(--primary-text-color);
        font: inherit;
        cursor: pointer;
      }
      .kind.active {
        background: var(--primary-color);
        border-color: var(--primary-color);
        color: var(--text-primary-color);
      }
      .list {
        list-style: none;
        margin: 0;
        padding: 0;
        max-height: 240px;
        overflow-y: auto;
        border: 1px solid var(--divider-color);
        border-radius: var(--ha-border-radius-lg, 12px);
      }
      .option {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        align-items: center;
        gap: var(--ha-space-2);
        width: 100%;
        min-height: 44px;
        padding: 0 var(--ha-space-3);
        border: 0;
        background: none;
        color: var(--primary-text-color);
        font: inherit;
        text-align: start;
        cursor: pointer;
      }
      .option.selected {
        background: var(--secondary-background-color);
        font-weight: var(--ha-font-weight-medium);
      }
      .kind:focus-visible,
      .option:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: -2px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-minecraft-version-picker": HaMinecraftVersionPicker;
  }
  interface HASSDomEvents {
    "refresh-versions": undefined;
  }
}
