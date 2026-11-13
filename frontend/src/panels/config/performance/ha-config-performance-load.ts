import {
  mdiChartLine,
  mdiCheckCircleOutline,
  mdiCloudAlert,
  mdiCloudCheck,
  mdiCloudOff,
  mdiImage,
  mdiPuzzle,
  mdiRefresh,
  mdiSpeedometer,
  mdiTimerOutline,
  mdiTimerSandComplete,
  mdiViewDashboardOutline,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { relativeTime } from "../../../common/datetime/relative_time";
import { navigate } from "../../../common/navigate";
import { formatNumber } from "../../../common/number/format_number";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-svg-icon";
import {
  fetchConfig,
  isStrategyDashboard,
  saveConfig,
} from "../../../data/lovelace/config/types";
import { fetchResources } from "../../../data/lovelace/resource";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-subpage";
import type { HomeAssistant } from "../../../types";
import { bytesToString } from "../../../util/bytes-to-string";
import { showToast } from "../../../util/toast";
import type { WorkerHealth, WorkerVerdict } from "../../../util/worker-health";
import {
  countStalls,
  readStalls,
  readWorkerHealth,
  workerVerdict,
} from "../../../util/worker-health";
import type { LoadSample } from "../../lovelace/common/load-diagnostics";
import {
  clearLoadSample,
  getLoadSample,
  LOAD_WINDOW_MS,
} from "../../lovelace/common/load-diagnostics";
import type { Finding, ResourceTiming, TimingEntry } from "./perf-findings";
import {
  applyFix,
  buildFindings,
  customResourceTimings,
  ownFileTimings,
  summarizeLoad,
} from "./perf-findings";
import { performanceStyles } from "./performance-styles";

const P = "ui.panel.config.performance.";

const FINDING_ICONS: Record<Finding["kind"], string> = {
  "history-span": mdiChartLine,
  "statistics-span": mdiChartLine,
  "slow-card": mdiViewDashboardOutline,
  "large-image": mdiImage,
  "custom-resource": mdiPuzzle,
};

const VERDICT_TEXT: Record<WorkerVerdict, string> = {
  healthy: "cache_healthy",
  attention: "cache_attention",
  inactive: "cache_inactive",
  unsupported: "cache_unsupported",
};

const VERDICT_TONE: Record<WorkerVerdict, string> = {
  healthy: "success",
  attention: "warning",
  inactive: "warning",
  unsupported: "neutral",
};

const VERDICT_ICON: Record<WorkerVerdict, string> = {
  healthy: mdiCloudCheck,
  attention: mdiCloudAlert,
  inactive: mdiCloudOff,
  unsupported: mdiCloudOff,
};

/** Why the dashboard was slow to open on this device, from what this browser measured. */
@customElement("ha-config-performance-load")
export class HaConfigPerformanceLoad extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() private _sample?: LoadSample;

  @state() private _findings: Finding[] = [];

  @state() private _ownFiles: ResourceTiming[] = [];

  @state() private _resources?: ResourceTiming[];

  @state() private _resourceCount = 0;

  @state() private _verdict?: WorkerVerdict;

  @state() private _fixable = new Set<string>();

  @state() private _fixed = new Set<string>();

  @state() private _note?: "yaml" | "strategy";

  @state() private _busy?: string;

  @state() private _error?: string;

  private _started = false;

  protected willUpdate(changed: PropertyValues<this>) {
    if (!this._started && this.hass) {
      this._started = true;
      this._load();
    }
    super.willUpdate(changed);
  }

  private _time(ms: number): string {
    const value = ms >= 1000 ? ms / 1000 : ms;
    return this.hass.localize(
      ms >= 1000 ? `${P}duration_s` : `${P}duration_ms`,
      {
        value: formatNumber(value, this.hass.locale, {
          maximumFractionDigits: ms >= 1000 ? 1 : 0,
        }),
      }
    );
  }

  private _span(hours: number): string {
    return hours >= 48
      ? this.hass.localize(`${P}span_days`, { count: Math.round(hours / 24) })
      : this.hass.localize(`${P}span_hours`, { count: Math.round(hours) });
  }

  private async _load() {
    const sample = getLoadSample();
    this._sample = sample;
    const entries = performance.getEntriesByType(
      "resource"
    ) as unknown as TimingEntry[];
    this._ownFiles = ownFileTimings(entries, location.origin);

    const [resources, health] = await Promise.all([
      fetchResources(this.hass.connection).catch(() => undefined),
      readWorkerHealth(0).catch(() => undefined),
    ]);
    if (resources) {
      this._resourceCount = resources.length;
      this._resources = customResourceTimings(
        resources.map((resource) => resource.url),
        entries,
        location.origin
      );
    }
    if (health) {
      this._verdict = workerVerdict(
        health as WorkerHealth,
        countStalls(readStalls(), 7, Date.now())
      );
    }
    if (sample) {
      this._findings = buildFindings(sample, this._resources ?? []);
      await this._checkFixes(sample);
    }
  }

  /** Which findings can really be fixed: the stored dashboard has a matching card or picture. */
  private async _checkFixes(sample: LoadSample) {
    const fixes = this._findings.filter((finding) => finding.fix);
    if (!fixes.length) {
      return;
    }
    if (sample.mode !== "storage") {
      this._note = "yaml";
      return;
    }
    try {
      const config = await fetchConfig(
        this.hass.connection,
        sample.urlPath,
        false
      );
      if (isStrategyDashboard(config)) {
        this._note = "strategy";
        return;
      }
      this._fixable = new Set(
        fixes
          .filter((finding) => applyFix(config, finding.fix!, location.origin))
          .map((finding) => finding.id)
      );
    } catch (_err) {
      // The dashboard could not be read; no fix is offered.
    }
  }

  protected render(): TemplateResult {
    const sample = this._sample;
    const l = (key: string, args?: Record<string, string | number>) =>
      this.hass.localize(`${P}${key}` as any, args);
    return html`
      <hass-subpage
        back-path="/config/system"
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${l("load.title")}
        .breadcrumb=${[
          this.hass.localize("panel.config"),
          this.hass.localize("ui.panel.config.dashboard.system.main"),
          l("caption"),
        ].join(", ")}
        .summary=${
          sample
            ? l("load.summary", {
                path: sample.path,
                time: relativeTime(
                  new Date(sample.startedAt),
                  this.hass.locale
                ),
              })
            : l("load.summary_none")
        }
      >
        <div class="page">
          ${this._error ? html`<ha-alert alert-type="error">${this._error}</ha-alert>` : nothing}
          ${sample ? this._renderMeasured(sample) : this._renderEmpty()}
        </div>
      </hass-subpage>
    `;
  }

  private _renderEmpty(): TemplateResult {
    return html`
      <div class="card empty">
        <ha-svg-icon .path=${mdiSpeedometer}></ha-svg-icon>
        <b>${this.hass.localize(`${P}load.empty_title`)}</b>
        <p class="note">${this.hass.localize(`${P}load.empty_text`)}</p>
        <ha-button @click=${this._openDashboard}>
          ${this.hass.localize(`${P}load.open_dashboard`)}
        </ha-button>
      </div>
      ${this._renderCache()}
    `;
  }

  private _renderMeasured(sample: LoadSample): TemplateResult {
    const summary = summarizeLoad(sample);
    const l = (key: string, args?: Record<string, string | number>) =>
      this.hass.localize(`${P}${key}` as any, args);
    return html`
      <div class="toolbar">
        <ha-button appearance="plain" @click=${this._forget}>
          ${l("load.forget")}
        </ha-button>
        <ha-button @click=${this._measureAgain}>
          <ha-svg-icon slot="start" .path=${mdiRefresh}></ha-svg-icon>
          ${l("load.measure_again")}
        </ha-button>
      </div>
      <div class="stats">
        ${this._renderStat(
          l("load.stat_first"),
          summary.firstCardsMs,
          mdiTimerOutline,
          1500,
          3000
        )}
        ${this._renderStat(
          l("load.stat_all"),
          summary.allCardsMs,
          mdiTimerSandComplete,
          4000,
          8000
        )}
        ${this._renderCache()}
      </div>
      <div class="card">
        <h3>${l("load.findings")}</h3>
        ${this._renderFindings()}
      </div>
      <div class="cards">
        <div class="card">
          <h3>${l("load.measured_title")}</h3>
          ${this._renderFacts(sample)}
          <p class="note">${l("load.private")}</p>
        </div>
        <div class="card">
          <h3>${l("load.files_title")}</h3>
          ${this._renderFiles()}
        </div>
        ${this._renderResources()}
      </div>
    `;
  }

  private _renderStat(
    label: string,
    ms: number | undefined,
    icon: string,
    warnAt: number,
    errorAt: number
  ): TemplateResult {
    const tone =
      ms === undefined
        ? "neutral"
        : ms >= errorAt
          ? "error"
          : ms >= warnAt
            ? "warning"
            : "success";
    return html`<div class="stat tone-${tone}">
      <span class="label"
        ><ha-svg-icon .path=${icon}></ha-svg-icon>${label}</span
      >
      <span class="value"
        >${
          ms === undefined
            ? this.hass.localize(`${P}load.stat_unknown`)
            : this._time(ms)
        }</span
      >
    </div>`;
  }

  /** The third tile: how the offline copy of the app is doing, linking to its page. */
  private _renderCache(): TemplateResult {
    const verdict = this._verdict;
    const tone = verdict ? VERDICT_TONE[verdict] : "neutral";
    return html`<a class="stat tone-${tone}" href="/config/performance/cache">
      <span class="label"
        ><ha-svg-icon
          .path=${verdict ? VERDICT_ICON[verdict] : mdiCloudCheck}
        ></ha-svg-icon
        >${this.hass.localize(`${P}load.stat_cache`)}</span
      >
      <span class="value"
        >${
          verdict
            ? this.hass.localize(`${P}load.${VERDICT_TEXT[verdict]}` as any)
            : this.hass.localize(`${P}load.stat_unknown`)
        }</span
      >
    </a>`;
  }

  private _renderFindings(): TemplateResult {
    if (!this._findings.length) {
      return html`<div class="row">
        <span class="tile tone-success"
          ><ha-svg-icon .path=${mdiCheckCircleOutline}></ha-svg-icon
        ></span>
        <div class="text">
          <span class="title"
            >${this.hass.localize(`${P}load.nothing_slow_title`)}</span
          >
          <span class="sub"
            >${this.hass.localize(`${P}load.nothing_slow_detail`)}</span
          >
        </div>
      </div>`;
    }
    return html`<ul>
      ${this._findings.map((finding) => this._renderFinding(finding))}
    </ul>`;
  }

  private _findingText(finding: Finding): { title: string; detail: string } {
    const a = finding.args;
    const t = (key: string, args?: Record<string, string | number>) =>
      this.hass.localize(`${P}load.${key}` as any, args);
    const entities = this.hass.localize(`${P}entity_count`, {
      count: Number(a.entities ?? 0),
    });
    switch (finding.kind) {
      case "history-span":
        return {
          title: t("history_title", { span: this._span(Number(a.hours)) }),
          detail: t("history_detail", {
            time: this._time(finding.ms),
            entities,
            limit: Number(a.limit),
          }),
        };
      case "statistics-span":
        return {
          title: t("statistics_title", { span: this._span(Number(a.hours)) }),
          detail: t("statistics_detail", {
            time: this._time(finding.ms),
            entities,
            limit: Number(a.limit),
          }),
        };
      case "slow-card": {
        const label = String(a.label);
        const type = String(a.type);
        return {
          title:
            label && label !== type
              ? t("slow_card_title", { type, label })
              : t("slow_card_title_unnamed", { type }),
          detail: t("slow_card_detail", { time: this._time(finding.ms) }),
        };
      }
      case "large-image":
        return {
          title: t("large_image_title", {
            natural: Number(a.natural),
            shown: Number(a.shown),
          }),
          detail: `${t("large_image_detail", {
            path: String(a.path),
            megabytes: Number(a.megabytes),
          })}. ${t(finding.fix ? "large_image_hint_fix" : "large_image_hint")}`,
        };
      default: {
        const url = String(a.url);
        return {
          title: t("resource_title", {
            name: url.substring(url.lastIndexOf("/") + 1) || url,
          }),
          detail: `${t("resource_detail", {
            time: this._time(finding.ms),
            size: bytesToString(Number(a.kilobytes) * 1000, 0),
          })}. ${t("resource_hint")}`,
        };
      }
    }
  }

  private _renderFinding(finding: Finding): TemplateResult {
    const text = this._findingText(finding);
    const fixed = this._fixed.has(finding.id);
    const canFix = finding.fix && this._fixable.has(finding.id);
    return html`<li>
      <div class="row">
        <span class="tile tone-${fixed ? "success" : "warning"}"
          ><ha-svg-icon
            .path=${fixed ? mdiCheckCircleOutline : FINDING_ICONS[finding.kind]}
          ></ha-svg-icon
        ></span>
        <div class="text">
          <span class="title">${text.title}</span>
          <span class="sub"
            >${text.detail}${
              finding.fix && this._note
                ? ` ${this.hass.localize(`${P}load.note_${this._note}` as any)}`
                : ""
            }</span
          >
        </div>
        ${
          fixed
            ? html`<span class="sub"
                >${this.hass.localize(`${P}load.fixed`)}</span
              >`
            : canFix
              ? html`<ha-button
                  size="s"
                  appearance="accent"
                  .disabled=${this._busy !== undefined}
                  .finding=${finding}
                  @click=${this._fix}
                  >${this.hass.localize(`${P}load.fix`)}</ha-button
                >`
              : finding.reviewPath
                ? html`<ha-button
                    size="s"
                    appearance="plain"
                    .path=${finding.reviewPath}
                    @click=${this._review}
                    >${this.hass.localize(`${P}load.review`)}</ha-button
                  >`
                : nothing
        }
      </div>
    </li>`;
  }

  private _renderFacts(sample: LoadSample): TemplateResult {
    const l = (key: string, args?: Record<string, string | number>) =>
      this.hass.localize(`${P}load.${key}` as any, args);
    const slowest = sample.requests.reduce((max, r) => Math.max(max, r.ms), 0);
    const decoded = sample.images.reduce((sum, i) => sum + i.decodedBytes, 0);
    const facts = [
      l("facts_started", { time: this._time(sample.sinceNavigationMs) }),
      l("facts_cards", {
        count: sample.cards.length + sample.skippedCards,
        seconds: LOAD_WINDOW_MS / 1000,
      }),
      l("facts_entities", { count: sample.entityCount }),
      sample.requests.length
        ? l("facts_requests", {
            count: sample.requests.length,
            time: this._time(slowest),
          })
        : l("facts_requests_none"),
      sample.images.length
        ? l("facts_images", {
            count: sample.images.length,
            size: bytesToString(decoded, 1),
          })
        : l("facts_images_none"),
    ];
    return html`<ul>
      ${facts.map(
        (fact) =>
          html`<li>
            <div class="row"><span class="sub">${fact}</span></div>
          </li>`
      )}
    </ul>`;
  }

  private _renderFiles(): TemplateResult {
    if (!this._ownFiles.length) {
      return html`<p class="note">
        ${this.hass.localize(`${P}load.files_empty`)}
      </p>`;
    }
    return html`<ul>
      ${this._ownFiles.map(
        (file) =>
          html`<li>
            <div class="row">
              <div class="text">
                <span class="title"
                  >${file.url.substring(file.url.lastIndexOf("/") + 1) || file.url}</span
                >
                <span class="sub"
                  >${this._time(file.ms)}${
                    file.bytes !== undefined
                      ? ` · ${bytesToString(file.bytes, 0)}`
                      : ""
                  }</span
                >
              </div>
            </div>
          </li>`
      )}
    </ul>`;
  }

  private _renderResources(): TemplateResult | typeof nothing {
    if (this._resources === undefined) {
      return nothing;
    }
    const l = (key: string) => this.hass.localize(`${P}load.${key}` as any);
    return html`<div class="card">
      <h3>${l("resources_title")}</h3>
      ${
        this._resourceCount === 0
          ? html`<p class="note">${l("resources_none")}</p>`
          : html`<ul>
                ${this._resources.map(
                  (resource) =>
                    html`<li>
                      <div class="row">
                        <div class="text">
                          <span class="title"
                            >${resource.url.substring(resource.url.lastIndexOf("/") + 1) || resource.url}</span
                          >
                          <span class="sub"
                            >${this._time(resource.ms)}${
                              resource.bytes !== undefined
                                ? ` · ${bytesToString(resource.bytes, 0)}`
                                : ""
                            }</span
                          >
                        </div>
                      </div>
                    </li>`
                )}
              </ul>
              ${
                this._resources.length < this._resourceCount
                  ? html`<p class="note">${l("resources_unreported")}</p>`
                  : nothing
              }`
      }
      <div class="toolbar">
        <ha-button
          appearance="plain"
          .path=${"/config/lovelace/resources"}
          @click=${this._review}
          >${l("resources_open")}</ha-button
        >
      </div>
    </div>`;
  }

  private _openDashboard() {
    navigate("/");
  }

  private _review(ev: Event) {
    navigate((ev.currentTarget as HTMLElement & { path: string }).path);
  }

  // A full load, so the files and cards are measured from a cold start.
  private _measureAgain() {
    window.location.assign(this._sample?.path || "/");
  }

  private _forget() {
    clearLoadSample();
    this._sample = undefined;
    this._findings = [];
  }

  private async _fix(ev: Event) {
    const finding = (ev.currentTarget as HTMLElement & { finding: Finding })
      .finding;
    const sample = this._sample;
    if (!finding.fix || !sample || this._busy) {
      return;
    }
    this._busy = finding.id;
    this._error = undefined;
    const l = (key: string, args?: Record<string, string | number>) =>
      this.hass.localize(`${P}load.${key}` as any, args);
    try {
      const config = await fetchConfig(
        this.hass.connection,
        sample.urlPath,
        true
      );
      const result = isStrategyDashboard(config)
        ? undefined
        : applyFix(config, finding.fix, location.origin);
      if (!result) {
        this._fixable = new Set(
          [...this._fixable].filter((id) => id !== finding.id)
        );
        await showAlertDialog(this, {
          title: l("fix_nothing_title"),
          text: l("fix_nothing_text"),
        });
        return;
      }
      const fix = finding.fix;
      const text =
        fix.type === "history-hours"
          ? l("fix_history_text", { count: result.changed, hours: fix.to })
          : fix.type === "statistics-days"
            ? l("fix_statistics_text", { count: result.changed, days: fix.to })
            : l("fix_image_text", { count: result.changed });
      const confirmed = await showConfirmationDialog(this, {
        title: l("fix_confirm_title"),
        text,
        confirmText: l("fix_confirm"),
        dismissText: this.hass.localize("ui.common.cancel"),
      });
      if (!confirmed) {
        return;
      }
      await saveConfig(this.hass, sample.urlPath, result.config as any);
      this._fixed = new Set([...this._fixed, finding.id]);
      showToast(this, { message: l("fix_done") });
    } catch (err: unknown) {
      this._error = l("fix_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this._busy = undefined;
    }
  }

  static get styles(): CSSResultGroup {
    return [
      performanceStyles,
      css`
        .row ha-button {
          flex: none;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-performance-load": HaConfigPerformanceLoad;
  }
}
