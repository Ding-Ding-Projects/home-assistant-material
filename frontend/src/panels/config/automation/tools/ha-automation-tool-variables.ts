import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import "../../../../components/ha-card";
import type {
  RenderTemplateError,
  RenderTemplateResult,
} from "../../../../data/ws-templates";
import { subscribeRenderTemplate } from "../../../../data/ws-templates";
import type { AutomationToolContext } from "./registry";
import type {
  VariableAnalysis,
  VariableLocation,
} from "./automation-variables";
import { analyzeVariables, literalContext } from "./automation-variables";

const MAX_PREVIEWS = 20;

interface Preview {
  result?: string;
  error?: string;
}

@customElement("ha-automation-tool-variables")
export class HaAutomationToolVariables extends LitElement {
  @property({ attribute: false }) public context!: AutomationToolContext;

  @state() private _previews: Record<string, Preview> = {};

  private _unsubs: Promise<UnsubscribeFunc>[] = [];

  private _analysis?: VariableAnalysis;

  private _key?: string;

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribe();
  }

  private _unsubscribe() {
    this._unsubs.forEach((p) => p.then((u) => u()).catch(() => undefined));
    this._unsubs = [];
  }

  protected willUpdate(): void {
    if (!this.context) {
      return;
    }
    const analysis = analyzeVariables(this.context.config);
    const key = JSON.stringify(analysis.templates.map((t) => t.template));
    this._analysis = analysis;
    if (key === this._key) {
      return;
    }
    this._key = key;
    this._unsubscribe();
    this._previews = {};
    const variables = literalContext(analysis);
    const unique = [...new Set(analysis.templates.map((t) => t.template))];
    unique.slice(0, MAX_PREVIEWS).forEach((template) => {
      this._unsubs.push(
        subscribeRenderTemplate(
          this.context.hass.connection,
          (msg: RenderTemplateResult | RenderTemplateError) => {
            this._previews = {
              ...this._previews,
              [template]:
                "error" in msg ? { error: msg.error } : { result: msg.result },
            };
          },
          { template, variables, report_errors: true, timeout: 5 }
        )
      );
    });
  }

  private _where(loc: VariableLocation): string {
    const localize = this.context.hass.localize;
    const base = "ui.panel.config.automation.editor.tools_more.variables.";
    if (loc.section === "variables") {
      return localize(`${base}at_variables`);
    }
    return localize(`${base}at_${loc.section}`, { number: loc.index + 1 });
  }

  private _list(locs: VariableLocation[]): string {
    return locs.length
      ? locs.map((l) => this._where(l)).join(", ")
      : this.context.hass.localize(
          "ui.panel.config.automation.editor.tools_more.variables.nowhere"
        );
  }

  protected render() {
    if (!this.context || !this._analysis) {
      return nothing;
    }
    const localize = this.context.hass.localize;
    const base = "ui.panel.config.automation.editor.tools_more.variables.";
    const { variables, templates } = this._analysis;
    return html`
      <ha-card .header=${localize(`${base}title`)}>
        <div class="content">
          <p class="hint">${localize(`${base}description`)}</p>
          ${
            variables.length
              ? html`<div class="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>${localize(`${base}variable`)}</th>
                        <th>${localize(`${base}set_at`)}</th>
                        <th>${localize(`${base}used_at`)}</th>
                        <th>${localize(`${base}value`)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${variables.map(
                        (info) =>
                          html`<tr>
                            <td class="mono">${info.name}</td>
                            <td>
                              ${
                                info.builtin && !info.setAt.length
                                  ? localize(`${base}provided`)
                                  : this._list(info.setAt)
                              }
                            </td>
                            <td>${this._list(info.usedAt)}</td>
                            <td class="mono">
                              ${
                                info.literal !== undefined
                                  ? JSON.stringify(info.literal)
                                  : localize(`${base}known_when_run`)
                              }
                            </td>
                          </tr>`
                      )}
                    </tbody>
                  </table>
                </div>`
              : html`<p>${localize(`${base}no_variables`)}</p>`
          }
        </div>
      </ha-card>
      <ha-card .header=${localize(`${base}templates`)}>
        <div class="content">
          ${
            templates.length
              ? [...new Map(templates.map((t) => [t.template, t])).values()]
                  .slice(0, MAX_PREVIEWS)
                  .map((t) => {
                    const preview = this._previews[t.template];
                    return html`<div class="template">
                      <code>${t.template}</code>
                      <div class="meta">${this._where(t.location)}</div>
                      <div class="result ${preview?.error ? "error" : ""}">
                        ${
                          preview
                            ? (preview.error ?? preview.result)
                            : localize(`${base}rendering`)
                        }
                      </div>
                    </div>`;
                  })
              : html`<p>${localize(`${base}no_templates`)}</p>`
          }
          <p class="hint">${localize(`${base}preview_note`)}</p>
        </div>
      </ha-card>
    `;
  }

  static styles = css`
    :host {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--ha-space-4);
    }
    .content {
      padding: var(--ha-space-4);
    }
    .hint,
    .meta {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .table-scroll {
      max-width: 100%;
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th,
    td {
      text-align: start;
      padding: var(--ha-space-2);
      border-bottom: 1px solid var(--divider-color);
      vertical-align: top;
    }
    .mono,
    code {
      font-family: var(--ha-font-family-code, monospace);
    }
    .template {
      display: grid;
      gap: var(--ha-space-1);
      padding: var(--ha-space-3) 0;
      border-bottom: 1px solid var(--divider-color);
    }
    code {
      overflow-wrap: anywhere;
      background: var(
        --ha-color-surface-tone-1,
        var(--secondary-background-color)
      );
      padding: var(--ha-space-2);
      border-radius: var(--ha-border-radius-md);
    }
    .result {
      font-weight: var(--ha-font-weight-semibold);
      overflow-wrap: anywhere;
    }
    .result.error {
      color: var(--ha-color-on-error-container, var(--error-color));
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-tool-variables": HaAutomationToolVariables;
  }
}
