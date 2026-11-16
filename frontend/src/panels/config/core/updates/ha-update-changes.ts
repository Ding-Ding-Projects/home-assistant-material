import { mdiChevronDown, mdiContentCopy, mdiRefresh } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
import { copyToClipboard } from "../../../../common/util/copy-clipboard";
import { formatDateTime } from "../../../../common/datetime/format_date_time";
import { formatTime } from "../../../../common/datetime/format_time";
import { LanguageModeController } from "../../../../common/language-mode/language-mode-controller";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-card";
import type {
  HaSelectOption,
  HaSelectSelectEvent,
} from "../../../../components/ha-select";
import "../../../../components/ha-select";
import "../../../../components/ha-spinner";
import "../../../../components/ha-svg-icon";
import "../../../../components/input/ha-input-search";
import type {
  ChangeEntry,
  ChangeList,
  ReleaseEntry,
} from "../../../../data/build-changes";
import {
  CHANGE_AREAS,
  changesToText,
  correctRange,
  countByArea,
  countChanges,
  defaultFromBuild,
  detailsForMode,
  fetchChangeList,
  filterReleases,
  findRelease,
  isFiltering,
  isPublishedRelease,
  sliceReleases,
} from "../../../../data/build-changes";
import { parseBuildNumber } from "../../../../data/build-progress";
import type { PublicFetchFailure } from "../../../../data/public-json";
import { haStyle } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import { showToast } from "../../../../util/toast";

const PREFIX = "ui.panel.config.updates.compare";
const DATA_PREFIX = "ui.panel.config.updates.build_data";

/**
 * "What changed between versions": a comparison of two builds and the list
 * of changes between them, read from the public change list.
 */
@customElement("ha-update-changes")
export class HaUpdateChanges extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() private _list?: ChangeList;

  @state() private _failure?: PublicFetchFailure;

  @state() private _loading = true;

  @state() private _from?: number;

  @state() private _to?: number;

  @state() private _belowList = false;

  @state() private _areas: ReadonlySet<string> = new Set();

  @state() private _query = "";

  @state() private _expanded: ReadonlySet<string> = new Set();

  private _lang = new LanguageModeController(this);

  private _abort?: AbortController;

  public connectedCallback(): void {
    super.connectedCallback();
    this._load(false);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._abort?.abort();
    this._abort = undefined;
  }

  private _installedBuild(): number | undefined {
    return parseBuildNumber(this.hass.config.version);
  }

  private async _load(force: boolean): Promise<void> {
    this._abort?.abort();
    const controller = new AbortController();
    this._abort = controller;
    this._loading = true;
    const result = await fetchChangeList(force, controller.signal);
    if (controller.signal.aborted) {
      return;
    }
    this._loading = false;
    if (!result.ok) {
      this._failure = result;
      return;
    }
    this._failure = undefined;
    this._list = result.data;
    if (this._from === undefined || this._to === undefined) {
      this._selectInstalledToNewest();
    }
  }

  private _selectInstalledToNewest(): void {
    const list = this._list;
    const newest = list?.releases[0];
    if (!list || !newest) {
      return;
    }
    const start = defaultFromBuild(list.releases, this._installedBuild());
    this._from = start.build ?? newest.build;
    this._to = newest.build;
    this._belowList = start.belowList;
  }

  private _selectLatestOnly(): void {
    const releases = this._list?.releases ?? [];
    const newest = releases[0];
    if (!newest) {
      return;
    }
    const older = releases.find((release) => release.build < newest.build);
    this._from = older?.build ?? newest.build;
    this._to = newest.build;
    this._belowList = false;
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.hass.localize, key, values);
  }

  private _date(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? ""
      : formatDateTime(date, this.hass.locale, this.hass.config);
  }

  private _areaLabel(area: string): string {
    return (
      this._lang.text(this.hass.localize, `${PREFIX}.area.${area}`) || area
    );
  }

  private _range = memoizeOne(
    (releases: ReleaseEntry[], from: number, to: number) =>
      sliceReleases(releases, { from, to })
  );

  private _byQuery = memoizeOne((range: ReleaseEntry[], query: string) =>
    filterReleases(range, { areas: new Set(), query })
  );

  private _visible = memoizeOne(
    (range: ReleaseEntry[], areas: ReadonlySet<string>, query: string) =>
      filterReleases(range, { areas, query })
  );

  protected render(): TemplateResult {
    return html`
      <ha-card aria-labelledby="compare-title">
        <div class="head">
          <div>
            <h2 id="compare-title">${this._t(`${PREFIX}.title`)}</h2>
            <p class="quiet">${this._t(`${PREFIX}.intro`)}</p>
          </div>
        </div>
        ${this._renderBody()}
        <p class="quiet">${this._t(`${DATA_PREFIX}.privacy`)}</p>
      </ha-card>
    `;
  }

  private _renderBody(): TemplateResult {
    if (this._failure) {
      return this._renderFailure(this._failure);
    }
    const list = this._list;
    if (!list) {
      return html`<div class="loading" role="status">
        <ha-spinner size="small"></ha-spinner>
        <span>${this._t(`${PREFIX}.loading`)}</span>
      </div>`;
    }
    if (
      !list.releases.length ||
      this._from === undefined ||
      this._to === undefined
    ) {
      return html`<ha-alert alert-type="info">
        ${this._t(`${PREFIX}.not_published`)}
      </ha-alert>`;
    }
    const range = this._range(list.releases, this._from, this._to);
    const byQuery = this._byQuery(range, this._query);
    const visible = this._visible(range, this._areas, this._query);
    return html`
      ${this._renderPickers(list)}
      ${
        this._belowList
          ? html`<ha-alert alert-type="info">
              ${this._t(`${PREFIX}.below_list`)}
            </ha-alert>`
          : nothing
      }
      ${this._renderTable(list, range)} ${this._renderSummary(range, visible)}
      ${this._renderFilters(range, byQuery, visible)}
      ${this._renderGroups(list, range, visible)}
    `;
  }

  private _renderFailure(failure: PublicFetchFailure): TemplateResult {
    let message: string;
    let type: "info" | "warning" | "error" = "error";
    switch (failure.reason) {
      case "not_found":
        message = this._t(`${PREFIX}.not_published`);
        type = "info";
        break;
      case "rate_limited":
        type = "warning";
        message = failure.resetAt
          ? this._t(`${DATA_PREFIX}.error_rate`, {
              time: formatTime(
                failure.resetAt,
                this.hass.locale,
                this.hass.config
              ),
            })
          : this._t(`${DATA_PREFIX}.error_rate_unknown`);
        break;
      case "offline":
        message = this._t(`${DATA_PREFIX}.error_offline`);
        break;
      case "http":
        message = this._t(`${DATA_PREFIX}.error_http`, {
          status: failure.status,
        });
        break;
      default:
        message = this._t(`${DATA_PREFIX}.error_invalid`);
    }
    return html`<ha-alert alert-type=${type}>
      ${message}
      <ha-button
        slot="action"
        appearance="plain"
        .disabled=${this._loading}
        @click=${this._retry}
      >
        <ha-svg-icon slot="start" .path=${mdiRefresh}></ha-svg-icon>
        ${this._t(`${DATA_PREFIX}.retry`)}
      </ha-button>
    </ha-alert>`;
  }

  private _retry = () => {
    this._load(true);
  };

  private _optionLabel(build: number, list: ChangeList): string {
    const installed = build === this._installedBuild();
    const newest = build === list.releases[0]?.build;
    const key =
      installed && newest
        ? "option_both"
        : installed
          ? "option_installed"
          : newest
            ? "option_newest"
            : "option";
    return this._t(`${PREFIX}.${key}`, { build });
  }

  private _renderPickers(list: ChangeList): TemplateResult {
    const options: HaSelectOption[] = list.releases.map((release) => ({
      value: release.build,
      label: this._optionLabel(release.build, list),
    }));
    return html`
      <div class="pickers">
        <ha-select
          .label=${this._t(`${PREFIX}.from`)}
          .value=${this._from}
          .options=${options}
          @selected=${this._fromChanged}
        ></ha-select>
        <ha-select
          .label=${this._t(`${PREFIX}.to`)}
          .value=${this._to}
          .options=${options}
          @selected=${this._toChanged}
        ></ha-select>
        <div class="quick">
          <ha-button appearance="outlined" @click=${this._quickInstalled}>
            ${this._t(`${PREFIX}.quick_installed`)}
          </ha-button>
          <ha-button appearance="outlined" @click=${this._quickLatest}>
            ${this._t(`${PREFIX}.quick_latest`)}
          </ha-button>
        </div>
      </div>
    `;
  }

  private _quickInstalled = () => {
    this._selectInstalledToNewest();
  };

  private _quickLatest = () => {
    this._selectLatestOnly();
  };

  private _fromChanged(ev: HaSelectSelectEvent): void {
    const build = Number(ev.detail.value);
    if (Number.isNaN(build) || this._to === undefined) {
      return;
    }
    const next = correctRange({ from: build, to: this._to }, "from");
    this._from = next.from;
    this._to = next.to;
    this._belowList = false;
  }

  private _toChanged(ev: HaSelectSelectEvent): void {
    const build = Number(ev.detail.value);
    if (Number.isNaN(build) || this._from === undefined) {
      return;
    }
    const next = correctRange({ from: this._from, to: build }, "to");
    this._from = next.from;
    this._to = next.to;
  }

  private _renderTable(
    list: ChangeList,
    range: ReleaseEntry[]
  ): TemplateResult {
    const from = findRelease(list.releases, this._from);
    const to = findRelease(list.releases, this._to);
    const fromLabel = this._t(`${PREFIX}.from`);
    const toLabel = this._t(`${PREFIX}.to`);
    const row = (
      label: string,
      pick: (release: ReleaseEntry | undefined) => string
    ) =>
      html`<tr>
        <th scope="row">${label}</th>
        <td data-label=${fromLabel}>${pick(from)}</td>
        <td data-label=${toLabel}>${pick(to)}</td>
      </tr>`;
    return html`
      <table class="compare" aria-label=${this._t(`${PREFIX}.table_label`)}>
        <thead>
          <tr>
            <td></td>
            <th scope="col">${fromLabel}</th>
            <th scope="col">${toLabel}</th>
          </tr>
        </thead>
        <tbody>
          ${row(this._t(`${PREFIX}.row_build`), (r) =>
            r ? this._t(`${PREFIX}.option`, { build: r.build }) : ""
          )}
          ${row(this._t(`${PREFIX}.row_core`), (r) => r?.core ?? "")}
          ${row(this._t(`${PREFIX}.row_supervisor`), (r) => r?.supervisor ?? "")}
          ${row(this._t(`${PREFIX}.row_os`), (r) => r?.os ?? "")}
          ${row(this._t(`${PREFIX}.row_date`), (r) =>
            r ? this._date(r.date) : ""
          )}
          ${row(this._t(`${PREFIX}.row_source`), (r) => r?.source ?? "")}
          ${row(this._t(`${PREFIX}.row_kind`), (r) =>
            r
              ? this._t(
                  isPublishedRelease(r)
                    ? `${PREFIX}.kind_release`
                    : `${PREFIX}.kind_feed`
                )
              : ""
          )}
          <tr>
            <th scope="row">${this._t(`${PREFIX}.row_changes`)}</th>
            <td class="span" colspan="2">
              ${this._t(`${PREFIX}.group_count`, {
                count: countChanges(range),
              })}
            </td>
          </tr>
        </tbody>
      </table>
    `;
  }

  private _renderSummary(
    range: ReleaseEntry[],
    visible: ReleaseEntry[]
  ): TemplateResult {
    const total = countChanges(range);
    const shown = countChanges(visible);
    const filtering = isFiltering({ areas: this._areas, query: this._query });
    return html`<div class="summary" role="status">
      <strong>
        ${
          this._from === this._to
            ? this._t(`${PREFIX}.summary_same`, { build: this._from! })
            : this._t(`${PREFIX}.summary`, {
                changes: total,
                builds: range.length,
                from: this._from!,
                to: this._to!,
              })
        }
      </strong>
      ${
        filtering
          ? html`<span class="quiet"
              >${this._t(`${PREFIX}.summary_filtered`, { shown, total })}</span
            >`
          : nothing
      }
    </div>`;
  }

  private _renderFilters(
    range: ReleaseEntry[],
    byQuery: ReleaseEntry[],
    visible: ReleaseEntry[]
  ): TemplateResult {
    const counts = countByArea(byQuery);
    const areas = [
      ...CHANGE_AREAS.filter((area) => counts[area] || this._areas.has(area)),
      ...Object.keys(counts).filter(
        (area) => !(CHANGE_AREAS as readonly string[]).includes(area)
      ),
    ];
    const samples = range.flatMap((release) =>
      release.changes.map((change) => change.title)
    );
    return html`
      <div class="filters">
        <ha-input-search
          appearance="outlined"
          .value=${this._query}
          .label=${this._t(`${PREFIX}.search`)}
          .placeholder=${this._t(`${PREFIX}.search`)}
          .patternSamples=${samples}
          @input=${this._queryChanged}
        ></ha-input-search>
        ${
          areas.length
            ? html`<div
                class="chips"
                role="group"
                aria-label=${this._t(`${PREFIX}.areas_label`)}
              >
                ${areas.map(
                  (area) =>
                    html`<button
                      type="button"
                      class="chip ${classMap({ on: this._areas.has(area) })}"
                      aria-pressed=${this._areas.has(area) ? "true" : "false"}
                      .area=${area}
                      @click=${this._toggleArea}
                    >
                      ${this._areaLabel(area)}
                      <span class="count">${counts[area] ?? 0}</span>
                    </button>`
                )}
              </div>`
            : nothing
        }
        <div class="tools">
          <ha-button appearance="plain" @click=${this._expandAll}>
            ${this._t(`${PREFIX}.expand_all`)}
          </ha-button>
          <ha-button appearance="plain" @click=${this._collapseAll}>
            ${this._t(`${PREFIX}.collapse_all`)}
          </ha-button>
          <ha-button
            appearance="outlined"
            .disabled=${!visible.length}
            @click=${this._copy}
          >
            <ha-svg-icon slot="start" .path=${mdiContentCopy}></ha-svg-icon>
            ${this._t(`${PREFIX}.copy`)}
          </ha-button>
        </div>
      </div>
    `;
  }

  private _queryChanged(ev: Event): void {
    this._query = (ev.target as HTMLInputElement).value ?? "";
  }

  private _toggleArea(ev: Event): void {
    const area = (ev.currentTarget as HTMLElement & { area: string }).area;
    const next = new Set(this._areas);
    if (next.has(area)) {
      next.delete(area);
    } else {
      next.add(area);
    }
    this._areas = next;
  }

  private _clearFilters = () => {
    this._areas = new Set();
    this._query = "";
  };

  private _currentVisible(): ReleaseEntry[] {
    const list = this._list;
    if (!list || this._from === undefined || this._to === undefined) {
      return [];
    }
    return this._visible(
      this._range(list.releases, this._from, this._to),
      this._areas,
      this._query
    );
  }

  private _expandAll = () => {
    const keys = new Set<string>();
    for (const release of this._currentVisible()) {
      for (const change of release.changes) {
        if (this._hasDetails(change)) {
          keys.add(this._key(release, change));
        }
      }
    }
    this._expanded = keys;
  };

  private _collapseAll = () => {
    this._expanded = new Set();
  };

  private _copy = async () => {
    const visible = this._currentVisible();
    const mode = this._lang.mode;
    const text = changesToText(visible, {
      heading: this._t(`${PREFIX}.text_heading`, {
        from: this._from!,
        to: this._to!,
      }),
      releaseLabel: (release) =>
        this._t(`${PREFIX}.text_release`, {
          build: release.build,
          core: release.core,
          date: this._date(release.date),
        }),
      areaLabel: (area) => this._areaLabel(area),
      details: (change) => detailsForMode(change, mode),
    });
    await copyToClipboard(text, this);
    showToast(this, { message: this._t(`${PREFIX}.copied`) });
  };

  private _key(release: ReleaseEntry, change: ChangeEntry): string {
    return `${release.build}:${change.sha}:${change.title}`;
  }

  private _hasDetails(change: ChangeEntry): boolean {
    return detailsForMode(change, this._lang.mode).length > 0;
  }

  private _toggleChange(ev: Event): void {
    const key = (ev.currentTarget as HTMLElement & { changeKey: string })
      .changeKey;
    const next = new Set(this._expanded);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    this._expanded = next;
  }

  private _renderGroups(
    list: ChangeList,
    range: ReleaseEntry[],
    visible: ReleaseEntry[]
  ): TemplateResult {
    if (!range.length) {
      return html`<p class="empty">${this._t(`${PREFIX}.empty_range`)}</p>`;
    }
    if (!visible.length) {
      return html`<div class="empty">
        <p>${this._t(`${PREFIX}.empty_filtered`)}</p>
        <ha-button appearance="outlined" @click=${this._clearFilters}>
          ${this._t(`${PREFIX}.clear_filters`)}
        </ha-button>
      </div>`;
    }
    const installed = this._installedBuild();
    const newest = list.releases[0]?.build;
    return html`<div class="groups">
      ${visible.map(
        (release) => html`
          <section
            class="group"
            aria-label=${this._t(`${PREFIX}.group_title`, {
              build: release.build,
            })}
          >
            <header>
              <h3>
                ${this._t(`${PREFIX}.group_title`, { build: release.build })}
                <span class="quiet"
                  >${this._t(`${PREFIX}.group_core`, {
                    core: release.core,
                  })}</span
                >
              </h3>
              <div class="badges">
                ${
                  release.build === installed
                    ? html`<span class="badge"
                        >${this._t(`${PREFIX}.badge_installed`)}</span
                      >`
                    : nothing
                }
                ${
                  release.build === newest
                    ? html`<span class="badge"
                        >${this._t(`${PREFIX}.badge_newest`)}</span
                      >`
                    : nothing
                }
                ${
                  isPublishedRelease(release)
                    ? html`<span class="badge"
                        >${this._t(`${PREFIX}.badge_release`)}</span
                      >`
                    : nothing
                }
              </div>
              <span class="quiet">${this._date(release.date)}</span>
            </header>
            ${
              release.truncated
                ? html`<p class="quiet">${this._t(`${PREFIX}.truncated`)}</p>`
                : nothing
            }
            ${
              release.changes.length
                ? html`<ul class="changes">
                    ${release.changes.map((change) =>
                      this._renderChange(release, change)
                    )}
                  </ul>`
                : html`<p class="quiet">${this._t(`${PREFIX}.no_changes`)}</p>`
            }
          </section>
        `
      )}
    </div>`;
  }

  private _renderChange(
    release: ReleaseEntry,
    change: ChangeEntry
  ): TemplateResult {
    const key = this._key(release, change);
    const details = detailsForMode(change, this._lang.mode);
    const open = this._expanded.has(key) && details.length > 0;
    const meta = html`<span class="meta">
      ${change.areas.map(
        (area) => html`<span class="area">${this._areaLabel(area)}</span>`
      )}
      ${
        change.date
          ? html`<span class="quiet">${this._date(change.date)}</span>`
          : nothing
      }
      ${
        change.sha
          ? html`<code
              class="sha"
              aria-label=${this._t(`${PREFIX}.commit`, { sha: change.sha })}
              >${change.sha.slice(0, 9)}</code
            >`
          : nothing
      }
    </span>`;
    return html`<li class="change">
      ${
        details.length
          ? html`<button
              type="button"
              class="change-main"
              aria-expanded=${open ? "true" : "false"}
              .changeKey=${key}
              @click=${this._toggleChange}
            >
              <span class="change-text">
                <span class="change-title">${change.title}</span>
                ${meta}
              </span>
              <ha-svg-icon
                class="chevron ${classMap({ open })}"
                .path=${mdiChevronDown}
              ></ha-svg-icon>
            </button>`
          : html`<div class="change-main plain">
              <span class="change-text">
                <span class="change-title">${change.title}</span>
                ${meta}
              </span>
            </div>`
      }
      ${
        open
          ? html`<div class="detail">
              ${details.map(
                (paragraph) =>
                  html`<p
                    lang=${paragraph === change.detailYue ? "zh-HK" : "en"}
                  >
                    ${paragraph}
                  </p>`
              )}
            </div>`
          : nothing
      }
    </li>`;
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          display: block;
        }
        ha-card {
          box-sizing: border-box;
          padding: var(--ha-space-5) var(--ha-space-6);
          border-radius: var(--ha-border-radius-3xl);
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
        }
        h2,
        h3 {
          margin: 0;
          font-weight: var(--ha-font-weight-medium);
        }
        h2 {
          font-size: var(--ha-font-size-l);
        }
        h3 {
          font-size: var(--ha-font-size-m);
        }
        p {
          margin: 0;
        }
        ha-button {
          --ha-button-height: 48px;
        }
        .quiet {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
          overflow-wrap: anywhere;
        }
        .loading {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          color: var(--secondary-text-color);
        }
        .pickers {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--ha-space-3);
        }
        .quick {
          grid-column: 1 / -1;
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
        }
        ha-select {
          min-width: 0;
        }
        table.compare {
          width: 100%;
          border-collapse: collapse;
          font-size: var(--ha-font-size-s);
        }
        .compare th,
        .compare td {
          padding: var(--ha-space-2) var(--ha-space-3);
          text-align: start;
          vertical-align: top;
          border-block-end: 1px solid var(--divider-color);
          overflow-wrap: anywhere;
        }
        .compare thead th {
          color: var(--secondary-text-color);
          font-weight: var(--ha-font-weight-medium);
        }
        .compare tbody th {
          width: 30%;
          font-weight: var(--ha-font-weight-medium);
        }
        .compare tbody td {
          font-variant-numeric: tabular-nums;
        }
        @media (max-width: 600px) {
          .compare,
          .compare tbody,
          .compare tr {
            display: block;
          }
          .compare thead {
            position: absolute;
            width: 1px;
            height: 1px;
            overflow: hidden;
            clip-path: inset(50%);
          }
          .compare tr {
            padding-block: var(--ha-space-2);
            border-block-end: 1px solid var(--divider-color);
          }
          .compare th,
          .compare td {
            display: block;
            width: auto !important;
            padding: var(--ha-space-1) 0;
            border: none;
          }
          .compare tbody td:not(.span) {
            display: grid;
            grid-template-columns: 4.5em minmax(0, 1fr);
            gap: var(--ha-space-2);
          }
          .compare tbody td:not(.span)::before {
            content: attr(data-label);
            color: var(--secondary-text-color);
          }
        }
        :host([narrow]) .pickers {
          grid-template-columns: minmax(0, 1fr);
        }
        .summary {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
        }
        .filters {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
        }
        .chips {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
        }
        .chip {
          display: inline-flex;
          align-items: center;
          gap: var(--ha-space-2);
          min-height: 48px;
          padding-inline: var(--ha-space-4);
          border: 1px solid var(--outline-color, var(--divider-color));
          border-radius: var(--ha-border-radius-pill);
          background: none;
          color: var(--primary-text-color);
          font: inherit;
          font-size: var(--ha-font-size-s);
          cursor: pointer;
        }
        .chip.on {
          background: color-mix(
            in srgb,
            var(--primary-color) 22%,
            var(--card-background-color)
          );
          border-color: var(--primary-color);
          font-weight: var(--ha-font-weight-medium);
        }
        .chip .count {
          font-variant-numeric: tabular-nums;
          color: var(--secondary-text-color);
        }
        .tools {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
        }
        button:focus-visible {
          outline: 3px solid var(--primary-color);
          outline-offset: 2px;
        }
        .empty {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: var(--ha-space-2);
          color: var(--secondary-text-color);
        }
        .groups {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-5);
        }
        .group header {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2) var(--ha-space-3);
          margin-block-end: var(--ha-space-2);
        }
        .group h3 {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          gap: var(--ha-space-2);
        }
        .badges {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-1);
        }
        .badge {
          padding: 2px var(--ha-space-2);
          border-radius: var(--ha-border-radius-pill);
          background: var(--secondary-background-color);
          font-size: var(--ha-font-size-s);
        }
        .changes {
          margin: 0;
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
        }
        .change {
          border-radius: var(--ha-border-radius-xl);
          background: var(--secondary-background-color);
        }
        .change-main {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          box-sizing: border-box;
          width: 100%;
          min-height: 48px;
          padding: var(--ha-space-2) var(--ha-space-3);
          border: none;
          border-radius: var(--ha-border-radius-xl);
          background: none;
          color: inherit;
          font: inherit;
          text-align: start;
        }
        button.change-main {
          cursor: pointer;
        }
        .change-text {
          display: flex;
          flex: 1;
          flex-direction: column;
          gap: var(--ha-space-1);
          min-width: 0;
        }
        .change-title {
          overflow-wrap: anywhere;
        }
        .meta {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-1) var(--ha-space-2);
        }
        .area {
          padding: 0 var(--ha-space-2);
          border-radius: var(--ha-border-radius-pill);
          border: 1px solid var(--divider-color);
          font-size: var(--ha-font-size-s);
        }
        .sha {
          font-family: var(--ha-font-family-code, monospace);
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .chevron {
          flex: none;
          color: var(--secondary-text-color);
          transition: transform var(--ha-animation-duration-fast, 150ms);
        }
        .chevron.open {
          transform: rotate(180deg);
        }
        .detail {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
          padding: 0 var(--ha-space-3) var(--ha-space-3);
          line-height: var(--ha-line-height-normal);
          overflow-wrap: anywhere;
        }
        @media (prefers-reduced-motion: reduce) {
          .chevron {
            transition: none;
          }
        }
        @media (max-width: 480px) {
          ha-card {
            padding: var(--ha-space-4);
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-update-changes": HaUpdateChanges;
  }
}
