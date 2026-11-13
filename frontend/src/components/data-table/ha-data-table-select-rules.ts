import { mdiClose, mdiPlus } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../common/dom/fire_event";
import {
  safeGetStored,
  safeSetStored,
} from "../../common/preferences/safe-storage";
import type {
  ApplyMode,
  CombineMode,
  RuleColumnLike,
  RuleFields,
  RuleKind,
  RuleRow,
  SelectRule,
  SelectRuleField,
  TextOperator,
} from "../../common/select-by-rule/select-by-rule";
import {
  ANY_FIELD,
  APPLY_MODES,
  applySelection,
  availableRuleKinds,
  detectRuleFields,
  hasRuleFields,
  matchRows,
  newRule,
  pruneRules,
  rowPreviewName,
  sanitizeStoredRuleSet,
} from "../../common/select-by-rule/select-by-rule";
import type { LocalizeFunc } from "../../common/translations/localize";
import "../ha-adaptive-dialog";
import "../ha-button";
import "../ha-checkbox";
import "../ha-dialog-footer";
import "../ha-icon-button";
import "../ha-select";
import type { HaSelectOption } from "../ha-select";
import "../ha-svg-icon";
import "../ha-switch";
import "../input/ha-input";
import "../input/ha-input-search";

declare global {
  interface HASSDomEvents {
    "select-by-rule-apply": { ids: string[] };
    "select-by-rule-closed": undefined;
  }
}

const PREVIEW_ROWS = 5;

const TEXT_OPERATORS: TextOperator[] = [
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "matches",
];

const KIND_KEYS: Record<RuleKind, string> = {
  text: "add_text",
  label: "add_label",
  value: "add_value",
  state: "add_state",
};

/** An element that remembers which rule and which part of it it edits. */
interface RuleControl extends HTMLElement {
  ruleId: string;
  prop: string;
  ruleKind?: RuleKind;
}

/**
 * @element ha-data-table-select-rules
 *
 * @summary
 * The "Select by rule" dialog of a list. The person builds text, label,
 * value and state rules, combines them with "all" or "any", sees how many of
 * the shown rows match and a few names, and applies the result to the
 * selection: replace it, add to it, remove from it or keep only the matching
 * rows. It is a bottom sheet on a phone. Only the rows passed in `rows`, the
 * ones the list shows now, are considered. The rule set last used is
 * remembered per page in browser storage.
 *
 * @fires select-by-rule-apply - `detail.ids` is the new selection.
 * @fires select-by-rule-closed - The dialog closed.
 */
@customElement("ha-data-table-select-rules")
export class HaDataTableSelectRules extends LitElement {
  @property({ type: Boolean }) public open = false;

  /** The rows the list shows now. */
  @property({ attribute: false }) public rows: RuleRow[] = [];

  @property({ attribute: false }) public columns: Record<
    string,
    RuleColumnLike
  > = {};

  @property({ attribute: false }) public hiddenColumns?: string[];

  @property({ attribute: false }) public selectFields?: SelectRuleField[];

  @property({ attribute: false }) public idKey = "id";

  /** The identifiers that are selected now. */
  @property({ attribute: false }) public current: string[] = [];

  /** Names the page for remembering its rule set. */
  @property({ attribute: "storage-key" }) public storageKey = "default";

  @property({ attribute: false }) public localize!: LocalizeFunc;

  @state() private _rules: SelectRule[] = [];

  @state() private _combine: CombineMode = "all";

  @state() private _apply: ApplyMode = "replace";

  private _detect = memoizeOne(
    (
      columns: Record<string, RuleColumnLike>,
      rows: RuleRow[],
      hidden: string[] | undefined,
      extra: SelectRuleField[] | undefined,
      localize: LocalizeFunc
    ): RuleFields =>
      detectRuleFields(columns, rows, {
        hiddenColumns: hidden,
        extra,
        fallbackTitles: {
          area: localize(
            "ui.components.subpage-data-table.select_rule.field_area"
          ),
          integration: localize(
            "ui.components.subpage-data-table.select_rule.field_integration"
          ),
          domain: localize(
            "ui.components.subpage-data-table.select_rule.field_domain"
          ),
        },
      })
  );

  private get _fields(): RuleFields {
    return this._detect(
      this.columns,
      this.rows,
      this.hiddenColumns,
      this.selectFields,
      this.localize
    );
  }

  private get _storeKey() {
    return `select-by-rule:${this.storageKey}`;
  }

  /** A string of this dialog, by the end of its key. */
  private _t(name: string, values?: Record<string, string | number>): string {
    return this.localize(
      `ui.components.subpage-data-table.select_rule.${name}` as "ui.components.subpage-data-table.select_rule.title",
      values
    );
  }

  protected willUpdate(changed: PropertyValues) {
    if (changed.has("open") && this.open) {
      const stored = sanitizeStoredRuleSet(safeGetStored(this._storeKey));
      const fields = this._fields;
      this._rules = pruneRules(stored.rules, fields);
      this._combine = stored.combine;
      this._apply = stored.apply;
      if (!this._rules.length) {
        const kinds = availableRuleKinds(fields);
        if (kinds.length) {
          this._rules = [newRule(kinds[0], fields)];
        }
      }
    }
  }

  private _match(fields: RuleFields) {
    return matchRows(
      this.rows,
      this._rules,
      this._combine,
      { anyFields: fields.textFields.map((field) => field.key) },
      this.idKey
    );
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.open) {
      return nothing;
    }
    const fields = this._fields;
    const usable = hasRuleFields(fields);
    const result = this._match(fields);
    const nextSelection = applySelection(this.current, result.ids, this._apply);
    return html`
      <ha-adaptive-dialog
        open
        width="medium"
        header-title=${this._t("title")}
        @closed=${this._closed}
      >
        <div class="body">
          <p class="note">${this._t("intro")}</p>
          ${
            usable
              ? html`
                  ${
                    this._rules.length > 1
                      ? html`<ha-select
                          .label=${this._t("match")}
                          .value=${this._combine}
                          .options=${this._combineOptions(this.localize)}
                          @selected=${this._combineChanged}
                        ></ha-select>`
                      : nothing
                  }
                  ${this._rules.map((rule) => this._renderRule(rule, fields))}
                  <div class="adders">
                    ${availableRuleKinds(fields).map(
                      (kind) => html`
                        <ha-button
                          appearance="plain"
                          size="small"
                          .ruleKind=${kind}
                          @click=${this._addClicked}
                        >
                          <ha-svg-icon
                            slot="start"
                            .path=${mdiPlus}
                          ></ha-svg-icon>
                          ${this._t(KIND_KEYS[kind])}
                        </ha-button>
                      `
                    )}
                  </div>
                  <ha-select
                    .label=${this._t("apply_as")}
                    .value=${this._apply}
                    .options=${this._applyOptions(this.localize)}
                    @selected=${this._applyChanged}
                  ></ha-select>
                  <div class="review" role="status" aria-live="polite">
                    ${this._renderReview(result)}
                  </div>
                `
              : html`<p class="note">${this._t("no_fields")}</p>`
          }
        </div>
        <ha-dialog-footer slot="footer">
          <ha-button
            slot="secondaryAction"
            appearance="plain"
            data-dialog="close"
          >
            ${this.localize("ui.common.cancel")}
          </ha-button>
          <ha-button
            slot="primaryAction"
            ?disabled=${!usable || !!result.blocked}
            @click=${this._applyRules}
          >
            ${this._t("apply", { count: nextSelection.length })}
          </ha-button>
        </ha-dialog-footer>
      </ha-adaptive-dialog>
    `;
  }

  private _combineOptions = memoizeOne((_localize: LocalizeFunc) => [
    { value: "all", label: this._t("match_all") },
    { value: "any", label: this._t("match_any") },
  ]);

  private _applyOptions = memoizeOne((_localize: LocalizeFunc) =>
    APPLY_MODES.map((mode) => ({
      value: mode,
      label: this._t(`apply_${mode}`),
    }))
  );

  private _renderReview(result: ReturnType<typeof matchRows>): TemplateResult {
    if (result.blocked === "empty") {
      return html`<p class="note">${this._t("empty")}</p>`;
    }
    if (result.blocked === "invalid") {
      return html`<p class="note">${this._t("invalid")}</p>`;
    }
    const byId = new Map(
      this.rows.map((row) => [String(row[this.idKey]), row])
    );
    const names = result.ids
      .slice(0, PREVIEW_ROWS)
      .map((id) =>
        rowPreviewName(byId.get(id) ?? { [this.idKey]: id }, this.idKey)
      );
    return html`
      <p class="count">
        ${this._t("count", { count: result.ids.length, total: this.rows.length })}
      </p>
      ${
        result.ids.length
          ? html`<ul class="names">
              ${names.map((name) => html`<li>${name}</li>`)}
              ${
                result.ids.length > PREVIEW_ROWS
                  ? html`<li class="more">
                      ${this._t("preview_more", {
                        count: result.ids.length - PREVIEW_ROWS,
                      })}
                    </li>`
                  : nothing
              }
            </ul>`
          : html`<p class="note">${this._t("none")}</p>`
      }
    `;
  }

  /** A select that edits one part of one rule. */
  private _ruleSelect(
    rule: SelectRule,
    prop: string,
    label: string,
    value: string,
    options: HaSelectOption[]
  ): TemplateResult {
    return html`<ha-select
      .label=${label}
      .value=${value}
      .options=${options}
      .ruleId=${rule.id}
      .prop=${prop}
      @selected=${this._selectChanged}
    ></ha-select>`;
  }

  private _operatorOptions(operators: readonly string[]): HaSelectOption[] {
    return operators.map((operator) => ({
      value: operator,
      label: this._t(`op_${operator}`),
    }));
  }

  private _renderRule(rule: SelectRule, fields: RuleFields): TemplateResult {
    let body: TemplateResult;
    switch (rule.kind) {
      case "text":
        body = html`
          ${this._ruleSelect(
            rule,
            "operator",
            this._t("operator"),
            rule.operator,
            this._operatorOptions(TEXT_OPERATORS)
          )}
          ${this._ruleSelect(rule, "field", this._t("column"), rule.field, [
            { value: ANY_FIELD, label: this._t("any_column") },
            ...fields.textFields.map((field) => ({
              value: field.key,
              label: field.title,
            })),
          ])}
          ${
            rule.operator === "matches"
              ? html`<ha-input-search
                  appearance="outlined"
                  .value=${rule.value}
                  .label=${this._t("pattern")}
                  .accessibleLabel=${this._t("pattern")}
                  .patternSamples=${this._samples(rule.field)}
                  .ruleId=${rule.id}
                  .prop=${"value"}
                  @input=${this._textChanged}
                ></ha-input-search>`
              : html`<ha-input
                  appearance="outlined"
                  .value=${rule.value}
                  .label=${this._t("text")}
                  .ruleId=${rule.id}
                  .prop=${"value"}
                  @input=${this._textChanged}
                ></ha-input>`
          }
          <label class="check">
            <ha-switch
              .checked=${rule.caseSensitive}
              .ruleId=${rule.id}
              .prop=${"caseSensitive"}
              @change=${this._toggleChanged}
            ></ha-switch>
            ${this._t("match_case")}
          </label>
        `;
        break;
      case "label":
        body = html`
          ${this._ruleSelect(
            rule,
            "operator",
            this._t("operator"),
            rule.operator,
            this._operatorOptions(["has", "not_has"])
          )}
          ${this._ruleSelect(
            rule,
            "value",
            this._t("label"),
            rule.value,
            fields.labels.map((label) => ({
              value: label.value,
              label: label.label,
            }))
          )}
        `;
        break;
      case "value": {
        const field = fields.valueFields.find((f) => f.key === rule.field);
        body = html`
          ${this._ruleSelect(
            rule,
            "field",
            this._t("field"),
            rule.field,
            fields.valueFields.map((f) => ({ value: f.key, label: f.title }))
          )}
          ${this._ruleSelect(
            rule,
            "operator",
            this._t("operator"),
            rule.operator,
            this._operatorOptions(["is", "is_not"])
          )}
          ${this._ruleSelect(
            rule,
            "value",
            this._t("value"),
            rule.value,
            (field?.values ?? []).map((value) => ({ value, label: value }))
          )}
        `;
        break;
      }
      default:
        body = html`
          ${this._ruleSelect(
            rule,
            "operator",
            this._t("operator"),
            rule.operator,
            this._operatorOptions(["is", "is_not"])
          )}
          ${this._ruleSelect(
            rule,
            "value",
            this._t("state"),
            rule.value,
            fields.states.map((rowState) => ({
              value: rowState,
              label: this._t(`state_${rowState}`),
            }))
          )}
        `;
    }
    return html`
      <div class="rule" role="group">
        <div class="rule-fields">${body}</div>
        <div class="rule-tools">
          <label class="check">
            <ha-checkbox
              .checked=${rule.negate}
              .ruleId=${rule.id}
              .prop=${"negate"}
              @change=${this._toggleChanged}
            ></ha-checkbox>
            ${this._t("negate")}
          </label>
          <ha-icon-button
            .path=${mdiClose}
            .label=${this._t("remove_rule")}
            .ruleId=${rule.id}
            @click=${this._removeClicked}
          ></ha-icon-button>
        </div>
      </div>
    `;
  }

  /** Values of one column, offered to the pattern workbench as test text. */
  private _samples(field: string): string[] {
    const keys =
      field === ANY_FIELD ? this._fields.textFields.map((f) => f.key) : [field];
    const out = new Set<string>();
    for (const row of this.rows.slice(0, 300)) {
      for (const key of keys) {
        const value = row[key];
        if (typeof value === "string" && value.trim()) {
          out.add(value.trim());
        }
      }
      if (out.size >= 300) {
        break;
      }
    }
    return [...out];
  }

  private _patch(id: string, change: Record<string, unknown>) {
    this._rules = this._rules.map((rule) =>
      rule.id === id ? ({ ...rule, ...change } as SelectRule) : rule
    );
  }

  private _selectChanged(ev: CustomEvent<{ value: string }>) {
    const control = ev.currentTarget as RuleControl;
    const change: Record<string, unknown> = {
      [control.prop]: ev.detail.value,
    };
    const rule = this._rules.find((item) => item.id === control.ruleId);
    if (rule?.kind === "value" && control.prop === "field") {
      // The values belong to the field, so a new field starts without one.
      change.value = "";
    }
    this._patch(control.ruleId, change);
  }

  private _textChanged(ev: Event) {
    const control = ev.currentTarget as RuleControl & { value?: string };
    this._patch(control.ruleId, { [control.prop]: control.value ?? "" });
  }

  private _toggleChanged(ev: Event) {
    const control = ev.currentTarget as RuleControl & { checked?: boolean };
    this._patch(control.ruleId, { [control.prop]: !!control.checked });
  }

  private _addClicked(ev: Event) {
    const kind = (ev.currentTarget as RuleControl).ruleKind;
    if (kind) {
      this._rules = [...this._rules, newRule(kind, this._fields)];
    }
  }

  private _removeClicked(ev: Event) {
    const id = (ev.currentTarget as RuleControl).ruleId;
    this._rules = this._rules.filter((rule) => rule.id !== id);
  }

  private _combineChanged(ev: CustomEvent<{ value: string }>) {
    this._combine = ev.detail.value === "any" ? "any" : "all";
  }

  private _applyChanged(ev: CustomEvent<{ value: string }>) {
    this._apply = ev.detail.value as ApplyMode;
  }

  private _remember() {
    safeSetStored(this._storeKey, {
      rules: this._rules,
      combine: this._combine,
      apply: this._apply,
    });
  }

  private _applyRules() {
    const result = this._match(this._fields);
    if (result.blocked) {
      return;
    }
    this._remember();
    fireEvent(this, "select-by-rule-apply", {
      ids: applySelection(this.current, result.ids, this._apply),
    });
    this.open = false;
  }

  private _closed(ev: Event) {
    ev.stopPropagation();
    this._remember();
    this.open = false;
    fireEvent(this, "select-by-rule-closed");
  }

  static styles: CSSResultGroup = css`
    .body {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3, 12px);
      min-width: 0;
    }
    .note {
      margin: 0;
      color: var(--secondary-text-color);
    }
    .rule {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2, 8px);
      padding: var(--ha-space-3, 12px);
      border: 1px solid var(--ha-color-outline, var(--divider-color));
      border-radius: var(--ha-border-radius-lg, 12px);
      min-width: 0;
    }
    .rule-fields {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
      gap: var(--ha-space-2, 8px);
      align-items: center;
    }
    .rule-tools {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-2, 8px);
    }
    .check {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-2, 8px);
      color: var(--primary-text-color);
    }
    .adders {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2, 8px);
    }
    .review {
      padding: var(--ha-space-3, 12px);
      border-radius: var(--ha-border-radius-lg, 12px);
      background: var(
        --ha-color-primary-container,
        var(--secondary-background-color)
      );
      color: var(--ha-color-on-primary-container, var(--primary-text-color));
    }
    .review .note {
      color: inherit;
    }
    .count {
      margin: 0;
      font-weight: var(--ha-font-weight-semibold, 500);
    }
    .names {
      margin: var(--ha-space-2, 8px) 0 0;
      padding-inline-start: var(--ha-space-5, 20px);
    }
    .names .more {
      list-style: none;
      margin-inline-start: calc(-1 * var(--ha-space-5, 20px));
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-data-table-select-rules": HaDataTableSelectRules;
  }
}
