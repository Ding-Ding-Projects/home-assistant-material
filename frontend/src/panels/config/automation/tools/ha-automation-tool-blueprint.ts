import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { copyToClipboard } from "../../../../common/util/copy-clipboard";
import "../../../../components/ha-button";
import "../../../../components/ha-card";
import { showToast } from "../../../../util/toast";
import type { StepSection, StepSelection } from "./automation-blueprint-maker";
import { buildBlueprint, listSteps } from "./automation-blueprint-maker";
import type { AutomationSnippet } from "./automation-snippets";
import {
  addSnippet,
  insertSnippet,
  loadSnippets,
  removeSnippet,
  saveSnippets,
} from "./automation-snippets";
import type { AutomationToolContext } from "./registry";

const stepLabel = (step: unknown): string => {
  const s = (step ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v : undefined);
  return (
    text(s.alias) ??
    text(s.action) ??
    text(s.service) ??
    text(s.trigger) ??
    text(s.platform) ??
    text(s.condition) ??
    Object.keys(s)[0] ??
    "?"
  );
};

const keyOf = (sel: StepSelection) => `${sel.section}:${sel.index}`;

@customElement("ha-automation-tool-blueprint")
export class HaAutomationToolBlueprint extends LitElement {
  @property({ attribute: false }) public context!: AutomationToolContext;

  @state() private _selected = new Set<string>();

  @state() private _name = "";

  @state() private _snippets: AutomationSnippet[] = loadSnippets();

  @state() private _snippetName = "";

  private _t(key: string, values?: Record<string, string | number>) {
    return this.context.hass.localize(
      `ui.panel.config.automation.editor.tools_more.blueprint.${key}` as any,
      values
    );
  }

  private _selection(): StepSelection[] {
    return listSteps(this.context.config)
      .map(({ section, index }) => ({ section, index }))
      .filter((sel) => this._selected.has(keyOf(sel)));
  }

  private _nameChanged(ev: Event) {
    this._name = (ev.target as HTMLInputElement).value;
  }

  private _snippetNameChanged(ev: Event) {
    this._snippetName = (ev.target as HTMLInputElement).value;
  }

  private _draft() {
    const selection = this._selection();
    return selection.length
      ? buildBlueprint(this.context.config, selection, {
          name: this._name.trim() || this._t("default_name"),
        })
      : undefined;
  }

  private async _copyDraft() {
    const draft = this._draft();
    if (draft) {
      await this._copy(draft.yaml);
    }
  }

  private _toggle(ev: Event) {
    const target = ev.currentTarget as HTMLElement;
    const next = new Set(this._selected);
    const key = `${target.dataset.section}:${target.dataset.index}`;
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    this._selected = next;
  }

  private async _copy(text: string) {
    await copyToClipboard(text, this);
    showToast(this, { message: this._t("copied") });
  }

  private _saveSnippet() {
    const selection = this._selection();
    const sections = new Set(selection.map((s) => s.section));
    if (sections.size !== 1 || !this._snippetName.trim()) {
      return;
    }
    const section = selection[0].section as StepSection;
    const all = listSteps(this.context.config);
    const steps = selection.map(
      (sel) =>
        all.find((a) => a.section === sel.section && a.index === sel.index)!
          .step
    );
    this._snippets = addSnippet(
      this._snippets,
      this._snippetName,
      section,
      steps
    );
    saveSnippets(this._snippets);
    this._snippetName = "";
  }

  private _insert(ev: Event) {
    const id = (ev.currentTarget as HTMLElement).dataset.id;
    const snippet = this._snippets.find((s) => s.id === id);
    if (!snippet) {
      return;
    }
    this.context.applyConfig?.(insertSnippet(this.context.config, snippet));
    showToast(this, { message: this._t("inserted", { name: snippet.name }) });
  }

  private _remove(ev: Event) {
    const id = (ev.currentTarget as HTMLElement).dataset.id;
    this._snippets = removeSnippet(this._snippets, id ?? "");
    saveSnippets(this._snippets);
  }

  protected render() {
    if (!this.context) {
      return nothing;
    }
    const steps = listSteps(this.context.config);
    const selection = this._selection();
    const draft = this._draft();
    const oneSection = new Set(selection.map((s) => s.section)).size === 1;
    return html`
      <ha-card .header=${this._t("title")}>
        <div class="content">
          <p class="hint">${this._t("description")}</p>
          <label class="field">
            <span>${this._t("name")}</span>
            <input
              .value=${this._name}
              placeholder=${this._t("default_name")}
              @input=${this._nameChanged}
            />
          </label>
          <ul class="steps">
            ${steps.map((entry) => {
              const sel = { section: entry.section, index: entry.index };
              return html`<li>
                <label>
                  <input
                    type="checkbox"
                    .checked=${this._selected.has(keyOf(sel))}
                    data-section=${sel.section}
                    data-index=${sel.index}
                    @change=${this._toggle}
                  />
                  <span class="kind">${this._t(`kind_${entry.section}`)}</span>
                  ${stepLabel(entry.step)}
                </label>
              </li>`;
            })}
          </ul>
          ${
            draft
              ? html`
                  <h3>${this._t("inputs")}</h3>
                  ${
                    draft.inputs.length
                      ? html`<ul class="inputs">
                          ${draft.inputs.map(
                            (input) =>
                              html`<li>
                                <code>${input.key}</code>
                                <span class="hint">
                                  ${this._t(`input_${input.kind}`)}
                                </span>
                              </li>`
                          )}
                        </ul>`
                      : html`<p class="hint">${this._t("no_inputs")}</p>`
                  }
                  <pre>${draft.yaml}</pre>
                  <div class="actions">
                    <ha-button @click=${this._copyDraft}>
                      ${this._t("copy")}
                    </ha-button>
                  </div>
                  <p class="hint">${this._t("save_note")}</p>
                `
              : html`<p class="hint">${this._t("select_steps")}</p>`
          }
        </div>
      </ha-card>
      <ha-card .header=${this._t("snippets")}>
        <div class="content">
          <p class="hint">${this._t("snippets_description")}</p>
          <div class="row">
            <input
              aria-label=${this._t("snippet_name")}
              placeholder=${this._t("snippet_name")}
              .value=${this._snippetName}
              @input=${this._snippetNameChanged}
            />
            <ha-button
              .disabled=${!oneSection || !this._snippetName.trim()}
              @click=${this._saveSnippet}
            >
              ${this._t("save_snippet")}
            </ha-button>
          </div>
          ${
            oneSection
              ? nothing
              : html`<p class="hint">${this._t("snippet_one_kind")}</p>`
          }
          ${
            this._snippets.length
              ? html`<ul class="snippets">
                  ${this._snippets.map(
                    (snippet) =>
                      html`<li>
                        <span class="grow">
                          ${snippet.name}
                          <span class="hint">
                            ${this._t(`kind_${snippet.section}`)} ·
                            ${snippet.steps.length}
                          </span>
                        </span>
                        <ha-button
                          appearance="filled"
                          size="s"
                          .disabled=${!this.context.applyConfig}
                          data-id=${snippet.id}
                          @click=${this._insert}
                        >
                          ${this._t("insert")}
                        </ha-button>
                        <ha-button
                          appearance="plain"
                          size="s"
                          data-id=${snippet.id}
                          @click=${this._remove}
                        >
                          ${this._t("remove")}
                        </ha-button>
                      </li>`
                  )}
                </ul>`
              : html`<p class="hint">${this._t("no_snippets")}</p>`
          }
        </div>
      </ha-card>
    `;
  }

  static styles = css`
    :host {
      display: grid;
      gap: var(--ha-space-4);
    }
    .content {
      padding: var(--ha-space-4);
      display: grid;
      gap: var(--ha-space-3);
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--ha-space-2);
    }
    li {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
    }
    .grow {
      flex: 1;
    }
    .kind {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .hint {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      margin: 0;
    }
    .field {
      display: grid;
      gap: var(--ha-space-1);
    }
    .row {
      display: flex;
      gap: var(--ha-space-2);
      align-items: center;
    }
    input:not([type="checkbox"]) {
      flex: 1;
      padding: var(--ha-space-2) var(--ha-space-3);
      border: 1px solid var(--ha-color-outline, var(--divider-color));
      border-radius: var(--ha-border-radius-md);
      background: var(--card-background-color);
      color: var(--primary-text-color);
      font: inherit;
    }
    pre {
      margin: 0;
      padding: var(--ha-space-3);
      overflow: auto;
      max-height: 320px;
      border-radius: var(--ha-border-radius-md);
      background: var(
        --ha-color-surface-tone-1,
        var(--secondary-background-color)
      );
      font-family: var(--ha-font-family-code, monospace);
    }
    h3 {
      margin: 0;
      font-size: var(--ha-font-size-m);
      font-weight: var(--ha-font-weight-semibold);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-tool-blueprint": HaAutomationToolBlueprint;
  }
}
