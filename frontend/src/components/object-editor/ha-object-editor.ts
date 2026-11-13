import {
  mdiArrowDown,
  mdiArrowUp,
  mdiChevronDown,
  mdiChevronRight,
  mdiClose,
  mdiPlus,
} from "@mdi/js";
import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import { consumeLocalize } from "../../common/decorators/consume-context-entry";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import type { LocalizeFunc } from "../../common/translations/localize";
import {
  addEntry,
  convertNode,
  isContainer,
  moveEntry,
  OBJECT_NODE_TYPES,
  outputValue,
  removeEntry,
  rootFromValue,
  validateNode,
} from "../../common/object-editor/object-model";
import type {
  ObjectEntry,
  ObjectErrorCode,
  ObjectNode,
  ObjectNodeType,
} from "../../common/object-editor/object-model";
import {
  nodeForOption,
  nodeFitsKind,
  unusedKnownOptions,
  type ResolvedKnownOption,
} from "../../common/object-editor/known-options";
import { deepEqual } from "../../common/util/deep-equal";
import type { HomeAssistant } from "../../types";
import "../input/ha-input";
import "../ha-button";
import "../ha-icon-button";
import "../ha-select";
import "../ha-switch";
import "../ha-svg-icon";
import "../ha-textarea";
import "../string-builder/ha-string-builder-button";
import type { HaSelectOption } from "../ha-select";

/** An element that carries the row data its handlers need. */
type Bound = HTMLElement & {
  node?: ObjectNode;
  entry?: ObjectEntry;
  container?: ObjectNode;
  index?: number;
};

/**
 * A visual editor for any dictionary, list or plain value: one row per entry
 * with a type picker and the control that fits the type. Fires `value-changed`
 * only while every row is valid; the last valid value stays in effect.
 *
 * @fires value-changed - the new value (undefined for an empty optional field).
 */
@customElement("ha-object-editor")
export class HaObjectEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public value?: unknown;

  @property() public label?: string;

  @property({ attribute: false }) public draft?: ObjectNode;
  @property({ attribute: false }) public dictionaryOnly = false;
  @property({ attribute: false }) public reservedKeys: string[] = [];

  @property({ attribute: false }) public knownOptions: ResolvedKnownOption[] =
    [];

  @property({ type: Boolean }) public disabled = false;

  @property({ type: Boolean }) public required = false;

  @state() @consumeLocalize() private _localize!: LocalizeFunc;

  @state() private _root?: ObjectNode;

  @state() private _errors = new Map<string, ObjectErrorCode>();

  @state() private _collapsed = new Set<string>();

  private _lastValue: unknown;

  protected willUpdate(changedProps: PropertyValues<this>) {
    if (
      this._root === undefined ||
      (changedProps.has("value") && !deepEqual(this.value, this._lastValue))
    ) {
      this._root =
        this._root === undefined && this.draft
          ? this.draft
          : rootFromValue(this.value);
      this._errors = validateNode(this._root).errors;
      this._lastValue = this.value;
    }
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return (
      this._lang.text(
        this._localize,
        `ui.components.object-editor.${key}`,
        values
      ) || key
    );
  }

  private _lang = new LanguageModeController(this);

  /** Re-checks the tree and emits the value when it is valid. */
  private _changed() {
    const root = this._root!;
    const result = validateNode(root);
    if (this.dictionaryOnly && root.type !== "dict") {
      result.errors.set(root.id, "dictionary_required");
    }
    if (root.type === "dict") {
      for (const entry of root.entries) {
        if (this.reservedKeys.includes(entry.key || "")) {
          result.errors.set(entry.id, "reserved_key");
        }
      }
    }
    result.valid = result.errors.size === 0;
    this._errors = result.errors;
    this._root = { ...root };
    fireEvent(this, "object-editor-validity-changed", {
      valid: result.valid,
      editor: this,
      draft: this._root,
    });
    if (!result.valid) {
      return;
    }
    const out = outputValue(result.value, this.required);
    if (deepEqual(out, this._lastValue)) {
      return;
    }
    this._lastValue = out;
    fireEvent(this, "value-changed", { value: out });
  }

  private _typeOptions(): HaSelectOption[] {
    return OBJECT_NODE_TYPES.map((type) => ({
      value: type,
      label: this._t(`types.${type}`),
    }));
  }

  protected render() {
    const root = this._root;
    if (!root) {
      return nothing;
    }
    return html`
      ${this.label ? html`<div class="label">${this.label}</div>` : nothing}
      ${this._renderError(root.id)}
      ${
        isContainer(root)
          ? this._renderContainer(root, true)
          : html`<div class="row">
              <div class="row-main">
                <div class="type">${this._renderTypePicker(root)}</div>
                ${this._renderScalar(root)}
              </div>
              ${this._renderError(root.id)}
            </div>`
      }
    `;
  }

  private _renderContainer(node: ObjectNode, top = false): TemplateResult {
    const isDict = node.type === "dict";
    return html`
      <div class="container" role="group">
        ${top && isDict && !this.disabled ? this._renderKnownOptions(node) : nothing}
        ${
          node.entries.length === 0
            ? html`<div class="empty">
                ${
                  top
                    ? this._t(isDict ? "empty_title" : "empty_list_title")
                    : this._t(isDict ? "empty_nested" : "empty_list_nested")
                }
              </div>`
            : node.entries.map((entry, index) =>
                this._renderEntry(node, entry, index)
              )
        }
        ${
          this.disabled
            ? nothing
            : html`<div class="add">
                <ha-button
                  appearance="plain"
                  size="small"
                  .container=${node}
                  @click=${this._add}
                >
                  <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
                  ${this._t(isDict ? "add_entry" : "add_item")}
                </ha-button>
              </div>`
        }
      </div>
    `;
  }

  private _renderKnownOptions(container: ObjectNode) {
    const available = unusedKnownOptions(
      this.knownOptions,
      container.entries.map((entry) => entry.key || "")
    );
    return available.length
      ? html`<ha-select
          .label=${this._t("known_options")}
          .options=${available.map((option) => ({ value: option.key, label: option.label || option.key }))}
          .value=${""}
          .container=${container}
          @selected=${this._knownSelected}
        ></ha-select>`
      : nothing;
  }

  private _knownSelected(ev: CustomEvent<{ value?: string }>) {
    ev.stopPropagation();
    const option = this.knownOptions.find(
      (item) => item.key === ev.detail.value
    );
    const container = (ev.currentTarget as Bound).container!;
    if (
      !option ||
      container.entries.some((entry) => entry.key === option.key)
    ) {
      return;
    }
    addEntry(container);
    const entry = container.entries[container.entries.length - 1];
    entry.key = option.key;
    entry.node = nodeForOption(option);
    this._changed();
  }

  private _renderEntry(
    container: ObjectNode,
    entry: ObjectEntry,
    index: number
  ): TemplateResult {
    const isDict = container.type === "dict";
    const node = entry.node;
    const known =
      container === this._root
        ? this.knownOptions.find((item) => item.key === entry.key)
        : undefined;
    const collapsed = this._collapsed.has(entry.id);
    const nested = isContainer(node);
    return html`
      <div class="row">
        ${known?.description ? html`<p>${known.description}</p>` : nothing}
        <div class="row-main">
          ${
            isDict
              ? html`<ha-input
                  class="key"
                  .label=${this._t("key")}
                  .value=${entry.key}
                  .disabled=${this.disabled}
                  .entry=${entry}
                  autocapitalize="none"
                  spellcheck="false"
                  @input=${this._keyInput}
                ></ha-input>`
              : html`<span class="index"
                  >${this._t("item_number", { number: index + 1 })}</span
                >`
          }
          <div class="type">${this._renderTypePicker(node, entry)}</div>
          ${
            nested
              ? html`<div class="summary">
                  <ha-icon-button
                    .label=${this._t(collapsed ? "expand" : "collapse")}
                    .path=${collapsed ? mdiChevronRight : mdiChevronDown}
                    .entry=${entry}
                    @click=${this._toggle}
                  ></ha-icon-button>
                  <span>
                    ${this._t(
                      node.type === "dict" ? "entries_count" : "items_count",
                      { count: node.entries.length }
                    )}
                  </span>
                </div>`
              : this._renderScalar(node, known)
          }
          <div class="actions">
            <ha-icon-button
              .label=${this._t("move_up")}
              .path=${mdiArrowUp}
              .disabled=${this.disabled || index === 0}
              .container=${container}
              .index=${index}
              @click=${this._moveUp}
            ></ha-icon-button>
            <ha-icon-button
              .label=${this._t("move_down")}
              .path=${mdiArrowDown}
              .disabled=${
                this.disabled || index === container.entries.length - 1
              }
              .container=${container}
              .index=${index}
              @click=${this._moveDown}
            ></ha-icon-button>
            <ha-icon-button
              .label=${this._t("remove")}
              .path=${mdiClose}
              .disabled=${this.disabled}
              .container=${container}
              .index=${index}
              @click=${this._remove}
            ></ha-icon-button>
          </div>
        </div>
        ${this._renderError(entry.id)} ${this._renderError(node.id)}
        ${
          nested && !collapsed
            ? html`<div class="nested">${this._renderContainer(node)}</div>`
            : nothing
        }
      </div>
    `;
  }

  private _renderError(id: string) {
    const code = this._errors.get(id);
    return code
      ? html`<div class="error" role="alert">${this._t(`errors.${code}`)}</div>`
      : nothing;
  }

  /** The entry is left out for the top level value. */
  private _renderTypePicker(node: ObjectNode, entry?: ObjectEntry) {
    return html`<ha-select
      .label=${this._t("type")}
      .options=${this._typeOptions()}
      .value=${node.type}
      .disabled=${this.disabled}
      .node=${node}
      .entry=${entry}
      @selected=${this._typeSelected}
    ></ha-select>`;
  }

  /** The control for a plain value. Edits change the node in place. */
  private _renderScalar(
    node: ObjectNode,
    option?: ResolvedKnownOption
  ): TemplateResult | typeof nothing {
    if (option?.kind.type === "choice" && nodeFitsKind(node, option.kind)) {
      const choices = option.kind.choices;
      return html`<div class="value">
        <ha-select
          class="value"
          .label=${option.label || this._t("value")}
          .options=${[
            ...choices.map((choice) => ({
              value: choice.value,
              label: choice.label || choice.value,
            })),
            ...(!choices.some((choice) => choice.value === node.text) &&
            node.text
              ? [{ value: node.text, label: node.text }]
              : []),
          ]}
          .value=${node.text}
          .disabled=${this.disabled}
          .node=${node}
          @selected=${this._choiceSelected}
        ></ha-select
        ><ha-input
          .label=${this._t("value")}
          .value=${node.text}
          .disabled=${this.disabled}
          .node=${node}
          @input=${this._textInput}
        ></ha-input>
      </div>`;
    }
    switch (node.type) {
      case "text":
        return html`<ha-input
          class="value"
          .label=${this._t("value")}
          .value=${node.text}
          .disabled=${this.disabled}
          .node=${node}
          autocapitalize="none"
          spellcheck="false"
          @input=${this._textInput}
        ></ha-input>`;
      case "number":
        return html`<ha-input
          class="value"
          type="number"
          step="any"
          .label=${this._t("value")}
          .value=${node.text}
          .disabled=${this.disabled}
          .node=${node}
          @input=${this._textInput}
        ></ha-input>`;
      case "boolean":
        return html`<div class="value switch">
          <ha-switch
            .checked=${node.checked}
            .disabled=${this.disabled}
            .node=${node}
            aria-label=${this._t("value")}
            @change=${this._switchChange}
          ></ha-switch>
          <span>${this._t(node.checked ? "yes" : "no")}</span>
        </div>`;
      case "null":
        return html`<div class="value empty-value">
          ${this._t("empty_value")}
        </div>`;
      case "template":
        return html`<div class="value template">
          <ha-textarea
            .label=${this._t("template")}
            .value=${node.text}
            .disabled=${this.disabled}
            .node=${node}
            autocapitalize="none"
            spellcheck="false"
            resize="auto"
            @input=${this._textInput}
          ></ha-textarea>
          ${
            this.hass && !this.disabled
              ? html`<ha-string-builder-button
                  .hass=${this.hass}
                  .value=${node.text}
                  .node=${node}
                  @string-builder-result=${this._builderResult}
                ></ha-string-builder-button>`
              : nothing
          }
        </div>`;
      default:
        return nothing;
    }
  }

  private _choiceSelected(ev: CustomEvent<{ value?: string }>) {
    ev.stopPropagation();
    (ev.currentTarget as Bound).node!.text = ev.detail.value || "";
    this._changed();
  }

  private _typeSelected(ev: CustomEvent<{ value?: string }>) {
    ev.stopPropagation();
    const target = ev.currentTarget as Bound;
    const node = target.node!;
    const type = ev.detail.value as ObjectNodeType | undefined;
    if (!type || type === node.type) {
      return;
    }
    const next = convertNode(node, type);
    if (target.entry) {
      target.entry.node = next;
    } else {
      this._root = next;
    }
    this._changed();
  }

  private _keyInput(ev: Event) {
    const target = ev.currentTarget as Bound;
    target.entry!.key = (ev.target as HTMLInputElement).value;
    this._changed();
  }

  private _textInput(ev: Event) {
    const target = ev.currentTarget as Bound;
    target.node!.text = (ev.target as HTMLInputElement).value;
    this._changed();
  }

  private _switchChange(ev: Event) {
    const target = ev.currentTarget as Bound;
    target.node!.checked = (ev.target as HTMLInputElement).checked;
    this._changed();
  }

  private _builderResult(ev: CustomEvent<{ value: string }>) {
    ev.stopPropagation();
    (ev.currentTarget as Bound).node!.text = ev.detail.value;
    this._changed();
  }

  private _add(ev: Event) {
    addEntry((ev.currentTarget as Bound).container!);
    this._changed();
  }

  private _moveUp(ev: Event) {
    this._move(ev, -1);
  }

  private _moveDown(ev: Event) {
    this._move(ev, 1);
  }

  private _move(ev: Event, delta: number) {
    const target = ev.currentTarget as Bound;
    if (moveEntry(target.container!, target.index!, delta)) {
      this._changed();
    }
  }

  private _remove(ev: Event) {
    const target = ev.currentTarget as Bound;
    removeEntry(target.container!, target.index!);
    this._changed();
  }

  private _toggle(ev: Event) {
    const id = (ev.currentTarget as Bound).entry!.id;
    const next = new Set(this._collapsed);
    if (!next.delete(id)) {
      next.add(id);
    }
    this._collapsed = next;
  }

  static styles = css`
    :host {
      display: block;
      container-type: inline-size;
    }
    .label {
      margin-bottom: var(--ha-space-2);
    }
    .container {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    .row {
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-border-radius-md);
      padding: var(--ha-space-2);
      min-width: 0;
    }
    .row-main {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2);
    }
    .key {
      flex: 1 1 12rem;
      min-width: 0;
    }
    .index {
      flex: 0 0 auto;
      color: var(--secondary-text-color);
      min-width: 4rem;
    }
    .type {
      flex: 0 0 9rem;
      min-width: 0;
    }
    .type ha-select {
      display: block;
    }
    .value {
      flex: 1 1 12rem;
      min-width: 0;
    }
    .value.template {
      flex-basis: 100%;
    }
    .value.switch {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
    }
    .empty-value {
      color: var(--secondary-text-color);
    }
    .summary {
      flex: 1 1 8rem;
      display: flex;
      align-items: center;
      gap: var(--ha-space-1);
      color: var(--secondary-text-color);
    }
    .actions {
      display: flex;
      margin-inline-start: auto;
      color: var(--secondary-text-color);
    }
    .nested {
      margin-top: var(--ha-space-2);
      margin-inline-start: var(--ha-space-4);
    }
    .error {
      color: var(--error-color);
      margin-top: var(--ha-space-1);
    }
    .empty {
      color: var(--secondary-text-color);
      padding: var(--ha-space-2);
    }
    .add {
      display: flex;
    }
    @container (max-width: 34rem) {
      .key,
      .type,
      .value {
        flex-basis: 100%;
      }
      .actions {
        margin-inline-start: 0;
      }
    }
  `;
}

declare global {
  interface HASSDomEvents {
    "object-editor-validity-changed": {
      valid: boolean;
      editor: HTMLElement;
      draft?: ObjectNode;
    };
  }
  interface HTMLElementTagNameMap {
    "ha-object-editor": HaObjectEditor;
  }
}
