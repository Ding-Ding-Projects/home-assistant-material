import type { ContextType } from "@lit/context";
import { mdiContentCopy } from "@mdi/js";
import type { CSSResultGroup, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, query, state } from "lit/decorators";
import { consume } from "../../../common/decorators/consume";
import { fireEvent } from "../../../common/dom/fire_event";
import { copyToClipboard } from "../../../common/util/copy-clipboard";
import "../../../components/ha-alert";
import "../../../components/ha-icon-button";
import "../../../components/ha-svg-icon";
import "../../../components/ha-dialog";
import {
  apiContext,
  configContext,
  internationalizationContext,
} from "../../../data/context";
import type { IntegrationManifest } from "../../../data/integration";
import {
  domainToName,
  fetchIntegrationManifest,
} from "../../../data/integration";
import {
  getLoggedErrorIntegration,
  isCustomIntegrationError,
} from "../../../data/system_log";
import { haStyleDialog } from "../../../resources/styles";
import { documentationUrl } from "../../../util/documentation-url";
import { showToast } from "../../../util/toast";
import type { SystemLogDetailDialogParams } from "./show-dialog-system-log-detail";
import { formatSystemLogTime } from "./util";

/** Compares the host, so a URL that merely contains ours does not pass. */
const isOfficialDocumentationUrl = (url: string): boolean => {
  try {
    return new URL(url).hostname === "www.home-assistant.io";
  } catch (_err) {
    return false;
  }
};

@customElement("dialog-system-log-detail")
class DialogSystemLogDetail extends LitElement {
  @state()
  @consume({ context: apiContext, subscribe: true })
  private _api!: ContextType<typeof apiContext>;

  @state()
  @consume({ context: configContext, subscribe: true })
  private _config!: ContextType<typeof configContext>;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: ContextType<typeof internationalizationContext>;

  @state() private _params?: SystemLogDetailDialogParams;

  @state() private _manifest?: IntegrationManifest | null;

  @state() private _open = false;

  @query(".contents") private _contents?: HTMLElement;

  public async showDialog(params: SystemLogDetailDialogParams): Promise<void> {
    this._params = params;
    this._manifest = undefined;
    this._open = true;
    await this.updateComplete;
  }

  public closeDialog() {
    this._open = false;
  }

  private _dialogClosed() {
    this._params = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected updated(changedProps: PropertyValues) {
    super.updated(changedProps);

    if (
      (!changedProps.has("_params") && !changedProps.has("_manifest")) ||
      !this._params
    ) {
      return;
    }

    const integration = getLoggedErrorIntegration(this._params.item);

    if (changedProps.has("_params") && integration) {
      this._fetchManifest(integration, this._params);
    }
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }
    const item = this._params.item;

    const integration = getLoggedErrorIntegration(item);

    const showDocumentation =
      this._manifest &&
      (this._manifest.is_built_in ||
        // Custom components with our official docs should not link to our docs
        (!!this._manifest.documentation &&
          !isOfficialDocumentationUrl(this._manifest.documentation)));

    const documentationLink = this._manifest?.is_built_in
      ? documentationUrl(this._config, `/integrations/${this._manifest.domain}`)
      : this._manifest?.documentation;

    const title = this._i18n.localize("ui.panel.config.logs.details", {
      level: html`<span class=${item.level}
        >${this._i18n.localize(`ui.panel.config.logs.level.${item.level}`)}</span
      >`,
    });

    return html`
      <ha-dialog
        .open=${this._open}
        width="large"
        @closed=${this._dialogClosed}
      >
        <span slot="headerTitle">${title}</span>
        <ha-icon-button
          id="copy"
          autofocus
          @click=${this._copyLog}
          slot="headerActionItems"
          .label=${this._i18n.localize("ui.panel.config.logs.copy")}
          .path=${mdiContentCopy}
        ></ha-icon-button>
        <ha-alert alert-type="info">
          <p>
            ${this._i18n.localize("ui.panel.config.problem_log.dialog_hint", {
              link: html`<a
                href="/config/problem-log"
                @click=${this.closeDialog}
                >${this._i18n.localize(
                  "ui.panel.config.problem_log.dialog_hint_link"
                )}</a
              >`,
            })}
          </p>
        </ha-alert>
        <div class="contents">
          <p>
            ${this._i18n.localize("ui.panel.config.logs.detail.logger")}:
            ${item.name}<br />
            ${this._i18n.localize("ui.panel.config.logs.detail.source")}:
            ${item.source.join(":")}
            ${
              integration
                ? html`
                    <br />
                    ${this._i18n.localize(
                      "ui.panel.config.logs.detail.integration"
                    )}:
                    ${domainToName(this._i18n.localize, integration)}
                    ${
                      !this._manifest ||
                      // Can happen with custom integrations
                      !showDocumentation ||
                      !documentationLink
                        ? ""
                        : html`
                            (<a
                              href=${documentationLink}
                              target="_blank"
                              rel="noreferrer"
                              >${this._i18n.localize(
                                "ui.panel.config.logs.detail.documentation"
                              )}</a
                            >)
                          `
                    }
                  `
                : ""
            }
            <br />
            ${
              item.count > 0
                ? html`
                    ${this._i18n.localize(
                      "ui.panel.config.logs.detail.first_occurred"
                    )}:
                    ${formatSystemLogTime(
                      item.first_occurred,
                      this._i18n.locale,
                      this._config.config
                    )}
                    (${this._i18n.localize(
                      "ui.panel.config.logs.detail.number_of_occurrences",
                      {
                        count: item.count,
                      }
                    )}) <br />
                  `
                : ""
            }
            ${this._i18n.localize("ui.panel.config.logs.detail.last_logged")}:
            ${formatSystemLogTime(
              item.timestamp,
              this._i18n.locale,
              this._config.config
            )}
          </p>
          ${
            item.message.length > 1
              ? html`
                  <ul>
                    ${item.message.map((msg) => html` <li>${msg}</li> `)}
                  </ul>
                `
              : item.message[0]
          }
          ${item.exception ? html` <pre>${item.exception}</pre> ` : nothing}
        </div>
      </ha-dialog>
    `;
  }

  private get isCustomIntegration(): boolean {
    return this._manifest
      ? !this._manifest.is_built_in
      : isCustomIntegrationError(this._params!.item);
  }

  private async _fetchManifest(
    integration: string,
    params: SystemLogDetailDialogParams
  ) {
    let manifest: IntegrationManifest | null;
    try {
      manifest = await fetchIntegrationManifest(this._api, integration);
    } catch {
      // Ignore if loading manifest fails. Probably bad JSON in manifest.
      manifest = null;
    }

    if (this._params === params && this._open) {
      this._manifest = manifest;
    }
  }

  private async _copyLog(): Promise<void> {
    const copyElement = this._contents!;

    let text = copyElement.innerText;

    if (this.isCustomIntegration) {
      text =
        this._i18n.localize(
          "ui.panel.config.logs.error_from_custom_integration"
        ) +
        "\n\n" +
        text;
    }

    await copyToClipboard(text);
    showToast(this, {
      message: this._i18n.localize("ui.common.copied_clipboard"),
    });
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleDialog,
      css`
        a {
          color: var(--primary-color);
        }
        p {
          margin-top: 0;
        }
        pre {
          margin-bottom: 0;
          font-family: var(--ha-font-family-code);
        }
        ha-alert {
          display: block;
          margin-inline: calc(-1 * var(--ha-space-3));
          margin-block-end: var(--ha-space-4);
        }
        ha-alert p {
          margin: 0;
        }
        ha-alert p + p {
          margin-block-start: var(--ha-space-2);
        }
        .contents {
          outline: none;
          direction: ltr;
        }
        .error {
          color: var(--error-color);
        }
        .warning {
          color: var(--warning-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-system-log-detail": DialogSystemLogDetail;
  }
}
