import type { TemplateResult } from "lit";
import { html, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { searchMatcher } from "../../../../common/regex/filter";
import "../../../../components/ha-button";
import "../../../../components/entity/ha-entity-picker";
import { showConfirmationDialog } from "../../../../dialogs/generic/show-dialog-box";
import type { ValueChangedEvent } from "../../../../types";
import "../../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../../components/input/ha-input-search";
import type { LovelaceConfig } from "../../../../data/lovelace/config/types";
import {
  applyEntityReplacementReview,
  reviewEntityReplacement,
} from "./entity-replacement";
import type { EntityRow } from "./entity-inspector";
import { inspectEntities } from "./entity-inspector";
import { ToolView } from "./tools-base";

@customElement("hui-tool-entities")
export class HuiToolEntities extends ToolView {
  @state() private _filter = "";

  @state() private _selected?: string;

  @state() private _replacement = "";

  @state() private _reviewing = false;

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
              <ha-entity-picker
                class="grow"
                .allowCustomEntity=${true}
                .disabled=${this._busy || this._reviewing}
                .label=${this._t("entities.replacement")}
                .value=${this._replacement}
                @value-changed=${this._replacementChanged}
              ></ha-entity-picker>
              <ha-button
                .disabled=${!this._replacement.trim() || this._replacement === this._selected || this._busy || this._reviewing}
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

  private _replacementChanged(ev: ValueChangedEvent<string | undefined>) {
    ev.stopPropagation();
    this._replacement = ev.detail.value?.trim() ?? "";
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
    const lovelace = this._lovelace;
    if (
      !from ||
      !to ||
      from === to ||
      !lovelace ||
      this._busy ||
      this._reviewing
    ) {
      return;
    }
    const userId = this.hass.user?.id;
    this._reviewing = true;
    try {
      const review = reviewEntityReplacement(lovelace.config, from, to);
      const count = review.count;
      if (!count) {
        return;
      }
      const confirmed = await showConfirmationDialog(this, {
        title: this._t("entities.swap"),
        text: this._t("entities.confirm_swap", { from, to, count }),
        confirmText: this._t("entities.swap"),
      });
      if (!confirmed) {
        return;
      }
      const ok = await this._save(
        (config) => {
          if (this._lovelace !== lovelace || this.hass.user?.id !== userId) {
            throw new Error(this._t("entities.changed_since_review"));
          }
          const replacement = applyEntityReplacementReview(config, review);
          if (!replacement) {
            throw new Error(this._t("entities.changed_since_review"));
          }
          return replacement;
        },
        this._t("entities.swapped", { from, to, count })
      );
      if (ok) {
        this._selected = undefined;
        this._replacement = "";
      }
    } catch (err: unknown) {
      this._fail(err);
    } finally {
      this._reviewing = false;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-tool-entities": HuiToolEntities;
  }
}
