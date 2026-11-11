import {
  mdiFlashOutline,
  mdiInformationOutline,
  mdiShapeOutline,
  mdiClockOutline,
  mdiViewSplitHorizontal,
  mdiViewSplitVertical,
} from "@mdi/js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { formatDateTime } from "../../../../common/datetime/format_date_time";
import {
  DRAFT_MAX_BYTES,
  discardDraft,
  getDraft,
  hashDraftText,
  saveDraft,
} from "../../../../common/drafts/draft-store";
import type { DraftLookup } from "../../../../common/drafts/draft-store";
import type { HASSDomTargetEvent } from "../../../../common/dom/fire_event";
import { fireEvent } from "../../../../common/dom/fire_event";
import { modeText } from "../../../../common/language-mode/language-mode";
import { stopPropagation } from "../../../../common/dom/stop_propagation";
import type { LocalizeKeys } from "../../../../common/translations/localize";
import { debounce } from "../../../../common/util/debounce";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-icon-button";
import "../../../../components/ha-card";
import "../../../../components/drafts/ha-draft-recovery";
import "../../../../components/ha-code-editor";
import "../../../../components/ha-expansion-panel";
import "../../../../components/ha-label";
import "../../../../components/ha-spinner";
import "../../../../components/ha-split-panel";
import type { HaSplitPanel } from "../../../../components/ha-split-panel";
import "../../../../components/ha-svg-icon";
import "../../../../components/ha-tip";
import "../../../../components/starting-points/ha-starting-points";
import type { StartingPointSelectedDetail } from "../../../../components/starting-points/ha-starting-points";
import {
  templateForStartingPoint,
  templateStartingPoints,
} from "../../../../components/starting-points/template-starting-points";
import type { RenderTemplateResult } from "../../../../data/ws-templates";
import { subscribeRenderTemplate } from "../../../../data/ws-templates";
import { showConfirmationDialog } from "../../../../dialogs/generic/show-dialog-box";
import { haStyle, haStyleScrollbar } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import { documentationUrl } from "../../../../util/documentation-url";

const DEMO_TEMPLATE = `{## Imitate available variables: ##}
{% set my_test_json = {
  "temperature": 25,
  "unit": "°C"
} %}

The temperature is {{ my_test_json.temperature }} {{ my_test_json.unit }}.

{% if is_state("sun.sun", "above_horizon") -%}
  The sun rose {{ relative_time(states.sun.sun.last_changed) }} ago.
{%- else -%}
  The sun will rise at {{ as_timestamp(state_attr("sun.sun", "next_rising")) | timestamp_local }}.
{%- endif %}

For loop example getting entity values in the weather domain:

{% for state in states.weather -%}
  {%- if loop.first %}The {% elif loop.last %} and the {% else %}, the {% endif -%}
  {{ state.name | lower }} is {{state.state_with_unit}}
{%- endfor %}.`;

// key resolves the label/description translation keys; path is passed through
// documentationUrl().
const TEMPLATE_DOCS_LINKS: { key: string; path: string }[] = [
  { key: "docs_introduction", path: "/docs/templating/introduction/" },
  { key: "docs_states", path: "/docs/templating/states/" },
  { key: "docs_debugging", path: "/docs/templating/debugging/" },
  { key: "docs_functions", path: "/template-functions/" },
];

const STORAGE_KEY_TEMPLATE = "panel-dev-template-template";
const STORAGE_KEY_SPLIT_POSITION = "panel-dev-template-split-position";
const STORAGE_KEY_SPLIT_ORIENTATION = "panel-dev-template-split-orientation";
const DEFAULT_SPLIT_POSITION = 50;
// The template tool has one working template, so one draft entry.
const DRAFT_KIND = "template";
const DRAFT_ITEM_ID = "default";
const DRAFT_SAVE_DELAY_MS = 300;

type SplitOrientation = "horizontal" | "vertical";

@customElement("tools-template")
class HaPanelDevTemplate extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() private _error?: string;

  @state() private _errorLevel?: "ERROR" | "WARNING";

  @state() private _rendering = false;

  @state() private _templateResult?: RenderTemplateResult;

  @state() private _unsubRenderTemplate?: Promise<UnsubscribeFunc>;

  @state() private _renderMs?: number;

  private _renderStartedAt = 0;

  @state() private _splitPosition = DEFAULT_SPLIT_POSITION;

  @state() private _splitOrientation: SplitOrientation = "horizontal";

  // A draft found on open that the person has not yet restored or discarded.
  @state() private _pendingDraft?: DraftLookup;

  private _template = "";

  // Fingerprint of the template the editor opened with; drafts record it.
  private _baseVersion: string | null = null;

  private _inited = false;

  // Bumped on every (re)subscribe so a superseded render can be detected and
  // its late-arriving results discarded.
  private _subscribeRequestId = 0;

  public connectedCallback() {
    super.connectedCallback();
    if (this._template && !this._unsubRenderTemplate) {
      this._subscribeTemplate();
    }
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribeTemplate();
    // Leaving the tool must not lose the last edits waiting for the delay.
    this._debounceDraft.cancel();
    this._writeDraft();
  }

  protected firstUpdated() {
    if (localStorage && localStorage[STORAGE_KEY_TEMPLATE]) {
      this._template = localStorage[STORAGE_KEY_TEMPLATE];
    } else {
      this._template = DEMO_TEMPLATE;
    }
    const storedPosition = localStorage?.[STORAGE_KEY_SPLIT_POSITION];
    if (storedPosition) {
      const parsed = parseFloat(storedPosition);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
        this._splitPosition = parsed;
      }
    }
    if (localStorage?.[STORAGE_KEY_SPLIT_ORIENTATION] === "vertical") {
      this._splitOrientation = "vertical";
    }
    this._baseVersion = hashDraftText(this._template);
    this._findDraft();
    this._subscribeTemplate();
    this._inited = true;
  }

  protected render() {
    const type = typeof this._templateResult?.result;
    const resultType =
      type === "object"
        ? Array.isArray(this._templateResult?.result)
          ? "list"
          : "dict"
        : type;

    const editorCard = this._renderEditorCard();
    const resultCard = this._renderResultCard(type, resultType);

    // On narrow viewports side-by-side is too cramped, so force the (still
    // resizable) stacked layout and hide the orientation toggle.
    const orientation = this.narrow ? "vertical" : this._splitOrientation;

    return html`
      <div class="about">
        <ha-expansion-panel
          .header=${this.hass.localize(
            "ui.panel.config.tools.tabs.templates.about"
          )}
          outlined
        >
          <div class="description">
            <p>
              ${this.hass.localize(
                "ui.panel.config.tools.tabs.templates.description"
              )}
            </p>
            <p>
              ${this.hass.localize(
                "ui.panel.config.tools.tabs.templates.engine_info"
              )}
            </p>
            <h3>
              ${this.hass.localize(
                "ui.panel.config.tools.tabs.templates.learn_more"
              )}
            </h3>
            <ul>
              ${TEMPLATE_DOCS_LINKS.map(
                (link) => html`
                  <li>
                    <a
                      href=${documentationUrl(this.hass, link.path)}
                      target="_blank"
                      rel="noreferrer"
                      >${this.hass.localize(
                        `ui.panel.config.tools.tabs.templates.${link.key}` as LocalizeKeys
                      )}</a
                    >
                    <span class="link-description"
                      >${this.hass.localize(
                        `ui.panel.config.tools.tabs.templates.${link.key}_description` as LocalizeKeys
                      )}</span
                    >
                  </li>
                `
              )}
            </ul>
          </div>
        </ha-expansion-panel>
      </div>

      ${this._renderDraftRecovery()}

      <ha-split-panel
        class="panes ${orientation === "vertical" ? "vertical" : ""}"
        .position=${this._splitPosition}
        .orientation=${orientation}
        snap="50%"
        @wa-reposition=${this._splitRepositioned}
      >
        <div slot="start" class="pane">${editorCard}</div>
        <div slot="end" class="pane">
          <div class="stack ha-scrollbar">
            ${resultCard} ${this._renderListenersCard()}
          </div>
        </div>
        ${this.narrow ? nothing : this._renderOrientationToggle()}
      </ha-split-panel>
    `;
  }

  private _renderDraftRecovery() {
    const draft = this._pendingDraft;
    if (!draft) {
      return nothing;
    }
    const localize = this.hass.localize;
    return html`
      <div class="draft-recovery">
        <ha-draft-recovery
          .labels=${{
            heading: localize("ui.components.draft_recovery.heading", {
              time: formatDateTime(
                new Date(draft.savedAt),
                this.hass.locale,
                this.hass.config
              ),
            }),
            stale: localize("ui.components.draft_recovery.stale"),
            restore: localize("ui.components.draft_recovery.restore"),
            compare: localize("ui.components.draft_recovery.compare"),
            hideCompare: localize("ui.components.draft_recovery.hide_compare"),
            discard: localize("ui.components.draft_recovery.discard"),
            current: localize("ui.components.draft_recovery.current"),
            draft: localize("ui.components.draft_recovery.draft"),
          }}
          .draft=${draft.content}
          .current=${this._template}
          .stale=${draft.baseMismatch}
          @draft-restore=${this._restoreDraft}
          @draft-discard=${this._discardDraft}
        ></ha-draft-recovery>
      </div>
    `;
  }

  private _renderOrientationToggle() {
    const label = this.hass.localize(
      this._splitOrientation === "vertical"
        ? "ui.panel.config.tools.tabs.templates.layout_side_by_side"
        : "ui.panel.config.tools.tabs.templates.layout_stacked"
    );
    return html`
      <button
        type="button"
        slot="divider"
        class="divider-toggle"
        .title=${label}
        aria-label=${label}
        @mousedown=${stopPropagation}
        @touchstart=${stopPropagation}
        @click=${this._toggleOrientation}
      >
        <ha-svg-icon
          .path=${
            this._splitOrientation === "vertical"
              ? mdiViewSplitVertical
              : mdiViewSplitHorizontal
          }
        ></ha-svg-icon>
      </button>
    `;
  }

  private _renderEditorCard() {
    return html`
      <ha-card class="edit-pane">
        <div class="card-header-row">
          <h2>
            ${this.hass.localize("ui.panel.config.tools.tabs.templates.editor")}
          </h2>
          <ha-button
            appearance="plain"
            size="small"
            @click=${this._restoreDemo}
          >
            ${this.hass.localize("ui.panel.config.tools.tabs.templates.reset")}
          </ha-button>
          <ha-button appearance="plain" size="small" @click=${this._clear}>
            ${this.hass.localize("ui.common.clear")}
          </ha-button>
        </div>
        <div class="card-content">
          <ha-code-editor
            mode="jinja2"
            .value=${this._template}
            .error=${this._error}
            autofocus
            autocomplete-entities
            autocomplete-icons
            @value-changed=${this._templateChanged}
            dir="ltr"
          ></ha-code-editor>
        </div>
        ${
          this.narrow
            ? nothing
            : html`
                <ha-tip>
                  ${this.hass.localize(
                    "ui.panel.config.tools.tabs.templates.keyboard_tip",
                    {
                      autocomplete: html`<kbd
                          >${this.hass.localize(
                            "ui.dialogs.shortcuts.keys.ctrl"
                          )}</kbd
                        >+<kbd>Space</kbd>`,
                    }
                  )}
                </ha-tip>
              `
        }
      </ha-card>
    `;
  }

  private _renderResultCard(type: string, resultType: string) {
    // Stays visible while an empty template is being rendered, so the cards
    // do not flicker away and back
    const showEmptyState = !this._error && !this._template?.trim();

    return html`
      <ha-card class="render-pane">
        <div class="card-header-row">
          <h2>
            ${this.hass.localize("ui.panel.config.tools.tabs.templates.result")}
          </h2>
        </div>
        <div class="card-content">
          ${
            this._rendering
              ? html`<ha-spinner
                  class="render-spinner"
                  size="small"
                ></ha-spinner>`
              : ""
          }
          ${
            this._error
              ? html`<ha-alert
                  alert-type=${this._errorLevel?.toLowerCase() || "error"}
                  >${this._error}</ha-alert
                >`
              : nothing
          }
          ${
            showEmptyState
              ? html`<div class="empty">
                    ${this.hass.localize(
                      "ui.panel.config.tools.tabs.templates.result_placeholder"
                    )}
                  </div>
                  <ha-starting-points
                    .heading=${modeText(
                      this.hass.localize as any,
                      "ui.components.starting_points.heading"
                    )}
                    .items=${templateStartingPoints(this.hass.localize)}
                    @starting-point-selected=${this._startingPointSelected}
                  ></ha-starting-points>`
              : this._templateResult
                ? html`
                    <pre class="rendered">
${
                        type === "object"
                          ? JSON.stringify(this._templateResult.result, null, 2)
                          : this._templateResult.result
                      }</pre>
                    <div class="result-meta">
                      <ha-label dense>${resultType}</ha-label>
                      ${
                        this._renderMs !== undefined
                          ? html`<span class="secondary"
                              >${this.hass.localize(
                                "ui.panel.config.tools.tabs.templates.rendered_in",
                                { ms: this._renderMs }
                              )}</span
                            >`
                          : nothing
                      }
                    </div>
                  `
                : nothing
          }
        </div>
      </ha-card>
    `;
  }

  private _renderListenersCard() {
    const listeners = this._templateResult?.listeners;
    if (!listeners || (this._error && !this._templateResult)) {
      return nothing;
    }
    const localize = this.hass.localize;
    const rows: {
      icon: string;
      title: string;
      detail: string;
      entityId?: string;
    }[] = [];
    if (listeners.all) {
      rows.push({
        icon: mdiShapeOutline,
        title: localize("ui.panel.config.tools.tabs.templates.listens_all"),
        detail: localize(
          "ui.panel.config.tools.tabs.templates.listens_all_detail"
        ),
      });
    } else {
      [...listeners.domains].sort().forEach((domain) =>
        rows.push({
          icon: mdiShapeOutline,
          title: localize(
            "ui.panel.config.tools.tabs.templates.listens_domain",
            { domain }
          ),
          detail: localize(
            "ui.panel.config.tools.tabs.templates.listens_entity_detail"
          ),
        })
      );
      [...listeners.entities].sort().forEach((entityId) =>
        rows.push({
          icon: mdiFlashOutline,
          title: entityId,
          detail: localize(
            "ui.panel.config.tools.tabs.templates.listens_entity_detail"
          ),
          entityId,
        })
      );
    }
    if (listeners.time) {
      rows.push({
        icon: mdiClockOutline,
        title: localize("ui.panel.config.tools.tabs.templates.listens_time"),
        detail: localize(
          "ui.panel.config.tools.tabs.templates.listens_time_detail"
        ),
      });
    }
    return html`
      <ha-card class="listeners-card">
        <div class="card-header-row">
          <h2>
            ${localize("ui.panel.config.tools.tabs.templates.listens_to")}
          </h2>
        </div>
        <div class="card-content">
          ${
            rows.length
              ? rows.map(
                  (row) => html`
                    <div class="listener">
                      <div class="listener-tile">
                        <ha-svg-icon .path=${row.icon}></ha-svg-icon>
                      </div>
                      <div class="listener-text">
                        <div class="listener-title">${row.title}</div>
                        <div class="secondary">${row.detail}</div>
                      </div>
                      ${
                        row.entityId
                          ? html`<ha-icon-button
                              .path=${mdiInformationOutline}
                              .label=${localize(
                                "ui.panel.config.tools.tabs.states.more_info"
                              )}
                              .entityId=${row.entityId}
                              @click=${this._showMoreInfo}
                            ></ha-icon-button>`
                          : nothing
                      }
                    </div>
                  `
                )
              : html`<span class="all_listeners">
                  ${localize("ui.panel.config.tools.tabs.templates.no_listeners")}
                </span>`
          }
        </div>
      </ha-card>
    `;
  }

  private _showMoreInfo(ev: Event) {
    const entityId = (ev.currentTarget as HTMLElement & { entityId: string })
      .entityId;
    fireEvent(this, "hass-more-info", { entityId });
  }

  private _splitRepositioned(ev: HASSDomTargetEvent<HaSplitPanel>) {
    this._splitPosition = (ev.target as HaSplitPanel).position;
    this._storeSplitPosition();
  }

  private _toggleOrientation() {
    this._splitOrientation =
      this._splitOrientation === "vertical" ? "horizontal" : "vertical";
    if (this._inited) {
      localStorage[STORAGE_KEY_SPLIT_ORIENTATION] = this._splitOrientation;
    }
  }

  private _storeSplitPosition = debounce(
    () => {
      if (!this._inited) {
        return;
      }
      localStorage[STORAGE_KEY_SPLIT_POSITION] = String(this._splitPosition);
    },
    500,
    false
  );

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      haStyleScrollbar,
      css`
        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .about {
          flex: none;
          padding: var(--ha-space-4);
          padding-bottom: 0;
        }

        .about a {
          color: var(--primary-color);
        }

        .draft-recovery {
          flex: none;
          padding: var(--ha-space-4) var(--ha-space-4) 0;
        }

        .panes {
          flex: 1;
          min-height: 0;
          box-sizing: border-box;
          padding: var(--ha-space-4);
          --ha-split-panel-min: 20%;
          --ha-split-panel-max: 80%;
          --ha-split-panel-divider-hit-area: var(--ha-space-4);
        }

        /* On wide viewports we slot our own handle (the orientation toggle)
           into the divider, so hide the default grip. On narrow there is no
           toggle, so keep the default grip as the resize affordance. */
        :host(:not([narrow])) .panes {
          --ha-split-panel-grip-display: none;
        }

        /* Orientation toggle that lives on the divider. Clicking it toggles
           orientation; resizing is done by dragging the divider elsewhere. */
        .divider-toggle {
          position: relative;
          z-index: 1;
          flex: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          width: 24px;
          height: 24px;
          margin: 0;
          padding: 0;
          border: 1px solid var(--divider-color);
          border-radius: 50%;
          background-color: var(--card-background-color);
          color: var(--secondary-text-color);
          cursor: pointer;
          --mdc-icon-size: 16px;
          transition:
            color var(--ha-animation-duration-fast) ease-out,
            border-color var(--ha-animation-duration-fast) ease-out;
        }

        @media (hover: hover) {
          .divider-toggle:hover {
            color: var(--primary-color);
            border-color: var(--primary-color);
          }
        }

        .divider-toggle:focus-visible {
          outline: none;
          color: var(--primary-color);
          border-color: var(--primary-color);
        }

        .pane {
          display: flex;
          min-width: 0;
          height: 100%;
          box-sizing: border-box;
          contain: size;
        }

        .pane[slot="start"] {
          padding-inline-end: var(--ha-space-4);
        }

        .pane[slot="end"] {
          padding-inline-start: var(--ha-space-4);
        }

        .panes.vertical .pane[slot="start"] {
          padding-inline-end: 0;
          padding-block-end: var(--ha-space-4);
        }

        .panes.vertical .pane[slot="end"] {
          padding-inline-start: 0;
          padding-block-start: var(--ha-space-4);
        }

        .pane ha-card {
          flex: 1;
          min-width: 0;
        }

        ha-card {
          display: flex;
          flex-direction: column;
          height: 100%;
          margin: 0;
          --ha-card-border-radius: var(--ha-border-radius-3xl);
        }

        .stack {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
          flex: 1;
          min-width: 0;
          min-height: 0;
          overflow: auto;
        }

        .stack ha-card {
          flex: none;
          height: auto;
        }

        .card-header-row {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
          padding: var(--ha-space-4) var(--ha-space-4) 0;
        }

        .card-header-row h2 {
          flex: 1;
          min-width: 0;
          margin: 0;
          font-family: var(--ha-font-family-heading, inherit);
          font-size: var(--ha-font-size-xl);
          font-weight: var(--ha-font-weight-medium);
        }

        .result-meta {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
        }

        .secondary {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
        }

        .listener {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          padding: var(--ha-space-2) 0;
        }

        .listener-tile {
          display: flex;
          flex: none;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: var(--ha-border-radius-lg);
          background: var(--secondary-background-color);
        }

        .listener-text {
          flex: 1;
          min-width: 0;
          word-break: break-word;
        }

        .listener-title {
          font-weight: var(--ha-font-weight-medium);
        }

        .listeners-card .card-content {
          display: flex;
          flex-direction: column;
        }

        .edit-pane .card-content {
          flex: 1;
          min-height: 0;
          display: flex;
        }

        .edit-pane ha-code-editor {
          flex: 1;
          min-height: 0;
          width: 100%;
          --code-mirror-height: 100%;
        }

        .render-pane .card-content {
          flex: 1;
          min-height: 0;
          overflow: auto;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }

        .edit-pane {
          direction: var(--direction);
        }

        .render-spinner {
          position: absolute;
          top: var(--ha-space-2);
          right: var(--ha-space-2);
          inset-inline-end: var(--ha-space-2);
          inset-inline-start: initial;
        }

        ha-alert {
          display: block;
        }

        .render-pane ha-label {
          align-self: flex-start;
        }

        .empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          min-height: 120px;
          padding: var(--ha-space-4);
          text-align: center;
          color: var(--secondary-text-color);
        }

        .render-pane ha-starting-points {
          margin-top: var(--ha-space-2);
        }

        .rendered {
          font-family: var(--ha-font-family-code);
          -webkit-font-smoothing: var(--ha-font-smoothing);
          -moz-osx-font-smoothing: var(--ha-moz-osx-font-smoothing);
          clear: both;
          white-space: pre-wrap;
          background-color: var(--secondary-background-color);
          border-radius: var(--ha-border-radius-md);
          padding: var(--ha-space-2);
          margin-top: 0;
          margin-bottom: 0;
          direction: ltr;
        }

        p,
        ul {
          margin-block: 0;
        }
        .description > p {
          margin-block-start: 0;
        }
        .description > ul {
          margin-block-start: var(--ha-space-1);
          margin-block-end: var(--ha-space-1);
        }
        .description > h3 {
          font-size: var(--ha-font-size-m);
          font-weight: var(--ha-font-weight-medium);
          margin-block-end: var(--ha-space-1);
        }
        .description li {
          margin-block-end: var(--ha-space-1);
        }
        .description .link-description {
          color: var(--secondary-text-color);
        }

        .all_listeners {
          color: var(--warning-color);
        }

        ha-tip {
          padding: 0 var(--ha-space-4) var(--ha-space-4);
          display: block;
        }

        kbd {
          display: inline-block;
          font-family: var(--ha-font-family-code);
          font-size: 0.85em;
          padding: 1px 5px;
          border: 1px solid var(--divider-color);
          border-radius: var(--ha-border-radius-xs);
          background-color: var(--secondary-background-color);
          white-space: nowrap;
        }
      `,
    ];
  }

  private _debounceRender = debounce(
    () => {
      this._subscribeTemplate();
      this._storeTemplate();
    },
    500,
    false
  );

  private _templateChanged(ev) {
    this._template = ev.detail.value;
    if (this._error) {
      this._error = undefined;
      this._errorLevel = undefined;
    }
    this._debounceRender();
    this._debounceDraft();
  }

  // Draft recovery: the text being edited is kept on this device a moment after
  // each change, and only ever offered back, never applied on its own.
  private _debounceDraft = debounce(
    () => this._writeDraft(),
    DRAFT_SAVE_DELAY_MS,
    false
  );

  // The draft belongs to the signed-in person, so another person using the
  // same browser is never offered it.
  private get _draftItemId(): string {
    return `${DRAFT_ITEM_ID}:${this.hass?.user?.id ?? "anonymous"}`;
  }

  private _writeDraft() {
    // While an earlier draft waits for a decision it is left untouched, so
    // new typing cannot overwrite what is on offer.
    if (!this._inited || this._pendingDraft) {
      return;
    }
    const text = this._template;
    if (
      !text.trim() ||
      text === DEMO_TEMPLATE ||
      // A text over the cap is refused by the store; do not hash it first.
      (text.length <= DRAFT_MAX_BYTES &&
        hashDraftText(text) === this._baseVersion)
    ) {
      // Nothing worth recovering.
      discardDraft(DRAFT_KIND, this._draftItemId);
      return;
    }
    saveDraft(DRAFT_KIND, this._draftItemId, text, this._baseVersion);
  }

  private _findDraft() {
    const draft = getDraft(DRAFT_KIND, this._draftItemId, this._baseVersion);
    if (!draft) {
      return;
    }
    if (draft.content === this._template || !draft.content.trim()) {
      discardDraft(DRAFT_KIND, this._draftItemId);
      return;
    }
    this._pendingDraft = draft;
  }

  private _restoreDraft() {
    const draft = this._pendingDraft;
    if (!draft) {
      return;
    }
    this._pendingDraft = undefined;
    discardDraft(DRAFT_KIND, this._draftItemId);
    this._template = draft.content;
    this._baseVersion = hashDraftText(draft.content);
    this._subscribeTemplate();
    this._storeTemplate();
  }

  private _discardDraft() {
    this._pendingDraft = undefined;
    discardDraft(DRAFT_KIND, this._draftItemId);
  }

  private async _subscribeTemplate() {
    const requestId = ++this._subscribeRequestId;
    this._rendering = true;
    await this._unsubscribeTemplate();
    // A newer render started while we were unsubscribing; let it win so we do
    // not leave a stale subscription running that overwrites the result.
    if (requestId !== this._subscribeRequestId) {
      return;
    }
    this._error = undefined;
    this._errorLevel = undefined;
    this._templateResult = undefined;
    this._renderMs = undefined;
    this._renderStartedAt = performance.now();
    try {
      this._unsubRenderTemplate = subscribeRenderTemplate(
        this.hass.connection,
        (result) => {
          // Ignore results from a render that has since been superseded.
          if (requestId !== this._subscribeRequestId) {
            return;
          }
          if ("error" in result) {
            // We show the latest error, or a warning if there are no errors
            if (result.level === "ERROR" || this._errorLevel !== "ERROR") {
              this._error = result.error;
              this._errorLevel = result.level;
            }
          } else {
            if (this._renderMs === undefined) {
              this._renderMs = Math.round(
                performance.now() - this._renderStartedAt
              );
            }
            this._templateResult = result;
          }
        },
        {
          template: this._template,
          timeout: 3,
          report_errors: true,
        }
      );
      await this._unsubRenderTemplate;
    } catch (err: any) {
      this._error = "Unknown error";
      this._errorLevel = undefined;
      if (err.message) {
        this._error = err.message;
        this._errorLevel = undefined;
        this._templateResult = undefined;
      }
      this._unsubRenderTemplate = undefined;
    } finally {
      this._rendering = false;
    }
  }

  private async _unsubscribeTemplate(): Promise<void> {
    if (!this._unsubRenderTemplate) {
      return;
    }

    try {
      const unsub = await this._unsubRenderTemplate;
      unsub();
      this._unsubRenderTemplate = undefined;
    } catch (err: any) {
      if (err.code === "not_found") {
        // If we get here, the connection was probably already closed. Ignore.
      } else {
        throw err;
      }
    }
  }

  private _storeTemplate() {
    if (!this._inited) {
      return;
    }
    localStorage[STORAGE_KEY_TEMPLATE] = this._template;
  }

  @query("ha-code-editor") private _codeEditor?: HTMLElement;

  private _startingPointSelected(ev: CustomEvent<StartingPointSelectedDetail>) {
    const template = templateForStartingPoint(ev.detail.id);
    if (!template) {
      return;
    }
    this._template = template;
    this._subscribeTemplate();
    this._storeTemplate();
    // The chosen text is in the editor: put the cursor there
    this.updateComplete.then(() => {
      this._codeEditor?.focus();
    });
  }

  private async _restoreDemo() {
    if (
      !(await showConfirmationDialog(this, {
        text: this.hass.localize(
          "ui.panel.config.tools.tabs.templates.confirm_reset"
        ),
        warning: true,
      }))
    ) {
      return;
    }
    this._template = DEMO_TEMPLATE;
    this._clearDraft();
    this._subscribeTemplate();
    delete localStorage[STORAGE_KEY_TEMPLATE];
  }

  private async _clear() {
    if (
      !(await showConfirmationDialog(this, {
        text: this.hass.localize(
          "ui.panel.config.tools.tabs.templates.confirm_clear"
        ),
        warning: true,
      }))
    ) {
      return;
    }
    this._unsubscribeTemplate();
    this._template = "";
    this._clearDraft();
    // An empty template shows the placeholder empty state.
    this._templateResult = undefined;
  }

  // An explicit clear or reset ends the draft, including any waiting edit.
  private _clearDraft() {
    this._debounceDraft.cancel();
    this._pendingDraft = undefined;
    discardDraft(DRAFT_KIND, this._draftItemId);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "tools-template": HaPanelDevTemplate;
  }
}
