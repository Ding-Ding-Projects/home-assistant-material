import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import "../../../components/ha-button";
import "../../../components/ha-card";
import { fetchHassioAddonsInfo } from "../../../data/hassio/addon";
import { fetchIngressAppInfo } from "../../../data/hassio/ingress";
import type { HomeAssistant } from "../../../types";

const editorSlugs = ["core_configurator", "a0d7b954_vscode"];

@customElement("ha-editor-handoff")
export class HaEditorHandoff extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _loading = false;
  @state() private _results?: {
    slug: string;
    name: string;
    version: string | null;
  }[];
  @state() private _unavailable = false;
  @state() private _fileName = "";
  @state() private _draft = "";
  private _original = "";
  @state() private _fileError = false;
  private _request = 0;
  private _fileRequest = 0;

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._request++;
    this._fileRequest++;
    this._loading = false;
    this._results = undefined;
    this._unavailable = false;
  }

  private async _openFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const request = ++this._fileRequest;
    try {
      if (file.size > 1024 * 1024) throw new RangeError();
      const content = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer()
      );
      if (content.includes("\u0000")) throw new TypeError();
      if (request !== this._fileRequest) return;
      if (
        this._draft !== this._original &&
        !window.confirm(
          this.hass.localize("ui.panel.config.editor_handoff.replace")
        )
      )
        return;
      this._draft = content;
      this._original = content;
      this._fileName = file.name;
      this._fileError = false;
    } catch {
      if (request === this._fileRequest) this._fileError = true;
    }
  }

  private _save() {
    const url = URL.createObjectURL(
      new Blob([this._draft], { type: "text/plain;charset=utf-8" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = this._fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private async _find() {
    const request = ++this._request;
    this._loading = true;
    this._unavailable = false;
    this._results = undefined;
    try {
      const { addons } = await fetchHassioAddonsInfo(this.hass);
      if (request !== this._request) return;
      const installed = editorSlugs.filter((slug) =>
        addons.some((app) => app.slug === slug && app.state === "started")
      );
      const responses = await Promise.allSettled(
        installed.map((slug) => fetchIngressAppInfo(this.hass, slug))
      );
      if (request !== this._request) return;
      this._unavailable = responses.some(
        (result) => result.status === "rejected"
      );
      this._results = responses.flatMap((result, index) => {
        if (result.status !== "fulfilled") return [];
        const {
          slug,
          name,
          state: status,
          version,
          ingress_url,
        } = result.value;
        return slug === installed[index] && status === "started" && ingress_url
          ? [{ slug, name, version }]
          : [];
      });
    } catch {
      if (request === this._request) this._unavailable = true;
    } finally {
      if (request === this._request) this._loading = false;
    }
  }

  protected render() {
    const l = (key: string) =>
      this.hass.localize(`ui.panel.config.editor_handoff.${key}`);
    const supported = isComponentLoaded(this.hass.config, "hassio");
    return html`<ha-card
      ><div class="card-content">
        <h2>${l("title")}</h2>
        <p>${l(supported ? "intro" : "unsupported")}</p>
        ${supported ? html`<ha-button @click=${this._find} .disabled=${this._loading}>${l("find")}</ha-button>` : nothing}
        <div role="status" aria-live="polite">
          ${this._loading ? l("checking") : nothing}
          ${this._unavailable ? l("unavailable") : nothing}
          ${this._results?.length === 0 && !this._unavailable ? l("empty") : nothing}
        </div>
        ${this._results?.map(({ slug, name, version }) => html`<a href=${`/app/${slug}`}>${name} ${version ?? ""}</a>`)}
        <label
          >${l("local")} <input type="file" @change=${this._openFile}
        /></label>
        ${this._fileError ? html`<p role="alert">${l("file_error")}</p>` : nothing}
        ${
          this._fileName
            ? html`<label
                  >${this._fileName} · ${l("draft")}
                  <textarea
                    .value=${this._draft}
                    @input=${(ev: Event) => {
                      this._draft = (ev.target as HTMLTextAreaElement).value;
                    }}
                  ></textarea></label
                ><ha-button @click=${this._save}>${l("save")}</ha-button>`
            : nothing
        }
      </div></ha-card
    >`;
  }

  static styles = css`
    :host,
    ha-card,
    a,
    label,
    textarea {
      display: block;
    }
    label,
    textarea {
      margin-block: 12px;
    }
    textarea {
      box-sizing: border-box;
      width: 100%;
      min-height: 10em;
      font: inherit;
    }
    h2 {
      margin-block-start: 0;
      font: var(--ha-font-headline-small);
    }
    input {
      max-width: 100%;
    }
    a {
      color: var(--primary-color);
      padding-block: 12px;
    }
  `;
}
