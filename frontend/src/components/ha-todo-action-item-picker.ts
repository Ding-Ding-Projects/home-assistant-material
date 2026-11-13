import type { HassEntities } from "home-assistant-js-websocket";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../common/decorators/consume";
import { fireEvent } from "../common/dom/fire_event";
import {
  configContext,
  connectionContext,
  statesContext,
} from "../data/context";
import type { SelectOption, SelectSelector } from "../data/selector";
import {
  TodoActionItemLoader,
  todoActionItemTarget,
  type TodoItemAction,
} from "../data/todo-action-items";
import type {
  HomeAssistantConfig,
  HomeAssistantConnection,
  ValueChangedEvent,
} from "../types";
import "./ha-selector/ha-selector-select";

@customElement("ha-todo-action-item-picker")
export class HaTodoActionItemPicker extends LitElement {
  @property({ attribute: false }) public entityIds?: string[] | null;

  @property() public action: TodoItemAction = "update_item";

  @property({ attribute: false }) public value?: string | string[];

  @property() public key = "item";

  @property() public label?: string;

  @property() public helper?: string;

  @property({ type: Boolean }) public disabled = false;

  @property({ type: Boolean }) public required = true;

  @state()
  @consume({ context: statesContext, subscribe: true })
  private _states?: HassEntities;

  @state()
  @consume({ context: configContext, subscribe: true })
  private _config?: HomeAssistantConfig;

  @state()
  @consume({ context: connectionContext, subscribe: true })
  private _connection?: HomeAssistantConnection;

  @state() private _options: SelectOption[] = [];

  private _loader = new TodoActionItemLoader();

  private _requestContext?: readonly unknown[];

  private _context() {
    const target = todoActionItemTarget(
      this.entityIds,
      this._states,
      this.action
    );
    return [
      target,
      this.action,
      this.disabled,
      this._connection?.connection,
      this._connection?.connected,
      this._config?.user,
      this._config?.auth,
    ] as const;
  }

  protected willUpdate() {
    const context = this._context();
    if (
      context.every((value, index) => value === this._requestContext?.[index])
    ) {
      return;
    }
    this._requestContext = context;
    this._loader.invalidate();
    this._options = [];
    const [target] = context;
    if (
      !target ||
      this.disabled ||
      !this._connection?.connected ||
      !this._config?.user ||
      !this.isConnected
    ) {
      return;
    }
    void this._loader.load(this._connection.connection, target, (options) => {
      // Properties can change before Lit schedules the next update.
      if (
        this.isConnected &&
        this._context().every((value, index) => value === context[index])
      ) {
        this._options = options;
      }
    });
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._loader.invalidate();
    this._requestContext = undefined;
    this._options = [];
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this.requestUpdate();
  }

  protected render() {
    const selector: SelectSelector = {
      select: {
        options: this._options,
        custom_value: true,
        multiple: this.action === "remove_item",
        mode: "dropdown",
      },
    };
    return html`<ha-selector-select
      .selector=${selector}
      .value=${this.value}
      .label=${this.label}
      .helper=${this.helper}
      .disabled=${this.disabled}
      .required=${this.required}
      @value-changed=${this._valueChanged}
    ></ha-selector-select>`;
  }

  private _valueChanged(ev: ValueChangedEvent<string | string[] | undefined>) {
    ev.stopPropagation();
    if (this.disabled) return;
    fireEvent(this, "value-changed", { value: ev.detail.value });
  }

  static styles = css`
    :host,
    ha-selector-select {
      display: block;
      min-width: 0;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-todo-action-item-picker": HaTodoActionItemPicker;
  }
}
