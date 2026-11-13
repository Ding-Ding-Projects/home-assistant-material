import type { TemplateResult } from "lit";
import { css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { searchMatcher } from "../../../../common/regex/filter";
import { showConfirmationDialog } from "../../../../dialogs/generic/show-dialog-box";
import "../../../../components/ha-button";
import "../../../../components/ha-select";
import "../../../../components/input/ha-input";
import "../../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../../components/input/ha-input-search";
import type { CardLibraryEntry } from "../../../../data/frontend";
import { saveFrontendUserData } from "../../../../data/frontend";
import type { LovelaceCardConfig } from "../../../../data/lovelace/config/card";
import type { LovelaceConfig } from "../../../../data/lovelace/config/types";
import type { LovelaceViewConfig } from "../../../../data/lovelace/config/view";
import { insertCards, outline } from "../dashboard-tools";
import {
  applyInputs,
  findInputs,
  latestVersion,
  removeFromLibrary,
  restoreVersion,
  saveToLibrary,
} from "./card-library";
import { ToolView } from "./tools-base";

const cardAt = (
  config: LovelaceConfig,
  view: number,
  section: number,
  card: number
): Record<string, unknown> | undefined => {
  const v = config.views[view] as LovelaceViewConfig | undefined;
  const list =
    section >= 0
      ? (v?.sections?.[section] as { cards?: unknown[] } | undefined)?.cards
      : v?.cards;
  return list?.[card] as Record<string, unknown> | undefined;
};

@customElement("hui-tool-library")
export class HuiToolLibrary extends ToolView {
  @state() private _library?: CardLibraryEntry[];

  @state() private _filter = "";

  @state() private _name = "";

  @state() private _source = "";

  @state() private _target = "";

  @state() private _open?: string;

  @state() private _version?: number;

  @state() private _values: Record<string, string> = {};

  private _entries = memoizeOne(
    (stored: CardLibraryEntry[] | undefined, local?: CardLibraryEntry[]) =>
      local ?? stored ?? []
  );

  private _visible = memoizeOne(
    (entries: CardLibraryEntry[], filter: string) => {
      if (!filter) {
        return entries;
      }
      const match = searchMatcher(filter);
      return entries.filter((e) =>
        match(e.name, latestVersion(e).card.type as string)
      );
    }
  );

  private get _all(): CardLibraryEntry[] {
    return this._entries(
      this.hass.userData?.dashboard_card_library,
      this._library
    );
  }

  private _sources = memoizeOne((config: LovelaceConfig) =>
    outline(config).flatMap((view) =>
      view.sections.flatMap((section) =>
        section.cards
          .filter((c) => c.selectable)
          .map((c) => ({
            value: `${c.path.view}/${c.path.section}/${c.path.card}`,
            label: `${view.title} › ${c.label || c.type}`,
          }))
      )
    )
  );

  private _targets = memoizeOne((config: LovelaceConfig) => {
    const options: { value: string; label: string }[] = [];
    outline(config).forEach((view) => {
      if (view.strategy) {
        return;
      }
      if (!view.sections.some((s) => s.section >= 0)) {
        options.push({ value: `${view.view}/-1`, label: view.title });
        return;
      }
      view.sections.forEach((s) =>
        options.push({
          value: `${view.view}/${s.section}`,
          label: `${view.title} › ${s.title}`,
        })
      );
    });
    return options;
  });

  protected render(): TemplateResult | typeof nothing {
    const config = this._config;
    if (!config) {
      return nothing;
    }
    const entries = this._visible(this._all, this._filter);
    return html`
      <p class="intro">${this._t("library.intro")}</p>
      ${this._renderMessages()}
      <div class="row">
        <ha-select
          .label=${this._t("library.source")}
          .value=${this._source}
          .options=${this._sources(config)}
          @selected=${this._sourceChanged}
        ></ha-select>
        <ha-input
          .label=${this._t("library.name")}
          .value=${this._name}
          @input=${this._nameChanged}
        ></ha-input>
        <ha-button
          .disabled=${!this._source || !this._name.trim() || this._busy}
          @click=${this._saveCard}
        >
          ${this._t("library.save")}
        </ha-button>
      </div>
      <ha-input-search
        appearance="outlined"
        .label=${this._t("library.search")}
        .value=${this._filter}
        @input=${this._filterChanged}
      ></ha-input-search>
      <div class="row">
        <ha-select
          .label=${this._t("library.target")}
          .value=${this._target}
          .options=${this._targets(config)}
          @selected=${this._targetChanged}
        ></ha-select>
      </div>
      ${
        entries.length
          ? html`<ul class="list">
              ${entries.map((entry) => this._renderEntry(entry))}
            </ul>`
          : html`<p class="empty">${this._t("library.none")}</p>`
      }
    `;
  }

  private _renderEntry(entry: CardLibraryEntry): TemplateResult {
    const open = this._open === entry.id;
    const index = this._version ?? entry.versions.length - 1;
    const version = entry.versions[index] ?? latestVersion(entry);
    const inputs = findInputs(version.card);
    return html`<li class="entry">
      <div class="main">
        <b>${entry.name}</b>
        <span class="muted">${String(version.card.type ?? "")}</span>
      </div>
      <span class="pill"
        >${this._t("library.version", { number: entry.versions.length })}</span
      >
      <span class="pill"
        >${this._t("library.inputs", { count: findInputs(latestVersion(entry).card).length })}</span
      >
      <ha-button
        size="s"
        appearance=${open ? "filled" : "plain"}
        aria-expanded=${open ? "true" : "false"}
        .id=${entry.id}
        @click=${this._toggleOpen}
      >
        ${this._t(open ? "library.close" : "library.open")}
      </ha-button>
      ${
        open
          ? html`<div class="detail">
              <ha-select
                .label=${this._t("library.which_version")}
                .value=${String(index)}
                .options=${entry.versions.map((v, i) => ({
                  value: String(i),
                  label: `${i + 1} · ${new Date(v.at).toLocaleString(this.hass.locale?.language)}`,
                }))}
                @selected=${this._versionChanged}
              ></ha-select>
              ${inputs.map(
                (name) =>
                  html`<ha-input
                    .label=${name}
                    .value=${this._values[name] ?? ""}
                    .inputName=${name}
                    @input=${this._valueChanged}
                  ></ha-input>`
              )}
              <div class="row">
                <ha-button
                  .disabled=${!this._target || this._busy}
                  .entry=${entry}
                  @click=${this._insert}
                >
                  ${this._t("library.insert")}
                </ha-button>
                <ha-button
                  appearance="plain"
                  .disabled=${index === entry.versions.length - 1}
                  .entry=${entry}
                  @click=${this._restore}
                >
                  ${this._t("library.restore")}
                </ha-button>
                <ha-button
                  variant="danger"
                  appearance="plain"
                  .entry=${entry}
                  @click=${this._remove}
                >
                  ${this._t("library.remove")}
                </ha-button>
              </div>
              ${this._target ? nothing : html`<p class="hint">${this._t("library.pick_target")}</p>`}
            </div>`
          : nothing
      }
    </li>`;
  }

  private async _store(next: CardLibraryEntry[]): Promise<boolean> {
    try {
      await saveFrontendUserData(this.hass.connection, "core", {
        ...this.hass.userData,
        dashboard_card_library: next,
      });
      this._library = next;
      return true;
    } catch (err: unknown) {
      this._fail(err);
      return false;
    }
  }

  private _filterChanged(ev: Event) {
    this._filter = (ev.target as HaInputSearch).value ?? "";
  }

  private _sourceChanged(ev: CustomEvent<{ value: string }>) {
    this._source = ev.detail?.value ?? "";
    if (!this._name.trim()) {
      const [view, section, card] = this._source.split("/").map(Number);
      const config = cardAt(this._config!, view, section, card);
      this._name = String(config?.title ?? config?.name ?? config?.type ?? "");
    }
  }

  private _nameChanged(ev: Event) {
    this._name = (ev.target as HTMLElement & { value?: string }).value ?? "";
  }

  private _targetChanged(ev: CustomEvent<{ value: string }>) {
    this._target = ev.detail?.value ?? "";
  }

  private _versionChanged(ev: CustomEvent<{ value: string }>) {
    this._version = Number(ev.detail?.value);
  }

  private _valueChanged(ev: Event) {
    const target = ev.target as HTMLElement & {
      inputName: string;
      value: string;
    };
    this._values = { ...this._values, [target.inputName]: target.value ?? "" };
  }

  private _toggleOpen(ev: Event) {
    const id = (ev.currentTarget as HTMLElement).id;
    this._open = this._open === id ? undefined : id;
    this._version = undefined;
    this._values = {};
  }

  private async _saveCard() {
    const [view, section, card] = this._source.split("/").map(Number);
    const config = cardAt(this._config!, view, section, card);
    if (!config) {
      return;
    }
    this._busy = true;
    this._error = undefined;
    const name = this._name.trim();
    const before = this._all;
    const next = saveToLibrary(before, name, config);
    if (next === before) {
      this._notice = this._t("library.unchanged", { name });
    } else if (await this._store(next)) {
      const entry = next.find(
        (e) => e.name.toLowerCase() === name.toLowerCase()
      );
      this._notice = this._t("library.saved", {
        name,
        number: entry?.versions.length ?? 1,
      });
      this._name = "";
    }
    this._busy = false;
  }

  private async _insert(ev: Event) {
    const entry = (
      ev.currentTarget as HTMLElement & { entry: CardLibraryEntry }
    ).entry;
    const index = this._version ?? entry.versions.length - 1;
    const card = applyInputs(
      (entry.versions[index] ?? latestVersion(entry)).card,
      this._values
    );
    const [view, section] = this._target.split("/").map(Number);
    await this._save(
      (config) =>
        insertCards(config, [card as LovelaceCardConfig], view, section),
      this._t("library.inserted", { name: entry.name })
    );
  }

  private async _restore(ev: Event) {
    const entry = (
      ev.currentTarget as HTMLElement & { entry: CardLibraryEntry }
    ).entry;
    const index = this._version ?? entry.versions.length - 1;
    const version = entry.versions[index];
    if (!version) {
      return;
    }
    if (await this._store(restoreVersion(this._all, entry.id, version.at))) {
      this._version = undefined;
      this._notice = this._t("library.restored", { name: entry.name });
    }
  }

  private async _remove(ev: Event) {
    const entry = (
      ev.currentTarget as HTMLElement & { entry: CardLibraryEntry }
    ).entry;
    const ok = await showConfirmationDialog(this, {
      title: this._t("library.remove_title", { name: entry.name }),
      text: this._t("library.remove_text"),
      confirmText: this.hass.localize("ui.common.delete"),
      dismissText: this.hass.localize("ui.common.cancel"),
      destructive: true,
    });
    if (ok && (await this._store(removeFromLibrary(this._all, entry.id)))) {
      this._open = undefined;
    }
  }

  static get styles() {
    return [
      ToolView.styles,
      css`
        .detail {
          flex: 1 1 100%;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-tool-library": HuiToolLibrary;
  }
}
