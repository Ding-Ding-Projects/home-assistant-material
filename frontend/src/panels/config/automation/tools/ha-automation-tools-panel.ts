import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-bottom-sheet";
import "../../../../components/ha-dialog";
import "../../../../components/ha-svg-icon";
import type { ManualAutomationConfig } from "../../../../data/automation";
import { haStyle } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import type { AutomationToolContext } from "./registry";
import { AUTOMATION_TOOLS } from "./registry";

/**
 * The Tools panel of the automation editor: a dialog on a wide screen and a
 * bottom sheet on a phone. It lists every tool of the registry and shows the
 * chosen one beside the configuration being edited.
 */
@customElement("ha-automation-tools-panel")
export class HaAutomationToolsPanel extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public config!: ManualAutomationConfig;

  @property({ attribute: false }) public entityId?: string;

  @property({ attribute: false }) public automationId?: string;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public initialTool?: string;

  @property({ attribute: false }) public applyConfig?: (
    config: ManualAutomationConfig
  ) => void;

  @state() private _tool?: string;

  private _elements = new Map<string, HTMLElement>();

  private get _active() {
    const id = this._tool ?? this.initialTool ?? AUTOMATION_TOOLS[0]?.id;
    return AUTOMATION_TOOLS.find((tool) => tool.id === id);
  }

  private _t(key: string) {
    return this.hass.localize(
      `ui.panel.config.automation.editor.tools.${key}` as any
    );
  }

  protected render() {
    const active = this._active;
    const body = html`
      <div class="tabs" role="tablist" aria-label=${this._t("title")}>
        ${AUTOMATION_TOOLS.map(
          (tool) =>
            html`<button
              role="tab"
              class=${classMap({ tab: true, active: tool.id === active?.id })}
              aria-selected=${tool.id === active?.id}
              .toolId=${tool.id}
              @click=${this._select}
            >
              <ha-svg-icon .path=${tool.icon}></ha-svg-icon>
              ${this.hass.localize(tool.labelKey as any)}
            </button>`
        )}
      </div>
      <div class=${classMap({ stage: true, steady: !this.narrow })}>
        ${
          active?.descriptionKey
            ? html`<p class="description">
                ${this.hass.localize(active.descriptionKey as any)}
              </p>`
            : nothing
        }
        <div class="content" role="tabpanel">${this._renderTool()}</div>
      </div>
    `;
    if (this.narrow) {
      return html`<ha-bottom-sheet open flexcontent @closed=${this._closed}>
        <div class="sheet">${body}</div>
      </ha-bottom-sheet>`;
    }
    return html`<ha-dialog
      open
      width="full"
      flexcontent
      header-title=${this._t("title")}
      @closed=${this._closed}
    >
      ${body}
    </ha-dialog>`;
  }

  private _renderTool() {
    const active = this._active;
    if (!active) {
      return nothing;
    }
    let el = this._elements.get(active.element);
    if (!el) {
      el = document.createElement(active.element);
      this._elements.set(active.element, el);
      active.open();
    }
    const context: AutomationToolContext = {
      hass: this.hass,
      config: this.config,
      entityId: this.entityId,
      automationId: this.automationId,
      applyConfig: this.applyConfig,
    };
    (el as any).context = context;
    return el;
  }

  private _select(ev: Event) {
    this._tool = (ev.currentTarget as HTMLElement & { toolId: string }).toolId;
  }

  private _closed(ev: Event) {
    ev.stopPropagation();
    fireEvent(this, "closed");
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        /* The tab row never shrinks: in a flex column an overflow container
           may shrink to nothing, which sliced the chips in half on a phone.
           It stays in place while the tool below it scrolls. */
        .tabs {
          position: sticky;
          top: 0;
          z-index: 1;
          flex: none;
          display: flex;
          gap: var(--ha-space-2);
          overflow-x: auto;
          padding: var(--ha-space-1) 0 var(--ha-space-2);
          background: var(--ha-bottom-sheet-surface-background, inherit);
          scrollbar-width: none;
        }
        .tabs::-webkit-scrollbar {
          display: none;
        }
        .tab {
          flex: none;
          display: inline-flex;
          align-items: center;
          gap: var(--ha-space-2);
          padding: var(--ha-space-2) var(--ha-space-4);
          border: 1px solid var(--ha-color-outline, var(--divider-color));
          border-radius: var(--ha-border-radius-pill, 999px);
          background: transparent;
          color: var(--primary-text-color);
          font: inherit;
          cursor: pointer;
        }
        .tab ha-svg-icon {
          --mdc-icon-size: 18px;
        }
        .tab.active {
          background: var(--ha-color-primary-container);
          color: var(--ha-color-on-primary-container);
          border-color: transparent;
        }
        .tab:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: 2px;
        }
        ha-bottom-sheet {
          --ha-bottom-sheet-height: min(85dvh, 760px);
        }
        .description {
          margin: var(--ha-space-1) 0 var(--ha-space-3);
          color: var(--secondary-text-color);
        }
        /* In the dialog the body keeps one height, so the dialog's top edge and
           size do not jump from tab to tab; a tall tool scrolls inside it. */
        .stage {
          display: flex;
          flex-direction: column;
          flex: 1 1 auto;
          min-width: 0;
          min-block-size: 0;
        }
        /* On a phone the dialog fills the screen, so the tool takes all the
           room that is left and scrolls inside it; a fixed height would leave
           blank space below it or cut the tool. */
        .stage.steady {
          box-sizing: border-box;
          min-block-size: 50dvh;
        }
        @media (min-width: 601px) and (min-height: 600px) {
          .stage.steady {
            block-size: min(70dvh, 640px);
            min-block-size: 0;
            flex: none;
          }
        }
        .content {
          display: flex;
          flex-direction: column;
          flex: 1 1 auto;
          min-width: 0;
          min-block-size: 0;
          overflow: auto;
        }
        /* On a phone the sheet has a height of its own, so a tool can take the
           space that is left. The handle sits over the top 16px. */
        .sheet {
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
          block-size: min(85dvh, 760px);
          padding: var(--ha-space-6) var(--ha-space-4)
            calc(var(--ha-space-4) + var(--safe-area-inset-bottom, 0px));
          min-height: 0;
          min-width: 0;
        }
        .content > * {
          display: block;
          flex: 0 0 auto;
          min-width: 0;
          max-width: 100%;
        }
        /* The flow view fills the room that is left under its toolbar. */
        .content > ha-automation-tool-flow {
          display: flex;
          flex: 1 1 auto;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-tools-panel": HaAutomationToolsPanel;
  }
}
