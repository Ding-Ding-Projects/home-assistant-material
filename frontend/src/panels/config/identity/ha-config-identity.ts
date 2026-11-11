import { mdiUpload } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import type {
  Identity,
  IdentityLogo,
  LogoAccent,
  LogoFit,
  LogoMark,
} from "../../../common/identity/identity";
import {
  cropRect,
  isAcceptableLogoUrl,
  isAllowedImageType,
  LOGO_ACCENTS,
  LOGO_MARKS,
  LOGO_MAX_BYTES,
  LOGO_SIZE,
  LOGO_SOURCE_MAX_BYTES,
  NAME_MAX_LENGTH,
  normalizeName,
  PRODUCT_NAME,
  readIdentity,
  SHORT_NAME_MAX_LENGTH,
  tabTitleSuffix,
  writeIdentity,
} from "../../../common/identity/identity";
import "../../../components/ha-button";
import "../../../components/ha-svg-icon";
import "../../../components/input/ha-input";
import "../../../layouts/hass-subpage";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { showToast } from "../../../util/toast";
import { MARK_PATHS } from "./ha-identity-logo";

type LogoChoice =
  { kind: "mark"; mark: LogoMark } | { kind: "saved" } | { kind: "picked" };

interface PickedPicture {
  url: string;
  width: number;
  height: number;
  fileName: string;
  element: HTMLImageElement;
}

type PictureError = "type" | "too_large" | "unreadable" | "too_big_after";

const ACCENT_STYLE: Record<LogoAccent, string> = {
  tonal:
    "color-mix(in srgb, var(--primary-color) 22%, var(--card-background-color))",
  white: "#ffffff",
  outline: "var(--card-background-color)",
};

/**
 * Name and logo: what this app is called and looks like in this browser.
 * Saved here only. The product's own name stays in About and in every file,
 * update and diagnostic.
 */
@customElement("ha-config-identity")
class HaConfigIdentity extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() private _saved: Identity = {};

  @state() private _name = "";

  @state() private _shortName = "";

  @state() private _choice: LogoChoice = { kind: "mark", mark: "heart" };

  @state() private _accent: LogoAccent = "tonal";

  @state() private _fit: LogoFit = "fill";

  @state() private _focus = { x: 0.5, y: 0.5 };

  @state() private _picture?: PickedPicture;

  @state() private _pictureError?: PictureError;

  @state() private _dragging = false;

  @query("#file") private _file?: HTMLInputElement;

  protected firstUpdated(): void {
    this._saved = readIdentity();
    this._name = this._saved.name ?? "";
    this._shortName = this._saved.shortName ?? "";
    this._accent = this._saved.accent ?? "tonal";
    this._choice = this._choiceFromSaved(this._saved);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._forgetPicture();
  }

  private _choiceFromSaved(identity: Identity): LogoChoice {
    if (identity.logo?.kind === "image") {
      return { kind: "saved" };
    }
    return identity.logo?.kind === "mark"
      ? { kind: "mark", mark: identity.logo.mark }
      : { kind: "mark", mark: "heart" };
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(`ui.panel.config.identity.${key}` as any, values);
  }

  private _forgetPicture(): void {
    if (this._picture) {
      URL.revokeObjectURL(this._picture.url);
      this._picture = undefined;
    }
  }

  /** The picture drawn on a square canvas, as a data URL within the limit. */
  private _renderPicture(): string | undefined {
    const picture = this._picture;
    if (!picture) {
      return undefined;
    }
    for (const size of [LOGO_SIZE, 128, 96]) {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) {
        return undefined;
      }
      if (this._accent === "white") {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, size, size);
      }
      const rect = cropRect(
        picture.width,
        picture.height,
        this._fit,
        this._focus,
        size
      );
      context.drawImage(
        picture.element,
        rect.sx,
        rect.sy,
        rect.sw,
        rect.sh,
        rect.dx,
        rect.dy,
        rect.dw,
        rect.dh
      );
      for (const type of ["image/png", "image/webp"]) {
        const url = canvas.toDataURL(type, 0.85);
        if (url.startsWith(`data:${type}`) && isAcceptableLogoUrl(url)) {
          return url;
        }
      }
    }
    return undefined;
  }

  private _draftLogo(): IdentityLogo | undefined {
    const choice = this._choice;
    if (choice.kind === "mark") {
      return { kind: "mark", mark: choice.mark };
    }
    if (choice.kind === "saved") {
      return this._saved.logo;
    }
    const url = this._renderPicture();
    return url ? { kind: "image", dataUrl: url } : undefined;
  }

  private _draft(): Identity {
    return {
      name: normalizeName(this._name) || undefined,
      shortName:
        normalizeName(this._shortName, SHORT_NAME_MAX_LENGTH) || undefined,
      logo: this._draftLogo(),
      accent: this._accent,
    };
  }

  private _nameDirty(): boolean {
    return (
      normalizeName(this._name) !== (this._saved.name ?? "") ||
      normalizeName(this._shortName, SHORT_NAME_MAX_LENGTH) !==
        (this._saved.shortName ?? "")
    );
  }

  protected render(): TemplateResult {
    const draft = this._draft();
    const count = Array.from(this._name).length;
    const shownName = draft.name || PRODUCT_NAME;
    const version = __MATERIAL_BUILD__ || this.hass.connection.haVersion;
    const hasPicture = Boolean(this._picture);
    const logoChanged =
      JSON.stringify(draft.logo ?? null) !==
        JSON.stringify(this._saved.logo ?? null) ||
      (draft.accent ?? "tonal") !== (this._saved.accent ?? "tonal");
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config/personal"
        .header=${this._l("caption")}
        .breadcrumb=${`${this.hass.localize("panel.config")}, ${this.hass.localize(
          "ui.panel.config.personal.caption"
        )}`}
      >
        <div class="content">
          <p class="intro">${this._l("intro")}</p>
          <div class="columns">
            <section class="card" aria-labelledby="name-title">
              <h2 id="name-title">${this._l("name_title")}</h2>
              <p class="help">${this._l("name_help")}</p>
              <ha-input
                .label=${this._l("name_label")}
                .value=${this._name}
                .placeholder=${PRODUCT_NAME}
                @input=${this._nameInput}
              ></ha-input>
              <span class="counter" aria-live="polite"
                >${this._l("name_count", { count, max: NAME_MAX_LENGTH })}</span
              >
              <ha-input
                .label=${this._l("short_label")}
                .value=${this._shortName}
                .hint=${this._l("short_help", { max: SHORT_NAME_MAX_LENGTH })}
                @input=${this._shortInput}
              ></ha-input>
              <div class="actions">
                <ha-button
                  @click=${this._saveName}
                  .disabled=${!this._nameDirty()}
                  >${this._l("save_name")}</ha-button
                >
                <ha-button
                  appearance="plain"
                  @click=${this._resetName}
                  .disabled=${!this._saved.name && !this._saved.shortName && !this._name && !this._shortName}
                  >${this._l("reset_name", { product: PRODUCT_NAME })}</ha-button
                >
              </div>
              <div
                class="preview"
                role="group"
                aria-label=${this._l("preview")}
              >
                <span class="label">${this._l("preview")}</span>
                <div class="row">
                  <span class="caption">${this._l("preview_rail")}</span>
                  <span class="rail">
                    <ha-identity-logo
                      .identity=${draft}
                      style="--identity-logo-size: 32px"
                    ></ha-identity-logo>
                    <strong>${shownName}</strong>
                  </span>
                </div>
                <div class="row">
                  <span class="caption">${this._l("preview_tab")}</span>
                  <span class="tab"
                    >${this._l("preview_tab_page")} –
                    ${draft.name || "Home Assistant"}</span
                  >
                </div>
                <div class="row">
                  <span class="caption">${this._l("preview_about")}</span>
                  <span class="about">
                    <ha-identity-logo
                      .identity=${draft}
                      style="--identity-logo-size: 48px"
                    ></ha-identity-logo>
                    <span>
                      <strong>${shownName}</strong>
                      ${
                        draft.name
                          ? html`<small
                              >${this._l("shown_as", {
                                product: PRODUCT_NAME,
                                name: draft.name,
                              })}</small
                            >`
                          : nothing
                      }
                      <small>${this._l("version", { version })}</small>
                    </span>
                  </span>
                </div>
              </div>
              <p class="note">${this._l("scope_note")}</p>
              <p class="note">${this._l("keeps_note")}</p>
            </section>

            <section class="card" aria-labelledby="logo-title">
              <div class="logo-head">
                <h2 id="logo-title">${this._l("logo_title")}</h2>
                <ha-button
                  appearance="filled"
                  size="s"
                  @click=${this._pickFile}
                >
                  <ha-svg-icon slot="start" .path=${mdiUpload}></ha-svg-icon>
                  ${this._l("upload")}
                </ha-button>
                <input
                  id="file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  @change=${this._fileChosen}
                />
              </div>
              <div
                class="marks"
                role="radiogroup"
                aria-label=${this._l("marks_label")}
              >
                ${LOGO_MARKS.map(
                  (mark) => html`
                    <button
                      type="button"
                      role="radio"
                      class=${classMap({
                        mark: true,
                        on:
                          this._choice.kind === "mark" &&
                          this._choice.mark === mark,
                      })}
                      aria-checked=${
                        this._choice.kind === "mark" &&
                        this._choice.mark === mark
                          ? "true"
                          : "false"
                      }
                      aria-label=${this._l(`mark_${mark}`)}
                      data-mark=${mark}
                      @click=${this._pickMark}
                    >
                      <ha-svg-icon .path=${MARK_PATHS[mark]}></ha-svg-icon>
                    </button>
                  `
                )}
                ${
                  this._saved.logo?.kind === "image"
                    ? html`<button
                        type="button"
                        role="radio"
                        class=${classMap({
                          mark: true,
                          on: this._choice.kind === "saved",
                        })}
                        aria-checked=${this._choice.kind === "saved" ? "true" : "false"}
                        aria-label=${this._l("current_picture")}
                        @click=${this._pickSaved}
                      >
                        <img src=${this._saved.logo.dataUrl} alt="" />
                      </button>`
                    : nothing
                }
              </div>
              <div
                class=${classMap({ drop: true, over: this._dragging })}
                @dragenter=${this._dragOver}
                @dragover=${this._dragOver}
                @dragleave=${this._dragLeave}
                @drop=${this._drop}
              >
                ${
                  hasPicture
                    ? this._renderCropper()
                    : html`<p>${this._l("drop_hint")}</p>
                        <p class="small">
                          ${this._l("picture_rules", {
                            size: Math.round(LOGO_MAX_BYTES / 1024),
                          })}
                        </p>`
                }
                ${
                  this._pictureError
                    ? html`<p class="error" role="alert">
                        ${this._l(`error_${this._pictureError}`, {
                          size: Math.round(LOGO_MAX_BYTES / 1024),
                        })}
                      </p>`
                    : nothing
                }
              </div>
              <div class="options">
                <div role="group" aria-label=${this._l("fit")}>
                  <span class="label">${this._l("fit")}</span>
                  <div class="segments">
                    ${(["fill", "inside"] as const).map(
                      (fit) =>
                        html`<button
                          type="button"
                          class=${classMap({ segment: true, on: this._fit === fit })}
                          aria-pressed=${this._fit === fit ? "true" : "false"}
                          .disabled=${!hasPicture}
                          data-fit=${fit}
                          @click=${this._pickFit}
                        >
                          ${this._l(`fit_${fit}`)}
                        </button>`
                    )}
                  </div>
                </div>
                <div role="radiogroup" aria-label=${this._l("background")}>
                  <span class="label">${this._l("background")}</span>
                  <div class="swatches">
                    ${LOGO_ACCENTS.map(
                      (accent) =>
                        html`<button
                          type="button"
                          role="radio"
                          class=${classMap({ swatch: true, on: this._accent === accent })}
                          style=${styleMap({ background: ACCENT_STYLE[accent] })}
                          aria-checked=${this._accent === accent ? "true" : "false"}
                          aria-label=${this._l(`accent_${accent}`)}
                          data-accent=${accent}
                          @click=${this._pickAccent}
                        ></button>`
                    )}
                  </div>
                </div>
              </div>
              <div class="actions end">
                <ha-button
                  appearance="plain"
                  @click=${this._resetLogo}
                  .disabled=${!this._saved.logo && !this._saved.accent && !hasPicture}
                  >${this._l("reset_logo")}</ha-button
                >
                <ha-button
                  @click=${this._useLogo}
                  .disabled=${!logoChanged || (this._choice.kind === "picked" && !draft.logo)}
                  >${this._l("use_logo")}</ha-button
                >
              </div>
              <p class="note">${this._l("checked_note")}</p>
            </section>
          </div>
        </div>
      </hass-subpage>
    `;
  }

  private _renderCropper(): TemplateResult {
    const picture = this._picture!;
    const rect = cropRect(
      picture.width,
      picture.height,
      "fill",
      this._focus,
      LOGO_SIZE
    );
    const frame =
      this._fit === "fill"
        ? styleMap({
            left: `${(rect.sx / picture.width) * 100}%`,
            top: `${(rect.sy / picture.height) * 100}%`,
            width: `${(rect.sw / picture.width) * 100}%`,
            height: `${(rect.sh / picture.height) * 100}%`,
          })
        : styleMap({ inset: "0" });
    return html`
      <p class="small file-name">
        ${this._l("picture_info", {
          name: picture.fileName,
          width: picture.width,
          height: picture.height,
        })}
      </p>
      <div
        class="cropper"
        style=${styleMap({ aspectRatio: `${picture.width} / ${picture.height}` })}
        @pointerdown=${this._cropDown}
        @pointermove=${this._cropMove}
      >
        <img src=${picture.url} alt="" draggable="false" />
        <span class="frame" style=${frame}></span>
        <button
          type="button"
          class="dot"
          style=${styleMap({
            left: `${this._focus.x * 100}%`,
            top: `${this._focus.y * 100}%`,
          })}
          aria-label=${this._l("focus_label")}
          .disabled=${this._fit !== "fill"}
          @keydown=${this._cropKey}
        ></button>
      </div>
      <p class="small">${this._l("focus_help")}</p>
    `;
  }

  private _nameInput(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const value = Array.from(input.value ?? "")
      .slice(0, NAME_MAX_LENGTH)
      .join("");
    if (value !== input.value) {
      input.value = value;
    }
    this._name = value;
  }

  private _shortInput(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const value = Array.from(input.value ?? "")
      .slice(0, SHORT_NAME_MAX_LENGTH)
      .join("");
    if (value !== input.value) {
      input.value = value;
    }
    this._shortName = value;
  }

  private _updateTitle(previous: string): void {
    const next = tabTitleSuffix();
    const old = ` – ${previous}`;
    if (document.title.endsWith(old)) {
      document.title = `${document.title.slice(0, -old.length)} – ${next}`;
    }
  }

  private _commit(change: Identity, message: string): void {
    const previous = tabTitleSuffix();
    const next: Identity = { ...this._saved, ...change };
    if (!writeIdentity(next)) {
      showToast(this, { message: this._l("not_saved") });
      return;
    }
    this._saved = readIdentity();
    this._updateTitle(previous);
    showToast(this, { message });
  }

  private _saveName(): void {
    this._commit(
      {
        name: normalizeName(this._name) || undefined,
        shortName:
          normalizeName(this._shortName, SHORT_NAME_MAX_LENGTH) || undefined,
      },
      this._l("name_saved")
    );
    this._name = this._saved.name ?? "";
    this._shortName = this._saved.shortName ?? "";
  }

  private _resetName(): void {
    this._commit(
      { name: undefined, shortName: undefined },
      this._l("name_reset")
    );
    this._name = "";
    this._shortName = "";
  }

  private _useLogo(): void {
    const logo = this._draftLogo();
    if (!logo) {
      this._pictureError = "too_big_after";
      return;
    }
    this._commit({ logo, accent: this._accent }, this._l("logo_saved"));
    this._forgetPicture();
    this._choice = this._choiceFromSaved(this._saved);
  }

  private _resetLogo(): void {
    this._commit({ logo: undefined, accent: undefined }, this._l("logo_reset"));
    this._forgetPicture();
    this._pictureError = undefined;
    this._accent = "tonal";
    this._choice = { kind: "mark", mark: "heart" };
  }

  private _pickMark(ev: Event): void {
    this._choice = {
      kind: "mark",
      mark: (ev.currentTarget as HTMLElement).dataset.mark as LogoMark,
    };
  }

  private _pickSaved(): void {
    this._choice = { kind: "saved" };
  }

  private _pickFit(ev: Event): void {
    this._fit = (ev.currentTarget as HTMLElement).dataset.fit as LogoFit;
  }

  private _pickAccent(ev: Event): void {
    this._accent = (ev.currentTarget as HTMLElement).dataset
      .accent as LogoAccent;
  }

  private _pickFile(): void {
    this._file?.click();
  }

  private _fileChosen(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) {
      this._loadFile(file);
    }
  }

  private _dragOver(ev: DragEvent): void {
    if (ev.dataTransfer?.types.includes("Files")) {
      // Taken here, so the window-wide import does not also take it.
      ev.preventDefault();
      ev.stopPropagation();
      this._dragging = true;
    }
  }

  private _dragLeave(): void {
    this._dragging = false;
  }

  private _drop(ev: DragEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this._dragging = false;
    const file = ev.dataTransfer?.files?.[0];
    if (file) {
      this._loadFile(file);
    }
  }

  private _loadFile(file: File): void {
    this._pictureError = undefined;
    if (!isAllowedImageType(file.type)) {
      this._pictureError = "type";
      return;
    }
    if (file.size > LOGO_SOURCE_MAX_BYTES) {
      this._pictureError = "too_large";
      return;
    }
    const url = URL.createObjectURL(file);
    const element = new Image();
    element.onload = () => {
      this._forgetPicture();
      this._picture = {
        url,
        width: element.naturalWidth,
        height: element.naturalHeight,
        fileName: file.name,
        element,
      };
      this._focus = { x: 0.5, y: 0.5 };
      this._choice = { kind: "picked" };
      if (!element.naturalWidth || !element.naturalHeight) {
        this._forgetPicture();
        this._pictureError = "unreadable";
        this._choice = this._choiceFromSaved(this._saved);
      } else if (!this._renderPicture()) {
        this._pictureError = "too_big_after";
      }
    };
    element.onerror = () => {
      URL.revokeObjectURL(url);
      this._pictureError = "unreadable";
    };
    element.src = url;
  }

  private _focusFromPointer(ev: PointerEvent): void {
    if (this._fit !== "fill") {
      return;
    }
    const box = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    if (!box.width || !box.height) {
      return;
    }
    this._focus = {
      x: Math.min(1, Math.max(0, (ev.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (ev.clientY - box.top) / box.height)),
    };
  }

  private _cropDown(ev: PointerEvent): void {
    (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
    this._focusFromPointer(ev);
  }

  private _cropMove(ev: PointerEvent): void {
    if ((ev.currentTarget as HTMLElement).hasPointerCapture?.(ev.pointerId)) {
      this._focusFromPointer(ev);
    }
  }

  private _cropKey(ev: KeyboardEvent): void {
    const step = ev.shiftKey ? 0.1 : 0.02;
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = move[ev.key];
    if (!delta) {
      return;
    }
    ev.preventDefault();
    this._focus = {
      x: Math.min(1, Math.max(0, this._focus.x + delta[0])),
      y: Math.min(1, Math.max(0, this._focus.y + delta[1])),
    };
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .content {
          box-sizing: border-box;
          max-width: 1100px;
          margin: 0 auto;
          padding: var(--ha-space-4) var(--ha-space-8) var(--ha-space-8);
        }
        :host([narrow]) .content {
          padding: var(--ha-space-2) var(--ha-space-3) var(--ha-space-6);
        }
        .intro {
          margin: 0 0 var(--ha-space-4);
          color: var(--secondary-text-color);
        }
        .columns {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--ha-space-4);
          align-items: start;
        }
        :host([narrow]) .columns {
          grid-template-columns: minmax(0, 1fr);
        }
        .card {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
          padding: var(--ha-space-6);
          border-radius: var(--ha-border-radius-3xl);
          background: var(--card-background-color);
          min-width: 0;
        }
        h2 {
          margin: 0;
          font-family: var(--ha-font-family-heading, inherit);
          font-size: var(--ha-font-size-2xl);
          font-weight: var(--ha-font-weight-medium);
        }
        .help,
        .note,
        .small,
        .caption {
          margin: 0;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .counter {
          align-self: flex-end;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2);
        }
        .actions.end {
          justify-content: flex-end;
        }
        .preview {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
          padding: var(--ha-space-4);
          border-radius: var(--ha-border-radius-xl);
          background: var(--primary-background-color);
        }
        .label {
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-medium);
          color: var(--secondary-text-color);
        }
        .row {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
        }
        .rail,
        .about {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          min-width: 0;
        }
        .about span:last-child {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        small {
          color: var(--secondary-text-color);
        }
        strong,
        .tab {
          overflow-wrap: anywhere;
        }
        .logo-head {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: var(--ha-space-2);
        }
        .marks {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-3);
        }
        .mark {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 56px;
          height: 56px;
          overflow: hidden;
          padding: 0;
          border: 2px solid transparent;
          border-radius: var(--ha-border-radius-xl);
          background: var(--primary-background-color);
          color: var(--primary-text-color);
          cursor: pointer;
          --mdc-icon-size: 30px;
        }
        .mark.on {
          border-color: var(--primary-color);
          background: color-mix(
            in srgb,
            var(--primary-color) 18%,
            var(--card-background-color)
          );
        }
        .mark img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .drop {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
          padding: var(--ha-space-4);
          border: 2px dashed var(--outline-color);
          border-radius: var(--ha-border-radius-xl);
          text-align: center;
        }
        .drop p {
          margin: 0;
        }
        .drop.over {
          border-color: var(--primary-color);
          background: color-mix(
            in srgb,
            var(--primary-color) 10%,
            var(--card-background-color)
          );
        }
        .error {
          color: var(--error-color);
          font-size: var(--ha-font-size-s);
        }
        .file-name {
          overflow-wrap: anywhere;
        }
        .cropper {
          position: relative;
          align-self: center;
          width: 100%;
          max-width: 280px;
          max-height: 260px;
          touch-action: none;
          cursor: crosshair;
          border-radius: var(--ha-border-radius-lg);
          overflow: hidden;
          background: var(--secondary-background-color);
        }
        .cropper img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          user-select: none;
        }
        .frame {
          position: absolute;
          border: 2px solid var(--primary-color);
          box-shadow: 0 0 0 100vmax rgb(0 0 0 / 35%);
          pointer-events: none;
        }
        .dot {
          position: absolute;
          width: 44px;
          height: 44px;
          margin: -22px 0 0 -22px;
          padding: 0;
          border: 0;
          background: none;
          cursor: grab;
        }
        .dot::after {
          content: "";
          position: absolute;
          inset: 12px;
          border: 3px solid var(--primary-color);
          border-radius: 50%;
          background: #fff;
        }
        .dot:disabled {
          opacity: 0.4;
        }
        .options {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-6);
        }
        .segments,
        .swatches {
          display: flex;
          gap: var(--ha-space-2);
          margin-top: var(--ha-space-2);
        }
        .segment {
          min-height: 44px;
          padding: 0 var(--ha-space-4);
          border: 1px solid var(--outline-color);
          border-radius: var(--ha-border-radius-lg);
          background: none;
          color: inherit;
          font: inherit;
          cursor: pointer;
        }
        .segment.on {
          border-color: transparent;
          background: color-mix(
            in srgb,
            var(--primary-color) 22%,
            var(--card-background-color)
          );
        }
        .segment:disabled {
          opacity: 0.5;
          cursor: default;
        }
        .swatch {
          width: 44px;
          height: 44px;
          padding: 0;
          border: 2px solid var(--outline-color);
          border-radius: 50%;
          cursor: pointer;
        }
        .swatch.on {
          border-color: var(--primary-color);
          box-shadow: 0 0 0 2px var(--primary-color);
        }
        button:focus-visible {
          outline: 3px solid var(--primary-color);
          outline-offset: 2px;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-identity": HaConfigIdentity;
  }
}
