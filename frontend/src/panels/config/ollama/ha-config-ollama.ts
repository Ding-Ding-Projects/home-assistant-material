import {
  mdiBrain,
  mdiClose,
  mdiPlus,
  mdiSortAscending,
  mdiSortDescending,
} from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { relativeTime } from "../../../common/datetime/relative_time";
import { searchMatcher } from "../../../common/regex/filter";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-icon-button";
import "../../../components/ha-spinner";
import "../../../components/ha-svg-icon";
import "../../../components/layout/ha-split-panels";
import "./ha-ollama-pull";
import "../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import type {
  OllamaModel,
  OllamaModelInfo,
  OllamaRunning,
  OllamaServer,
} from "../../../data/ollama_suite";
import {
  deleteOllamaModel,
  fetchOllamaModelInfo,
  fetchOllamaModels,
  fetchOllamaRunning,
  fetchOllamaServers,
} from "../../../data/ollama_suite";
import { showConfigFlowDialog } from "../../../dialogs/config-flow/show-dialog-config-flow";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-subpage";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { bytesToString } from "../../../util/bytes-to-string";

type SortKey = "name" | "size" | "modified_at";

@customElement("ha-config-ollama")
class HaConfigOllama extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @state() private _servers?: OllamaServer[];

  @state() private _serverId?: string;

  @state() private _models?: OllamaModel[];

  @state() private _truncated = false;

  @state() private _running?: OllamaRunning;

  @state() private _error?: string;

  @state() private _modelsError?: string;

  @state() private _loadingModels = false;

  @state() private _filter = "";

  @state() private _sortKey: SortKey = "name";

  @state() private _sortAsc = true;

  @state() private _selected?: string;

  @state() private _info?: OllamaModelInfo;

  @state() private _infoError?: string;

  /** Guards against an older answer replacing a newer one. */
  private _requestId = 0;

  protected firstUpdated(): void {
    this._loadServers();
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(`ui.panel.config.ollama.${key}` as any, values);
  }

  private async _loadServers(): Promise<void> {
    try {
      this._servers = (await fetchOllamaServers(this.hass)).servers;
      this._error = undefined;
    } catch (err: any) {
      this._error = err?.message ?? String(err);
      return;
    }
    const current = this._servers.find(
      (server) => server.entry_id === this._serverId
    );
    const next = current ?? this._servers.find((server) => server.reachable);
    if (next) {
      await this._selectServer(next.entry_id);
    } else {
      this._serverId = undefined;
      this._models = undefined;
      this._running = undefined;
    }
  }

  private async _selectServer(entryId: string): Promise<void> {
    const id = ++this._requestId;
    this._serverId = entryId;
    this._selected = undefined;
    this._info = undefined;
    this._modelsError = undefined;
    this._loadingModels = true;
    const [models, running] = await Promise.allSettled([
      fetchOllamaModels(this.hass, entryId),
      fetchOllamaRunning(this.hass, entryId),
    ]);
    if (id !== this._requestId) {
      return;
    }
    this._loadingModels = false;
    if (models.status === "fulfilled") {
      this._models = models.value.models;
      this._truncated = models.value.truncated;
    } else {
      this._models = undefined;
      this._modelsError = this._errorText(models.reason);
    }
    this._running = running.status === "fulfilled" ? running.value : undefined;
  }

  private _errorText(err: any): string {
    const code = typeof err?.code === "string" ? err.code : "unknown";
    return (
      this.hass.localize(`ui.panel.config.ollama.errors.${code}` as any) ||
      this._l("errors.unknown")
    );
  }

  private _serverClicked(ev: Event): void {
    const id = (ev.currentTarget as HTMLElement).dataset.entry;
    if (id && id !== this._serverId) {
      this._selectServer(id);
    }
  }

  private _addServer(): void {
    showConfigFlowDialog(this, {
      startFlowHandler: "ollama",
      dialogClosedCallback: () => this._loadServers(),
    });
  }

  private _filterChanged(ev: Event): void {
    this._filter = (ev.target as HaInputSearch).value ?? "";
  }

  private _sortBy(ev: Event): void {
    const key = (ev.currentTarget as HTMLElement).dataset.key as SortKey;
    if (key === this._sortKey) {
      this._sortAsc = !this._sortAsc;
    } else {
      this._sortKey = key;
      this._sortAsc = true;
    }
  }

  private async _openModel(ev: Event): Promise<void> {
    const name = (ev.currentTarget as HTMLElement).dataset.model;
    if (!name || !this._serverId) {
      return;
    }
    this._selected = name;
    this._info = undefined;
    this._infoError = undefined;
    const serverId = this._serverId;
    try {
      const info = await fetchOllamaModelInfo(this.hass, serverId, name);
      if (this._selected === name && this._serverId === serverId) {
        this._info = info;
      }
    } catch (err: any) {
      if (this._selected === name) {
        this._infoError = this._errorText(err);
      }
    }
  }

  private async _refreshModels(): Promise<void> {
    if (this._serverId) {
      await this._selectServer(this._serverId);
    }
  }

  private async _deleteModel(ev: Event): Promise<void> {
    const name = (ev.currentTarget as HTMLElement).dataset.model;
    const serverId = this._serverId;
    if (!name || !serverId) {
      return;
    }
    const size = this._models?.find((model) => model.name === name)?.size;
    const confirmed = await showConfirmationDialog(this, {
      title: this._l("delete_title", { model: name }),
      text: size
        ? this._l("delete_text_size", {
            model: name,
            size: bytesToString(size, 1),
          })
        : this._l("delete_text", { model: name }),
      confirmText: this._l("delete"),
      dismissText: this._l("cancel"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      await deleteOllamaModel(this.hass, serverId, name);
    } catch (err: any) {
      await showAlertDialog(this, {
        title: this._l("delete_failed", { model: name }),
        text: this._errorText(err),
      });
      return;
    }
    if (this._selected === name) {
      this._closeModel();
    }
    await this._refreshModels();
  }

  private _closeModel(): void {
    this._selected = undefined;
    this._info = undefined;
    this._infoError = undefined;
  }

  private _shownModels(): OllamaModel[] {
    const matches = searchMatcher(this._filter);
    const direction = this._sortAsc ? 1 : -1;
    return (this._models ?? [])
      .filter((model) =>
        matches(
          model.name,
          model.family,
          model.parameter_size,
          model.quantization_level
        )
      )
      .sort((a, b) => {
        if (this._sortKey === "name") {
          return direction * (a.name ?? "").localeCompare(b.name ?? "");
        }
        if (this._sortKey === "size") {
          return direction * ((a.size ?? 0) - (b.size ?? 0));
        }
        return (
          direction * (Date.parse(a.modified_at ?? "") || 0) -
          direction * (Date.parse(b.modified_at ?? "") || 0)
        );
      });
  }

  protected render(): TemplateResult {
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config"
        .header=${this._l("title")}
      >
        <div class=${classMap({ content: true, narrow: this.narrow })}>
          ${this._renderBody()}
        </div>
      </hass-subpage>
    `;
  }

  private _renderBody(): TemplateResult {
    if (this._error) {
      return html`<ha-alert alert-type="error">${this._error}</ha-alert>`;
    }
    if (!this._servers) {
      return html`<div class="center">
        <ha-spinner .ariaLabel=${this._l("loading")}></ha-spinner>
      </div>`;
    }
    return html`
      <p class="intro">${this._l("intro")}</p>
      <p class="privacy" role="note">${this._l("privacy")}</p>
      ${
        this._servers.length
          ? html`${this._renderServers(this._servers)} ${this._renderPull()}
            ${this._renderRunning()}
            ${
              this._selected
                ? html`<ha-split-panels
                    storage-key="ollama-models"
                    .defaultSize=${520}
                    .minStart=${320}
                    .minEnd=${260}
                    .startLabel=${this._l("models")}
                    .endLabel=${this._l("detail")}
                  >
                    <div slot="start" class="split-start">
                      ${this._renderModels()}
                    </div>
                    <div slot="end" class="split-end">
                      ${this._renderDetail()}
                    </div>
                  </ha-split-panels>`
                : this._renderModels()
            }`
          : this._renderEmpty()
      }
      ${this._renderNext()}
    `;
  }

  private _renderPull(): TemplateResult | typeof nothing {
    const server = this._servers?.find((s) => s.entry_id === this._serverId);
    if (!server?.reachable) {
      return nothing;
    }
    return html`<ha-ollama-pull
      .hass=${this.hass}
      .entryId=${this._serverId}
      @ollama-models-changed=${this._refreshModels}
    ></ha-ollama-pull>`;
  }

  private _renderEmpty(): TemplateResult {
    return html`<ha-card class="empty">
      <div class="card-content">
        <ha-svg-icon .path=${mdiBrain}></ha-svg-icon>
        <h2>${this._l("no_servers")}</h2>
        <p>${this._l("no_servers_text")}</p>
        <ha-button @click=${this._addServer}>
          <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
          ${this._l("add_server")}
        </ha-button>
        <ha-button
          appearance="plain"
          href="/config/integrations/integration/ollama"
        >
          ${this._l("open_integration")}
        </ha-button>
      </div>
    </ha-card>`;
  }

  private _renderServers(servers: OllamaServer[]): TemplateResult {
    return html`<h2>${this._l("servers")}</h2>
      <ul class="cards">
        ${servers.map((server) => {
          const status = this._status(server);
          return html`<li>
            <button
              type="button"
              class=${classMap({
                card: true,
                active: server.entry_id === this._serverId,
              })}
              data-entry=${server.entry_id}
              aria-pressed=${server.entry_id === this._serverId}
              @click=${this._serverClicked}
            >
              <span class="name">${server.title}</span>
              <span class="detail"
                >${server.address || this._l("no_address")}</span
              >
              <span class=${classMap({ tag: true, [status.kind]: true })}
                >${status.text}</span
              >
              ${
                server.version
                  ? html`<span class="detail"
                      >${this._l("version", { version: server.version })}</span
                    >`
                  : nothing
              }
            </button>
          </li>`;
        })}
      </ul>`;
  }

  private _status(server: OllamaServer): { kind: string; text: string } {
    if (server.disabled) {
      return { kind: "off", text: this._l("state.disabled") };
    }
    if (server.reachable) {
      return { kind: "ok", text: this._l("state.reachable") };
    }
    if (server.error) {
      return { kind: "bad", text: this._l("state.unreachable") };
    }
    return { kind: "bad", text: this._l("state.not_loaded") };
  }

  private _renderRunning(): TemplateResult | typeof nothing {
    if (!this._serverId || this._modelsError) {
      return nothing;
    }
    const running = this._running;
    const used = running?.memory_used ?? 0;
    const gpu = running?.memory_gpu ?? 0;
    return html`<h2>${this._l("running")}</h2>
      ${
        running?.running.length
          ? html`<p class="detail">
                ${this._l("running_memory", {
                  total: bytesToString(used),
                  gpu: bytesToString(gpu),
                })}
              </p>
              <ul class="rows">
                ${running.running.map(
                  (item) =>
                    html`<li class="row">
                      <span class="text">
                        <span class="name">${item.name}</span>
                        <span class="detail"
                          >${bytesToString(item.size ?? 0)} ·
                          ${this._l("in_gpu", {
                            size: bytesToString(item.size_vram ?? 0),
                          })}${
                            item.expires_at
                              ? html` ·
                                ${this._l("unloads", {
                                  when: relativeTime(
                                    new Date(item.expires_at),
                                    this.hass.locale
                                  ),
                                })}`
                              : nothing
                          }</span
                        >
                        <span class="bar" role="presentation">
                          <span
                            class="fill"
                            style=${styleMap({
                              width: `${
                                used
                                  ? Math.round(((item.size ?? 0) / used) * 100)
                                  : 0
                              }%`,
                            })}
                          ></span>
                        </span>
                      </span>
                    </li>`
                )}
              </ul>`
          : html`<p class="detail">${this._l("nothing_running")}</p>`
      }`;
  }

  private _sortHeader(key: SortKey, label: string): TemplateResult {
    const active = this._sortKey === key;
    return html`<th
      scope="col"
      aria-sort=${
        active ? (this._sortAsc ? "ascending" : "descending") : "none"
      }
    >
      <button type="button" class="sort" data-key=${key} @click=${this._sortBy}>
        ${label}
        ${
          active
            ? html`<ha-svg-icon
                .path=${this._sortAsc ? mdiSortAscending : mdiSortDescending}
              ></ha-svg-icon>`
            : nothing
        }
      </button>
    </th>`;
  }

  private _renderModels(): TemplateResult {
    const shown = this._shownModels();
    const total = this._models?.length ?? 0;
    const search = this._l("search_n", { count: total });
    return html`<section class="models">
      <h2>${this._l("models")}</h2>
      ${
        this._loadingModels
          ? html`<div class="center">
              <ha-spinner .ariaLabel=${this._l("loading")}></ha-spinner>
            </div>`
          : this._modelsError
            ? html`<ha-alert alert-type="error">${this._modelsError}</ha-alert>`
            : html`<ha-input-search
                  appearance="outlined"
                  .placeholder=${search}
                  .accessibleLabel=${search}
                  .value=${this._filter}
                  .patternSamples=${(this._models ?? []).map(
                    (model) => model.name ?? ""
                  )}
                  @input=${this._filterChanged}
                ></ha-input-search>
                ${
                  this._truncated
                    ? html`<p class="detail">${this._l("truncated")}</p>`
                    : nothing
                }
                ${
                  shown.length
                    ? html`<table>
                        <thead>
                          <tr>
                            ${this._sortHeader("name", this._l("col_name"))}
                            ${this._sortHeader("size", this._l("col_size"))}
                            ${
                              this.narrow
                                ? nothing
                                : html`<th scope="col">
                                      ${this._l("col_family")}
                                    </th>
                                    <th scope="col">
                                      ${this._l("col_parameters")}
                                    </th>
                                    <th scope="col">
                                      ${this._l("col_quantisation")}
                                    </th>
                                    ${this._sortHeader(
                                      "modified_at",
                                      this._l("col_modified")
                                    )}`
                            }
                            <th scope="col">
                              <span class="visually-hidden"
                                >${this._l("col_actions")}</span
                              >
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          ${shown.map((model) => this._renderModelRow(model))}
                        </tbody>
                      </table>`
                    : html`<p class="detail" role="status">
                        ${
                          total
                            ? this._l("no_match", {
                                query: this._filter.trim(),
                              })
                            : this._l("no_models")
                        }
                      </p>`
                }`
      }
    </section>`;
  }

  private _renderModelRow(model: OllamaModel): TemplateResult {
    return html`<tr
      class=${classMap({ selected: model.name === this._selected })}
    >
      <td>
        <button
          type="button"
          class="link"
          data-model=${model.name ?? ""}
          @click=${this._openModel}
        >
          ${model.name}
        </button>
      </td>
      <td>${bytesToString(model.size ?? 0, 1)}</td>
      ${
        this.narrow
          ? nothing
          : html`<td>${model.family ?? ""}</td>
              <td>${model.parameter_size ?? ""}</td>
              <td>${model.quantization_level ?? ""}</td>
              <td>
                ${
                  model.modified_at
                    ? relativeTime(
                        new Date(model.modified_at),
                        this.hass.locale
                      )
                    : ""
                }
              </td>`
      }
      <td>
        <ha-button
          appearance="plain"
          variant="danger"
          data-model=${model.name ?? ""}
          aria-label=${this._l("delete_named", { model: model.name ?? "" })}
          @click=${this._deleteModel}
        >
          ${this._l("delete")}
        </ha-button>
      </td>
    </tr>`;
  }

  private _renderDetail(): TemplateResult {
    const info = this._info;
    return html`<aside class="detail-panel" aria-label=${this._l("detail")}>
      <div class="detail-head">
        <h2>${this._selected}</h2>
        <ha-icon-button
          .path=${mdiClose}
          .label=${this._l("close")}
          @click=${this._closeModel}
        ></ha-icon-button>
      </div>
      ${
        this._infoError
          ? html`<ha-alert alert-type="error">${this._infoError}</ha-alert>`
          : info
            ? html`<dl>
                  ${this._fact("col_family", info.family)}
                  ${this._fact("col_parameters", info.parameter_size)}
                  ${this._fact("col_quantisation", info.quantization_level)}
                  ${this._fact("format", info.format)}
                  ${this._fact(
                    "capabilities",
                    info.capabilities.filter(Boolean).join(", ")
                  )}
                  ${this._fact(
                    "col_modified",
                    info.modified_at
                      ? relativeTime(
                          new Date(info.modified_at),
                          this.hass.locale
                        )
                      : null
                  )}
                </dl>
                ${
                  Object.keys(info.info).length
                    ? html`<h3>${this._l("technical")}</h3>
                        <dl class="technical">
                          ${Object.entries(info.info).map(
                            ([key, value]) =>
                              html`<dt>${key}</dt>
                                <dd>${String(value)}</dd>`
                          )}
                        </dl>`
                    : nothing
                }
                ${
                  info.parameters
                    ? html`<h3>${this._l("parameters")}</h3>
                        <pre>${info.parameters}</pre>`
                    : nothing
                }`
            : html`<div class="center">
                <ha-spinner .ariaLabel=${this._l("loading")}></ha-spinner>
              </div>`
      }
    </aside>`;
  }

  private _fact(
    key: string,
    value?: string | null
  ): TemplateResult | typeof nothing {
    return value
      ? html`<dt>${this._l(key)}</dt>
          <dd>${value}</dd>`
      : nothing;
  }

  private _renderNext(): TemplateResult {
    return html`<ha-card class="next">
      <div class="card-content">
        <h2>${this._l("next_title")}</h2>
        <p class="detail">${this._l("next_text")}</p>
        <ul>
          <li>${this._l("next_chat")}</li>
          <li>${this._l("next_helpers")}</li>
        </ul>
      </div>
    </ha-card>`;
  }

  static styles = [
    haStyle,
    css`
      .content {
        max-width: 1100px;
        margin: 0 auto;
        padding: var(--ha-space-4);
        box-sizing: border-box;
      }
      .center {
        display: flex;
        justify-content: center;
        padding: var(--ha-space-8);
      }
      .intro,
      .detail {
        color: var(--secondary-text-color);
      }
      .privacy {
        padding: var(--ha-space-3) var(--ha-space-4);
        border-radius: var(--ha-border-radius-lg, 12px);
        background: var(--secondary-background-color);
      }
      h2 {
        font-size: var(--ha-font-size-l);
        margin: var(--ha-space-4) 0 var(--ha-space-2);
        overflow-wrap: anywhere;
      }
      ul.cards {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
        gap: var(--ha-space-3);
      }
      .card {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: var(--ha-space-1);
        width: 100%;
        min-height: 44px;
        box-sizing: border-box;
        padding: var(--ha-space-3) var(--ha-space-4);
        border: 1px solid var(--divider-color);
        border-radius: var(--ha-border-radius-lg, 12px);
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font: inherit;
        text-align: start;
        cursor: pointer;
      }
      .card.active {
        border-color: var(--primary-color);
        outline: 1px solid var(--primary-color);
      }
      .card:focus-visible,
      .link:focus-visible,
      .sort:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }
      .name {
        font-weight: var(--ha-font-weight-medium);
        overflow-wrap: anywhere;
      }
      .detail {
        font-size: var(--ha-font-size-s);
        overflow-wrap: anywhere;
      }
      .tag {
        padding: 0 var(--ha-space-2);
        border-radius: 12px;
        font-size: var(--ha-font-size-xs, 12px);
        background: var(--secondary-background-color);
      }
      .tag.ok {
        color: var(--success-color);
      }
      .tag.bad {
        color: var(--error-color);
      }
      .rows {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .row {
        display: flex;
        padding: var(--ha-space-2) 0;
        border-bottom: 1px solid var(--divider-color);
      }
      .text {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
        gap: var(--ha-space-1);
      }
      .bar {
        display: block;
        height: 6px;
        border-radius: 3px;
        background: var(--secondary-background-color);
        overflow: hidden;
      }
      .fill {
        display: block;
        height: 100%;
        background: var(--primary-color);
      }
      .split-start,
      .split-end {
        min-width: 0;
      }
      .split-start {
        padding-inline-end: var(--ha-space-2);
      }
      .split-end {
        padding-inline-start: var(--ha-space-2);
      }
      ha-input-search {
        display: block;
        margin-bottom: var(--ha-space-2);
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th,
      td {
        text-align: start;
        padding: var(--ha-space-1) var(--ha-space-2);
        border-bottom: 1px solid var(--divider-color);
        overflow-wrap: anywhere;
      }
      th {
        color: var(--secondary-text-color);
        font-weight: var(--ha-font-weight-medium);
      }
      tr.selected {
        background: var(--secondary-background-color);
      }
      .sort,
      .link {
        display: inline-flex;
        align-items: center;
        gap: var(--ha-space-1);
        min-height: 44px;
        padding: 0;
        border: 0;
        background: none;
        font: inherit;
        color: inherit;
        text-align: start;
        cursor: pointer;
      }
      .link {
        color: var(--primary-color);
        overflow-wrap: anywhere;
      }
      .detail-panel {
        padding: var(--ha-space-3) var(--ha-space-4);
        border: 1px solid var(--divider-color);
        border-radius: var(--ha-border-radius-lg, 12px);
        min-width: 0;
      }
      .detail-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--ha-space-2);
      }
      .detail-head h2 {
        margin: 0;
      }
      dl {
        display: grid;
        grid-template-columns: max-content minmax(0, 1fr);
        gap: var(--ha-space-1) var(--ha-space-3);
        margin: 0;
      }
      dt {
        color: var(--secondary-text-color);
        overflow-wrap: anywhere;
      }
      dd {
        margin: 0;
        overflow-wrap: anywhere;
      }
      h3 {
        font-size: var(--ha-font-size-m);
        margin: var(--ha-space-3) 0 var(--ha-space-1);
      }
      td ha-button {
        min-height: 44px;
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      ha-ollama-pull {
        margin: var(--ha-space-4) 0;
      }
      pre {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        margin: 0;
      }
      .empty .card-content {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: var(--ha-space-2);
      }
      .next {
        display: block;
        margin-top: var(--ha-space-6);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-ollama": HaConfigOllama;
  }
}
