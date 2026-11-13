import type { TemplateResult } from "lit";
import { html, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { searchMatcher } from "../../../../common/regex/filter";
import "../../../../components/ha-button";
import "../../../../components/input/ha-input";
import "../../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../../components/input/ha-input-search";
import type { LovelaceConfig } from "../../../../data/lovelace/config/types";
import { replaceEntity } from "../dashboard-tools";
import type { EntityRow } from "./entity-inspector";
import { inspectEntities } from "./entity-inspector";
import { ToolView } from "./tools-base";

@customElement("hui-tool-entities")
export class HuiToolEntities extends ToolView {
  @state() private _filter = "";

  @state() private _selected?: string;

  @state() private _replacement = "";

  private _rows = memoizeOne(
    (config: LovelaceConfig, states: ToolView["hass"]["states"]) =>
      inspectEntities(config, states)
  );

  private _visible = memoizeOne((rows: EntityRow[], filter: string) => {
    if (!filter) {
      return rows;
    }
    const match = searchMatcher(filter);
    return rows.filter((row) =>
      match(row.entityId, ...row.uses.flatMap((u) => [u.label, u.type]))
    );
  });

  protected render(): TemplateResult | typeof nothing {
    const config = this._config;
    if (!config) {
      return nothing;
    }
    const rows = this._rows(config, this.hass.states);
    const visible = this._visible(rows, this._filter);
    const missing = rows.filter((r) => r.status === "missing").length;
    const unavailable = rows.filter((r) => r.status === "unavailable").length;
    return html`
      <p class="intro">${this._t("entities.intro")}</p>
      ${this._renderMessages()}
      <div class="stats">
        <div class="stat">
          <strong>${rows.length}</strong>${this._t("entities.total")}
        </div>
        <div class="stat">
          <strong>${missing}</strong>${this._t("entities.missing")}
        </div>
        <div class="stat">
          <strong>${unavailable}</strong>${this._t("entities.unavailable")}
        </div>
      </div>
      <ha-input-search
        appearance="outlined"
        .label=${this._t("entities.search")}
        .value=${this._filter}
        @input=${this._filterChanged}
      ></ha-input-search>
      ${
        this._selected
          ? html`<div
              class="row"
              role="group"
              aria-label=${this._t("entities.swap")}
            >
              <span class="mono">${this._selected}</span>
              <ha-input
                class="grow"
                .label=${this._t("entities.replacement")}
                .value=${this._replacement}
                @input=${this._replacementChanged}
              ></ha-input>
              <ha-button
                .disabled=${!this._replacement.trim() || this._busy}
                @click=${this._swap}
              >
                ${this._t("entities.swap")}
              </ha-button>
            </div>`
          : html`<p class="hint">${this._t("entities.pick")}</p>`
      }
      ${
        visible.length
          ? html`<ul class="list">
              ${visible.map((row) => this._renderRow(row))}
            </ul>`
          : html`<p class="empty">${this._t("entities.none")}</p>`
      }
    `;
  }

  private _renderRow(row: EntityRow): TemplateResult {
    const selected = this._selected === row.entityId;
    return html`<li>
      <div class="main">
        <b class="mono">${row.entityId}</b>
        <span class="muted">
          ${row.uses.map((use, i) => html`${i ? ", " : ""}${use.label || use.type}`)}
        </span>
      </div>
      <span
        class="pill ${
          row.status === "missing"
            ? "error"
            : row.status === "unavailable"
              ? "warning"
              : "success"
        }"
      >
        ${
          row.status === "ok"
            ? row.state
            : this._t(`entities.status.${row.status}`)
        }
      </span>
      <ha-button
        size="s"
        appearance=${selected ? "filled" : "plain"}
        aria-pressed=${selected ? "true" : "false"}
        .entityId=${row.entityId}
        @click=${this._select}
      >
        ${this._t("entities.choose")}
      </ha-button>
      <ha-button
        size="s"
        appearance="plain"
        .view=${row.uses[0].path.view}
        @click=${this._show}
      >
        ${this._t("entities.show")}
      </ha-button>
    </li>`;
  }

  private _filterChanged(ev: Event) {
    this._filter = (ev.target as HaInputSearch).value ?? "";
  }

  private _replacementChanged(ev: Event) {
    this._replacement = (
      (ev.target as HTMLElement & { value?: string }).value ?? ""
    ).trim();
  }

  private _select(ev: Event) {
    const id = (ev.currentTarget as HTMLElement & { entityId: string })
      .entityId;
    this._selected = this._selected === id ? undefined : id;
    this._replacement = "";
  }

  private _show(ev: Event) {
    this._openView((ev.currentTarget as HTMLElement & { view: number }).view);
  }

  private async _swap() {
    const from = this._selected;
    const to = this._replacement;
    if (!from || !to) {
      return;
    }
    try {
      const count = replaceEntity(this._config!, from, to).count;
      const ok = await this._save(
        (config) => replaceEntity(config, from, to).config,
        this._t("entities.swapped", { from, to, count })
      );
      if (ok) {
        this._selected = undefined;
        this._replacement = "";
      }
    } catch (err: unknown) {
      this._fail(err);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-tool-entities": HuiToolEntities;
  }
}
