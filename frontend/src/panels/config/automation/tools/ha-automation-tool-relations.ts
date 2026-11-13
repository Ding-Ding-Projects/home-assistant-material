import { mdiSourceBranch } from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing, svg } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-alert";
import "../../../../components/ha-svg-icon";
import { haStyle } from "../../../../resources/styles";
import type { AutomationToolContext } from "./registry";
import { stepKindIcon } from "./step-icons";
import type { StepKind } from "./step-model";
import { analyseRelations, stepsReachedBy } from "./trigger-relations";

const ROW = 72;
const TONES = 4;

/**
 * Shows which triggers feed which gated branch, and which steps the selected
 * trigger can reach. Everything is read from the configuration on screen.
 */
@customElement("ha-automation-tool-relations")
export class HaAutomationToolRelations extends LitElement {
  @property({ attribute: false }) public context!: AutomationToolContext;

  @state() private _selected?: number;

  private _t(key: string, vars?: Record<string, string | number>) {
    return this.context.hass.localize(
      `ui.panel.config.automation.editor.tools.relations.${key}` as any,
      vars as any
    );
  }

  protected render() {
    const relations = analyseRelations(this.context.config);
    if (!relations.triggers.length) {
      return html`<div class="empty">${this._t("empty")}</div>`;
    }
    const gated = relations.branches.filter((b) => b.ids);
    const selected =
      this._selected !== undefined && this._selected < relations.triggers.length
        ? this._selected
        : undefined;
    const rows = Math.max(relations.triggers.length, gated.length, 1);
    const height = rows * ROW;
    const reached =
      selected !== undefined ? stepsReachedBy(relations, selected) : [];

    return html`
      ${
        relations.missingIds.length
          ? html`<ha-alert alert-type="warning">
              ${this._t("missing_ids", {
                ids: relations.missingIds.join(", "),
                count: relations.missingIds.length,
              })}
            </ha-alert>`
          : nothing
      }
      <div class="map" style=${styleMap({ height: `${height}px` })}>
        <ol class="column">
          ${relations.triggers.map(
            (trigger) =>
              html`<li style=${styleMap({ height: `${ROW}px` })}>
                <button
                  type="button"
                  class=${classMap({
                    node: true,
                    selected: selected === trigger.index,
                    disabled: trigger.disabled,
                  })}
                  aria-pressed=${selected === trigger.index ? "true" : "false"}
                  .triggerIndex=${trigger.index}
                  @click=${this._select}
                >
                  <span class="icon"
                    ><ha-svg-icon .path=${stepKindIcon("trigger")}></ha-svg-icon
                  ></span>
                  <span class="text">
                    <span class="title">${trigger.title}</span>
                    <span class="detail"
                      >${trigger.id ?? this._t("no_id")}</span
                    >
                  </span>
                </button>
              </li>`
          )}
        </ol>
        <svg
          class="wires"
          viewBox="0 0 100 ${height}"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          ${gated.map((branch, bi) =>
            branch.triggers.map((ti) => {
              const y1 = ti * ROW + ROW / 2;
              const y2 = bi * ROW + ROW / 2;
              return svg`<path
                class=${classMap({
                  wire: true,
                  [`tone-${ti % TONES}`]: true,
                  dim: selected !== undefined && selected !== ti,
                })}
                vector-effect="non-scaling-stroke"
                d="M0 ${y1} C 50 ${y1}, 50 ${y2}, 100 ${y2}"
              />`;
            })
          )}
        </svg>
        <ol class="column">
          ${gated.map(
            (branch) =>
              html`<li style=${styleMap({ height: `${ROW}px` })}>
                <button
                  type="button"
                  class=${classMap({
                    node: true,
                    dim:
                      selected !== undefined &&
                      !branch.triggers.includes(selected),
                  })}
                  .stepPath=${branch.owner}
                  title=${this._t("show_step")}
                  @click=${this._showStep}
                >
                  <span class="icon"
                    ><ha-svg-icon .path=${mdiSourceBranch}></ha-svg-icon
                  ></span>
                  <span class="text">
                    <span class="title"
                      >${this._branchTitle(branch.label)}</span
                    >
                    <span class="detail"
                      >${this._t("branch_detail", {
                        ids: branch.ids!.join(", "),
                        count: branch.steps,
                      })}</span
                    >
                  </span>
                </button>
              </li>`
          )}
        </ol>
      </div>
      ${
        !gated.length
          ? html`<p class="note">${this._t("no_gates")}</p>`
          : nothing
      }
      <section class="reach" aria-live="polite">
        ${
          selected === undefined
            ? html`<p class="hint">${this._t("select_hint")}</p>`
            : html`<h3>
                  ${this._t("reach_title", {
                    name: relations.triggers[selected].title,
                    count: reached.length,
                  })}
                </h3>
                <ul>
                  ${reached.map(
                    (step) =>
                      html`<li
                        style=${styleMap({
                          "padding-inline-start": `${step.depth * 16}px`,
                        })}
                      >
                        <button
                          type="button"
                          class="step"
                          .stepPath=${step.path}
                          @click=${this._showStep}
                        >
                          <ha-svg-icon
                            .path=${stepKindIcon(step.kind as StepKind)}
                          ></ha-svg-icon>
                          <span>${step.title}</span>
                          ${
                            step.gated
                              ? html`<span class="tag"
                                  >${this._t("gated")}</span
                                >`
                              : nothing
                          }
                        </button>
                      </li>`
                  )}
                </ul>`
        }
      </section>
    `;
  }

  private _branchTitle(label: string): string {
    const option = /^option:(\d+)$/.exec(label);
    return option
      ? this._t("option", { number: Number(option[1]) + 1 })
      : this._t(`branch.${label}` as any);
  }

  private _select(ev: Event) {
    const index = (ev.currentTarget as HTMLElement & { triggerIndex: number })
      .triggerIndex;
    this._selected = this._selected === index ? undefined : index;
  }

  private _showStep(ev: Event) {
    const path = (ev.currentTarget as HTMLElement & { stepPath: string })
      .stepPath;
    fireEvent(this, "tool-show-step", { path });
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
        }
        .empty,
        .hint,
        .note {
          margin: 0;
          padding: var(--ha-space-3) var(--ha-space-4);
          border-radius: var(--ha-border-radius-xl, 16px);
          background: var(
            --ha-color-primary-container,
            var(--secondary-background-color)
          );
          color: var(
            --ha-color-on-primary-container,
            var(--primary-text-color)
          );
        }
        .map {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(32px, 96px) minmax(
              0,
              1fr
            );
        }
        .column {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .column li {
          display: flex;
          align-items: center;
        }
        .node {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          width: 100%;
          height: 56px;
          padding: 0 var(--ha-space-3);
          border: 1px solid var(--ha-color-outline, var(--divider-color));
          border-radius: var(--ha-border-radius-xl, 16px);
          background: var(--card-background-color);
          box-shadow: var(--ha-shadow-card, none);
          color: var(--primary-text-color);
          font: inherit;
          text-align: start;
          cursor: pointer;
        }
        .node.selected {
          border-color: var(--primary-color);
          box-shadow: 0 0 0 2px var(--primary-color);
        }
        .node.dim {
          opacity: 0.45;
        }
        .node.disabled {
          opacity: 0.6;
        }
        .icon {
          display: grid;
          place-items: center;
          flex: none;
          width: 32px;
          height: 32px;
          border-radius: var(--ha-border-radius-lg, 12px);
          background: var(
            --ha-color-primary-container,
            var(--secondary-background-color)
          );
          color: var(
            --ha-color-on-primary-container,
            var(--primary-text-color)
          );
        }
        .text {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .title {
          font-weight: var(--ha-font-weight-semibold);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .detail {
          font-size: var(--ha-font-size-s, 0.875rem);
          color: var(--secondary-text-color);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .wires {
          width: 100%;
          height: 100%;
        }
        .wire {
          fill: none;
          stroke-width: 2.5;
          stroke: var(--primary-color);
        }
        .wire.tone-1 {
          stroke: var(--success-color, var(--primary-color));
        }
        .wire.tone-2 {
          stroke: var(--warning-color, var(--primary-color));
        }
        .wire.tone-3 {
          stroke: var(--info-color, var(--primary-color));
        }
        .wire.dim {
          opacity: 0.15;
        }
        .reach h3 {
          margin: 0 0 var(--ha-space-2);
          font-size: var(--ha-font-size-l, 1.125rem);
        }
        .reach ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
        }
        .step {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          min-height: 44px;
          width: 100%;
          padding: 0 var(--ha-space-2);
          border: none;
          background: none;
          font: inherit;
          color: var(--primary-text-color);
          text-align: start;
          cursor: pointer;
        }
        .tag {
          margin-inline-start: auto;
          padding: 0 var(--ha-space-2);
          border-radius: var(--ha-border-radius-pill, 999px);
          font-size: var(--ha-font-size-s, 0.875rem);
          background: var(
            --ha-color-surface-tone-2,
            var(--secondary-background-color)
          );
          color: var(--secondary-text-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-tool-relations": HaAutomationToolRelations;
  }
}
