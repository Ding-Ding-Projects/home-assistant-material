import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/input/ha-input";
import type { OllamaPullEvent } from "../../../data/ollama_suite";
import { isValidPullName, pullOllamaModel } from "../../../data/ollama_suite";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { bytesToString } from "../../../util/bytes-to-string";

type PullState = "running" | "done" | "error" | "cancelled";

interface PullRow {
  id: number;
  model: string;
  state: PullState;
  status: string;
  digest?: string | null;
  total?: number | null;
  completed?: number | null;
  /** Bytes per second over the last few seconds, from the numbers the server sent. */
  speed?: number;
  code?: string;
  samples: { t: number; completed: number }[];
}

/** Rows kept after they finish, so a result stays visible. */
const KEEP_ROWS = 5;

/** How long, in milliseconds, the speed is averaged over. */
const SPEED_WINDOW = 4000;

declare global {
  interface HASSDomEvents {
    "ollama-models-changed": undefined;
  }
}

@customElement("ha-ollama-pull")
class HaOllamaPull extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public entryId?: string;

  @state() private _name = "";

  @state() private _touched = false;

  @state() private _rows: PullRow[] = [];

  private _nextId = 1;

  private _cancel?: () => Promise<void>;

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    // The download only lives as long as this page: leaving it stops it.
    this._stopActive();
  }

  protected willUpdate(changed: Map<string, unknown>): void {
    if (changed.has("entryId") && changed.get("entryId") !== undefined) {
      this._stopActive();
      this._rows = [];
    }
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.ollama.pull.${key}` as any,
      values
    );
  }

  private _errorText(code?: string): string {
    return (
      this.hass.localize(
        `ui.panel.config.ollama.errors.${code ?? "unknown"}` as any
      ) || this.hass.localize("ui.panel.config.ollama.errors.unknown")
    );
  }

  private get _active(): PullRow | undefined {
    return this._rows.find((row) => row.state === "running");
  }

  private _stopActive(): void {
    const cancel = this._cancel;
    this._cancel = undefined;
    if (cancel) {
      cancel().catch(() => undefined);
    }
  }

  private _nameChanged(ev: Event): void {
    this._name = ((ev.target as HTMLInputElement).value ?? "").trim();
    this._touched = true;
  }

  private _keydown(ev: KeyboardEvent): void {
    if (ev.key === "Enter") {
      ev.preventDefault();
      this._start();
    }
  }

  private async _start(): Promise<void> {
    if (!this.entryId || this._active || !isValidPullName(this._name)) {
      this._touched = true;
      return;
    }
    const model = this._name;
    const row: PullRow = {
      id: this._nextId++,
      model,
      state: "running",
      status: "",
      samples: [],
    };
    this._rows = [row, ...this._rows].slice(0, KEEP_ROWS + 1);
    try {
      this._cancel = await pullOllamaModel(
        this.hass,
        this.entryId,
        model,
        (event) => this._onEvent(row.id, event)
      );
    } catch (err: any) {
      this._update(row.id, { state: "error", code: err?.code ?? "unknown" });
      return;
    }
    // The download may have ended before the subscription came back.
    if (this._rows.find((r) => r.id === row.id)?.state !== "running") {
      this._cancel = undefined;
    }
  }

  private _update(id: number, change: Partial<PullRow>): void {
    this._rows = this._rows.map((row) =>
      row.id === id ? { ...row, ...change } : row
    );
  }

  private _onEvent(id: number, event: OllamaPullEvent): void {
    const row = this._rows.find((r) => r.id === id);
    if (!row || row.state !== "running") {
      return;
    }
    if (event.state === "error") {
      this._cancel = undefined;
      this._update(id, { state: "error", code: event.code });
      return;
    }
    if (event.state === "done") {
      this._cancel = undefined;
      this._update(id, { state: "done", speed: undefined });
      fireEvent(this, "ollama-models-changed");
      return;
    }
    const now = Date.now();
    let samples = row.samples;
    // A new part starts a new count.
    if (event.digest !== row.digest) {
      samples = [];
    }
    let speed: number | undefined;
    if (typeof event.completed === "number") {
      samples = [...samples, { t: now, completed: event.completed }].filter(
        (sample) => now - sample.t <= SPEED_WINDOW
      );
      const first = samples[0];
      const last = samples[samples.length - 1];
      if (last.t - first.t >= 1000 && last.completed > first.completed) {
        speed =
          ((last.completed - first.completed) * 1000) / (last.t - first.t);
      }
    }
    this._update(id, {
      status: event.status ?? row.status,
      digest: event.digest,
      total: event.total,
      completed: event.completed,
      speed,
      samples,
    });
  }

  private async _cancelClicked(): Promise<void> {
    const active = this._active;
    const cancel = this._cancel;
    this._cancel = undefined;
    if (!active) {
      return;
    }
    this._update(active.id, { state: "cancelled", speed: undefined });
    if (cancel) {
      try {
        await cancel();
      } catch (_err) {
        // The connection may already be closed; the download stops with it.
      }
    }
  }

  private _dismiss(ev: Event): void {
    const id = Number((ev.currentTarget as HTMLElement).dataset.id);
    this._rows = this._rows.filter((row) => row.id !== id);
  }

  protected render(): TemplateResult {
    const invalid = !isValidPullName(this._name);
    const showInvalid = this._touched && this._name !== "" && invalid;
    const active = this._active;
    return html`<ha-card class="pull">
      <div class="card-content">
        <h2>${this._l("title")}</h2>
        <p class="note">${this._l("note")}</p>
        <div class="entry">
          <ha-input
            .label=${this._l("name_label")}
            .hint=${this._l("name_hint")}
            .value=${this._name}
            .validationMessage=${showInvalid ? this._l("name_invalid") : ""}
            ?invalid=${showInvalid}
            .disabled=${!this.entryId}
            autocapitalize="none"
            spellcheck="false"
            @input=${this._nameChanged}
            @keydown=${this._keydown}
          ></ha-input>
          <ha-button
            .disabled=${invalid || !!active || !this.entryId}
            @click=${this._start}
          >
            ${this._l("start")}
          </ha-button>
        </div>
        ${
          showInvalid
            ? html`<p class="invalid" role="alert">
                ${this._l("name_invalid")}
              </p>`
            : nothing
        }
        ${
          active
            ? html`<p class="note">${this._l("one_at_a_time")}</p>`
            : nothing
        }
        <ul class="rows" aria-live="polite">
          ${this._rows.map((row) => this._renderRow(row))}
        </ul>
      </div>
    </ha-card>`;
  }

  private _renderRow(row: PullRow): TemplateResult {
    const known = !!row.total && typeof row.completed === "number";
    const percent = known
      ? Math.min(100, Math.floor((row.completed! / row.total!) * 100))
      : 0;
    const remaining =
      known && row.speed
        ? (row.total! - row.completed!) / row.speed
        : undefined;
    return html`<li class="row">
      <div class="head">
        <span class="model">${row.model}</span>
        ${
          row.state === "running"
            ? html`<ha-button
                appearance="plain"
                variant="danger"
                @click=${this._cancelClicked}
              >
                ${this._l("cancel")}
              </ha-button>`
            : html`<ha-button
                appearance="plain"
                data-id=${row.id}
                @click=${this._dismiss}
              >
                ${this._l("dismiss")}
              </ha-button>`
        }
      </div>
      ${
        row.state === "running"
          ? html`<div
                class=${classMap({ bar: true, unknown: !known })}
                role="progressbar"
                aria-label=${this._l("progress_label", { model: row.model })}
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow=${known ? percent : nothing}
                aria-valuetext=${
                  known
                    ? this._l("part_progress", {
                        done: bytesToString(row.completed!, 1),
                        total: bytesToString(row.total!, 1),
                      })
                    : this._l("working")
                }
              >
                <span
                  class="fill"
                  style=${styleMap({ width: known ? `${percent}%` : "" })}
                ></span>
              </div>
              <p class="detail">
                ${row.status || this._l("working")}${
                  known
                    ? html` ·
                      ${this._l("part_progress", {
                        done: bytesToString(row.completed!, 1),
                        total: bytesToString(row.total!, 1),
                      })}
                      (${percent}%)`
                    : nothing
                }${
                  row.speed
                    ? html` ·
                      ${this._l("speed", {
                        speed: bytesToString(row.speed, 1),
                      })}`
                    : nothing
                }${
                  remaining !== undefined && isFinite(remaining)
                    ? html` ·
                      ${this._l("remaining", {
                        time: this._duration(remaining),
                      })}`
                    : nothing
                }
              </p>
              <p class="detail">${this._l("parts_note")}</p>`
          : row.state === "done"
            ? html`<p class="result ok" role="status">
                ${this._l("done", { model: row.model })}
              </p>`
            : row.state === "cancelled"
              ? html`<p class="result" role="status">
                  ${this._l("cancelled", { model: row.model })}
                </p>`
              : html`<ha-alert alert-type="error"
                  >${this._l("failed", { model: row.model })}
                  ${this._errorText(row.code)}</ha-alert
                >`
      }
    </li>`;
  }

  private _duration(seconds: number): string {
    const total = Math.max(1, Math.round(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hours) {
      return this._l("duration_hm", { hours, minutes });
    }
    if (minutes) {
      return this._l("duration_ms", { minutes, seconds: secs });
    }
    return this._l("duration_s", { seconds: secs });
  }

  static styles = [
    haStyle,
    css`
      :host {
        display: block;
      }
      h2 {
        font-size: var(--ha-font-size-l);
        margin: 0 0 var(--ha-space-2);
      }
      .note,
      .detail {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
        margin: var(--ha-space-1) 0;
        overflow-wrap: anywhere;
      }
      .entry {
        display: flex;
        align-items: flex-start;
        gap: var(--ha-space-2);
        flex-wrap: wrap;
      }
      .entry ha-input {
        flex: 1 1 220px;
        min-width: 0;
      }
      .entry ha-button {
        min-height: 44px;
        margin-top: var(--ha-space-1);
      }
      .invalid {
        color: var(--error-color);
        font-size: var(--ha-font-size-s);
        margin: var(--ha-space-1) 0;
      }
      .rows {
        list-style: none;
        margin: var(--ha-space-3) 0 0;
        padding: 0;
      }
      .row {
        padding: var(--ha-space-2) 0;
        border-top: 1px solid var(--divider-color);
      }
      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--ha-space-2);
        flex-wrap: wrap;
      }
      .head ha-button {
        min-height: 44px;
      }
      .model {
        font-weight: var(--ha-font-weight-medium);
        overflow-wrap: anywhere;
        min-width: 0;
      }
      .bar {
        position: relative;
        height: 8px;
        border-radius: 4px;
        background: var(--secondary-background-color);
        overflow: hidden;
      }
      .fill {
        display: block;
        height: 100%;
        background: var(--primary-color);
        transition: width 0.25s linear;
      }
      .bar.unknown .fill {
        width: 40%;
        animation: slide 1.4s ease-in-out infinite;
      }
      @keyframes slide {
        from {
          margin-inline-start: -40%;
        }
        to {
          margin-inline-start: 100%;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .fill {
          transition: none;
        }
        .bar.unknown .fill {
          animation: none;
          width: 100%;
          opacity: 0.4;
        }
      }
      .result {
        margin: var(--ha-space-1) 0;
        overflow-wrap: anywhere;
      }
      .result.ok {
        color: var(--success-color);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-ollama-pull": HaOllamaPull;
  }
}
