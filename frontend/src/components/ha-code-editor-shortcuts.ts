import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";

export interface CodeEditorShortcutRow {
  label: string;
  combos: string[][];
}

export interface CodeEditorShortcutGroup {
  title: string;
  rows: CodeEditorShortcutRow[];
}

/** The key bindings of a code editor as groups of key chips and names. */
@customElement("ha-code-editor-shortcuts")
export class HaCodeEditorShortcuts extends LitElement {
  @property({ attribute: false }) public groups: CodeEditorShortcutGroup[] = [];

  @property() public note?: string;

  protected render() {
    return html`
      ${this.groups.map(
        (group) => html`
          <section>
            <h3>${group.title}</h3>
            <ul>
              ${group.rows.map(
                (row) => html`
                  <li>
                    <span class="keys">
                      ${row.combos.map(
                        (combo, index) => html`
                          ${
                            index > 0
                              ? html`<span class="or" aria-hidden="true"
                                  >/</span
                                >`
                              : nothing
                          }
                          <span class="combo">
                            ${combo.map((key) => html`<kbd>${key}</kbd>`)}
                          </span>
                        `
                      )}
                    </span>
                    <span class="label">${row.label}</span>
                  </li>
                `
              )}
            </ul>
          </section>
        `
      )}
      ${this.note ? html`<p class="note">${this.note}</p>` : nothing}
    `;
  }

  static styles = css`
    :host {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: var(--ha-space-4, 16px) var(--ha-space-6, 24px);
      text-align: start;
    }
    h3 {
      margin: 0 0 var(--ha-space-2, 8px);
      font-size: var(--ha-font-size-s, 0.8125rem);
      font-weight: var(--ha-font-weight-semibold, 600);
      color: var(--secondary-text-color);
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--ha-space-2, 8px);
    }
    li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2, 8px) var(--ha-space-3, 12px);
    }
    .keys {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-1, 4px);
      min-width: 7.5em;
    }
    .combo {
      display: inline-flex;
      gap: 3px;
    }
    .or {
      color: var(--secondary-text-color);
    }
    kbd {
      font: inherit;
      font-size: var(--ha-font-size-xs, 0.75rem);
      padding: 1px 6px;
      border: 1px solid var(--ha-color-outline, var(--divider-color));
      border-radius: var(--ha-border-radius-sm, 6px);
      background: var(--ha-color-surface-tone-1, var(--card-background-color));
      color: var(--primary-text-color);
      white-space: nowrap;
    }
    .label {
      color: var(--primary-text-color);
    }
    .note {
      grid-column: 1 / -1;
      margin: 0;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 0.8125rem);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-code-editor-shortcuts": HaCodeEditorShortcuts;
  }
}
