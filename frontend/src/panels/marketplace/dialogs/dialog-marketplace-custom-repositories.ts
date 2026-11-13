import type { ContextType } from "@lit/context";
import { mdiFolderZipOutline } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { consume } from "../../../common/decorators/consume";
import type { HASSDomEvent } from "../../../common/dom/fire_event";
import type { LocalizeFunc } from "../../../common/translations/localize";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-button-toggle-group";
import "../../../components/ha-dialog";
import "../../../components/ha-dialog-footer";
import "../../../components/ha-file-upload";
import "../../../components/ha-form/ha-form";
import type { HaFormSchema } from "../../../components/ha-form/types";
import "../../../components/progress/ha-progress-bar";
import { apiContext, internationalizationContext } from "../../../data/context";
import type { ArchiveItem } from "../../../data/marketplace/archive-detect";
import {
  CODE_KINDS,
  isInstallable,
} from "../../../data/marketplace/archive-detect";
import type {
  ArchiveInspection,
  MarketplaceUploadResult,
} from "../../../data/marketplace/archive-upload";
import {
  archiveErrorMessage,
  inspectArchive,
  uploadArchiveItem,
  uploadErrorMessage,
} from "../../../data/marketplace/archive-upload";
import type { RepositoryType } from "../../../data/marketplace/repository";
import {
  ERROR_GITHUB_NOT_CONNECTED,
  isWebSocketError,
  marketplaceErrorMessage,
} from "../../../data/marketplace/websocket";
import {
  addMarketplaceRepository,
  detectMarketplaceRepository,
} from "../../../data/marketplace/repository";
import { DialogMixin } from "../../../dialogs/dialog-mixin";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import { bytesToString } from "../../../util/bytes-to-string";
import { ARCHIVE_LIMITS } from "../../../data/marketplace/archive-zip";
import "../components/ha-marketplace-archive-found";
import { showConnectGitHubFlow } from "../tools/connect-github";
import type { MarketplaceCustomRepositoriesDialogParams } from "./show-dialog-marketplace-custom-repositories";

type Mode = "link" | "file";

const DIALOG = "ui.panel.marketplace.dialog_custom_repositories";
const FILE = `${DIALOG}.file`;

interface FileOutcome {
  added: { item: ArchiveItem; result: MarketplaceUploadResult }[];
  failed: { item: ArchiveItem; error: string }[];
}

@customElement("dialog-marketplace-custom-repositories")
export class DialogMarketplaceCustomRepositories extends DialogMixin<MarketplaceCustomRepositoriesDialogParams>(
  LitElement
) {
  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: ContextType<typeof internationalizationContext>;

  @state()
  @consume({ context: apiContext, subscribe: true })
  private _api!: ContextType<typeof apiContext>;

  @state() private _waiting?: boolean;

  @state() private _errors?: Record<string, string>;

  @state() private _data?: { repository: string; category?: RepositoryType };

  // What was found out about the link, set when that did not settle the type
  @state() private _detected?: RepositoryType[];

  @state() private _githubConnected = false;

  @state() private _mode: Mode = "link";

  // The file being looked through, and what was found in it
  @state() private _file?: File;

  @state() private _reading = false;

  @state() private _fileError?: string;

  @state() private _inspection?: ArchiveInspection;

  @state() private _selected: string[] = [];

  @state() private _uploading = false;

  @state() private _outcome?: FileOutcome;

  public connectedCallback(): void {
    super.connectedCallback();
    if (!this.params) {
      return;
    }

    this._githubConnected = this.params.marketplace.info.github_connected;
  }

  private get _busy(): boolean {
    return !!this._waiting || this._reading || this._uploading;
  }

  protected render() {
    if (!this.params) {
      return nothing;
    }
    return html`
      <ha-dialog open .headerTitle=${this._title()}>
        <div>
          ${
            this._outcome
              ? nothing
              : html`<ha-button-toggle-group
                  class="mode"
                  full-width
                  .buttons=${this._modeButtons(this._i18n.localize)}
                  .active=${this._mode}
                  .disabled=${this._busy}
                  @value-changed=${this._modeChanged}
                ></ha-button-toggle-group>`
          }
          ${this._mode === "link" ? this._renderLink() : this._renderFile()}
        </div>
        ${this._mode === "link" ? this._renderLinkFooter() : this._renderFileFooter()}
      </ha-dialog>
    `;
  }

  private _title(): string {
    const localize = this._i18n.localize;
    if (this._mode === "link") {
      return localize(`${DIALOG}.title`);
    }
    if (this._outcome) {
      return localize(`${FILE}.added.title`);
    }
    const items = this._inspection?.items;
    if (!items) {
      return localize(`${FILE}.title`);
    }
    if (!items.length) {
      return localize(`${FILE}.found.title_none`);
    }
    if (items.every((item) => item.kind === "app")) {
      return localize(`${FILE}.found.title_app`, { count: items.length });
    }
    return localize(`${FILE}.found.title_repository`);
  }

  private _modeButtons = memoizeOne((localize: LocalizeFunc) => [
    { label: localize(`${DIALOG}.mode_link`), value: "link" },
    { label: localize(`${DIALOG}.mode_file`), value: "file" },
  ]);

  private _modeChanged(ev: CustomEvent<{ value: Mode }>) {
    ev.stopPropagation();
    this._mode = ev.detail.value;
  }

  private _renderLink() {
    return html`
      <p class="intro">${this._i18n.localize(`${DIALOG}.intro`)}</p>
      ${
        this._githubConnected
          ? nothing
          : html`<ha-alert alert-type="info">
              ${this._i18n.localize(`${DIALOG}.github_needed`)}
            </ha-alert>`
      }
      <ha-form
        .data=${this._data ?? {}}
        .schema=${this._schema(this._i18n.localize, this._typeOptions())}
        .error=${this._errors}
        .computeLabel=${this._computeLabel}
        .computeHelper=${this._computeHelper}
        .disabled=${this._waiting}
        @value-changed=${this._valueChanged}
        autofocus
      ></ha-form>
      ${
        this._detected
          ? html`<ha-alert alert-type="info" class="type-unknown">
              ${this._i18n.localize(
                this._detected.length > 1
                  ? `${DIALOG}.type_several`
                  : `${DIALOG}.type_unknown`
              )}
            </ha-alert>`
          : nothing
      }
      ${
        this._waiting
          ? html`<ha-progress-bar indeterminate></ha-progress-bar>`
          : nothing
      }
    `;
  }

  private _renderLinkFooter() {
    return html`
      <ha-dialog-footer slot="footer">
        <ha-button
          slot="secondaryAction"
          appearance="plain"
          @click=${this.closeDialog}
        >
          ${this._i18n.localize("ui.common.cancel")}
        </ha-button>
        <ha-button
          slot="primaryAction"
          appearance="filled"
          .disabled=${
            this._waiting ||
            !this._data?.repository ||
            (this._detected && !this._data.category)
          }
          @click=${this._addRepository}
        >
          ${this._i18n.localize("ui.common.add")}
        </ha-button>
      </ha-dialog-footer>
    `;
  }

  private _renderFile() {
    const localize = this._i18n.localize;
    if (this._outcome) {
      return this._renderOutcome(this._outcome);
    }
    return html`
      ${
        this._inspection
          ? nothing
          : html`<p class="intro">${localize(`${FILE}.intro`)}</p>`
      }
      <ha-alert alert-type="warning">
        ${localize(`${FILE}.unknown_source`)}
      </ha-alert>
      ${
        this._fileError
          ? html`<ha-alert alert-type="error">${this._fileError}</ha-alert>`
          : nothing
      }
      ${
        this._inspection
          ? html`<ha-marketplace-archive-found
              .inspection=${this._inspection}
              .selected=${this._selected}
              .disabled=${this._uploading}
              @archive-selection-changed=${this._selectionChanged}
            ></ha-marketplace-archive-found>`
          : html`<ha-file-upload
              .accept=${".zip,application/zip,application/x-zip-compressed"}
              .icon=${mdiFolderZipOutline}
              .label=${localize(`${FILE}.pick`)}
              .supports=${localize(`${FILE}.supports`, {
                size: bytesToString(ARCHIVE_LIMITS.archiveBytes, 0),
              })}
              .uploading=${this._reading}
              .uploadingLabel=${localize(`${FILE}.reading`, {
                name: this._file?.name ?? "",
              })}
              @file-picked=${this._filePicked}
            ></ha-file-upload>`
      }
      ${
        this._uploading
          ? html`<ha-progress-bar indeterminate></ha-progress-bar>`
          : nothing
      }
    `;
  }

  private _renderOutcome(outcome: FileOutcome) {
    const localize = this._i18n.localize;
    return html`
      ${outcome.added.map(
        ({ item, result }) =>
          html`<ha-alert
            alert-type="success"
            .title=${localize(`${FILE}.added.item`, {
              name: result.name,
              path: result.path,
            })}
          >
            ${
              result.restart_required
                ? html`<div>${localize(`${FILE}.added.restart`)}</div>`
                : nothing
            }
            ${
              result.resource_added
                ? html`<div>${localize(`${FILE}.added.resource`)}</div>`
                : nothing
            }
            ${
              item.kind === "plugin" &&
              !result.resource_added &&
              result.resource_url
                ? html`<div>
                    ${localize(`${FILE}.added.resource_manual`, {
                      url: result.resource_url,
                    })}
                  </div>`
                : nothing
            }
            <div>${localize(`${FILE}.added.not_tracked`)}</div>
          </ha-alert>`
      )}
      ${outcome.failed.map(
        ({ item, error }) =>
          html`<ha-alert alert-type="error">
            ${localize(`${FILE}.added.failed`, { name: item.name, error })}
          </ha-alert>`
      )}
    `;
  }

  private _renderFileFooter() {
    const localize = this._i18n.localize;
    if (this._outcome) {
      return html`
        <ha-dialog-footer slot="footer">
          ${
            this._outcome.failed.length
              ? html`<ha-button
                  slot="secondaryAction"
                  appearance="plain"
                  @click=${this._backToSelection}
                >
                  ${localize("ui.common.back")}
                </ha-button>`
              : nothing
          }
          <ha-button
            slot="primaryAction"
            appearance="filled"
            @click=${this.closeDialog}
          >
            ${localize(`${FILE}.added.close`)}
          </ha-button>
        </ha-dialog-footer>
      `;
    }
    return html`
      <ha-dialog-footer slot="footer">
        <ha-button
          slot="secondaryAction"
          appearance="plain"
          .disabled=${this._uploading}
          @click=${this.closeDialog}
        >
          ${localize("ui.common.cancel")}
        </ha-button>
        ${
          this._inspection
            ? html`<ha-button
                slot="secondaryAction"
                appearance="plain"
                .disabled=${this._uploading}
                @click=${this._chooseAnother}
              >
                ${localize(`${FILE}.choose_another`)}
              </ha-button>`
            : nothing
        }
        <ha-button
          slot="primaryAction"
          appearance="filled"
          .disabled=${this._uploading || !this._canAddFromFile()}
          @click=${this._addFromFile}
        >
          ${localize("ui.common.add")}
        </ha-button>
      </ha-dialog-footer>
    `;
  }

  private _canAddFromFile(): boolean {
    return !!this._inspection?.items.some(
      (item) => isInstallable(item) && this._selected.includes(item.id)
    );
  }

  private async _filePicked(ev: HASSDomEvent<{ files: File[] }>) {
    const file = ev.detail.files[0];
    if (!file) {
      return;
    }
    this._file = file;
    this._fileError = undefined;
    this._reading = true;
    try {
      const inspection = await inspectArchive(file);
      if (!this.isConnected || this._file !== file) {
        return;
      }
      this._inspection = inspection;
      this._selected = inspection.items
        .filter(isInstallable)
        .map((item) => item.id);
    } catch (err: unknown) {
      if (!this.isConnected) {
        return;
      }
      this._file = undefined;
      this._fileError = archiveErrorMessage(err, this._i18n.localize);
    } finally {
      this._reading = false;
    }
  }

  private _selectionChanged(ev: HASSDomEvent<{ selected: string[] }>) {
    this._selected = ev.detail.selected;
  }

  private _chooseAnother() {
    this._file = undefined;
    this._inspection = undefined;
    this._selected = [];
    this._fileError = undefined;
  }

  private _backToSelection() {
    const addedIds = new Set(this._outcome?.added.map(({ item }) => item.id));
    this._selected = this._selected.filter((id) => !addedIds.has(id));
    this._outcome = undefined;
  }

  private async _addFromFile() {
    const file = this._file;
    const items = (this._inspection?.items ?? []).filter(
      (item) => isInstallable(item) && this._selected.includes(item.id)
    );
    if (!file || !items.length) {
      return;
    }

    // What runs code in the home is confirmed in two steps
    const runsCode = items.filter((item) => CODE_KINDS.includes(item.kind));
    if (runsCode.length) {
      const confirmed = await showConfirmationDialog(this, {
        title: this._i18n.localize(`${FILE}.confirm.title`),
        text: this._i18n.localize(`${FILE}.confirm.text`, {
          names: runsCode.map((item) => item.name).join(", "),
        }),
        confirmText: this._i18n.localize(`${FILE}.confirm.confirm`),
        dismissText: this._i18n.localize("ui.common.cancel"),
        destructive: true,
        warning: true,
      });
      if (!confirmed || !this.isConnected) {
        return;
      }
    }

    this._uploading = true;
    const outcome: FileOutcome = { added: [], failed: [] };
    for (const item of items) {
      try {
        // One item at a time, the server installs only what it is told to
        // eslint-disable-next-line no-await-in-loop
        const result = await uploadArchiveItem(
          this._api,
          file,
          file.name,
          item
        );
        outcome.added.push({ item, result });
      } catch (err: unknown) {
        outcome.failed.push({
          item,
          error: uploadErrorMessage(err, this._i18n.localize),
        });
      }
      if (!this.isConnected) {
        return;
      }
    }
    this._uploading = false;
    this._outcome = outcome;
  }

  // Only when the type could not be found out, from what it might be
  private _typeOptions(): RepositoryType[] | undefined {
    if (!this._detected) {
      return undefined;
    }
    return this._detected.length > 1
      ? this._detected
      : this.params!.marketplace.info.categories;
  }

  private _schema = memoizeOne(
    (localize: LocalizeFunc, categories?: RepositoryType[]): HaFormSchema[] => [
      {
        name: "repository",
        selector: { text: {} },
      },
      ...(categories
        ? [
            {
              name: "category",
              selector: {
                select: {
                  mode: "dropdown" as const,
                  options: categories.map((category) => ({
                    value: category,
                    label: localize(
                      `ui.panel.marketplace.common.type.${category}`
                    ),
                  })),
                },
              },
            },
          ]
        : []),
    ]
  );

  private _computeLabel = (schema: HaFormSchema): string =>
    this._i18n.localize(
      schema.name === "category" ? `${DIALOG}.type` : `${DIALOG}.link`
    );

  private _computeHelper = (schema: HaFormSchema): string =>
    this._i18n.localize(
      schema.name === "category"
        ? `${DIALOG}.type_helper`
        : `${DIALOG}.link_helper`
    );

  private _valueChanged(ev: CustomEvent) {
    const data = { ...this._data, ...ev.detail.value };
    // Another link holds something else, it is found out again
    if (data.repository !== this._data?.repository) {
      this._detected = undefined;
      delete data.category;
    }
    this._data = data;
  }

  private async _addRepository() {
    this._errors = {};

    if (!this._data?.repository) {
      this._errors = {
        base: this._i18n.localize(`${DIALOG}.no_repository`),
      };
      return;
    }

    // Connect first and then add what was typed, so one press is enough.
    if (!this._githubConnected) {
      this._githubConnected = await showConnectGitHubFlow(
        this,
        this._api,
        this._i18n.localize
      );
      if (!this._githubConnected || !this.isConnected) {
        return;
      }
    }

    // What was asked for, the form can change while it is found out
    const { repository } = this._data;
    this._waiting = true;
    try {
      let category = this._data.category;
      if (!category) {
        const { categories } = await detectMarketplaceRepository(
          this._api,
          repository
        );
        if (!this.isConnected || this._data?.repository !== repository) {
          return;
        }
        // Asked once it is clear it has to be, otherwise added right away
        if (categories.length !== 1) {
          this._detected = categories;
          return;
        }
        category = categories[0];
      }

      await addMarketplaceRepository(this._api, repository, category);
      // The panel hears the change from the backend and lists it
      this.closeDialog();
    } catch (err: unknown) {
      // The dialog can be closed while waiting for the backend.
      if (!this.isConnected) {
        return;
      }

      // GitHub got disconnected after the dialog opened, the hint comes back
      // and the next press connects again.
      if (isWebSocketError(err, ERROR_GITHUB_NOT_CONNECTED)) {
        this._githubConnected = false;
        return;
      }

      this._errors = {
        base: marketplaceErrorMessage(err, this._i18n.localize),
      };
    } finally {
      this._waiting = false;
    }
  }

  static get styles() {
    return [
      css`
        ha-progress-bar {
          margin-block-end: calc(-1 * var(--ha-space-2));
          margin-block-start: var(--ha-space-1);
        }
        .intro {
          margin: 0 0 var(--ha-space-4);
        }
        .mode {
          display: block;
          margin-block-end: var(--ha-space-4);
        }
        ha-alert {
          display: block;
          margin-bottom: var(--ha-space-2);
        }
        ha-file-upload {
          display: block;
          margin-block-start: var(--ha-space-3);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-marketplace-custom-repositories": DialogMarketplaceCustomRepositories;
  }
}
