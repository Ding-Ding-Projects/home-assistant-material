import { mdiContentCopy, mdiPencil } from "@mdi/js";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { navigate } from "../common/navigate";
import { copyToClipboard } from "../common/util/copy-clipboard";
import type { RegistryNoteKind, RegistryNotes } from "../data/registry-notes";
import {
  fetchRegistryNotes,
  MAX_NOTE_LENGTH,
  saveRegistryNote,
  splitNoteAddresses,
} from "../data/registry-notes";
import type { HomeAssistant } from "../types";
import { showToast } from "../util/toast";
import "./ha-button";
import "./ha-card";
import "./ha-icon-button";
import "./ha-svg-icon";
import "./ha-textarea";
import type { HaTextArea } from "./ha-textarea";

/**
 * Notes on one device or entity, kept in the instance's shared settings.
 * Addresses inside the instance open; any other address is shown as text with
 * a Copy button, because the interface never opens an outside address itself.
 */
@customElement("ha-registry-notes-card")
export class HaRegistryNotesCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property() public kind!: RegistryNoteKind;

  @property({ attribute: "target-id" }) public targetId!: string;

  @state() private _notes?: RegistryNotes;

  @state() private _unavailable = false;

  @state() private _editing = false;

  @state() private _draft = "";

  @state() private _saving = false;

  @query("ha-textarea") private _textarea?: HaTextArea;

  private _requested = false;

  protected willUpdate(changedProps: PropertyValues) {
    if (!this._requested && this.hass) {
      this._requested = true;
      this._load();
    }
    if (changedProps.has("targetId") && this.hasUpdated) {
      this._editing = false;
    }
  }

  private async _load() {
    try {
      this._notes = await fetchRegistryNotes(this.hass.connection);
      this._unavailable = false;
    } catch (_err) {
      this._unavailable = true;
    }
  }

  private get _text(): string {
    return this._notes?.[this.kind][this.targetId]?.text ?? "";
  }

  private get _canEdit(): boolean {
    return !!this.hass.user?.is_admin && !this._unavailable;
  }

  protected render() {
    if (!this._notes && !this._unavailable) {
      return nothing;
    }
    const text = this._text;
    // Someone who cannot edit has nothing to see on an empty note.
    if (!text && !this._canEdit && !this._editing) {
      return nothing;
    }
    const localize = this.hass.localize;
    const body = this._editing
      ? html`
          <ha-textarea
            resize="auto"
            rows="4"
            maxlength=${MAX_NOTE_LENGTH}
            .label=${localize("ui.panel.config.registry_notes.label")}
            .hint=${localize("ui.panel.config.registry_notes.hint")}
            .value=${this._draft}
            .disabled=${this._saving}
            @input=${this._draftChanged}
          ></ha-textarea>
          <div class="actions">
            <ha-button
              appearance="plain"
              @click=${this._cancel}
              .disabled=${this._saving}
              >${localize("ui.common.cancel")}</ha-button
            >
            <ha-button @click=${this._save} .disabled=${this._saving}
              >${localize("ui.common.save")}</ha-button
            >
          </div>
        `
      : html`
          ${
            text
              ? html`<div class="note">${this._renderNote(text)}</div>`
              : html`<p class="empty">
                  ${localize("ui.panel.config.registry_notes.empty")}
                </p>`
          }
          ${
            this._canEdit
              ? html`<div class="actions">
                  <ha-button appearance="filled" @click=${this._edit}>
                    <ha-svg-icon slot="start" .path=${mdiPencil}></ha-svg-icon>
                    ${localize(
                      text
                        ? "ui.panel.config.registry_notes.edit"
                        : "ui.panel.config.registry_notes.add"
                    )}
                  </ha-button>
                  ${
                    text
                      ? html`<span class="tag"
                          >${localize(
                            "ui.panel.config.registry_notes.searchable"
                          )}</span
                        >`
                      : nothing
                  }
                </div>`
              : nothing
          }
        `;
    return html`<ha-card
      .header=${localize("ui.panel.config.registry_notes.title")}
    >
      <div class="card-content">
        ${
          this._unavailable
            ? html`<p class="empty">
                ${localize("ui.panel.config.registry_notes.unavailable")}
              </p>`
            : body
        }
      </div>
    </ha-card>`;
  }

  private _renderNote(text: string) {
    return splitNoteAddresses(text, location.origin).map((segment) => {
      if (segment.type === "text") {
        return segment.text;
      }
      if (segment.type === "inside") {
        return html`<a href=${segment.href} @click=${this._openInside}
          >${segment.text}</a
        >`;
      }
      return html`<span class="outside"
        ><span class="address">${segment.text}</span
        ><ha-icon-button
          .path=${mdiContentCopy}
          .label=${this.hass.localize(
            "ui.panel.config.registry_notes.copy_address"
          )}
          data-address=${segment.text}
          @click=${this._copy}
        ></ha-icon-button
      ></span>`;
    });
  }

  private _openInside(ev: MouseEvent) {
    if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button !== 0) {
      return;
    }
    ev.preventDefault();
    const url = new URL(
      (ev.currentTarget as HTMLAnchorElement).href,
      location.origin
    );
    navigate(`${url.pathname}${url.search}${url.hash}`);
  }

  private async _copy(ev: Event) {
    const address = (ev.currentTarget as HTMLElement).dataset.address;
    if (!address) {
      return;
    }
    await copyToClipboard(address);
    showToast(this, {
      message: this.hass.localize("ui.common.copied_clipboard"),
    });
  }

  private _edit() {
    this._draft = this._text;
    this._editing = true;
    this.updateComplete.then(() => {
      this._textarea?.focus();
    });
  }

  private _cancel() {
    this._editing = false;
  }

  private _draftChanged(ev: Event) {
    this._draft = (ev.target as HaTextArea).value ?? "";
  }

  private async _save() {
    this._saving = true;
    try {
      this._notes = await saveRegistryNote(
        this.hass.connection,
        this.kind,
        this.targetId,
        this._draft
      );
      this._editing = false;
    } catch (_err) {
      showToast(this, {
        message: this.hass.localize(
          "ui.panel.config.registry_notes.save_failed"
        ),
      });
    } finally {
      this._saving = false;
    }
  }

  static styles = css`
    :host {
      display: block;
    }
    .note {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      padding: var(--ha-space-3, 12px) var(--ha-space-4, 16px);
      border-radius: var(--ha-border-radius-lg, 12px);
      background: var(
        --ha-color-warning-container,
        var(--secondary-background-color)
      );
      color: var(--ha-color-on-warning-container, var(--primary-text-color));
    }
    .empty {
      margin: 0;
      color: var(--secondary-text-color);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--ha-space-2, 8px);
      margin-top: var(--ha-space-3, 12px);
    }
    .actions {
      align-items: center;
    }
    .tag {
      padding: 2px var(--ha-space-3, 12px);
      border-radius: 999px;
      font-size: var(--ha-font-size-s, 0.8125rem);
      background: var(
        --ha-color-tertiary-container,
        var(--secondary-background-color)
      );
      color: var(--ha-color-on-tertiary-container, var(--primary-text-color));
    }
    .outside {
      display: inline-flex;
      align-items: center;
    }
    .address {
      font-family: var(--ha-font-family-code, monospace);
      font-size: 0.9em;
    }
    .outside ha-icon-button {
      --ha-icon-button-size: 32px;
      margin-inline-start: 2px;
    }
    a {
      color: var(--primary-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-registry-notes-card": HaRegistryNotesCard;
  }
}
