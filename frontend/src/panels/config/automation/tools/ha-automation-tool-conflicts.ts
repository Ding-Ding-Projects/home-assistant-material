import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-spinner";
import type { AutomationConfig } from "../../../../data/automation";
import { getAutomationStateConfig } from "../../../../data/automation";
import { haStyle } from "../../../../resources/styles";
import type { AnalysedAutomation, Finding } from "./conflicts";
import { analyse, isAnalysable } from "./conflicts";
import type { AutomationToolContext } from "./registry";

const BATCH = 6;

@customElement("ha-automation-tool-conflicts")
export class HaAutomationToolConflicts extends LitElement {
  @property({ attribute: false }) public context!: AutomationToolContext;

  @state() private _loading = false;

  @state() private _error?: string;

  @state() private _findings?: Finding[];

  @state() private _total = 0;

  @state() private _skipped = 0;

  @state() private _ignored = new Set<string>();

  private _t(key: string, vars?: Record<string, string | number>) {
    return this.context.hass.localize(
      `ui.panel.config.automation.editor.tools.conflicts.${key}` as any,
      vars as any
    );
  }

  private _name(entityId: string): string {
    return (
      (this.context.hass.states[entityId]?.attributes?.friendly_name as
        string | undefined) ?? entityId
    );
  }

  protected firstUpdated(): void {
    this._scan();
  }

  private async _scan() {
    const { hass, entityId, config } = this.context;
    this._loading = true;
    this._error = undefined;
    try {
      const ids = Object.keys(hass.states).filter(
        (id) => id.startsWith("automation.") && hass.states[id].attributes.id
      );
      const analysed: AnalysedAutomation[] = [];
      let skipped = 0;
      for (let i = 0; i < ids.length; i += BATCH) {
        // eslint-disable-next-line no-await-in-loop
        const results = await Promise.all(
          ids.slice(i, i + BATCH).map(async (id) => {
            if (id === entityId) {
              return { id, config: config as AutomationConfig };
            }
            try {
              return {
                id,
                config: (await getAutomationStateConfig(hass, id)).config,
              };
            } catch (_err) {
              return { id, config: undefined };
            }
          })
        );
        for (const r of results) {
          if (r.config && isAnalysable(r.config)) {
            analysed.push({
              id: r.id,
              name: this._name(r.id),
              config: r.config,
            });
          } else {
            skipped++;
          }
        }
      }
      // An automation that is not saved yet is analysed as well.
      if (!entityId && isAnalysable(config)) {
        analysed.push({
          id: "automation.unsaved",
          name: config.alias || this._t("unsaved"),
          config,
        });
      }
      const { conflicts, loops } = analyse(analysed);
      this._findings = [...conflicts, ...loops];
      this._total = analysed.length;
      this._skipped = skipped;
    } catch (err: any) {
      this._error = err?.message ?? String(err);
    } finally {
      this._loading = false;
    }
  }

  private _key(f: Finding): string {
    return f.kind === "conflict"
      ? `c:${f.entity}:${f.first.id}:${f.second.id}`
      : `l:${f.cycle.map((c) => c.id).join(">")}`;
  }

  private _ignore(ev: Event) {
    const f = (ev.currentTarget as HTMLElement & { finding: Finding }).finding;
    this._ignored = new Set([...this._ignored, this._key(f)]);
  }

  protected render() {
    if (this._loading) {
      return html`<div class="loading">
        <ha-spinner size="small"></ha-spinner>${this._t("scanning")}
      </div>`;
    }
    if (this._error) {
      return html`<ha-alert alert-type="error">${this._error}</ha-alert>`;
    }
    const visible = (this._findings ?? []).filter(
      (f) => !this._ignored.has(this._key(f))
    );
    return html`
      <p class="summary">
        ${
          visible.length
            ? this._t("summary", { count: visible.length, total: this._total })
            : this._t("none", { total: this._total })
        }
      </p>
      <ha-alert alert-type="info">${this._t("possibilities")}</ha-alert>
      ${
        this._skipped
          ? html`<p class="hint">
              ${this._t("skipped", { count: this._skipped })}
            </p>`
          : nothing
      }
      <div class="cards">
        ${visible.map((f) => (f.kind === "conflict" ? this._conflict(f) : this._loop(f)))}
      </div>
      <ha-button appearance="plain" @click=${this._scan}
        >${this._t("rescan")}</ha-button
      >
    `;
  }

  private _conflict(f: Extract<Finding, { kind: "conflict" }>) {
    return html`<section class="card">
      <h3>${this._t("conflict_title", { entity: this._name(f.entity) })}</h3>
      <ul>
        <li>
          <b>${f.first.name}</b>: ${f.first.command.service}
          <span class="sub">(${f.first.command.path})</span>
        </li>
        <li>
          <b>${f.second.name}</b>: ${f.second.command.service}
          <span class="sub">(${f.second.command.path})</span>
        </li>
      </ul>
      <p class="reason">${this._t(`basis.${f.basis}` as any)}</p>
      <ha-button
        appearance="plain"
        size="small"
        .finding=${f}
        @click=${this._ignore}
        >${this._t("ignore")}</ha-button
      >
    </section>`;
  }

  private _loop(f: Extract<Finding, { kind: "loop" }>) {
    return html`<section class="card">
      <h3>${this._t("loop_title")}</h3>
      <ol>
        ${f.cycle.map(
          (c, i) => html`<li><b>${c.name}</b> → ${this._name(f.via[i])}</li>`
        )}
      </ol>
      <p class="reason">${this._t("loop_reason")}</p>
      <ha-button
        appearance="plain"
        size="small"
        .finding=${f}
        @click=${this._ignore}
        >${this._t("ignore")}</ha-button
      >
    </section>`;
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .loading {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          padding: var(--ha-space-4);
        }
        .summary {
          font-size: var(--ha-font-size-l);
          font-weight: var(--ha-font-weight-semibold);
          margin: 0 0 var(--ha-space-3);
        }
        .hint,
        .sub {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
        }
        .cards {
          display: grid;
          grid-template-columns: repeat(
            auto-fit,
            minmax(min(100%, 280px), 1fr)
          );
          gap: var(--ha-space-3);
          margin: var(--ha-space-3) 0;
        }
        .card {
          padding: var(--ha-space-4);
          border-radius: var(--ha-border-radius-xl);
          background: var(
            --ha-color-surface-tone-1,
            var(--secondary-background-color)
          );
          border: 1px solid var(--ha-color-outline, var(--divider-color));
        }
        .card h3 {
          margin: 0 0 var(--ha-space-2);
          font-size: var(--ha-font-size-m);
        }
        .card ul,
        .card ol {
          margin: 0;
          padding-inline-start: var(--ha-space-5);
        }
        .reason {
          color: var(--secondary-text-color);
          margin: var(--ha-space-2) 0;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-tool-conflicts": HaAutomationToolConflicts;
  }
}
