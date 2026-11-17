import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import type { ImportConfigDialogParams } from "./show-dialog-import-config";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-checkbox";
import "../../../../components/ha-dialog";
import "../../../../components/ha-dialog-footer";
import "../../../../components/ha-file-upload";
import "../../../../components/ha-textarea";
import {
  normalizeAutomationConfig,
  showAutomationEditor,
} from "../../../../data/automation";
import { validateConfig } from "../../../../data/config";
import { saveEditorDraft } from "../../../../data/editor-drafts";
import {
  normalizeScriptConfig,
  showScriptEditor,
} from "../../../../data/script";
import type { ScriptConfig } from "../../../../data/script";
import type { HassDialog } from "../../../../dialogs/make-dialog-manager";
import { haStyleDialog } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import { navigate } from "../../../../common/navigate";
import { showSceneEditor } from "../../../../data/scene";
import { showToast } from "../../../../util/toast";
import { newDraftId } from "./draft-logic";
import { draftText } from "./draft-strings";
import "./ha-editor-hero";
import {
  findMissingReferences,
  hasMissingReferences,
  parseImport,
} from "./transfer-logic";
import type {
  ImportItem,
  ImportResult,
  MissingReferences,
  TransferKind,
} from "./transfer-logic";

declare global {
  interface HTMLElementTagNameMap {
    "ha-dialog-import-config": DialogImportConfig;
  }
}

interface PreparedItem extends ImportItem {
  missing: MissingReferences;
  invalid?: string;
}

const KIND_PATH: Record<TransferKind, string> = {
  automation: "automation",
  script: "script",
  scene: "scene",
};

@customElement("ha-dialog-import-config")
class DialogImportConfig extends LitElement implements HassDialog {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _params?: ImportConfigDialogParams;

  @state() private _open = false;

  @state() private _text = "";

  @state() private _result?: ImportResult;

  @state() private _items: PreparedItem[] = [];

  @state() private _replace = new Set<number>();

  @state() private _busy = false;

  public showDialog(params: ImportConfigDialogParams): void {
    this._params = params;
    this._text = "";
    this._result = undefined;
    this._items = [];
    this._replace = new Set();
    this._open = true;
  }

  public closeDialog(): boolean {
    this._open = false;
    return true;
  }

  private _closed() {
    this._params = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private _existingIds(kind: TransferKind): Set<string> {
    const ids = new Set<string>();
    for (const [entityId, stateObj] of Object.entries(this.hass.states)) {
      if (!entityId.startsWith(`${KIND_PATH[kind]}.`)) {
        continue;
      }
      if (kind === "script") {
        ids.add(entityId.split(".")[1]);
      } else if (stateObj.attributes.id !== undefined) {
        ids.add(String(stateObj.attributes.id));
      }
    }
    return ids;
  }

  private _known() {
    return {
      entities: new Set([
        ...Object.keys(this.hass.states),
        ...Object.keys(this.hass.entities ?? {}),
      ]),
      devices: new Set(Object.keys(this.hass.devices ?? {})),
      areas: new Set(Object.keys(this.hass.areas ?? {})),
    };
  }

  private async _prepare(text: string): Promise<void> {
    const kind = this._params!.kind;
    this._text = text;
    const result = parseImport(text, kind, this._existingIds(kind));
    this._result = result;
    this._replace = new Set();
    if (!result.ok) {
      this._items = [];
      return;
    }
    const known = this._known();
    const items: PreparedItem[] = result.items.map((item) => {
      const config =
        kind === "automation"
          ? normalizeAutomationConfig(item.config)
          : kind === "script"
            ? normalizeScriptConfig(item.config as ScriptConfig)
            : item.config;
      return {
        ...item,
        config,
        missing: findMissingReferences(config, known),
      };
    });
    this._items = items;
    if (kind === "scene") {
      return;
    }
    this._items = await Promise.all(
      items.map(async (item) => {
        try {
          const checks = await validateConfig(
            this.hass,
            kind === "automation"
              ? {
                  triggers: item.config.triggers,
                  conditions: item.config.conditions,
                  actions: item.config.actions,
                }
              : { actions: item.config.sequence }
          );
          const bad = Object.values(checks).find((check) => !check.valid);
          return bad && !bad.valid ? { ...item, invalid: bad.error } : item;
        } catch {
          return item;
        }
      })
    );
  }

  private async _filePicked(ev: CustomEvent<{ files: File[] }>) {
    const file = ev.detail.files[0];
    if (file) {
      await this._prepare(await file.text());
    }
  }

  private _textInput(ev: Event) {
    this._text = (ev.target as HTMLTextAreaElement).value;
  }

  private _check() {
    void this._prepare(this._text);
  }

  private _toggleReplace(ev: Event) {
    const index = Number((ev.currentTarget as HTMLElement).dataset.index);
    const next = new Set(this._replace);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    this._replace = next;
  }

  private async _import() {
    const kind = this._params!.kind;
    const items = this._items;
    if (items.length === 0 || this._busy) {
      return;
    }
    if (items.length === 1 && !this._replace.has(0)) {
      this.closeDialog();
      if (kind === "automation") {
        showAutomationEditor(items[0].config);
      } else if (kind === "script") {
        showScriptEditor(items[0].config);
      } else {
        showSceneEditor(items[0].config);
      }
      return;
    }
    this._busy = true;
    try {
      let created = 0;
      let replaceTarget: string | undefined;
      for (const [position, item] of items.entries()) {
        const replacing = this._replace.has(position) && item.originalId;
        const id = replacing ? item.originalId! : newDraftId();
        // eslint-disable-next-line no-await-in-loop
        await saveEditorDraft(
          this.hass,
          kind,
          id,
          item.config,
          null,
          replacing ? undefined : { imported: true }
        );
        if (replacing) {
          replaceTarget ??= id;
        } else {
          created++;
        }
      }
      this.closeDialog();
      if (created === 0 && replaceTarget) {
        navigate(`/config/${kind}/edit/${replaceTarget}`);
        return;
      }
      showToast(this, {
        message: draftText(this.hass, "import_imported_many", {
          count: created,
        }),
      });
      navigate(`/config/${kind}/edit/new`);
    } catch (err: any) {
      this._result = {
        ok: false,
        reason: "invalid_yaml",
        detail: String(err?.message ?? err),
      };
    } finally {
      this._busy = false;
    }
  }

  private _refusal() {
    const result = this._result;
    if (!result || result.ok) {
      return "";
    }
    switch (result.reason) {
      case "invalid_yaml":
        return draftText(this.hass, "import_refused_invalid_yaml", {
          detail: result.detail,
        });
      case "empty":
        return draftText(this.hass, "import_refused_empty");
      default:
        return draftText(this.hass, "import_refused_not_config", {
          kind: this._params!.kind,
          detail: result.detail,
        });
    }
  }

  private _renderMissing(missing: MissingReferences) {
    if (!hasMissingReferences(missing)) {
      return nothing;
    }
    const items = [
      ...missing.entities,
      ...missing.devices,
      ...missing.areas,
    ].join(", ");
    return html`<div class="missing">
      ${draftText(this.hass, "import_missing", { items })}
    </div>`;
  }

  private _renderItem(item: PreparedItem, position: number) {
    const summary = item.summary;
    return html`
      <li class="item">
        <div class="name">${summary.name || `#${position + 1}`}</div>
        <ha-editor-hero
          .hass=${this.hass}
          .config=${item.config}
        ></ha-editor-hero>
        <div class="counts">
          ${draftText(this.hass, "import_summary", {
            triggers: summary.triggers,
            conditions: summary.conditions,
            actions: summary.actions,
          })}
        </div>
        ${this._renderMissing(item.missing)}
        ${
          item.invalid
            ? html`<div class="missing" role="alert">${item.invalid}</div>`
            : nothing
        }
        ${
          item.idClash
            ? html`<div class="clash">
                ${draftText(this.hass, "import_new_id")}
                <label class="replace">
                  <ha-checkbox
                    data-index=${position}
                    .checked=${this._replace.has(position)}
                    @change=${this._toggleReplace}
                  ></ha-checkbox>
                  ${draftText(this.hass, "import_replace")}
                </label>
                ${
                  this._replace.has(position)
                    ? html`<div class="hint">
                        ${draftText(this.hass, "import_replace_hint")}
                      </div>`
                    : nothing
                }
              </div>`
            : nothing
        }
      </li>
    `;
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }
    const refusal = this._refusal();
    return html`
      <ha-dialog
        .open=${this._open}
        header-title=${draftText(this.hass, "import_title")}
        @closed=${this._closed}
      >
        <p class="hint">${draftText(this.hass, "import_hint")}</p>
        <ha-file-upload
          accept=".yaml,.yml,.txt,text/yaml,text/plain"
          .label=${draftText(this.hass, "import_choose_file")}
          @file-picked=${this._filePicked}
        ></ha-file-upload>
        <ha-textarea
          .label=${draftText(this.hass, "import_paste_label")}
          .value=${this._text}
          resize="auto"
          @input=${this._textInput}
        ></ha-textarea>
        <ha-button size="s" appearance="plain" @click=${this._check}>
          ${draftText(this.hass, "import_check")}
        </ha-button>
        ${
          refusal
            ? html`<ha-alert alert-type="error">${refusal}</ha-alert>`
            : nothing
        }
        ${
          this._items.length
            ? html`<ul class="items">
                ${this._items.map((item, position) =>
                  this._renderItem(item, position)
                )}
              </ul>`
            : nothing
        }
        <ha-dialog-footer slot="footer">
          <ha-button
            slot="secondaryAction"
            appearance="plain"
            @click=${this.closeDialog}
          >
            ${draftText(this.hass, "cancel")}
          </ha-button>
          <ha-button
            slot="primaryAction"
            .disabled=${this._items.length === 0 || this._busy}
            @click=${this._import}
          >
            ${
              this._items.length > 1
                ? draftText(this.hass, "import_open_many", {
                    count: this._items.length,
                  })
                : draftText(this.hass, "import_open")
            }
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  static styles: CSSResultGroup = [
    haStyleDialog,
    css`
      .hint {
        margin-top: 0;
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
      }
      ha-textarea {
        display: block;
        margin-top: var(--ha-space-2);
      }
      .items {
        list-style: none;
        margin: var(--ha-space-2) 0 0;
        padding: 0;
        max-height: 40vh;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
      }
      .item {
        padding: var(--ha-space-2);
        border-radius: var(--ha-border-radius-xl);
        background: var(--secondary-background-color);
      }
      .name {
        font-weight: var(--ha-font-weight-medium);
      }
      .counts {
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
      }
      .missing {
        margin-top: var(--ha-space-1);
        font-size: var(--ha-font-size-s);
        color: var(--warning-color);
      }
      .clash {
        margin-top: var(--ha-space-1);
        font-size: var(--ha-font-size-s);
      }
      .replace {
        display: flex;
        align-items: center;
        gap: var(--ha-space-1);
      }
    `,
  ];
}
