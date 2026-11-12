import {
  mdiAlertDecagram,
  mdiClose,
  mdiCrosshairsGps,
  mdiAutoFix,
} from "@mdi/js";
import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import { navigate } from "../../common/navigate";
import type { Problem } from "../../common/problems/problem-store";
import {
  activeProblems,
  getProblem,
  ignoreProblem,
  subscribeProblems,
  targetsFor,
} from "../../common/problems/problem-store";
import {
  motionReduced,
  PROBLEM_SETTINGS_CHANGED_EVENT,
  readProblemSettings,
} from "../../common/problems/problem-settings";
import type { ProblemSpotlightDetail } from "../../common/problems/teleport";
import { PROBLEM_SPOTLIGHT_EVENT } from "../../common/problems/teleport";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import type { HomeAssistant } from "../../types";
import "../ha-button";
import "../ha-icon-button";
import "../ha-svg-icon";

interface Box {
  id: string;
  severity: Problem["severity"];
  top: number;
  left: number;
  width: number;
  height: number;
}

const POPOVER_WIDTH = 360;
const SPOTLIGHT_MS = 7000;

/**
 * Draws the problem detector over the page: an outline and a badge on every
 * element with a problem, the details panel with Fix and the steps to fix it
 * by hand, and the spotlight Teleport lands on. It sits above the page in one
 * fixed layer, so it reaches elements inside any shadow root.
 */
@customElement("ha-problem-overlay")
export class HaProblemOverlay extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  private _lang = new LanguageModeController(this);

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.hass.localize, key, values);
  }

  @state() private _boxes: Box[] = [];

  @state() private _open?: string;

  @state() private _spot?: string;

  @state() private _notFound = false;

  @state() private _settings = readProblemSettings();

  @state() private _fixing = false;

  private _unsub?: () => void;

  private _frame?: number;

  private _timer?: number;

  private _spotTimer?: number;

  public connectedCallback(): void {
    super.connectedCallback();
    this._unsub = subscribeProblems(() => this._schedule());
    window.addEventListener("scroll", this._schedule, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", this._schedule, { passive: true });
    window.addEventListener(PROBLEM_SPOTLIGHT_EVENT, this._onSpotlight);
    window.addEventListener(
      PROBLEM_SETTINGS_CHANGED_EVENT,
      this._onSettingsChanged
    );
    // Layout can move without a scroll (panels opening, cards loading).
    this._timer = window.setInterval(this._schedule, 700);
    this._schedule();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsub?.();
    window.removeEventListener("scroll", this._schedule, { capture: true });
    window.removeEventListener("resize", this._schedule);
    window.removeEventListener(PROBLEM_SPOTLIGHT_EVENT, this._onSpotlight);
    window.removeEventListener(
      PROBLEM_SETTINGS_CHANGED_EVENT,
      this._onSettingsChanged
    );
    window.clearInterval(this._timer);
    window.clearTimeout(this._spotTimer);
    if (this._frame) {
      cancelAnimationFrame(this._frame);
    }
  }

  private _onSettingsChanged = () => {
    this._settings = readProblemSettings();
    this._schedule();
  };

  private _onSpotlight = (ev: Event) => {
    const detail = (ev as CustomEvent<ProblemSpotlightDetail>).detail;
    this._spot = detail.found ? detail.id : undefined;
    this._notFound = !detail.found;
    this._open = detail.id;
    window.clearTimeout(this._spotTimer);
    if (detail.found) {
      this._spotTimer = window.setTimeout(() => {
        this._spot = undefined;
      }, SPOTLIGHT_MS);
    }
    this._schedule();
  };

  private _schedule = () => {
    if (this._frame) {
      return;
    }
    this._frame = requestAnimationFrame(() => {
      this._frame = undefined;
      this._measure();
    });
  };

  private _measure() {
    const show = this._settings.enabled || this._spot !== undefined;
    const boxes: Box[] = [];
    if (show) {
      for (const problem of activeProblems()) {
        if (!this._settings.enabled && problem.id !== this._spot) {
          continue;
        }
        for (const element of targetsFor(problem.id)) {
          const rect = element.getBoundingClientRect();
          if (!rect.width && !rect.height) {
            continue;
          }
          boxes.push({
            id: problem.id,
            severity: problem.severity,
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          });
        }
      }
    }
    const changed =
      boxes.length !== this._boxes.length ||
      boxes.some((box, index) => {
        const old = this._boxes[index];
        return (
          old.id !== box.id ||
          Math.abs(old.top - box.top) > 0.5 ||
          Math.abs(old.left - box.left) > 0.5 ||
          Math.abs(old.width - box.width) > 0.5 ||
          Math.abs(old.height - box.height) > 0.5
        );
      });
    if (changed) {
      this._boxes = boxes;
    }
    if (this._open && !getProblem(this._open)) {
      this._open = undefined;
    }
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("_settings")) {
      this.toggleAttribute("pulse", this._settings.pulse && !motionReduced());
    }
  }

  protected render(): TemplateResult {
    const found = this._t("ui.problems.found");
    const spotBox = this._spot
      ? this._boxes.find((box) => box.id === this._spot)
      : undefined;
    return html`
      ${spotBox ? this._renderSpotlight(spotBox) : nothing}
      ${this._boxes.map(
        (box) => html`
          <div
            class="outline ${box.severity}"
            style=${styleMap({
              top: `${box.top - 4}px`,
              left: `${box.left - 4}px`,
              width: `${box.width + 8}px`,
              height: `${box.height + 8}px`,
            })}
          ></div>
          <button
            class="badge ${box.severity}"
            style=${styleMap({
              top: `${Math.max(box.top - 14, 2)}px`,
              left: `${box.left + 12}px`,
            })}
            aria-haspopup="dialog"
            aria-expanded=${this._open === box.id ? "true" : "false"}
            .problemId=${box.id}
            @click=${this._toggle}
          >
            <ha-svg-icon .path=${mdiAlertDecagram}></ha-svg-icon>${found}
          </button>
        `
      )}
      ${this._open ? this._renderDetails(this._open) : nothing}
    `;
  }

  private _renderSpotlight(box: Box) {
    return html`<div
      class="spotlight"
      style=${styleMap({
        top: `${box.top - 10}px`,
        left: `${box.left - 10}px`,
        width: `${box.width + 20}px`,
        height: `${box.height + 20}px`,
      })}
    ></div>`;
  }

  private _renderDetails(id: string) {
    const problem = getProblem(id);
    if (!problem) {
      return nothing;
    }
    const box = this._boxes.find((item) => item.id === id);
    const style: Record<string, string> = {};
    if (box) {
      const right = box.left + box.width + 16;
      const fitsRight = right + POPOVER_WIDTH < window.innerWidth - 8;
      style.left = `${Math.max(8, fitsRight ? right : Math.min(box.left, window.innerWidth - POPOVER_WIDTH - 8))}px`;
      style.top = `${Math.max(8, Math.min(fitsRight ? box.top : box.top + box.height + 16, window.innerHeight - 320))}px`;
    }
    return html`
      <div
        class="details ${box ? "" : "floating"}"
        role="dialog"
        aria-labelledby="problem-title"
        style=${styleMap(style)}
        @keydown=${this._detailsKeydown}
      >
        <div class="head">
          <span class="icon ${problem.severity}"
            ><ha-svg-icon .path=${mdiAlertDecagram}></ha-svg-icon
          ></span>
          <div class="titles">
            <b id="problem-title">${this._t("ui.problems.found")}</b>
            <span>${problem.title}</span>
            <span class="where">${problem.location}</span>
          </div>
          <ha-icon-button
            .label=${this._t("ui.common.close")}
            .path=${mdiClose}
            @click=${this._close}
          ></ha-icon-button>
        </div>
        ${
          this._notFound
            ? html`<p class="note">${this._t("ui.problems.not_on_page")}</p>`
            : nothing
        }
        ${problem.why ? html`<p class="note">${problem.why}</p>` : nothing}
        ${
          problem.manualSteps?.length
            ? html`<b class="steps-title">${this._t("ui.problems.by_hand")}</b>
                <ol>
                  ${problem.manualSteps.map((step) => html`<li>${step}</li>`)}
                </ol>`
            : nothing
        }
        <div class="actions">
          ${
            problem.fix
              ? html`<ha-button .disabled=${this._fixing} @click=${this._fix}
                  ><ha-svg-icon slot="start" .path=${mdiAutoFix}></ha-svg-icon
                  >${problem.fixLabel || this._t("ui.problems.fix")}</ha-button
                >`
              : nothing
          }
          ${
            box
              ? nothing
              : html`<ha-button appearance="plain" @click=${this._toRepairs}
                  ><ha-svg-icon
                    slot="start"
                    .path=${mdiCrosshairsGps}
                  ></ha-svg-icon
                  >${this._t("ui.problems.all_problems")}</ha-button
                >`
          }
          <ha-button appearance="plain" @click=${this._ignore}
            >${this._t("ui.problems.ignore")}</ha-button
          >
          ${
            box
              ? html`<ha-button appearance="plain" @click=${this._toRepairs}
                  >${this._t("ui.problems.all_problems")}</ha-button
                >`
              : nothing
          }
        </div>
      </div>
    `;
  }

  private _toggle(ev: Event) {
    const id = (ev.currentTarget as HTMLElement & { problemId: string })
      .problemId;
    this._notFound = false;
    this._open = this._open === id ? undefined : id;
  }

  private _close() {
    this._open = undefined;
    this._notFound = false;
    this._endSpotlight();
  }

  private _endSpotlight() {
    this._spot = undefined;
    window.clearTimeout(this._spotTimer);
  }

  private _detailsKeydown(ev: KeyboardEvent) {
    if (ev.key === "Escape") {
      ev.stopPropagation();
      this._close();
    }
  }

  private async _fix() {
    const problem = this._open ? getProblem(this._open) : undefined;
    if (!problem?.fix) {
      return;
    }
    this._fixing = true;
    try {
      await problem.fix();
    } finally {
      this._fixing = false;
    }
  }

  private _ignore() {
    if (this._open) {
      ignoreProblem(this._open);
    }
    this._close();
  }

  private _toRepairs() {
    this._close();
    navigate("/config/repairs");
  }

  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 7;
    }
    .outline {
      position: fixed;
      border-radius: var(--ha-border-radius-lg, 16px);
      outline: 3px solid var(--error-color);
      pointer-events: none;
    }
    .outline.warning {
      outline-color: var(--warning-color);
    }
    :host([pulse]) .outline {
      animation: pulse 1.6s ease-in-out infinite;
    }
    @keyframes pulse {
      50% {
        outline-color: color-mix(in srgb, var(--error-color) 45%, transparent);
        box-shadow: 0 0 0 10px transparent;
      }
      0%,
      100% {
        box-shadow: 0 0 0 0
          color-mix(in srgb, var(--error-color) 35%, transparent);
      }
    }
    .badge {
      position: fixed;
      pointer-events: auto;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 28px;
      padding: 4px 12px 4px 8px;
      border: none;
      border-radius: 999px;
      background: var(--error-color);
      color: var(--text-primary-color, #fff);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: var(--ha-box-shadow-m, 0 2px 8px rgba(0, 0, 0, 0.25));
      animation: pop 0.35s ease-out both;
    }
    .badge.warning {
      background: var(--warning-color);
      color: var(--primary-text-color);
    }
    .badge:focus-visible {
      outline: 3px solid var(--primary-color);
      outline-offset: 2px;
    }
    .badge ha-svg-icon {
      --mdc-icon-size: 18px;
    }
    @keyframes pop {
      from {
        opacity: 0;
        transform: scale(0.85);
      }
    }
    .spotlight {
      position: fixed;
      border-radius: var(--ha-border-radius-xl, 20px);
      box-shadow: 0 0 0 200vmax rgba(10, 10, 20, 0.55);
      pointer-events: none;
      animation: fade 0.4s ease-out both;
    }
    @keyframes fade {
      from {
        opacity: 0;
      }
    }
    .details {
      position: fixed;
      width: min(${POPOVER_WIDTH}px, calc(100vw - 16px));
      max-height: calc(100vh - 16px);
      overflow: auto;
      box-sizing: border-box;
      pointer-events: auto;
      padding: 16px;
      border-radius: var(--ha-border-radius-2xl, 24px);
      background: var(--card-background-color);
      color: var(--primary-text-color);
      box-shadow: var(--ha-box-shadow-l, 0 8px 28px rgba(0, 0, 0, 0.3));
      display: flex;
      flex-direction: column;
      gap: 10px;
      animation: slide 0.3s ease-out both;
    }
    .details.floating {
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      animation: none;
    }
    @keyframes slide {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
    }
    .head {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }
    .icon {
      display: grid;
      place-items: center;
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 14px;
      color: var(--error-color);
      background: color-mix(in srgb, var(--error-color) 16%, transparent);
    }
    .icon.warning {
      color: var(--warning-color);
      background: color-mix(in srgb, var(--warning-color) 18%, transparent);
    }
    .titles {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }
    .where {
      color: var(--secondary-text-color);
      font-size: 13px;
    }
    .note {
      margin: 0;
      padding: 10px 12px;
      border-radius: 14px;
      background: color-mix(in srgb, var(--warning-color) 16%, transparent);
      font-size: 14px;
    }
    .steps-title {
      font-size: 14px;
    }
    ol {
      margin: 0;
      padding-inline-start: 22px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 14px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    @media (prefers-reduced-motion: reduce) {
      .badge,
      .spotlight,
      .details,
      :host([pulse]) .outline {
        animation: none;
      }
    }
    :host-context(html[data-a11y-reduce-motion]) .badge,
    :host-context(html[data-a11y-reduce-motion]) .spotlight,
    :host-context(html[data-a11y-reduce-motion]) .details,
    :host-context(html[data-a11y-reduce-motion]) .outline {
      animation: none !important;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-problem-overlay": HaProblemOverlay;
  }
}
