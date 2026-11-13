import {
  mdiFitToScreenOutline,
  mdiMinus,
  mdiPlus,
  mdiSourceBranch,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues } from "lit";
import { css, html, LitElement, nothing, svg } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import "../../../../components/ha-icon-button";
import "../../../../components/ha-svg-icon";
import { haStyle } from "../../../../resources/styles";
import type { FlowGraph, FlowNode } from "./flow-graph";
import { buildFlowGraph } from "./flow-graph";
import type { AutomationToolContext } from "./registry";
import { stepKindIcon } from "./step-icons";

const NODE_W = 220;
const NODE_H = 68;
const GAP_X = 64;
const GAP_Y = 24;
const PAD = 24;
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5];

const nodeX = (node: FlowNode) => PAD + node.col * (NODE_W + GAP_X);
const nodeY = (node: FlowNode) => PAD + node.row * (NODE_H + GAP_Y);

@customElement("ha-automation-tool-flow")
export class HaAutomationToolFlow extends LitElement {
  @property({ attribute: false }) public context!: AutomationToolContext;

  @state() private _zoom = 2;

  @state() private _view = { x: 0, y: 0, w: 1, h: 1 };

  @query(".canvas") private _canvas?: HTMLElement;

  private get _graph(): FlowGraph {
    return buildFlowGraph(this.context.config);
  }

  private get _size() {
    const graph = this._graph;
    return {
      w: PAD * 2 + graph.cols * NODE_W + (graph.cols - 1) * GAP_X,
      h: PAD * 2 + graph.rows * NODE_H + (graph.rows - 1) * GAP_Y,
    };
  }

  protected firstUpdated(_changed: PropertyValues): void {
    this._updateView();
  }

  private _t(key: string, vars?: Record<string, string | number>) {
    return this.context.hass.localize(
      `ui.panel.config.automation.editor.tools.flow.${key}` as any,
      vars as any
    );
  }

  private _title(node: FlowNode): string {
    if (node.role === "branch") {
      const last = node.path.split("/").pop()!;
      if (/^\d+$/.test(last)) {
        return this._t("branch.option", { number: Number(last) + 1 });
      }
      return this._t(`branch.${last}` as any);
    }
    return node.title;
  }

  protected render() {
    const graph = this._graph;
    if (!graph.nodes.length) {
      return html`<div class="empty">${this._t("empty")}</div>`;
    }
    const { w, h } = this._size;
    const zoom = ZOOMS[this._zoom];
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    return html`
      <div class="toolbar">
        <ha-icon-button
          .label=${this._t("zoom_out")}
          .path=${mdiMinus}
          .disabled=${this._zoom === 0}
          @click=${this._zoomOut}
        ></ha-icon-button>
        <span class="zoom">${Math.round(zoom * 100)}%</span>
        <ha-icon-button
          .label=${this._t("zoom_in")}
          .path=${mdiPlus}
          .disabled=${this._zoom === ZOOMS.length - 1}
          @click=${this._zoomIn}
        ></ha-icon-button>
        <ha-icon-button
          .label=${this._t("fit")}
          .path=${mdiFitToScreenOutline}
          @click=${this._fit}
        ></ha-icon-button>
        <span class="note">${this._t("derived")}</span>
      </div>
      <div class="stage">
        <div class="canvas" tabindex="0" @scroll=${this._updateView}>
          <div
            class="surface"
            style=${styleMap({
              width: `${w * zoom}px`,
              height: `${h * zoom}px`,
            })}
          >
            <div
              class="scaled"
              style=${styleMap({
                width: `${w}px`,
                height: `${h}px`,
                transform: `scale(${zoom})`,
              })}
            >
              <svg
                class="wires"
                width=${w}
                height=${h}
                viewBox="0 0 ${w} ${h}"
                aria-hidden="true"
              >
                ${graph.edges.map((edge) => {
                  const from = byId.get(edge.from)!;
                  const to = byId.get(edge.to)!;
                  const x1 = nodeX(from) + NODE_W;
                  const y1 = nodeY(from) + NODE_H / 2;
                  const x2 = nodeX(to);
                  const y2 = nodeY(to) + NODE_H / 2;
                  const mid = (x1 + x2) / 2;
                  return svg`<path
                    class=${classMap({
                      wire: true,
                      alternative: edge.tone === "alternative",
                    })}
                    d="M${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}"
                  />`;
                })}
              </svg>
              <ol class="nodes">
                ${graph.nodes.map((node) => this._renderNode(node))}
              </ol>
            </div>
          </div>
        </div>
        ${this._renderMinimap(graph, w, h)}
      </div>
    `;
  }

  private _renderNode(node: FlowNode) {
    return html`<li
      class=${classMap({
        node: true,
        [node.role]: true,
        disabled: node.disabled,
      })}
      style=${styleMap({
        left: `${nodeX(node)}px`,
        top: `${nodeY(node)}px`,
        width: `${NODE_W}px`,
        height: `${NODE_H}px`,
      })}
    >
      <span class="icon">
        <ha-svg-icon
          .path=${node.role === "branch" ? mdiSourceBranch : stepKindIcon(node.kind)}
        ></ha-svg-icon>
      </span>
      <span class="text">
        <span class="role">
          ${this._t(`role.${node.role}` as any)}${
            node.disabled ? html` · ${this._t("off")}` : nothing
          }
        </span>
        <span class="title">${this._title(node)}</span>
        ${
          node.detail && node.role !== "branch"
            ? html`<span class="detail">${node.detail}</span>`
            : nothing
        }
      </span>
    </li>`;
  }

  private _renderMinimap(graph: FlowGraph, w: number, h: number) {
    const MW = 160;
    const scale = MW / w;
    const MH = Math.max(40, Math.min(120, h * scale));
    const vs = Math.min(MW / w, MH / h);
    return html`<div
      class="minimap"
      role="img"
      aria-label=${this._t("minimap")}
    >
      <svg width=${w * vs} height=${h * vs} viewBox="0 0 ${w} ${h}">
        ${graph.nodes.map(
          (n) =>
            svg`<rect class="mini-node" x=${nodeX(n)} y=${nodeY(n)} width=${NODE_W} height=${NODE_H} rx="10"></rect>`
        )}
        <rect
          class="mini-view"
          x=${this._view.x * w}
          y=${this._view.y * h}
          width=${this._view.w * w}
          height=${this._view.h * h}
          rx="10"
        ></rect>
      </svg>
    </div>`;
  }

  private _updateView = () => {
    const el = this._canvas;
    if (!el) {
      return;
    }
    const sw = Math.max(1, el.scrollWidth);
    const sh = Math.max(1, el.scrollHeight);
    this._view = {
      x: el.scrollLeft / sw,
      y: el.scrollTop / sh,
      w: Math.min(1, el.clientWidth / sw),
      h: Math.min(1, el.clientHeight / sh),
    };
  };

  private _zoomIn() {
    this._zoom = Math.min(ZOOMS.length - 1, this._zoom + 1);
    this.updateComplete.then(this._updateView);
  }

  private _zoomOut() {
    this._zoom = Math.max(0, this._zoom - 1);
    this.updateComplete.then(this._updateView);
  }

  private _fit() {
    const el = this._canvas;
    if (!el) {
      return;
    }
    const { w, h } = this._size;
    const ratio = Math.min(el.clientWidth / w, el.clientHeight / h);
    let best = 0;
    ZOOMS.forEach((z, i) => {
      if (z <= ratio) {
        best = i;
      }
    });
    this._zoom = best;
    el.scrollTo({ left: 0, top: 0 });
    this.updateComplete.then(this._updateView);
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
          min-height: 0;
        }
        .toolbar {
          display: flex;
          align-items: center;
          gap: var(--ha-space-1);
        }
        .zoom {
          min-width: 44px;
          text-align: center;
          color: var(--secondary-text-color);
        }
        .note {
          margin-inline-start: auto;
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
        }
        .stage {
          position: relative;
          min-height: 280px;
          height: 60vh;
          border-radius: var(--ha-border-radius-2xl);
          background-color: var(
            --ha-color-surface-tone-1,
            var(--secondary-background-color)
          );
          background-image: radial-gradient(
            var(--ha-color-outline, var(--divider-color)) 1px,
            transparent 1px
          );
          background-size: 22px 22px;
          overflow: hidden;
        }
        .canvas {
          position: absolute;
          inset: 0;
          overflow: auto;
        }
        .scaled {
          position: relative;
          transform-origin: 0 0;
        }
        .wires {
          position: absolute;
          inset: 0;
        }
        .wire {
          fill: none;
          stroke: var(--ha-color-outline, var(--divider-color));
          stroke-width: 2.5;
          stroke-linecap: round;
        }
        .wire.alternative {
          stroke-dasharray: 6 6;
        }
        .nodes {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .node {
          position: absolute;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          padding: var(--ha-space-2) var(--ha-space-3);
          border-radius: var(--ha-border-radius-xl);
          background: var(--card-background-color);
          box-shadow: var(--ha-shadow-card, none);
          border: 1px solid var(--ha-color-outline, var(--divider-color));
        }
        .node.branch {
          background: var(
            --ha-color-surface-tone-2,
            var(--secondary-background-color)
          );
        }
        .node.disabled {
          opacity: 0.55;
        }
        .icon {
          flex: none;
          display: grid;
          place-items: center;
          width: 36px;
          height: 36px;
          border-radius: var(--ha-border-radius-lg);
          background: var(--ha-color-primary-container);
          color: var(--ha-color-on-primary-container);
        }
        .node.condition .icon,
        .node.branch .icon {
          background: var(
            --ha-color-warning-container,
            var(--ha-color-primary-container)
          );
          color: var(
            --ha-color-on-warning-container,
            var(--ha-color-on-primary-container)
          );
        }
        .node.action .icon {
          background: var(
            --ha-color-success-container,
            var(--ha-color-primary-container)
          );
          color: var(
            --ha-color-on-success-container,
            var(--ha-color-on-primary-container)
          );
        }
        .text {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .role {
          font-size: var(--ha-font-size-xs);
          color: var(--secondary-text-color);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .title {
          font-weight: var(--ha-font-weight-semibold);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .detail {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .minimap {
          position: absolute;
          inset-inline-end: var(--ha-space-3);
          inset-block-end: var(--ha-space-3);
          padding: var(--ha-space-2);
          border-radius: var(--ha-border-radius-lg);
          background: var(--card-background-color);
          box-shadow: var(--ha-shadow-card, none);
          pointer-events: none;
        }
        .mini-node {
          fill: var(--ha-color-outline, var(--divider-color));
        }
        .mini-view {
          fill: none;
          stroke: var(--primary-color);
          stroke-width: 14;
        }
        .empty {
          padding: var(--ha-space-6);
          color: var(--secondary-text-color);
        }
        @media (prefers-reduced-motion: reduce) {
          .canvas {
            scroll-behavior: auto;
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-tool-flow": HaAutomationToolFlow;
  }
}
