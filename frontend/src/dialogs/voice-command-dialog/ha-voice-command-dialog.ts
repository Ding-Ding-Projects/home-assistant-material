import "@home-assistant/webawesome/dist/components/divider/divider";
import {
  mdiChevronDown,
  mdiClose,
  mdiHelpCircleOutline,
  mdiShieldCheckOutline,
  mdiStar,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { storage } from "../../common/decorators/storage";
import { fireEvent } from "../../common/dom/fire_event";
import { stopPropagation } from "../../common/dom/stop_propagation";
import "../../components/ha-alert";
import "../../components/ha-assist-chat";
import "../../components/ha-button";
import "../../components/ha-dialog";
import "../../components/ha-dialog-header";
import "../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../components/ha-dropdown";
import "../../components/ha-dropdown-item";
import "../../components/ha-icon-button";
import "../../components/ha-icon-next";
import "../../components/ha-spinner";
import "../../components/ha-svg-icon";
import type { AssistPipeline } from "../../data/assist_pipeline";
import {
  getAssistPipeline,
  listAssistPipelines,
} from "../../data/assist_pipeline";
import { haStyleDialog } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import { documentationUrl } from "../../util/documentation-url";
import { pipelineRunsLocally } from "./pipeline-locality";
import type { VoiceCommandDialogParams } from "./show-ha-voice-command-dialog";

@customElement("ha-voice-command-dialog")
export class HaVoiceCommandDialog extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _open = false;

  @state() private _dialogOpen = false;

  @state()
  @storage({
    key: "AssistPipelineId",
    state: true,
    subscribe: false,
  })
  private _pipelineId?: string;

  @state() private _pipeline?: AssistPipeline;

  @state() private _pipelines?: AssistPipeline[];

  @state() private _preferredPipeline?: string;

  @state() private _errorLoadAssist?: "not_found" | "unknown";

  private _startListening = false;

  private _prompt?: string;

  private _submitPrompt = false;

  public async showDialog(params: VoiceCommandDialogParams): Promise<void> {
    await this._loadPipelines();
    const pipelinesIds = this._pipelines?.map((pipeline) => pipeline.id) || [];
    if (
      params.pipeline_id === "preferred" ||
      (params.pipeline_id === "last_used" && !this._pipelineId)
    ) {
      this._pipelineId = this._preferredPipeline;
    } else if (!["last_used", "preferred"].includes(params.pipeline_id)) {
      this._pipelineId = params.pipeline_id;
    }

    // If the pipeline id is not in the list of pipelines, set it to preferred
    if (this._pipelineId && !pipelinesIds.includes(this._pipelineId)) {
      this._pipelineId = this._preferredPipeline;
    }

    this._startListening = params.start_listening ?? false;
    this._prompt = params.prompt;
    this._submitPrompt = params.submit ?? false;
    this._dialogOpen = true;
    this._open = true;
  }

  public closeDialog(): void {
    this._open = false;
  }

  private _dialogClosed(): void {
    this._dialogOpen = false;
    this._pipelines = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected render() {
    if (!this._dialogOpen) {
      return nothing;
    }

    return html`
      <ha-dialog .open=${this._open} @closed=${this._dialogClosed} flexcontent>
        <ha-dialog-header slot="header">
          <ha-icon-button
            slot="navigationIcon"
            data-dialog="close"
            .label=${this.hass.localize("ui.common.close")}
            .path=${mdiClose}
          ></ha-icon-button>
          <div slot="title">
            ${this.hass.localize("ui.dialogs.voice_command.title")}
            <ha-dropdown
              @opened=${this._loadPipelines}
              @closed=${stopPropagation}
              @wa-select=${this._selectPipeline}
            >
              <ha-button
                slot="trigger"
                appearance="plain"
                variant="neutral"
                size="s"
                .loading=${!this._pipelines}
              >
                ${this._pipeline?.name}
                <ha-svg-icon slot="end" .path=${mdiChevronDown}></ha-svg-icon>
              </ha-button>
              ${
                !this._pipelines
                  ? nothing
                  : this._pipelines?.map(
                      (pipeline) =>
                        html`<ha-dropdown-item
                          ?selected=${
                            pipeline.id === this._pipelineId ||
                            (!this._pipelineId &&
                              pipeline.id === this._preferredPipeline)
                          }
                          .value=${pipeline.id}
                        >
                          ${pipeline.name}${
                            pipeline.id === this._preferredPipeline
                              ? html`
                                  <ha-svg-icon
                                    slot="details"
                                    .path=${mdiStar}
                                  ></ha-svg-icon>
                                `
                              : nothing
                          }
                        </ha-dropdown-item>`
                    )
              }
              ${
                this.hass.user?.is_admin
                  ? html`<wa-divider></wa-divider>
                      <a href="/config/voice-assistants/assistants"
                        ><ha-dropdown-item
                          >${this.hass.localize(
                            "ui.dialogs.voice_command.manage_assistants"
                          )}

                          <ha-icon-next
                            slot="details"
                          ></ha-icon-next></ha-dropdown-item
                      ></a>`
                  : nothing
              }
            </ha-dropdown>
          </div>
          <ha-icon-button
            .label=${this.hass.localize("ui.common.help")}
            .path=${mdiHelpCircleOutline}
            href=${documentationUrl(this.hass, "/docs/assist/")}
            slot="actionItems"
            target="_blank"
            rel="noopener noreferrer"
          ></ha-icon-button>
        </ha-dialog-header>

        ${
          this._errorLoadAssist
            ? html`<ha-alert alert-type="error">
                ${this.hass.localize(
                  `ui.dialogs.voice_command.${this._errorLoadAssist}_error_load_assist`
                )}
              </ha-alert>`
            : this._pipeline
              ? html`
                  <ha-assist-chat
                    .pipeline=${this._pipeline}
                    .startListening=${this._startListening}
                    .initialPrompt=${this._prompt}
                    .submitInitialPrompt=${this._submitPrompt}
                  >
                  </ha-assist-chat>
                  ${
                    pipelineRunsLocally(this._pipeline)
                      ? html`<div class="privacy-note" slot="footer">
                          <ha-svg-icon
                            .path=${mdiShieldCheckOutline}
                          ></ha-svg-icon>
                          <span
                            >${this.hass.localize(
                              "ui.dialogs.voice_command.local_answers_note"
                            )}</span
                          >
                        </div>`
                      : nothing
                  }
                `
              : html`<div class="pipelines-loading">
                  <ha-spinner size="large"></ha-spinner>
                </div>`
        }
      </ha-dialog>
    `;
  }

  protected willUpdate(changedProperties: PropertyValues): void {
    if (
      changedProperties.has("_pipelineId") ||
      (changedProperties.has("_open") &&
        this._open === true &&
        this._pipelineId)
    ) {
      this._getPipeline();
    }
  }

  private async _loadPipelines() {
    if (this._pipelines) {
      return;
    }
    const { pipelines, preferred_pipeline } = await listAssistPipelines(
      this.hass.callWS
    );
    this._pipelines = pipelines;
    this._preferredPipeline = preferred_pipeline || undefined;
  }

  private async _selectPipeline(ev: HaDropdownSelectEvent) {
    const pipelineId = ev.detail?.item?.value;
    if (pipelineId) {
      this._pipelineId = pipelineId;
      await this.updateComplete;
    }
  }

  private async _getPipeline() {
    this._pipeline = undefined;
    this._errorLoadAssist = undefined;
    const pipelineId = this._pipelineId!;
    try {
      const pipeline = await getAssistPipeline(this.hass, pipelineId);
      // Verify the pipeline is still the same.
      if (pipelineId === this._pipelineId) {
        this._pipeline = pipeline;
      }
    } catch (e: any) {
      if (pipelineId !== this._pipelineId) {
        return;
      }

      if (e.code === "not_found") {
        this._errorLoadAssist = "not_found";
      } else {
        this._errorLoadAssist = "unknown";
        // eslint-disable-next-line no-console
        console.error(e);
      }
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleDialog,
      css`
        ha-dialog {
          --dialog-content-padding: 0;
        }
        ha-dialog-header a {
          color: var(--primary-text-color);
        }
        div[slot="title"] {
          display: flex;
          flex-direction: column;
          margin: -4px 0;
        }
        ha-dropdown {
          display: flex;
        }
        /* The button is 32px tall; the invisible extension keeps the
           touch target at 48px. Clicks on it reach the trigger itself. */
        ha-dropdown ha-button {
          position: relative;
        }
        ha-dropdown ha-button::after {
          content: "";
          position: absolute;
          inset: calc(var(--ha-space-2) * -1) 0;
        }
        ha-dropdown ha-button::part(base) {
          border: 1px solid var(--outline-color);
          border-radius: var(--ha-border-radius-pill, 999px);
          padding-inline: var(--ha-space-3);
        }
        .privacy-note {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          margin: var(--ha-space-2) var(--ha-space-4) var(--ha-space-4);
          padding: var(--ha-space-3) var(--ha-space-4);
          border-radius: var(--ha-border-radius-lg);
          background: var(--secondary-background-color);
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
        }
        .privacy-note ha-svg-icon {
          flex: none;
          color: var(--primary-text-color);
        }
        ha-dropdown ha-button ha-svg-icon {
          margin-left: var(--ha-space-1);
          margin-inline-start: var(--ha-space-1);
          margin-inline-end: initial;
          direction: var(--direction);
        }
        ha-dropdown-item ha-svg-icon {
          margin-left: var(--ha-space-1);
          margin-inline-start: var(--ha-space-1);
          margin-inline-end: initial;
          direction: var(--direction);
          display: block;
        }
        ha-dropdown a {
          text-decoration: none;
        }

        .pipelines-loading {
          display: flex;
          justify-content: center;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-voice-command-dialog": HaVoiceCommandDialog;
  }
}
