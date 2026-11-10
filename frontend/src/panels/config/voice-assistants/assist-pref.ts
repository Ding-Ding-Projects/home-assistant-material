import "@home-assistant/webawesome/dist/components/divider/divider";
import {
  mdiBug,
  mdiCommentProcessingOutline,
  mdiContentDuplicate,
  mdiDotsVertical,
  mdiHelpCircleOutline,
  mdiPencil,
  mdiStar,
  mdiTrashCan,
} from "@mdi/js";
import type { PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
import { computeDomain } from "../../../common/entity/compute_domain";
import { computeStateName } from "../../../common/entity/compute_state_name";
import { formatLanguageCode } from "../../../common/language/format_language";
import { navigate } from "../../../common/navigate";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-icon-button";
import "../../../components/ha-svg-icon";
import "../../../components/ha-switch";
import type { HaSwitch } from "../../../components/ha-switch";
import "../../../components/item/ha-row-item";
import "../../../components/voice-assistant-brand-icon";
import type { AssistPipeline } from "../../../data/assist_pipeline";
import {
  createAssistPipeline,
  deleteAssistPipeline,
  listAssistPipelines,
  setAssistPipelinePreferred,
  updateAssistPipeline,
} from "../../../data/assist_pipeline";
import type { CloudStatus } from "../../../data/cloud";
import type { ExposeEntitySettings } from "../../../data/expose";
import {
  getExposeNewEntities,
  setExposeNewEntities,
} from "../../../data/expose";
import { domainToName } from "../../../data/integration";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import { showVoiceCommandDialog } from "../../../dialogs/voice-command-dialog/show-ha-voice-command-dialog";
import type { HomeAssistant } from "../../../types";
import { documentationUrl } from "../../../util/documentation-url";
import { showVoiceAssistantPipelineDetailDialog } from "./show-dialog-voice-assistant-pipeline-detail";

@customElement("assist-pref")
export class AssistPref extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public exposedEntities?: Record<
    string,
    ExposeEntitySettings
  >;

  @property({ attribute: false }) public cloudStatus?: CloudStatus;

  @state() private _pipelines: AssistPipeline[] = [];

  @state() private _preferred: string | null = null;

  @state() private _pipelineEntitiesCount = 0;

  @state() private _exposeNew?: boolean;

  protected willUpdate() {
    if (!this.hasUpdated) {
      getExposeNewEntities(this.hass, "conversation").then((value) => {
        this._exposeNew = value.expose_new;
      });
    }
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);

    listAssistPipelines(this.hass.callWS).then((pipelines) => {
      this._pipelines = pipelines.pipelines;
      this._preferred = pipelines.preferred_pipeline;
    });
    this._pipelineEntitiesCount = Object.values(this.hass.entities).filter(
      (entity) =>
        computeDomain(entity.entity_id) === "assist_satellite" &&
        this.hass.states[entity.entity_id].state !== "unavailable"
    ).length;
  }

  private _exposedEntitiesCount = memoizeOne(
    (exposedEntities: Record<string, ExposeEntitySettings>) =>
      Object.entries(exposedEntities).filter(
        ([entityId, expose]) =>
          expose.conversation && entityId in this.hass.states
      ).length
  );

  /** The name of an engine the assistant uses: an entity, or an integration. */
  private _engineName(engine?: string | null): string | undefined {
    if (!engine) {
      return undefined;
    }
    const stateObj = this.hass.states[engine];
    if (stateObj) {
      return computeStateName(stateObj);
    }
    return domainToName(this.hass.localize, engine);
  }

  private _pipelineEngines(pipeline: AssistPipeline): string[] {
    return [
      pipeline.stt_engine,
      pipeline.conversation_engine,
      pipeline.tts_engine,
    ]
      .map((engine) => this._engineName(engine))
      .filter((name): name is string => !!name);
  }

  /** Opens the dialog that creates a new assistant. */
  public addAssistant() {
    this._openDialog();
  }

  protected render() {
    return html`
      <div class="cards">
        ${this._pipelines.map((pipeline) => this._renderPipeline(pipeline))}
      </div>
      <ha-card outlined class="settings">
        <ha-row-item>
          <span slot="headline"
            >${this.hass!.localize(
              "ui.panel.config.voice_assistants.expose.expose_new_entities"
            )}</span
          >
          <span slot="supporting-text"
            >${this.hass!.localize(
              "ui.panel.config.voice_assistants.expose.expose_new_entities_info"
            )}</span
          >
          <ha-switch
            slot="end"
            .checked=${this._exposeNew}
            .disabled=${this._exposeNew === undefined}
            @change=${this._exposeNewToggleChanged}
          ></ha-switch>
        </ha-row-item>
        <div class="card-actions">
          <ha-button
            appearance="plain"
            href="/config/voice-assistants/expose?assistants=conversation&historyBack"
          >
            ${this.hass.localize(
              "ui.panel.config.voice_assistants.assistants.pipeline.exposed_entities",
              {
                number: this.exposedEntities
                  ? this._exposedEntitiesCount(this.exposedEntities)
                  : 0,
              }
            )}
          </ha-button>
          ${
            this._pipelineEntitiesCount > 0
              ? html`
                  <ha-button
                    appearance="plain"
                    href="/config/voice-assistants/assist/devices"
                  >
                    ${this.hass.localize(
                      "ui.panel.config.voice_assistants.assistants.pipeline.assist_devices",
                      { number: this._pipelineEntitiesCount }
                    )}
                  </ha-button>
                `
              : nothing
          }
          <span class="spacer"></span>
          <ha-icon-button
            .label=${this.hass.localize(
              "ui.panel.config.voice_assistants.assistants.pipeline.link_learn_how_it_works"
            )}
            .path=${mdiHelpCircleOutline}
            href=${documentationUrl(this.hass, "/docs/assist/")}
            target="_blank"
            rel="noreferrer noopener"
            class="icon-link"
          ></ha-icon-button>
        </div>
      </ha-card>
    `;
  }

  private _renderPipeline(pipeline: AssistPipeline) {
    const preferred = this._preferred === pipeline.id;
    const engines = this._pipelineEngines(pipeline);
    const language = formatLanguageCode(pipeline.language, this.hass.locale);
    return html`
      <div class=${classMap({ card: true, preferred })}>
        <div class="card-top">
          <span class="tile">
            <voice-assistant-brand-icon .voiceAssistantId=${"conversation"}>
            </voice-assistant-brand-icon>
          </span>
          <div class="card-text">
            <a
              class="card-title"
              href="/config/voice-assistants/pipeline/${pipeline.id}"
              >${pipeline.name}</a
            >
            <span class="card-sub">
              ${
                preferred
                  ? html`<ha-svg-icon .path=${mdiStar}></ha-svg-icon>
                      ${this.hass.localize(
                        "ui.panel.config.voice_assistants.assistants.pipeline.preferred_language",
                        { language }
                      )}`
                  : language
              }
            </span>
          </div>
          <ha-dropdown
            placement="bottom-end"
            @wa-select=${this._handlePipelineMenuAction}
            @keydown=${this._handleDropdownKeydown}
          >
            <ha-icon-button
              slot="trigger"
              .label=${this.hass!.localize(
                "ui.panel.lovelace.editor.menu.open"
              )}
              .path=${mdiDotsVertical}
            ></ha-icon-button>
            <ha-dropdown-item value="edit" .data=${pipeline.id}>
              ${this.hass.localize("ui.common.edit")}
              <ha-svg-icon slot="icon" .path=${mdiPencil}></ha-svg-icon>
            </ha-dropdown-item>
            <ha-dropdown-item value="talk" .data=${pipeline.id}>
              ${this.hass!.localize(
                "ui.panel.config.voice_assistants.assistants.pipeline.start_conversation"
              )}
              <ha-svg-icon
                slot="icon"
                .path=${mdiCommentProcessingOutline}
              ></ha-svg-icon>
            </ha-dropdown-item>
            <ha-dropdown-item
              value="set-preferred"
              .data=${pipeline.id}
              .disabled=${preferred}
            >
              ${this.hass.localize(
                "ui.panel.config.voice_assistants.assistants.pipeline.detail.set_as_preferred"
              )}
              <ha-svg-icon slot="icon" .path=${mdiStar}></ha-svg-icon>
            </ha-dropdown-item>
            <ha-dropdown-item value="debug" .data=${pipeline.id}>
              ${this.hass.localize(
                "ui.panel.config.voice_assistants.assistants.pipeline.detail.debug"
              )}
              <ha-svg-icon slot="icon" .path=${mdiBug}></ha-svg-icon>
            </ha-dropdown-item>
            <ha-dropdown-item value="duplicate" .data=${pipeline.id}>
              ${this.hass.localize("ui.common.duplicate")}
              <ha-svg-icon
                slot="icon"
                .path=${mdiContentDuplicate}
              ></ha-svg-icon>
            </ha-dropdown-item>
            <wa-divider></wa-divider>
            <ha-dropdown-item
              variant="danger"
              value="delete"
              .data=${pipeline.id}
            >
              ${this.hass.localize("ui.common.delete")}
              <ha-svg-icon slot="icon" .path=${mdiTrashCan}></ha-svg-icon>
            </ha-dropdown-item>
          </ha-dropdown>
        </div>
        ${
          engines.length
            ? html`<ul class="tags">
                ${engines.map((engine) => html`<li>${engine}</li>`)}
              </ul>`
            : nothing
        }
      </div>
    `;
  }

  private async _exposeNewToggleChanged(ev) {
    const toggle = ev.target as HaSwitch;
    if (this._exposeNew === undefined || this._exposeNew === toggle.checked) {
      return;
    }
    try {
      await setExposeNewEntities(this.hass, "conversation", toggle.checked);
    } catch (_err: any) {
      toggle.checked = !toggle.checked;
    }
  }

  private _handlePipelineMenuAction(ev: HaDropdownSelectEvent) {
    const value = ev.detail.item.value;
    const id = (ev.detail.item as any).data as string;
    switch (value) {
      case "edit":
        navigate(`/config/voice-assistants/pipeline/${id}`);
        break;
      case "talk":
        this._talkWithPipeline(id);
        break;
      case "set-preferred":
        this._setPreferredPipeline(id);
        break;
      case "debug":
        this._debugPipeline(id);
        break;
      case "duplicate":
        this._duplicatePipeline(id);
        break;
      case "delete":
        this._deletePipeline(id);
        break;
    }
  }

  private _talkWithPipeline(id: string) {
    showVoiceCommandDialog(this, this.hass, { pipeline_id: id });
  }

  private async _setPreferredPipeline(id: string) {
    await setAssistPipelinePreferred(this.hass!, id);
    this._preferred = id;
  }

  private async _debugPipeline(id: string) {
    navigate(`/config/voice-assistants/debug/${id}`);
  }

  private async _duplicatePipeline(id: string) {
    const pipeline = this._pipelines.find((res) => res.id === id);
    if (!pipeline) {
      showAlertDialog(this, {
        text: this.hass.localize(
          "ui.panel.config.voice_assistants.assistants.pipeline.duplicate.error_pipeline_not_found"
        ),
      });
      return;
    }

    const { id: _id, ...pipelineWithoutId } = pipeline;
    const newPipeline = {
      ...pipelineWithoutId,
      name: this.hass.localize(
        "ui.panel.config.voice_assistants.assistants.pipeline.duplicate.name",
        { name: pipeline.name }
      ),
    };

    this._openDialog(newPipeline);
  }

  private async _deletePipeline(id: string) {
    if (this._preferred === id) {
      showAlertDialog(this, {
        text: this.hass!.localize(
          "ui.panel.config.voice_assistants.assistants.pipeline.delete.error_preferred"
        ),
      });
      return;
    }
    const pipeline = this._pipelines.find((res) => res.id === id);
    if (
      !(await showConfirmationDialog(this, {
        title: this.hass!.localize(
          "ui.panel.config.voice_assistants.assistants.pipeline.delete.confirm_title",
          { name: pipeline!.name }
        ),
        text: this.hass!.localize(
          "ui.panel.config.voice_assistants.assistants.pipeline.delete.confirm_text",
          { name: pipeline!.name }
        ),
        confirmText: this.hass!.localize("ui.common.delete"),
        destructive: true,
      }))
    ) {
      return;
    }

    await deleteAssistPipeline(this.hass!, pipeline!.id);
    this._pipelines = this._pipelines!.filter((res) => res !== pipeline);
  }

  private async _openDialog(
    pipeline?: AssistPipeline | Omit<AssistPipeline, "id">
  ): Promise<void> {
    showVoiceAssistantPipelineDetailDialog(this, {
      cloudActiveSubscription:
        this.cloudStatus?.logged_in && this.cloudStatus.active_subscription,
      pipeline,
      createPipeline: async (values) => {
        const created = await createAssistPipeline(this.hass!, values);
        this._pipelines = this._pipelines!.concat(created);
      },
      ...(pipeline && "id" in pipeline
        ? {
            updatePipeline: async (values) => {
              const updated = await updateAssistPipeline(
                this.hass,
                pipeline.id,
                values
              );
              const pipelineToUpdate = pipeline as AssistPipeline;
              this._pipelines = this._pipelines!.map((res) =>
                res.id === pipelineToUpdate.id ? updated : res
              );
            },
          }
        : {}),
    });
  }

  private _handleDropdownKeydown(ev: KeyboardEvent) {
    if (ev.key === " " || ev.key === "Enter") {
      ev.stopPropagation();
    }
  }

  static styles = css`
    :host {
      display: block;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: var(--ha-space-4);
      margin-bottom: var(--ha-space-4);
    }
    .card {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
      box-sizing: border-box;
      padding: var(--ha-space-5);
      border-radius: var(--ha-border-radius-3xl);
      background: var(--card-background-color);
    }
    .card.preferred {
      background: var(
        --ha-color-fill-primary-quiet-resting,
        var(--secondary-background-color)
      );
    }
    .card:focus-within,
    .card:hover {
      box-shadow: var(--ha-box-shadow-s);
    }
    .card-top {
      display: flex;
      align-items: flex-start;
      gap: var(--ha-space-3);
    }
    .tile {
      flex: none;
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      border-radius: var(--ha-border-radius-xl, 16px);
      background: var(--card-background-color);
    }
    .tile voice-assistant-brand-icon {
      height: 28px;
    }
    .card-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
    }
    .card-title {
      color: var(--primary-text-color);
      font-family: var(--ha-font-family-heading, inherit);
      font-size: var(--ha-font-size-xl);
      font-weight: var(--ha-font-weight-medium);
      text-decoration: none;
      overflow-wrap: anywhere;
    }
    /* The whole card opens the assistant; the menu stays above the link. */
    .card-title::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
    }
    .card-title:focus-visible {
      outline: none;
    }
    .card-title:focus-visible::after {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .card-sub {
      display: flex;
      align-items: center;
      gap: var(--ha-space-1);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .card-sub ha-svg-icon {
      --mdc-icon-size: 16px;
      color: currentColor;
    }
    ha-dropdown {
      position: relative;
      z-index: 1;
      font-size: var(--ha-font-size-m);
      font-family: var(--ha-font-family-body);
      letter-spacing: normal;
    }
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .tags li {
      padding: var(--ha-space-1) var(--ha-space-3);
      border-radius: var(--ha-border-radius-pill, 999px);
      background: var(--secondary-background-color);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .settings {
      display: block;
    }
    ha-row-item::part(headline),
    ha-row-item::part(supporting-text) {
      white-space: normal;
    }
    .card-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
    }
    .spacer {
      flex: 1;
    }
    .icon-link {
      color: var(--secondary-text-color);
      direction: var(--direction);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "assist-pref": AssistPref;
  }
}
