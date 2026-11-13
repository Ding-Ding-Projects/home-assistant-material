import type { TemplateResult } from "lit";
import { css, html, nothing } from "lit";
import { styleMap } from "lit/directives/style-map";
import { customElement, state } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-button";
import type { CardTiming, PerfReport } from "./card-perf";
import { measureCards, SLOW_MS } from "./card-perf";
import { locateElement } from "./a11y-checker";
import { ToolView } from "./tools-base";

@customElement("hui-tool-perf")
export class HuiToolPerf extends ToolView {
  @state() private _report?: PerfReport;

  @state() private _progress?: [number, number];

  protected render(): TemplateResult {
    const report = this._report;
    const max = Math.max(1, ...(report?.cards.map((c) => c.ms ?? 0) ?? [0]));
    return html`
      <p class="intro">${this._t("perf.intro")}</p>
      <div class="row">
        <ha-button .disabled=${!!this._progress} @click=${this._measure}>
          ${this._t(report ? "perf.remeasure" : "perf.measure")}
        </ha-button>
        ${
          this._progress
            ? html`<span class="hint" aria-live="polite"
                >${this._t("perf.measuring", {
                  done: this._progress[0],
                  total: this._progress[1],
                })}</span
              >`
            : nothing
        }
      </div>
      ${this._error ? html`<ha-alert alert-type="error">${this._error}</ha-alert>` : nothing}
      ${
        report
          ? html`
              <div class="stats">
                <div class="stat">
                  <strong>${report.cards.length}</strong
                  >${this._t("perf.cards")}
                </div>
                <div class="stat">
                  <strong>${report.totalMs} ms</strong>${this._t("perf.total")}
                </div>
                <div class="stat">
                  <strong>${report.slow}</strong>${this._t("perf.slow", {
                    ms: SLOW_MS,
                  })}
                </div>
              </div>
              <p class="hint">${this._t("perf.explain")}</p>
              ${
                report.cards.length
                  ? html`<ul class="list">
                      ${report.cards.map((card) => this._renderCard(card, max))}
                    </ul>`
                  : html`<p class="empty">${this._t("perf.none")}</p>`
              }
            `
          : nothing
      }
    `;
  }

  private _renderCard(card: CardTiming, max: number): TemplateResult {
    const share = card.ms === undefined ? 0 : Math.round((card.ms / max) * 100);
    return html`<li>
      <div class="main">
        <b>${card.label}</b>
        <span class="muted"
          >${this._t("perf.entities", { count: card.entities })}</span
        >
        ${
          card.ms === undefined
            ? html`<span class="muted">${this._t("perf.not_measurable")}</span>`
            : html`<div class="bar" aria-hidden="true">
                <span style=${styleMap({ width: `${share}%` })}></span>
              </div>`
        }
      </div>
      ${
        card.ms === undefined
          ? nothing
          : html`<span class="pill ${card.ms >= SLOW_MS ? "warning" : ""}"
              >${card.ms} ms</span
            >`
      }
      <ha-button
        size="s"
        appearance="plain"
        .card=${card}
        @click=${this._locate}
      >
        ${this._t("a11y.locate")}
      </ha-button>
    </li>`;
  }

  private async _measure() {
    this._error = undefined;
    this._progress = [0, 0];
    try {
      this._report = await measureCards((done, total) => {
        this._progress = [done, total];
      });
    } catch (err: unknown) {
      this._fail(err);
    } finally {
      this._progress = undefined;
    }
  }

  private _locate(ev: Event) {
    const card = (ev.currentTarget as HTMLElement & { card: CardTiming }).card;
    if (card.element.isConnected) {
      fireEvent(this, "close-tool");
      window.setTimeout(() => locateElement(card.element), 400);
    }
  }

  static get styles() {
    return [
      ToolView.styles,
      css`
        .bar {
          height: 8px;
          border-radius: var(--ha-border-radius-pill);
          background: var(--divider-color);
          overflow: hidden;
        }
        .bar span {
          display: block;
          height: 100%;
          background: var(--primary-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-tool-perf": HuiToolPerf;
  }
}
