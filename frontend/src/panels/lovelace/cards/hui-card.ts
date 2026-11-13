import type { PropertyValues } from "lit";
import { ReactiveElement } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/ha-svg-icon";
import type { LovelaceCardConfig } from "../../../data/lovelace/config/card";
import type { HomeAssistant } from "../../../types";
import { ConditionalListenerMixin } from "../../../mixins/conditional-listener-mixin";
import {
  detectMissingEntities,
  releaseTarget,
} from "../../../common/problems/entity-detector";
import { configKey } from "../../../common/problems/missing-entities";
import { clearProblem } from "../../../common/problems/problem-store";
import { evaluateConditionsLocally } from "../../../common/condition/evaluate-locally";
import { dropInvalidConditions } from "../../../common/condition/sanitize";
import { playCardFeedback } from "../common/card-feedback";
import { trackFirstDraw } from "../common/card-first-draw";
import { computeCardStyleProperties } from "../common/card-style";
import { describeCard } from "../common/load-diagnostics";
import { cardEntities } from "../editor/dashboard-tools";
import type { VisibilityCondition } from "../common/validate-condition";
import { migrateLayoutToGridOptions } from "../common/compute-card-grid-size";
import { computeCardSize } from "../common/compute-card-size";
import { getConfigEntityId } from "../common/get-config-entity-id";
import { tryCreateCardElement } from "../create-element/create-card-element";
import { createErrorCardElement } from "../create-element/create-element-base";
import type { LovelaceCard, LovelaceGridOptions } from "../types";

declare global {
  interface HASSDomEvents {
    "card-visibility-changed": { value: boolean };
    "card-updated": undefined;
  }
}

@customElement("hui-card")
export class HuiCard extends ConditionalListenerMixin<LovelaceCardConfig>(
  ReactiveElement
) {
  @property({ type: Boolean }) public preview = false;

  @property({ attribute: false }) public config?: LovelaceCardConfig;

  @property({ attribute: false }) public layout?: string;

  private _hass?: HomeAssistant;

  public get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  public set hass(hass: HomeAssistant | undefined) {
    this._hass = hass;
    if (!this._element || !hass) {
      return;
    }
    try {
      this._element.hass = hass;
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error(this.config?.type, e);
      this._loadElement({ type: "error" });
    }
    this.setupConditionalListeners();
    this._updateVisibility();
    this._updateViewOnly();
    this._detectProblems();
  }

  private _problemId?: string;

  /** Tells the problem detector when this card names entities that are gone. */
  private _detectProblems() {
    if (!this.hass || !this.config || this.preview) {
      releaseTarget(this._problemId, this);
      return;
    }
    const id = `dashboard-card:${window.location.pathname}:${configKey(this.config)}`;
    if (this._problemId && this._problemId !== id) {
      releaseTarget(this._problemId, this);
      clearProblem(this._problemId);
    }
    this._problemId = id;
    const localize = this.hass.localize;
    detectMissingEntities({
      id,
      element: this,
      config: this.config,
      hass: this.hass,
      source: "dashboard-card",
      location: localize("ui.problems.location.card", {
        card: this.config.title || this.config.name || this.config.type,
      }),
      manualSteps: [
        localize("ui.problems.missing_entity.card_step_device"),
        localize("ui.problems.missing_entity.card_step_edit"),
        localize("ui.problems.missing_entity.card_step_remove"),
      ],
    });
  }

  private _elementConfig?: LovelaceCardConfig;

  public load() {
    if (!this.config) {
      throw new Error("Cannot build card without config");
    }
    this._loadElement(this.config);
  }

  private _element?: LovelaceCard;

  protected createRenderRoot() {
    return this;
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("hass-action", this._handleGestureFeedback);
    releaseTarget(this._problemId, this);
  }

  public connectedCallback() {
    super.connectedCallback();
    this.addEventListener("hass-action", this._handleGestureFeedback);
    this._updateVisibility();
    this._detectProblems();
  }

  public getCardSize(): number | Promise<number> {
    if (this._element) {
      const size = computeCardSize(this._element);
      return size;
    }
    return 1;
  }

  public getGridOptions(): LovelaceGridOptions {
    const elementOptions = this.getElementGridOptions();
    const configOptions = this.getConfigGridOptions();
    const mergedConfig = {
      ...elementOptions,
      ...configOptions,
    };
    return mergedConfig;
  }

  // options provided by the element
  public getElementGridOptions(): LovelaceGridOptions {
    if (!this._element) return {};

    if (this._element.getGridOptions) {
      const options = this._element.getGridOptions();
      // Some custom cards might return undefined, so we ensure we return an object
      return options || {};
    }
    if (this._element.getLayoutOptions) {
      // Disabled for now to avoid spamming the console, need to be re-enabled when hui-card performance are fixed

      // console.warn(
      //   `This card (${this.config?.type}) is using "getLayoutOptions" and it is deprecated, contact the developer to suggest to use "getGridOptions" instead`
      // );
      const options = migrateLayoutToGridOptions(
        this._element.getLayoutOptions()
      );
      return options;
    }
    return {};
  }

  // options provided by the config
  public getConfigGridOptions(): LovelaceGridOptions {
    if (this.config?.grid_options) {
      return this.config.grid_options;
    }
    if (this.config?.layout_options) {
      return migrateLayoutToGridOptions(this.config.layout_options);
    }
    return {};
  }

  protected _updateElement(config: LovelaceCardConfig) {
    if (!this._element) {
      return;
    }
    this._element.setConfig(config);
    this._elementConfig = config;
    fireEvent(this, "card-updated");
  }

  private _loadElement(config: LovelaceCardConfig) {
    try {
      this._element = tryCreateCardElement(config);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : undefined;
      this._element = createErrorCardElement({
        type: "error",
        message: errorMessage,
      });
    }
    this._elementConfig = config;
    trackFirstDraw(
      this,
      this._element,
      describeCard(config, cardEntities(config))
    );
    if (this.hass) {
      this._element.hass = this.hass;
    }
    this._element.layout = this.layout;
    this._element.preview = this.preview;
    // For backwards compatibility
    (this._element as any).editMode = this.preview;
    // Update element when the visibility of the card changes (e.g. conditional card or filter card)
    this._element.addEventListener("card-visibility-changed", (ev: Event) => {
      ev.stopPropagation();
      this._updateVisibility();
    });
    this._element.addEventListener(
      "ll-upgrade",
      (ev: Event) => {
        ev.stopPropagation();
        if (this.hass) {
          this._element!.hass = this.hass;
        }
        fireEvent(this, "card-updated");
      },
      { once: true }
    );
    this._element.addEventListener(
      "ll-rebuild",
      (ev: Event) => {
        ev.stopPropagation();
        this._loadElement(config);
        fireEvent(this, "card-updated");
      },
      { once: true }
    );
    while (this.lastChild) {
      this.removeChild(this.lastChild);
    }
    this._updateVisibility();
    this._updateViewOnly();
  }

  protected willUpdate(changedProps: PropertyValues<this>): void {
    super.willUpdate(changedProps);

    if (changedProps.has("config")) {
      this._conditionContext = {
        ...this._conditionContext,
        entity_id: this.config ? getConfigEntityId(this.config) : undefined,
      };
    }

    if (!this._element) {
      this.load();
    }
  }

  protected update(changedProps: PropertyValues<this>) {
    super.update(changedProps);

    if (this._element) {
      if (changedProps.has("config")) {
        const elementConfig = this._elementConfig;
        if (this.config !== elementConfig && this.config) {
          const typeChanged =
            this.config?.type !== elementConfig?.type || this.preview;
          // Rebuild the card if the type of the card has changed or if we are in preview mode
          if (typeChanged || this.preview) {
            this._loadElement(this.config);
          } else {
            this._updateElement(this.config);
          }
        }
      }
      if (changedProps.has("preview")) {
        try {
          this._element.preview = this.preview;
          // For backwards compatibility
          (this._element as any).editMode = this.preview;
          if (this.hasUpdated) {
            fireEvent(this, "card-updated");
          }
        } catch (e: any) {
          // eslint-disable-next-line no-console
          console.error(this.config?.type, e);
          this._loadElement({ type: "error" });
        }
      }
      if (changedProps.has("layout")) {
        try {
          this._element.layout = this.layout;
          // For backwards compatibility
          (this._element as any).isPanel = this.layout === "panel";
        } catch (e: any) {
          // eslint-disable-next-line no-console
          console.error(this.config?.type, e);
          this._loadElement({ type: "error" });
        }
      }
    }

    if (changedProps.has("preview")) {
      this._updateVisibility();
    }
    if (changedProps.has("config") || changedProps.has("preview")) {
      this._detectProblems();
    }
    if (changedProps.has("config")) {
      this._applyCardStyle();
    }
    if (changedProps.has("config") || changedProps.has("preview")) {
      this._updateViewOnly();
    }
  }

  private _styleProperties: string[] = [];

  /**
   * Applies the card's `style` block as validated custom properties on this
   * element, and removes the ones a previous configuration had set.
   */
  private _applyCardStyle() {
    const next = computeCardStyleProperties(this.config?.style);
    this._styleProperties.forEach((name) => {
      if (!(name in next)) {
        this.style.removeProperty(name);
      }
    });
    Object.entries(next).forEach(([name, value]) => {
      this.style.setProperty(name, value);
    });
    this._styleProperties = Object.keys(next);
  }

  protected _updateVisibility(conditionsMet?: boolean) {
    if (!this._element || !this.hass) {
      return;
    }

    if (this._element.hidden) {
      this._setElementVisibility(false);
      return;
    }

    if (this.preview) {
      this._setElementVisibility(true);
      return;
    }

    if (this.config?.disabled) {
      this._setElementVisibility(false);
      return;
    }

    const visible = conditionsMet ?? this._conditionsVisible();
    this._setElementVisibility(visible);
  }

  private _viewOnlyMark?: HTMLElement;

  private _positionSet = false;

  /**
   * True when the card's `view_only` conditions are met for this person. The
   * conditions are evaluated in this browser, like a role condition, and the
   * result is presentation only: it does not limit what the person can do.
   */
  private _isViewOnly(): boolean {
    const conditions = this.config?.view_only;
    if (
      this.preview ||
      !this.hass ||
      !Array.isArray(conditions) ||
      conditions.length === 0
    ) {
      return false;
    }
    const valid = dropInvalidConditions(conditions);
    if (!valid.length) {
      return false;
    }
    return (
      evaluateConditionsLocally(
        [
          {
            condition: "or",
            conditions: valid,
          } as unknown as VisibilityCondition,
        ],
        this.hass,
        this._conditionContext
      ) === true
    );
  }

  /**
   * Makes the card view only: its element cannot be focused or operated, it
   * is marked as disabled for assistive technology and a small "View only"
   * mark is shown. The mark is not part of the card element, so it stays
   * readable.
   */
  private _updateViewOnly() {
    const on = this._isViewOnly();
    if (this._element) {
      this._element.inert = on;
    }
    this.toggleAttribute("view-only", on);
    if (on) {
      this.setAttribute("aria-disabled", "true");
      if (!this._viewOnlyMark?.isConnected) {
        const mark = document.createElement("span");
        mark.textContent =
          this.hass?.localize(
            "ui.panel.lovelace.editor.who_can_see.view_only_mark"
          ) ?? "";
        Object.assign(mark.style, {
          position: "absolute",
          insetBlockStart: "var(--ha-space-2)",
          insetInlineEnd: "var(--ha-space-2)",
          padding: "2px var(--ha-space-2)",
          borderRadius: "var(--ha-border-radius-pill)",
          background: "var(--ha-color-surface-tone-3, rgba(0,0,0,0.08))",
          color: "var(--secondary-text-color)",
          fontSize: "var(--ha-font-size-xs)",
          fontWeight: "var(--ha-font-weight-semibold, 600)",
          pointerEvents: "none",
          zIndex: "1",
        });
        this._viewOnlyMark = mark;
      }
      if (this.style.position === "") {
        this.style.position = "relative";
        this._positionSet = true;
      }
      if (this._viewOnlyMark && !this._viewOnlyMark.isConnected) {
        this.appendChild(this._viewOnlyMark);
      }
    } else {
      this.removeAttribute("aria-disabled");
      this._viewOnlyMark?.remove();
      if (this._positionSet) {
        this.style.removeProperty("position");
        this._positionSet = false;
      }
    }
  }

  private _handleGestureFeedback = (ev: Event) => {
    const gesture = (ev as CustomEvent<{ action?: string }>).detail?.action;
    if (this.preview || !gesture || !this.config?.gesture_feedback) {
      return;
    }
    const feedback = this.config.gesture_feedback as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(feedback, gesture)) {
      playCardFeedback(this, feedback[gesture]);
    }
  };

  private _setElementVisibility(visible: boolean) {
    if (!this._element) return;

    if (this.hidden !== !visible) {
      this.style.setProperty("display", visible ? "" : "none");
      this.toggleAttribute("hidden", !visible);
      fireEvent(this, "card-visibility-changed", { value: visible });
    }

    if (this._element.connectedWhileHidden === true) {
      if (!this._element.parentElement) {
        this.appendChild(this._element);
      }
    } else if (!visible && this._element.parentElement) {
      this.removeChild(this._element);
    } else if (visible && !this._element.parentElement) {
      this.appendChild(this._element);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-card": HuiCard;
  }
}
