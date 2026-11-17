import { mdiCheck, mdiChevronDown, mdiContentCopy, mdiRefresh } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { copyToClipboard } from "../../../../common/util/copy-clipboard";
import { formatDateTime } from "../../../../common/datetime/format_date_time";
import { formatTime } from "../../../../common/datetime/format_time";
import { LanguageModeController } from "../../../../common/language-mode/language-mode-controller";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
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
  areaShares,
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
  timeApart,
} from "../../../../data/build-changes";
import { parseBuildNumber } from "../../../../data/build-progress";
import type { PublicFetchFailure } from "../../../../data/public-json";
import { haMotionKeyframes } from "../../../../resources/motion-styles";
import { haStyle } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import { showToast } from "../../../../util/toast";
import "./ha-update-notes";

const PREFIX = "ui.panel.config.updates.compare";
const DATA_PREFIX = "ui.panel.config.updates.build_data";

/**
 * "What changed": a comparison of two builds and the list of changes between
 * them, read from the public change list.
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
      <section class="panel" aria-labelledby="compare-title">
        <div class="head">
          <h2 id="compare-title">${this._t(`${PREFIX}.title`)}</h2>
          ${this._renderRangeSwitch()}
        </div>
        <p class="quiet intro">${this._t(`${PREFIX}.intro`)}</p>
        ${this._renderBody()}
        <p class="quiet">${this._t(`${DATA_PREFIX}.privacy`)}</p>
      </section>
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
      ${
        this._belowList
          ? html`<ha-alert alert-type="info">
              ${this._t(`${PREFIX}.below_list`)}
            </ha-alert>`
          : nothing
      }
      ${this._renderBlocks(list, range)}
      <div class="sr-only" role="status">${this._summaryText(range)}</div>
      <div class="controls">
        ${this._renderAreas(byQuery)} ${this._renderSearch(range, visible)}
      </div>
      <ha-update-notes .hass=${this.hass} .build=${this._to}></ha-update-notes>
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

  // The range as a segmented control: it is pressed while the pickers agree
  // with it, and the pickers below still allow any other pair of builds.
  private _renderRangeSwitch(): TemplateResult | typeof nothing {
    const list = this._list;
    const newest = list?.releases[0];
    if (!list || !newest || this._failure) {
      return nothing;
    }
    const start = defaultFromBuild(list.releases, this._installedBuild());
    const older = list.releases.find((release) => release.build < newest.build);
    const installedRange =
      this._from === (start.build ?? newest.build) && this._to === newest.build;
    const latestRange =
      this._from === (older?.build ?? newest.build) &&
      this._to === newest.build;
    return html`
      <div
        class="segmented"
        role="group"
        aria-label=${this._t(`${PREFIX}.range_label`)}
      >
        <button
          type="button"
          class=${classMap({ on: installedRange })}
          aria-pressed=${installedRange ? "true" : "false"}
          @click=${this._quickInstalled}
        >
          ${this._t(`${PREFIX}.quick_installed`)}
        </button>
        <button
          type="button"
          class=${classMap({ on: latestRange && !installedRange })}
          aria-pressed=${latestRange && !installedRange ? "true" : "false"}
          @click=${this._quickLatest}
        >
          ${this._t(`${PREFIX}.quick_latest`)}
        </button>
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

  private _summaryText(range: ReleaseEntry[]): string {
    const total = countChanges(range);
    const shown = countChanges(this._currentVisible());
    const filtering = isFiltering({ areas: this._areas, query: this._query });
    const base =
      this._from === this._to
        ? this._t(`${PREFIX}.summary_same`, { build: this._from! })
        : this._t(`${PREFIX}.summary`, {
            changes: total,
            builds: range.length,
            from: this._from!,
            to: this._to!,
          });
    return filtering
      ? `${base}. ${this._t(`${PREFIX}.summary_filtered`, { shown, total })}`
      : base;
  }

  private _renderFacts(
    release: ReleaseEntry | undefined,
    onPrimary: boolean
  ): TemplateResult {
    const row = (label: string, value: string, mono: boolean) =>
      html`<dt>${label}</dt>
        <dd class=${classMap({ mono })}>${value}</dd>`;
    return html`
      <dl class="facts ${classMap({ "on-primary": onPrimary })}">
        ${row(this._t(`${PREFIX}.row_core`), release?.core ?? "", true)}
        ${row(this._t(`${PREFIX}.row_supervisor`), release?.supervisor ?? "", true)}
        ${row(this._t(`${PREFIX}.row_os`), release?.os ?? "", true)}
        ${row(this._t(`${PREFIX}.row_date`), release ? this._date(release.date) : "", false)}
        ${row(this._t(`${PREFIX}.row_source`), release?.source ?? "", true)}
        ${
          release
            ? row(
                this._t(`${PREFIX}.row_kind`),
                this._t(
                  isPublishedRelease(release)
                    ? `${PREFIX}.kind_release`
                    : `${PREFIX}.kind_feed`
                ),
                false
              )
            : nothing
        }
      </dl>
    `;
  }

  private _renderBlocks(
    list: ChangeList,
    range: ReleaseEntry[]
  ): TemplateResult {
    const from = findRelease(list.releases, this._from);
    const to = findRelease(list.releases, this._to);
    const options: HaSelectOption[] = list.releases.map((release) => ({
      value: release.build,
      label: this._optionLabel(release.build, list),
    }));
    const apart = timeApart(from?.date, to?.date);
    const total = countChanges(range);
    return html`
      <div class="blocks">
        <div class="block from" style=${styleMap({ "--i": "0" })}>
          <ha-select
            .label=${this._t(`${PREFIX}.from`)}
            .value=${this._from}
            .options=${options}
            @selected=${this._fromChanged}
          ></ha-select>
          <div class="build-number">${this._from}</div>
          ${this._renderFacts(from, false)}
        </div>
        <div class="block count" style=${styleMap({ "--i": "1" })}>
          <div class="huge">${total}</div>
          <div class="count-label">
            ${this._t(
              `${PREFIX}.${total === 1 ? "block_change_one" : "block_changes"}`,
              { builds: range.length }
            )}
          </div>
          ${
            apart && this._from !== this._to
              ? html`<div class="count-note">
                  ${this._t(`${PREFIX}.apart`, {
                    days: apart.days,
                    hours: apart.hours,
                    minutes: apart.minutes,
                  })}
                </div>`
              : nothing
          }
        </div>
        <div class="block to" style=${styleMap({ "--i": "2" })}>
          <ha-select
            .label=${this._t(`${PREFIX}.to`)}
            .value=${this._to}
            .options=${options}
            @selected=${this._toChanged}
          ></ha-select>
          <div class="build-number">${this._to}</div>
          ${this._renderFacts(to, true)}
        </div>
      </div>
    `;
  }

  private _renderAreas(byQuery: ReleaseEntry[]): TemplateResult {
    const counts = countByArea(byQuery);
    const shares = areaShares(counts);
    const areas = [
      ...CHANGE_AREAS.filter((area) => counts[area] || this._areas.has(area)),
      ...Object.keys(counts).filter(
        (area) => !(CHANGE_AREAS as readonly string[]).includes(area)
      ),
    ].sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
    return html`
      <div
        class="areas"
        role="group"
        aria-label=${this._t(`${PREFIX}.areas_label`)}
      >
        <div class="areas-hint">${this._t(`${PREFIX}.parts_hint`)}</div>
        ${
          areas.length
            ? areas.map((area) => {
                const on = this._areas.has(area);
                return html`<button
                  type="button"
                  class="bar ${classMap({ on })}"
                  aria-pressed=${on ? "true" : "false"}
                  .area=${area}
                  @click=${this._toggleArea}
                >
                  <i
                    aria-hidden="true"
                    style=${styleMap({ width: `${shares[area] ?? 0}%` })}
                  ></i>
                  <span class="bar-label">
                    ${on ? html`<ha-svg-icon .path=${mdiCheck}></ha-svg-icon>` : nothing}
                    ${this._areaLabel(area)}
                  </span>
                  <b class="bar-count">${counts[area] ?? 0}</b>
                </button>`;
              })
            : html`<p class="quiet">${this._t(`${PREFIX}.no_changes`)}</p>`
        }
      </div>
    `;
  }

  private _renderSearch(
    range: ReleaseEntry[],
    visible: ReleaseEntry[]
  ): TemplateResult {
    const samples = range.flatMap((release) =>
      release.changes.map((change) => change.title)
    );
    const total = countChanges(range);
    const shown = countChanges(visible);
    const filtering = isFiltering({ areas: this._areas, query: this._query });
    const names = [...this._areas]
      .map((area) => this._areaLabel(area))
      .join(", ");
    return html`
      <div class="search-col">
        <ha-input-search
          appearance="outlined"
          .value=${this._query}
          .label=${this._t(`${PREFIX}.search`)}
          .placeholder=${this._t(`${PREFIX}.search`)}
          .patternSamples=${samples}
          @input=${this._queryChanged}
        ></ha-input-search>
        <div class="tools">
          <ha-button appearance="outlined" @click=${this._expandAll}>
            ${this._t(`${PREFIX}.expand_all`)}
          </ha-button>
          <ha-button appearance="outlined" @click=${this._collapseAll}>
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
        <div class="showing">
          <div class="tile-label">${this._t(`${PREFIX}.showing`)}</div>
          <div class="medium">
            ${
              filtering
                ? this._t(`${PREFIX}.showing_count`, { shown, total })
                : this._t(`${PREFIX}.showing_all`, { total })
            }
          </div>
          <div class="tile-label">
            ${names ? `${names}. ` : ""}${this._t(`${PREFIX}.showing_hint`)}
          </div>
          ${
            filtering
              ? html`<ha-button appearance="plain" @click=${this._clearFilters}>
                  ${this._t(`${PREFIX}.clear_filters`)}
                </ha-button>`
              : nothing
          }
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
    const full = new Map(range.map((release) => [release.build, release]));
    return html`<div class="groups">
      ${visible.map((release) => {
        const all = full.get(release.build)?.changes.length ?? 0;
        return html`
          <section
            class="group"
            aria-label=${this._t(`${PREFIX}.group_title`, {
              build: release.build,
            })}
          >
            <header>
              <span class="group-number">${release.build}</span>
              <div class="badges">
                ${
                  release.build === newest
                    ? html`<span class="badge on"
                        >${this._t(`${PREFIX}.badge_newest`)}</span
                      >`
                    : nothing
                }
                ${
                  release.build === installed
                    ? html`<span class="badge"
                        >${this._t(`${PREFIX}.badge_installed`)}</span
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
              <span class="quiet"
                >${this._date(release.date)}.
                ${this._t(`${PREFIX}.group_count`, { count: all })}${
                  release.changes.length !== all
                    ? html`,
                      ${this._t(`${PREFIX}.group_shown`, {
                        shown: release.changes.length,
                      })}`
                    : nothing
                }</span
              >
              <span class="quiet core"
                >${this._t(`${PREFIX}.group_core`, { core: release.core })}</span
              >
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
        `;
      })}
      ${
        installed !== undefined && installed === this._from
          ? html`<div class="start-note">
              ${this._t(`${PREFIX}.start_note`, { build: installed })}
            </div>`
          : nothing
      }
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
      haMotionKeyframes,
      css`
        :host {
          display: block;
        }
        .panel {
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-5);
          padding: clamp(20px, 3vw, 32px);
          border-radius: calc(var(--ha-border-radius-6xl) + 4px);
          background: var(--card-background-color);
        }
        h2,
        h3 {
          margin: 0;
        }
        h2 {
          font-family: var(--ha-font-family-heading, inherit);
          font-size: clamp(28px, 4.4vw, 44px);
          font-weight: var(--ha-font-weight-bold);
          line-height: 1.05;
          letter-spacing: -0.01em;
        }
        p {
          margin: 0;
        }
        ha-button {
          --ha-button-height: 52px;
        }
        .head {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          justify-content: space-between;
          gap: var(--ha-space-3);
        }
        .intro {
          margin-top: calc(var(--ha-space-3) * -1);
        }
        .quiet {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
          overflow-wrap: anywhere;
        }
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip-path: inset(50%);
          white-space: nowrap;
        }
        .loading {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          color: var(--secondary-text-color);
        }
        /* The range as a segmented control. */
        .segmented {
          display: inline-flex;
          flex-wrap: wrap;
          padding: 4px;
          border-radius: var(--ha-border-radius-6xl);
          background: var(--secondary-background-color);
        }
        .segmented button {
          min-height: 48px;
          padding: 0 20px;
          border: none;
          border-radius: var(--ha-border-radius-5xl);
          background: transparent;
          color: var(--primary-text-color);
          font: inherit;
          font-weight: var(--ha-font-weight-medium);
          cursor: pointer;
          transition:
            background-color var(--ha-animation-duration-normal, 250ms)
              var(--ha-motion-ease, ease),
            color var(--ha-animation-duration-normal, 250ms)
              var(--ha-motion-ease, ease);
        }
        .segmented button.on {
          background: var(--primary-color);
          color: var(--text-primary-color, #fff);
          font-weight: var(--ha-font-weight-bold);
        }
        button:focus-visible {
          outline: 3px solid var(--primary-color);
          outline-offset: 3px;
        }
        /* From, how many, To. */
        .blocks {
          display: grid;
          grid-template-columns: repeat(
            auto-fit,
            minmax(min(100%, 280px), 1fr)
          );
          gap: var(--ha-space-4);
          align-items: stretch;
        }
        .block {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
          min-width: 0;
          padding: var(--ha-space-6);
          border-radius: var(--ha-border-radius-6xl);
          background: var(--secondary-background-color);
          animation: ha-pop var(--ha-animation-duration-enter, 450ms)
            var(--ha-motion-spring, ease) both;
          animation-delay: calc(var(--i, 0) * 80ms);
        }
        .block.to {
          background: color-mix(
            in srgb,
            var(--primary-color) 28%,
            var(--card-background-color)
          );
        }
        .block.count {
          align-items: center;
          justify-content: center;
          text-align: center;
          gap: var(--ha-space-1);
          background: color-mix(
            in srgb,
            var(--accent-color, var(--primary-color)) 22%,
            var(--card-background-color)
          );
        }
        ha-select {
          min-width: 0;
        }
        .build-number {
          font-size: 56px;
          line-height: 1;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
        }
        .huge {
          font-size: clamp(72px, 12vw, 120px);
          line-height: 0.95;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
        }
        .count-label {
          font-size: var(--ha-font-size-xl);
          font-weight: var(--ha-font-weight-bold);
        }
        .count-note {
          font-size: var(--ha-font-size-s);
        }
        .facts {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 4px 14px;
          margin: 0;
          font-size: var(--ha-font-size-s);
        }
        .facts dt {
          color: var(--secondary-text-color);
        }
        .facts dd {
          margin: 0;
          overflow-wrap: anywhere;
        }
        .facts dd.mono {
          font-family: var(--ha-font-family-code, monospace);
        }
        .facts.on-primary dt {
          color: var(--primary-text-color);
        }
        /* Where the changes are, and the search. */
        .controls {
          display: grid;
          grid-template-columns: repeat(
            auto-fit,
            minmax(min(100%, 340px), 1fr)
          );
          gap: var(--ha-space-4);
        }
        .areas {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 0;
          padding: var(--ha-space-5);
          border-radius: var(--ha-border-radius-6xl);
          background: var(--secondary-background-color);
        }
        .areas-hint {
          padding: 0 4px 6px;
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-medium);
          color: var(--secondary-text-color);
        }
        .bar {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--ha-space-3);
          min-height: 48px;
          padding: 0 14px;
          overflow: hidden;
          border: 2px solid transparent;
          border-radius: var(--ha-border-radius-xl);
          background: var(--card-background-color);
          color: var(--primary-text-color);
          font: inherit;
          text-align: start;
          cursor: pointer;
        }
        .bar i {
          position: absolute;
          inset-block: 0;
          inset-inline-start: 0;
          background: color-mix(
            in srgb,
            var(--primary-color) 22%,
            var(--card-background-color)
          );
          transform-origin: left;
          animation: bar-grow var(--ha-animation-duration-enter, 450ms)
            var(--ha-motion-ease, ease-out) both;
        }
        :host-context([dir="rtl"]) .bar i {
          transform-origin: right;
        }
        @keyframes bar-grow {
          from {
            transform: scaleX(0);
          }
        }
        .bar.on {
          border-color: var(--primary-color);
          font-weight: var(--ha-font-weight-bold);
        }
        .bar.on i {
          background: color-mix(
            in srgb,
            var(--primary-color) 48%,
            var(--card-background-color)
          );
        }
        .bar-label {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: var(--ha-space-2);
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .bar-label ha-svg-icon {
          --mdc-icon-size: 20px;
          color: var(--primary-color);
        }
        .bar-count {
          position: relative;
          font-variant-numeric: tabular-nums;
        }
        .search-col {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
          min-width: 0;
        }
        ha-input-search {
          --ha-input-search-height: 64px;
          --ha-input-search-border-radius: var(--ha-border-radius-6xl);
        }
        .tools {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
        }
        .tools ha-button {
          flex: 1 1 140px;
        }
        .showing {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: var(--ha-space-1);
          padding: var(--ha-space-4) var(--ha-space-5);
          border-radius: var(--ha-border-radius-4xl);
          background: var(--secondary-background-color);
        }
        .tile-label {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .medium {
          font-size: 28px;
          font-weight: 800;
          line-height: 1.15;
        }
        .empty {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: var(--ha-space-2);
          color: var(--secondary-text-color);
        }
        /* The list, grouped by build. */
        .groups {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-6);
        }
        .group header {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2) var(--ha-space-3);
          margin-block-end: var(--ha-space-3);
        }
        .group-number {
          font-size: 32px;
          line-height: 1;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
        }
        .badges {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-1);
        }
        .badge {
          display: inline-flex;
          align-items: center;
          min-height: 28px;
          padding: 0 12px;
          border-radius: var(--ha-border-radius-lg);
          background: var(--secondary-background-color);
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-bold);
        }
        .badge.on {
          background: var(--primary-color);
          color: var(--text-primary-color, #fff);
        }
        .changes {
          margin: 0;
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        .change {
          border-radius: var(--ha-border-radius-4xl);
          background: var(--secondary-background-color);
        }
        .change-main {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          box-sizing: border-box;
          width: 100%;
          min-height: 56px;
          padding: var(--ha-space-2) var(--ha-space-5);
          border: none;
          border-radius: var(--ha-border-radius-4xl);
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
          font-size: var(--ha-font-size-l);
          font-weight: var(--ha-font-weight-medium);
          overflow-wrap: anywhere;
        }
        .meta {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-1) var(--ha-space-2);
        }
        .area {
          padding: 0 10px;
          border-radius: var(--ha-border-radius-lg);
          background: color-mix(
            in srgb,
            var(--primary-color) 22%,
            var(--card-background-color)
          );
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-medium);
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
          padding: 0 var(--ha-space-5) var(--ha-space-4);
          max-width: 76ch;
          color: var(--secondary-text-color);
          line-height: var(--ha-line-height-normal);
          overflow-wrap: anywhere;
        }
        .start-note {
          padding: 14px 18px;
          border-radius: var(--ha-border-radius-2xl);
          border: 2px dashed var(--divider-color);
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
        }
        @media (prefers-reduced-motion: reduce) {
          .chevron,
          .segmented button {
            transition: none;
          }
          .block,
          .bar i {
            animation: none;
          }
        }
        @media (max-width: 480px) {
          .panel {
            padding: var(--ha-space-4);
          }
          .block {
            padding: var(--ha-space-5);
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
