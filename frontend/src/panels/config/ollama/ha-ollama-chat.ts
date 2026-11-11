import type { Connection } from "home-assistant-js-websocket";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-textarea";
import type { OllamaChatEvent } from "../../../data/ollama_suite";
import {
  chatWithOllamaModel,
  OLLAMA_CHAT_MAX_PROMPT,
} from "../../../data/ollama_suite";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";

type ChatState = "idle" | "running" | "done" | "stopped" | "error";

/**
 * A minimal test chat with one model on one server. The conversation is not
 * kept anywhere and the model is given no tools, so it cannot touch the home.
 * The reply is shown as plain text, never as markup.
 */
@customElement("ha-ollama-chat")
class HaOllamaChat extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public entryId?: string;

  @property() public model?: string;

  @state() private _prompt = "";

  @state() private _reply = "";

  @state() private _state: ChatState = "idle";

  @state() private _code?: string;

  @state() private _truncated = false;

  @state() private _speed?: number | null;

  private _stop?: () => Promise<void>;

  private _connection?: Connection;

  private _run = 0;

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._connection?.removeEventListener("disconnected", this._connectionLost);
    this._connection = undefined;
    this._release();
  }

  protected willUpdate(changed: Map<string, unknown>): void {
    if (
      (changed.has("model") && changed.get("model") !== undefined) ||
      (changed.has("entryId") && changed.get("entryId") !== undefined)
    ) {
      this._clear();
    }
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.ollama.chat.${key}` as any,
      values
    );
  }

  private _errorText(code?: string): string {
    if (code === "incomplete") {
      return this._l("incomplete");
    }
    return (
      this.hass.localize(
        `ui.panel.config.ollama.errors.${code ?? "unknown"}` as any
      ) || this.hass.localize("ui.panel.config.ollama.errors.unknown")
    );
  }

  private _release(): void {
    this._run++;
    const stop = this._stop;
    this._stop = undefined;
    stop?.().catch(() => undefined);
  }

  private _connectionLost = (): void => {
    if (this._state === "running") {
      this._release();
      this._state = "error";
      this._code = "cannot_connect";
    }
  };

  private _watchConnection(): void {
    const connection = this.hass.connection;
    if (this._connection === connection) {
      return;
    }
    this._connection?.removeEventListener("disconnected", this._connectionLost);
    this._connection = connection;
    connection.addEventListener("disconnected", this._connectionLost);
  }

  private _promptChanged(ev: Event): void {
    this._prompt = (ev.target as HTMLTextAreaElement).value ?? "";
  }

  private _keydown(ev: KeyboardEvent): void {
    if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      this._send();
    }
  }

  private _canSend(): boolean {
    return (
      !!this.entryId &&
      !!this.model &&
      this._state !== "running" &&
      this._prompt.trim() !== "" &&
      this._prompt.length <= OLLAMA_CHAT_MAX_PROMPT
    );
  }

  private async _send(): Promise<void> {
    if (!this._canSend()) {
      return;
    }
    this._release();
    const run = this._run;
    this._reply = "";
    this._code = undefined;
    this._truncated = false;
    this._speed = undefined;
    this._state = "running";
    this._watchConnection();
    try {
      const stop = await chatWithOllamaModel(
        this.hass,
        this.entryId!,
        this.model!,
        this._prompt,
        (event) => this._onEvent(run, event)
      );
      if (run !== this._run) {
        stop().catch(() => undefined);
        return;
      }
      this._stop = stop;
    } catch (err: any) {
      if (run === this._run) {
        this._state = "error";
        this._code = typeof err?.code === "string" ? err.code : "unknown";
      }
    }
  }

  private _onEvent(run: number, event: OllamaChatEvent): void {
    if (run !== this._run) {
      return;
    }
    if (event.state === "text") {
      this._reply += event.text ?? "";
      return;
    }
    const stop = this._stop;
    this._stop = undefined;
    stop?.().catch(() => undefined);
    if (event.state === "done") {
      this._state = "done";
      this._truncated = !!event.truncated;
      this._speed = event.tokens_per_second;
    } else {
      this._state = "error";
      this._code = event.code ?? "unknown";
    }
  }

  private _stopClicked(): void {
    this._release();
    this._state = "stopped";
  }

  private _clear(): void {
    this._release();
    this._reply = "";
    this._prompt = "";
    this._code = undefined;
    this._truncated = false;
    this._speed = undefined;
    this._state = "idle";
  }

  protected render(): TemplateResult {
    const running = this._state === "running";
    return html`<section class="chat" aria-label=${this._l("title")}>
      <h3>${this._l("title")}</h3>
      <p class="note">${this._l("note")}</p>
      <ha-textarea
        .label=${this._l("prompt_label")}
        .value=${this._prompt}
        .rows=${3}
        .maxlength=${OLLAMA_CHAT_MAX_PROMPT}
        .disabled=${running}
        resize="vertical"
        @input=${this._promptChanged}
        @keydown=${this._keydown}
      ></ha-textarea>
      <div class="actions">
        ${
          running
            ? html`<ha-button variant="danger" @click=${this._stopClicked}>
                ${this._l("stop")}
              </ha-button>`
            : html`<ha-button
                .disabled=${!this._canSend()}
                @click=${this._send}
              >
                ${this._l("send")}
              </ha-button>`
        }
        <ha-button
          appearance="plain"
          .disabled=${this._state === "idle" && !this._prompt}
          @click=${this._clear}
        >
          ${this._l("clear")}
        </ha-button>
      </div>
      <p class="status" role="status">${this._statusText()}</p>
      ${
        this._state === "error"
          ? html`<ha-alert alert-type="error"
              >${this._errorText(this._code)}</ha-alert
            >`
          : nothing
      }
      ${
        this._reply
          ? html`<div
              class="reply"
              role="region"
              aria-label=${this._l("reply")}
              .textContent=${this._reply}
            ></div>`
          : nothing
      }
    </section>`;
  }

  private _statusText(): string {
    switch (this._state) {
      case "running":
        return this._reply ? this._l("replying") : this._l("waiting");
      case "stopped":
        return this._l("stopped");
      case "done": {
        const parts = [this._l("done")];
        if (this._truncated) {
          parts.push(this._l("truncated"));
        }
        if (this._speed) {
          parts.push(this._l("speed", { speed: this._speed }));
        }
        return parts.join(" ");
      }
      default:
        return "";
    }
  }

  static styles = [
    haStyle,
    css`
      :host {
        display: block;
      }
      h3 {
        font-size: var(--ha-font-size-m);
        margin: var(--ha-space-3) 0 var(--ha-space-1);
      }
      .note,
      .status {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
        margin: var(--ha-space-1) 0 var(--ha-space-2);
        overflow-wrap: anywhere;
      }
      ha-textarea {
        display: block;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
        margin-top: var(--ha-space-2);
      }
      .actions ha-button {
        min-height: 44px;
      }
      .reply {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        margin: var(--ha-space-2) 0 0;
        padding: var(--ha-space-3);
        border-radius: var(--ha-border-radius-lg, 12px);
        background: var(--secondary-background-color);
        font: inherit;
        max-height: 50vh;
        overflow: auto;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-ollama-chat": HaOllamaChat;
  }
}
