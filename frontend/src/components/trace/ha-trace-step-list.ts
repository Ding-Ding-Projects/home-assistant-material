import { mdiAlertOctagon, mdiArrowDecision, mdiCodeBrackets } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
import { consume } from "../../common/decorators/consume";
import { fireEvent } from "../../common/dom/fire_event";
import { getAutomationActionType, ACTION_ICONS } from "../../data/action";
import { fullEntitiesContext, manifestsContext } from "../../data/context";
import type { EntityRegistryEntry } from "../../data/entity/entity_registry";
import type { DomainManifestLookup } from "../../data/integration";
import type { Action } from "../../data/script";
import type { TraceExtended } from "../../data/trace";
import { TraceTree } from "../../data/trace-tree";
import type { HomeAssistant } from "../../types";
import "../ha-condition-icon";
import "../ha-service-icon";
import "../ha-svg-icon";
import "../ha-trigger-icon";
import type { NodeInfo } from "./hat-script-graph";
import type { TraceStepState } from "./trace-step-info";
import {
  conditionResult,
  describeTraceStep,
  getTraceStepState,
} from "./trace-step-info";

/**
 * The steps of one run, top to bottom in the order they happened, each in the
 * words of the editor with how it turned out. It is the same selection as the
 * graph: picking a step fires `graph-node-selected` with the step.
 */
@customElement("ha-trace-step-list")
export class HaTraceStepList extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public trace!: TraceExtended;

  /** The path of the selected step. */
  @property({ attribute: false }) public selected?: string;

  @state()
  @consume({ context: fullEntitiesContext, subscribe: true })
  private _entityRegistry?: EntityRegistryEntry[];

  @state()
  @consume({ context: manifestsContext, subscribe: true })
  private _manifests?: DomainManifestLookup;

  private _tree = memoizeOne((trace: TraceExtended) => new TraceTree(trace));

  protected render(): TemplateResult {
    const tree = this._tree(this.trace);
    const nodes = tree.trackedPaths.map((path) => tree.trackedNodes[path]);
    return html`
      <ol class="steps">
        ${nodes.map((node) => this._renderStep(node))}
      </ol>
    `;
  }

  private _renderStep(node: NodeInfo) {
    const outcome = getTraceStepState(this.trace, node);
    const description = describeTraceStep(
      this.hass,
      this._entityRegistry,
      this._manifests,
      node
    );
    const passed = conditionResult(this.trace, node);
    const label =
      node.type === "trigger"
        ? this._l("step_triggered", { description })
        : node.type === "condition"
          ? this._l("step_checked", {
              description,
              result: this._l(passed === false ? "step_false" : "step_true"),
            })
          : description;
    const active = this.selected === node.path;
    return html`
      <li class=${classMap({ step: true, [outcome]: true, active })}>
        <button
          .node=${node}
          aria-current=${active ? "step" : "false"}
          @click=${this._pick}
        >
          <span class="tile">${this._renderIcon(node, outcome)}</span>
          <span class="label">${label}</span>
          <span class="visually-hidden">${this._l(`state_${outcome}`)}</span>
        </button>
      </li>
    `;
  }

  private _renderIcon(node: NodeInfo, outcome: TraceStepState) {
    if (outcome === "error") {
      return html`<ha-svg-icon .path=${mdiAlertOctagon}></ha-svg-icon>`;
    }
    const config = (node.config ?? {}) as Record<string, any>;
    if (node.type === "trigger") {
      return html`<ha-trigger-icon
        .trigger=${config.trigger ?? config.platform}
      ></ha-trigger-icon>`;
    }
    if (node.type === "condition") {
      return html`<ha-condition-icon
        .condition=${config.condition}
      ></ha-condition-icon>`;
    }
    if (node.type === "chooseOption") {
      return html`<ha-svg-icon .path=${mdiArrowDecision}></ha-svg-icon>`;
    }
    const service = config.action ?? config.service;
    if (typeof service === "string" && !service.includes("{{")) {
      return html`<ha-service-icon .service=${service}></ha-service-icon>`;
    }
    const type = getAutomationActionType(config as Action);
    return html`<ha-svg-icon
      .path=${(type && ACTION_ICONS[type]) || mdiCodeBrackets}
    ></ha-svg-icon>`;
  }

  private _l(key: string, values?: Record<string, string | number>) {
    return this.hass.localize(
      `ui.panel.config.automation.trace.${key}` as any,
      values
    );
  }

  private _pick(ev: Event) {
    const node = (ev.currentTarget as HTMLElement & { node: NodeInfo }).node;
    fireEvent(this, "graph-node-selected", node);
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    .steps {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
    }
    .step {
      position: relative;
      padding-bottom: var(--ha-space-3);
    }
    .step:last-child {
      padding-bottom: 0;
    }
    /* The line that joins a step to the next. */
    .step:not(:last-child)::before {
      content: "";
      position: absolute;
      inset-inline-start: 25px;
      top: 44px;
      bottom: 4px;
      width: 2px;
      background: var(--divider-color);
    }
    button {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      width: 100%;
      padding: var(--ha-space-1);
      border: none;
      border-radius: var(--ha-border-radius-xl);
      background: none;
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    button:hover {
      background: var(--ha-color-fill-neutral-quiet-resting);
    }
    button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .tile {
      flex: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: var(--ha-border-radius-lg);
      box-sizing: border-box;
      --mdc-icon-size: 24px;
      background: var(--ha-color-fill-success-normal-resting);
      color: var(--ha-color-on-success-normal, inherit);
    }
    .failed .tile,
    .error .tile {
      background: var(--ha-color-fill-danger-normal-resting);
      color: var(--ha-color-on-danger-normal, inherit);
    }
    .not_triggered .tile,
    .skipped .tile,
    .not_run .tile {
      background: var(--ha-color-fill-neutral-normal-resting);
      color: var(--secondary-text-color);
    }
    .active .tile {
      outline: 3px solid var(--primary-color);
      outline-offset: 1px;
    }
    .label {
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
      min-width: 0;
    }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-trace-step-list": HaTraceStepList;
  }
}
