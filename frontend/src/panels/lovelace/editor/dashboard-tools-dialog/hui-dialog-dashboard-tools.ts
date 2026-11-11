import { dump } from "js-yaml";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../../../common/dom/fire_event";
import { searchMatcher } from "../../../../common/regex/filter";
import type { LocalizeKeys } from "../../../../common/translations/localize";
import { copyToClipboard } from "../../../../common/util/copy-clipboard";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-button-toggle-group";
import "../../../../components/ha-checkbox";
import "../../../../components/ha-dialog";
import "../../../../components/ha-select";
import "../../../../components/input/ha-input";
import "../../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../../components/input/ha-input-search";
import type { DashboardCardTemplate } from "../../../../data/frontend";
import { saveFrontendUserData } from "../../../../data/frontend";
import type { LovelaceCardConfig } from "../../../../data/lovelace/config/card";
import type { LovelaceConfig } from "../../../../data/lovelace/config/types";
import { showConfirmationDialog } from "../../../../dialogs/generic/show-dialog-box";
import { haStyleDialog } from "../../../../resources/styles";
import type { HomeAssistant, ToggleButton } from "../../../../types";
import type { CardPath, OutlineView, Problem } from "../dashboard-tools";
import {
  checkDashboard,
  dashboardStats,
  deleteCards,
  duplicateCards,
  insertCards,
  moveCards,
  outline,
  replaceEntity,
} from "../dashboard-tools";
import type {
  DashboardToolsDialogParams,
  PreviewWidth,
} from "./show-dashboard-tools-dialog";

type Tab = "outline" | "replace" | "check" | "templates" | "stats";

const TABS: Tab[] = ["outline", "replace", "check", "templates", "stats"];

const WIDTHS: Exclude<PreviewWidth, undefined>[] = [
  "phone",
  "tablet",
  "desktop",
];

const pathKey = (p: CardPath) => `${p.view}/${p.section}/${p.card}`;

const fromKey = (key: string): CardPath => {
  const [view, section, card] = key.split("/").map(Number);
  return { view, section, card };
};

@customElement("hui-dialog-dashboard-tools")
export class HuiDialogDashboardTools extends LitElement {
  public hass!: HomeAssistant;

  @state() private _params?: DashboardToolsDialogParams;

  @state() private _open = false;

  @state() private _tab: Tab = "outline";

  @state() private _config?: LovelaceConfig;

  @state() private _filter = "";

  @state() private _selected = new Set<string>();

  @state() private _target = "";

  @state() private _from = "";

  @state() private _to = "";

  @state() private _templateName = "";

  @state() private _busy = false;

  @state() private _error?: string;

  @state() private _notice?: string;

  @state() private _preview: PreviewWidth;

  public showDialog(params: DashboardToolsDialogParams): void {
    this._params = params;
    this._config = params.lovelace()?.config;
    this._preview = params.previewWidth;
    this._selected = new Set();
    this._error = undefined;
    this._notice = undefined;
    this._open = true;
  }

  public closeDialog(): void {
    this._open = false;
  }

  private _dialogClosed(): void {
    this._params = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.lovelace.editor.dashboard_tools.${key}` as LocalizeKeys,
      values
    );
  }

  private _outline = memoizeOne((config: LovelaceConfig) => outline(config));

  private _problems = memoizeOne(
    (config: LovelaceConfig, states: HomeAssistant["states"]) =>
      checkDashboard(config, states)
  );

  private _filtered = memoizeOne(
    (views: OutlineView[], filter: string): OutlineView[] => {
      if (!filter) {
        return views;
      }
      const match = searchMatcher(filter);
      return views
        .map((view) => ({
          ...view,
          sections: view.sections
            .map((section) => ({
              ...section,
              cards: section.cards.filter((card) =>
                match(
                  card.type,
                  card.label,
                  section.title,
                  view.title,
                  ...card.entities
                )
              ),
            }))
            .filter((section) => section.cards.length),
        }))
        .filter((view) => view.sections.length);
    }
  );

  protected render() {
    if (!this._params || !this._config) {
      return nothing;
    }
    const buttons: ToggleButton[] = TABS.map((tab) => ({
      label: this._t(`tabs.${tab}`),
      value: tab,
    }));
    return html`
      <ha-dialog
        .open=${this._open}
        width="large"
        header-title=${this._t("title")}
        header-subtitle=${this._t("subtitle")}
        @closed=${this._dialogClosed}
      >
        <div class="top">
          <ha-button-toggle-group
            variant="neutral"
            active-variant="brand"
            size="s"
            full-width
            .buttons=${buttons}
            .active=${this._tab}
            @value-changed=${this._tabChanged}
          ></ha-button-toggle-group>
          <div
            class="preview"
            role="group"
            aria-label=${this._t("preview.label")}
          >
            <span>${this._t("preview.label")}</span>
            ${[undefined, ...WIDTHS].map(
              (width) =>
                html`<ha-button
                  size="s"
                  appearance=${this._preview === width ? "filled" : "plain"}
                  aria-pressed=${this._preview === width ? "true" : "false"}
                  .width=${width}
                  @click=${this._setPreview}
                >
                  ${this._t(`preview.${width ?? "full"}`)}
                </ha-button>`
            )}
          </div>
        </div>
        ${
          this._error
            ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
            : nothing
        }
        ${
          this._notice
            ? html`<ha-alert alert-type="success">${this._notice}</ha-alert>`
            : nothing
        }
        <div class="body">${this._renderTab()}</div>
        <ha-button slot="footer" appearance="plain" @click=${this.closeDialog}>
          ${this.hass.localize("ui.common.close")}
        </ha-button>
      </ha-dialog>
    `;
  }

  private _renderTab(): TemplateResult {
    switch (this._tab) {
      case "replace":
        return this._renderReplace();
      case "check":
        return this._renderCheck();
      case "templates":
        return this._renderTemplates();
      case "stats":
        return this._renderStats();
      default:
        return this._renderOutline();
    }
  }

  private _targets(config: LovelaceConfig) {
    const options: { value: string; label: string }[] = [];
    this._outline(config).forEach((view) => {
      if (view.strategy) {
        return;
      }
      const sectionsView = view.sections.some((s) => s.section >= 0);
      if (!sectionsView) {
        options.push({ value: `${view.view}/-1`, label: view.title });
        return;
      }
      view.sections.forEach((section) =>
        options.push({
          value: `${view.view}/${section.section}`,
          label: `${view.title} › ${section.title}`,
        })
      );
      options.push({
        value: `${view.view}/-1`,
        label: `${view.title} › ${this._t("outline.new_section")}`,
      });
    });
    return options;
  }

  private _renderTarget(): TemplateResult {
    const options = this._targets(this._config!);
    return html`<ha-select
      .label=${this._t("outline.target")}
      .value=${this._target}
      .options=${options}
      @selected=${this._targetChanged}
    ></ha-select>`;
  }

  private _renderOutline(): TemplateResult {
    const views = this._filtered(this._outline(this._config!), this._filter);
    const count = this._selected.size;
    return html`
      <ha-input-search
        appearance="outlined"
        .label=${this._t("outline.search")}
        .value=${this._filter}
        @input=${this._filterChanged}
      ></ha-input-search>
      <div class="bulk" role="toolbar" aria-label=${this._t("outline.bulk")}>
        <span class="count">${this._t("outline.selected", { count })}</span>
        <ha-button size="s" appearance="plain" @click=${this._selectVisible}>
          ${this._t("outline.select_visible")}
        </ha-button>
        <ha-button
          size="s"
          appearance="plain"
          .disabled=${!count}
          @click=${this._clearSelection}
        >
          ${this._t("outline.clear")}
        </ha-button>
        <ha-button
          size="s"
          .disabled=${!count || this._busy}
          @click=${this._duplicate}
        >
          ${this._t("outline.duplicate")}
        </ha-button>
        <ha-button
          size="s"
          appearance="plain"
          .disabled=${!count}
          @click=${this._copyYaml}
        >
          ${this._t("outline.copy_yaml")}
        </ha-button>
        <ha-button
          size="s"
          variant="danger"
          .disabled=${!count || this._busy}
          @click=${this._delete}
        >
          ${this._t("outline.delete")}
        </ha-button>
      </div>
      <div class="move">
        ${this._renderTarget()}
        <ha-button
          .disabled=${!count || !this._target || this._busy}
          @click=${this._move}
        >
          ${this._t("outline.move")}
        </ha-button>
      </div>
      ${
        views.length
          ? html`<ul class="tree" aria-label=${this._t("tabs.outline")}>
              ${views.map(
                (view) =>
                  html`<li>
                    <div class="view">
                      <button
                        class="link"
                        .view=${view.view}
                        @click=${this._openView}
                      >
                        ${view.title}
                      </button>
                      ${view.path ? html`<code>/${view.path}</code>` : nothing}
                      ${
                        view.strategy
                          ? html`<span class="tag"
                              >${this._t("outline.strategy")}</span
                            >`
                          : nothing
                      }
                    </div>
                    <ul>
                      ${view.sections.map(
                        (section) =>
                          html`<li>
                            ${
                              section.section >= 0
                                ? html`<div class="section">
                                    ${section.title}
                                  </div>`
                                : nothing
                            }
                            <ul>
                              ${section.cards.map((card) => {
                                const key = pathKey(card.path);
                                return html`<li
                                  class="card"
                                  style=${`padding-inline-start: ${card.depth * 24}px`}
                                >
                                  ${
                                    card.selectable
                                      ? html`<ha-checkbox
                                          .checked=${this._selected.has(key)}
                                          .key=${key}
                                          @change=${this._toggle}
                                        >
                                          <span class="type">${card.type}</span>
                                          <span class="label"
                                            >${card.label}</span
                                          >
                                        </ha-checkbox>`
                                      : html`<span class="nested">
                                          <span class="type">${card.type}</span>
                                          <span class="label"
                                            >${card.label}</span
                                          >
                                        </span>`
                                  }
                                  ${
                                    card.entities.length && card.selectable
                                      ? html`<span class="entities"
                                          >${this._t("outline.entities", {
                                            count: card.entities.length,
                                          })}</span
                                        >`
                                      : nothing
                                  }
                                </li>`;
                              })}
                            </ul>
                          </li>`
                      )}
                    </ul>
                  </li>`
              )}
            </ul>`
          : html`<p class="empty">${this._t("outline.none")}</p>`
      }
    `;
  }

  private _renderReplace(): TemplateResult {
    let preview: string;
    try {
      preview =
        this._from && this._to
          ? this._t("replace.preview", {
              count: replaceEntity(this._config!, this._from, this._to).count,
            })
          : this._t("replace.hint");
    } catch (_err: unknown) {
      preview = this._t("replace.invalid");
    }
    const known = this._from && !this.hass.states[this._to] && this._to;
    return html`
      <p>${this._t("replace.intro")}</p>
      <div class="replace">
        <ha-input
          .label=${this._t("replace.from")}
          .value=${this._from}
          .field=${"from"}
          @input=${this._replaceInput}
        ></ha-input>
        <ha-input
          .label=${this._t("replace.to")}
          .value=${this._to}
          .field=${"to"}
          @input=${this._replaceInput}
        ></ha-input>
      </div>
      <p class="hint" aria-live="polite">${preview}</p>
      ${
        known
          ? html`<ha-alert alert-type="warning"
              >${this._t("replace.unknown_target", { entity: this._to })}</ha-alert
            >`
          : nothing
      }
      <ha-button
        .disabled=${!this._from || !this._to || this._busy}
        @click=${this._replace}
      >
        ${this._t("replace.apply")}
      </ha-button>
    `;
  }

  private _renderCheck(): TemplateResult {
    const problems = this._problems(this._config!, this.hass.states);
    if (!problems.length) {
      return html`<ha-alert alert-type="success"
        >${this._t("check.clean")}</ha-alert
      >`;
    }
    const views = this._outline(this._config!);
    return html`
      <p>${this._t("check.found", { count: problems.length })}</p>
      <ul class="problems">
        ${problems.map(
          (problem: Problem) =>
            html`<li>
              <span class="kind"
                >${this._t(`check.kinds.${problem.kind}`)}</span
              >
              <code>${problem.detail}</code>
              <button
                class="link"
                .view=${problem.view}
                @click=${this._openView}
              >
                ${views[problem.view]?.title}
              </button>
            </li>`
        )}
      </ul>
    `;
  }

  private _renderTemplates(): TemplateResult {
    const templates = this.hass.userData?.dashboard_card_templates ?? [];
    return html`
      <p>${this._t("templates.intro")}</p>
      <div class="replace">
        <ha-input
          .label=${this._t("templates.name")}
          .value=${this._templateName}
          @input=${this._templateNameInput}
        ></ha-input>
        <ha-button
          .disabled=${!this._selected.size || !this._templateName.trim()}
          @click=${this._saveTemplate}
        >
          ${this._t("templates.save", { count: this._selected.size })}
        </ha-button>
      </div>
      <div class="move">${this._renderTarget()}</div>
      ${
        templates.length
          ? html`<ul class="templates">
              ${templates.map(
                (template) =>
                  html`<li>
                    <span class="label">${template.name}</span>
                    <span class="entities"
                      >${this._t("templates.cards", {
                        count: template.cards.length,
                      })}</span
                    >
                    <ha-button
                      size="s"
                      .disabled=${!this._target || this._busy}
                      .template=${template}
                      @click=${this._insertTemplate}
                    >
                      ${this._t("templates.insert")}
                    </ha-button>
                    <ha-button
                      size="s"
                      appearance="plain"
                      variant="danger"
                      .template=${template}
                      @click=${this._removeTemplate}
                    >
                      ${this._t("templates.remove")}
                    </ha-button>
                  </li>`
              )}
            </ul>`
          : html`<p class="empty">${this._t("templates.none")}</p>`
      }
    `;
  }

  private _renderStats(): TemplateResult {
    const stats = dashboardStats(this._config!);
    const facts: [string, number][] = [
      ["views", stats.views],
      ["sections", stats.sections],
      ["cards", stats.cards],
      ["entities", stats.entities],
    ];
    const most = stats.types[0]?.[1] ?? 1;
    return html`
      <div class="facts">
        ${facts.map(
          ([key, value]) =>
            html`<div class="fact">
              <strong>${value}</strong><span>${this._t(`stats.${key}`)}</span>
            </div>`
        )}
      </div>
      <h3>${this._t("stats.types")}</h3>
      <ul class="bars">
        ${stats.types.map(
          ([type, count]) =>
            html`<li>
              <span class="type">${type}</span>
              <span
                class="bar"
                style=${`--share: ${(count / most) * 100}%`}
              ></span>
              <span>${count}</span>
            </li>`
        )}
      </ul>
    `;
  }

  private _tabChanged(ev: CustomEvent<{ value?: string }>) {
    this._tab = (ev.detail.value as Tab) ?? "outline";
    this._notice = undefined;
    this._error = undefined;
  }

  private _setPreview(ev: Event) {
    const width = (ev.currentTarget as HTMLElement & { width: PreviewWidth })
      .width;
    this._preview = width;
    this._params!.setPreviewWidth(width);
  }

  private _filterChanged(ev: Event) {
    this._filter = (ev.target as HaInputSearch).value ?? "";
  }

  private _toggle(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      key: string;
      checked: boolean;
    };
    const next = new Set(this._selected);
    if (target.checked) {
      next.add(target.key);
    } else {
      next.delete(target.key);
    }
    this._selected = next;
  }

  private _selectVisible() {
    const next = new Set(this._selected);
    this._filtered(this._outline(this._config!), this._filter).forEach((v) =>
      v.sections.forEach((s) =>
        s.cards
          .filter((c) => c.selectable)
          .forEach((c) => next.add(pathKey(c.path)))
      )
    );
    this._selected = next;
  }

  private _clearSelection() {
    this._selected = new Set();
  }

  private _targetChanged(ev: CustomEvent<{ value?: string }>) {
    this._target = ev.detail.value ?? "";
  }

  private _openView(ev: Event) {
    const view = (ev.currentTarget as HTMLElement & { view: number }).view;
    this._params!.openView(view);
    this.closeDialog();
  }

  private _paths(): CardPath[] {
    return [...this._selected].map(fromKey);
  }

  private _selectedCards(): LovelaceCardConfig[] {
    const views = this._outline(this._config!);
    const byKey = new Map<string, LovelaceCardConfig>();
    this._paths().forEach((p) => {
      const view = this._config!.views[p.view] as {
        cards?: LovelaceCardConfig[];
        sections?: { cards?: LovelaceCardConfig[] }[];
      };
      const list =
        p.section >= 0 ? view.sections?.[p.section]?.cards : view.cards;
      const card = list?.[p.card];
      if (card && views[p.view]) {
        byKey.set(pathKey(p), card);
      }
    });
    return [...byKey.values()];
  }

  private async _apply(
    change: (config: LovelaceConfig) => LovelaceConfig,
    notice: () => string
  ) {
    const lovelace = this._params?.lovelace();
    if (!lovelace) {
      return;
    }
    this._busy = true;
    this._error = undefined;
    this._notice = undefined;
    try {
      await lovelace.saveConfig(change(lovelace.config));
      this._config = this._params?.lovelace()?.config ?? this._config;
      this._selected = new Set();
      this._notice = notice();
    } catch (err: unknown) {
      this._error = this._t("failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this._busy = false;
    }
  }

  private _duplicate() {
    const paths = this._paths();
    this._apply(
      (config) => duplicateCards(config, paths),
      () => this._t("done.duplicated", { count: paths.length })
    );
  }

  private async _delete() {
    const paths = this._paths();
    const ok = await showConfirmationDialog(this, {
      title: this._t("confirm_delete.title", { count: paths.length }),
      text: this._t("confirm_delete.text"),
      confirmText: this.hass.localize("ui.common.delete"),
      dismissText: this.hass.localize("ui.common.cancel"),
      destructive: true,
    });
    if (ok) {
      this._apply(
        (config) => deleteCards(config, paths),
        () => this._t("done.deleted", { count: paths.length })
      );
    }
  }

  private _move() {
    const paths = this._paths();
    const [view, section] = this._target.split("/").map(Number);
    this._apply(
      (config) => moveCards(config, paths, view, section),
      () => this._t("done.moved", { count: paths.length })
    );
  }

  private async _copyYaml() {
    await copyToClipboard(dump(this._selectedCards()));
    this._notice = this._t("done.copied");
  }

  private _replaceInput(ev: Event) {
    const target = ev.target as HTMLElement & { field: string; value: string };
    const value = (target.value ?? "").trim();
    if (target.field === "from") {
      this._from = value;
    } else {
      this._to = value;
    }
  }

  private _replace() {
    const { _from: from, _to: to } = this;
    let count = 0;
    this._apply(
      (config) => {
        const result = replaceEntity(config, from, to);
        count = result.count;
        return result.config;
      },
      () => this._t("done.replaced", { count, from, to })
    );
  }

  private _templateNameInput(ev: Event) {
    this._templateName = (ev.target as HTMLElement & { value: string }).value;
  }

  private async _saveTemplates(templates: DashboardCardTemplate[]) {
    try {
      await saveFrontendUserData(this.hass.connection, "core", {
        ...this.hass.userData,
        dashboard_card_templates: templates,
      });
    } catch (err: unknown) {
      this._error = this._t("failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async _saveTemplate() {
    const cards = this._selectedCards();
    const template: DashboardCardTemplate = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: this._templateName.trim(),
      created: Date.now(),
      cards: structuredClone(cards) as Record<string, unknown>[],
    };
    await this._saveTemplates([
      template,
      ...(this.hass.userData?.dashboard_card_templates ?? []),
    ]);
    if (!this._error) {
      this._templateName = "";
      this._notice = this._t("done.template_saved", { name: template.name });
    }
  }

  private _insertTemplate(ev: Event) {
    const template = (
      ev.currentTarget as HTMLElement & { template: DashboardCardTemplate }
    ).template;
    const [view, section] = this._target.split("/").map(Number);
    this._apply(
      (config) =>
        insertCards(
          config,
          template.cards as LovelaceCardConfig[],
          view,
          section
        ),
      () => this._t("done.inserted", { name: template.name })
    );
  }

  private async _removeTemplate(ev: Event) {
    const template = (
      ev.currentTarget as HTMLElement & { template: DashboardCardTemplate }
    ).template;
    const ok = await showConfirmationDialog(this, {
      title: this._t("templates.remove_title", { name: template.name }),
      confirmText: this.hass.localize("ui.common.delete"),
      dismissText: this.hass.localize("ui.common.cancel"),
      destructive: true,
    });
    if (ok) {
      await this._saveTemplates(
        (this.hass.userData?.dashboard_card_templates ?? []).filter(
          (t) => t.id !== template.id
        )
      );
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleDialog,
      css`
        .top {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
          margin-bottom: var(--ha-space-3);
        }
        .preview,
        .bulk,
        .move,
        .replace {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2);
        }
        .preview span,
        .count,
        .hint,
        .entities,
        .empty {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
        }
        .move,
        .bulk,
        .replace {
          margin: var(--ha-space-3) 0;
        }
        .move ha-select,
        .replace ha-input {
          flex: 1 1 220px;
        }
        ul {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .tree > li {
          border-top: 1px solid var(--divider-color);
          padding: var(--ha-space-2) 0;
        }
        .view {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          font-weight: var(--ha-font-weight-bold);
        }
        .section {
          margin: var(--ha-space-2) 0 0;
          padding-inline-start: var(--ha-space-2);
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .card {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          min-height: 36px;
        }
        .nested {
          display: inline-flex;
          gap: var(--ha-space-2);
          padding-inline-start: var(--ha-space-8);
          color: var(--secondary-text-color);
        }
        .type {
          font-family: var(--ha-font-family-code);
          font-size: var(--ha-font-size-s);
          color: var(--primary-color);
        }
        .tag {
          font-size: var(--ha-font-size-xs);
          padding: 0 var(--ha-space-2);
          border-radius: var(--ha-border-radius-pill);
          background: var(--secondary-background-color);
        }
        .link {
          background: none;
          border: none;
          padding: 0;
          font: inherit;
          color: var(--primary-color);
          cursor: pointer;
          text-decoration: underline;
        }
        .link:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: 2px;
        }
        .problems li,
        .templates li {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2);
          padding: var(--ha-space-2) 0;
          border-top: 1px solid var(--divider-color);
        }
        .kind {
          font-weight: var(--ha-font-weight-medium);
        }
        .templates .label {
          flex: 1 1 auto;
        }
        .facts {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: var(--ha-space-3);
        }
        .fact {
          display: flex;
          flex-direction: column;
          padding: var(--ha-space-3);
          border-radius: var(--ha-border-radius-lg);
          background: var(--secondary-background-color);
        }
        .fact strong {
          font-size: var(--ha-font-size-2xl);
        }
        .bars li {
          display: grid;
          grid-template-columns: minmax(100px, 30%) 1fr auto;
          align-items: center;
          gap: var(--ha-space-2);
          padding: var(--ha-space-1) 0;
        }
        .bar {
          height: 8px;
          border-radius: var(--ha-border-radius-pill);
          background: linear-gradient(
            to right,
            var(--primary-color) var(--share),
            var(--divider-color) var(--share)
          );
        }
        :host-context([style*="direction: rtl"]) .bar {
          transform: scaleX(-1);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-dialog-dashboard-tools": HuiDialogDashboardTools;
  }
}
