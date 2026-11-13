import { mdiAlertDecagram, mdiAutoFix, mdiCrosshairsGps } from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import type { Problem } from "../../common/problems/problem-store";
import {
  activeProblems,
  ignoreProblem,
  subscribeProblems,
} from "../../common/problems/problem-store";
import { teleportToProblem } from "../../common/problems/teleport";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import type { HomeAssistant } from "../../types";
import "../ha-button";
import "../ha-card";
import "../ha-svg-icon";

/**
 * Every problem the detector has found in this session, with Fix where it
 * can fix itself and Teleport to the exact element. Shown on the Repairs page.
 */
@customElement("ha-problem-list")
export class HaProblemList extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  private _lang = new LanguageModeController(this);

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.hass.localize, key, values);
  }

  @state() private _problems: Problem[] = activeProblems();

  @state() private _busy?: string;

  private _unsub?: () => void;

  public connectedCallback(): void {
    super.connectedCallback();
    this._unsub = subscribeProblems(() => {
      this._problems = activeProblems();
    });
    this._problems = activeProblems();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsub?.();
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._problems.length) {
      return nothing;
    }
    const fixable = this._problems.filter((problem) => problem.fix);
    return html`
      <ha-card outlined>
        <div class="head">
          <h2>${this._t("ui.problems.list_title")}</h2>
          <span class="count"
            >${this._t("ui.problems.count", {
              count: this._problems.length,
            })}</span
          >
          ${
            fixable.length > 1
              ? html`<ha-button @click=${this._fixAll}
                  ><ha-svg-icon slot="start" .path=${mdiAutoFix}></ha-svg-icon
                  >${this._t("ui.problems.fix_all")}</ha-button
                >`
              : nothing
          }
        </div>
        <ul>
          ${this._problems.map(
            (problem) => html`
              <li>
                <span class="icon ${problem.severity}"
                  ><ha-svg-icon .path=${mdiAlertDecagram}></ha-svg-icon
                ></span>
                <div class="text">
                  <b>${problem.location}</b>
                  <span>${problem.title}</span>
                </div>
                <div class="actions">
                  ${
                    problem.fix
                      ? html`<ha-button
                          size="small"
                          .disabled=${this._busy === problem.id}
                          .problemId=${problem.id}
                          @click=${this._fix}
                          >${problem.fixLabel || this._t("ui.problems.fix")}</ha-button
                        >`
                      : nothing
                  }
                  <ha-button
                    size="small"
                    appearance="outlined"
                    .problemId=${problem.id}
                    @click=${this._teleport}
                    ><ha-svg-icon
                      slot="start"
                      .path=${mdiCrosshairsGps}
                    ></ha-svg-icon
                    >${this._t("ui.problems.teleport")}</ha-button
                  >
                  <ha-button
                    size="small"
                    appearance="plain"
                    .problemId=${problem.id}
                    @click=${this._ignore}
                    >${this._t("ui.problems.ignore")}</ha-button
                  >
                </div>
              </li>
            `
          )}
        </ul>
      </ha-card>
    `;
  }

  private _id(ev: Event): string {
    return (ev.currentTarget as HTMLElement & { problemId: string }).problemId;
  }

  private _teleport(ev: Event) {
    teleportToProblem(this._id(ev));
  }

  private _ignore(ev: Event) {
    ignoreProblem(this._id(ev));
  }

  private async _fix(ev: Event) {
    const id = this._id(ev);
    const problem = this._problems.find((item) => item.id === id);
    if (!problem?.fix) {
      return;
    }
    this._busy = id;
    try {
      await problem.fix();
    } finally {
      this._busy = undefined;
    }
  }

  private async _fixAll() {
    for (const problem of this._problems) {
      if (problem.fix) {
        this._busy = problem.id;
        // One at a time, so a failure stops at the problem that caused it.
        // eslint-disable-next-line no-await-in-loop
        await problem.fix();
      }
    }
    this._busy = undefined;
  }

  static styles = css`
    :host {
      display: block;
    }
    ha-card {
      padding: 16px;
    }
    .head {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }
    h2 {
      margin: 0;
      font-size: 20px;
      flex: 1;
    }
    .count {
      color: var(--secondary-text-color);
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
    }
    li {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 0;
      border-top: 1px solid var(--divider-color);
      flex-wrap: wrap;
    }
    .icon {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: 14px;
      color: var(--error-color);
      background: color-mix(in srgb, var(--error-color) 16%, transparent);
      flex: none;
    }
    .icon.warning {
      color: var(--warning-color);
      background: color-mix(in srgb, var(--warning-color) 18%, transparent);
    }
    .text {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 180px;
    }
    .text span {
      color: var(--secondary-text-color);
      font-size: 14px;
    }
    .actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-problem-list": HaProblemList;
  }
}
