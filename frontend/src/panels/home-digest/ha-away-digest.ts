import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import { formatShortDateTime } from "../../common/datetime/format_date_time";
import { formatTime } from "../../common/datetime/format_time";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import { playPageEntry } from "../../common/motion/page-entry";
import { getPersonalPreferences } from "../../common/preferences/personal-preferences";
import { getLogbookDataFromServer } from "../../data/logbook";
import type { LogbookEntry } from "../../data/logbook";
import type { HomeAssistant } from "../../types";
import type { LovelaceCard } from "../lovelace/types";
import type { LovelaceCardConfig } from "../../data/lovelace/config/card";
import {
  absenceWindow,
  AWAY_MAX_ENTRIES,
  buildDigest,
  describeDuration,
  digestLead,
  digestRows,
  readLastSeen,
  shouldShowDigest,
  writeLastSeen,
} from "./away-digest";
import type { AbsenceWindow, Digest, DigestRow } from "./away-digest";

const KEY = "ui.panel.lovelace.cards.away_digest.";

/**
 * What the front door decided for this page load, per person. The choice is
 * made once, so going to another page and back keeps showing the same summary
 * until it is dismissed.
 */
interface Session {
  window: AbsenceWindow;
  dismissed: boolean;
}

const sessions = new Map<string, Session | null>();

/**
 * A summary of what happened while you were away, shown at the top of the
 * Home page after an absence of at least the chosen gap. It reads only the
 * logbook and the current states of this instance and sends nothing anywhere.
 */
@customElement("hui-away-digest-card")
export class HuiAwayDigestCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _digest?: Digest;

  @state() private _window?: AbsenceWindow;

  @state() private _failed = false;

  @state() private _loading = false;

  private _started = false;

  private _entered = false;

  private _lang = new LanguageModeController(this);

  public setConfig(_config: LovelaceCardConfig): void {
    // The card takes no options.
  }

  public getCardSize(): number {
    return this._digest || this._loading || this._failed ? 4 : 0;
  }

  public connectedCallback(): void {
    super.connectedCallback();
    // Hidden until it is known that there is something to show.
    this._setVisible(false);
    window.addEventListener("pagehide", this._markSeen);
    document.addEventListener("visibilitychange", this._onVisibility);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("pagehide", this._markSeen);
    document.removeEventListener("visibilitychange", this._onVisibility);
  }

  private _onVisibility = () => {
    if (document.visibilityState === "hidden") {
      this._markSeen();
    }
  };

  /** Remembers, on this device, that the front door was open just now. */
  private _markSeen = () => {
    if (this.hass && this._started) {
      writeLastSeen(this.hass.user?.id, Date.now());
    }
  };

  private _setVisible(visible: boolean) {
    if (this.hasAttribute("hidden") === !visible) {
      return;
    }
    this.style.display = visible ? "" : "none";
    this.toggleAttribute("hidden", !visible);
    fireEvent(this, "card-visibility-changed", { value: visible });
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("hass") && this.hass && !this._started) {
      this._started = true;
      this._start(this.hass);
    }
  }

  private _start(hass: HomeAssistant) {
    const userId = hass.user?.id ?? "anonymous";
    const now = Date.now();
    if (!sessions.has(userId)) {
      const prefs = getPersonalPreferences();
      const lastSeen = readLastSeen(hass.user?.id);
      const show = shouldShowDigest({
        enabled: prefs.awayDigest,
        gapHours: prefs.awayDigestGapHours,
        lastSeen,
        now,
      });
      sessions.set(
        userId,
        show && lastSeen !== undefined
          ? { window: absenceWindow(lastSeen, now), dismissed: false }
          : null
      );
      // The start of this visit is the new last seen time.
      writeLastSeen(hass.user?.id, now);
    }
    const session = sessions.get(userId);
    if (!session || session.dismissed) {
      return;
    }
    this._window = session.window;
    this._loading = true;
    this._setVisible(true);
    this._load(hass, session.window);
  }

  private async _load(hass: HomeAssistant, window: AbsenceWindow) {
    try {
      const entries = await getLogbookDataFromServer(
        hass,
        new Date(window.start).toISOString(),
        new Date(window.end).toISOString()
      );
      this._digest = buildDigest(this._newest(entries), hass.states, window);
    } catch (_err) {
      this._failed = true;
    }
    this._loading = false;
  }

  private _newest(entries: LogbookEntry[]): LogbookEntry[] {
    return entries.length > AWAY_MAX_ENTRIES
      ? entries.slice(entries.length - AWAY_MAX_ENTRIES)
      : entries;
  }

  protected updated(): void {
    if (this._entered || !this._digest) {
      return;
    }
    this._entered = true;
    const root = this.shadowRoot;
    if (root) {
      playPageEntry([...root.querySelectorAll(".hero, .tile, .rows")]);
    }
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.hass!.localize, `${KEY}${key}`, values);
  }

  private _duration(window: AbsenceWindow): string {
    const { unit, count } = describeDuration(window.end - window.start);
    return this._t(`duration_${unit}`, { count });
  }

  private _sentence(digest: Digest): string {
    const lead = this._t(`lead_${digestLead(digest.counts)}`);
    const look = digest.counts.attention
      ? this._t("needs_look", { count: digest.counts.attention })
      : this._t("needs_none");
    return `${lead} ${look}`;
  }

  private _time(when: number): string {
    const hass = this.hass!;
    const date = new Date(when);
    return date.toDateString() === new Date().toDateString()
      ? formatTime(date, hass.locale, hass.config)
      : formatShortDateTime(date, hass.locale, hass.config);
  }

  private _tiles(digest: Digest) {
    const { counts, sources } = digest;
    const tiles: { key: string; count: number; attention?: boolean }[] = [
      { key: "tile_attention", count: counts.attention, attention: true },
    ];
    if (sources.automations) {
      tiles.push({ key: "tile_automations", count: counts.automations });
    }
    if (sources.openings) {
      tiles.push({ key: "tile_openings", count: counts.openings });
    }
    if (sources.arrivals) {
      tiles.push({ key: "tile_arrivals", count: counts.arrivals });
    }
    return tiles;
  }

  private _row(row: DigestRow): TemplateResult {
    if (row.type === "attention") {
      const { item } = row;
      return html`<li class="row attention">
        <span class="text"
          >${
            item.kind === "battery"
              ? this._t("row_battery", {
                  name: item.name,
                  percent: item.percent ?? 0,
                })
              : this._t("row_unavailable", { name: item.name })
          }</span
        >
        <span class="when">${this._t("row_now")}</span>
      </li>`;
    }
    const { event } = row;
    return html`<li class="row">
      <span class="text"
        >${this._t(event.kind === "arrival" ? "row_arrival" : "row_opening", {
          name: event.name,
        })}</span
      >
      <time class="when" datetime=${new Date(event.when).toISOString()}
        >${this._time(event.when)}</time
      >
    </li>`;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._window || this.hidden) {
      return nothing;
    }
    const digest = this._digest;
    const rows = digest ? digestRows(digest) : [];
    return html`<section
      class="digest"
      aria-label=${this._t("region_label")}
      aria-busy=${this._loading ? "true" : "false"}
    >
      <div class="hero">
        <p class="eyebrow">${this._t("title")}</p>
        <h2>
          ${this._t("away_for", { duration: this._duration(this._window) })}
        </h2>
        ${
          digest
            ? html`<p class="sentence">${this._sentence(digest)}</p>`
            : this._failed
              ? html`<p class="sentence" role="status">${this._t("failed")}</p>`
              : html`<p class="sentence" role="status">
                  ${this._t("loading")}
                </p>`
        }
        ${
          this._window.capped
            ? html`<p class="note">${this._t("capped")}</p>`
            : nothing
        }
      </div>
      ${
        digest
          ? html`<div class="tiles">
              ${this._tiles(digest).map(
                (tile) =>
                  html`<div
                    class=${tile.attention && tile.count ? "tile look" : "tile"}
                  >
                    <span class="numeral">${tile.count}</span>
                    <span class="label">${this._t(tile.key)}</span>
                  </div>`
              )}
            </div>`
          : nothing
      }
      ${
        rows.length
          ? html`<ul class="rows" aria-label=${this._t("rows_label")}>
              ${rows.map((row) => this._row(row))}
            </ul>`
          : nothing
      }
      <button type="button" class="dismiss" @click=${this._dismiss}>
        ${this._t("dismiss")}
      </button>
    </section>`;
  }

  private _dismiss = () => {
    const hass = this.hass;
    if (!hass) {
      return;
    }
    const userId = hass.user?.id ?? "anonymous";
    const session = sessions.get(userId);
    if (session) {
      session.dismissed = true;
    }
    writeLastSeen(hass.user?.id, Date.now());
    this._setVisible(false);
  };

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    .digest {
      display: grid;
      gap: var(--ha-space-4);
      padding: var(--ha-space-5);
      border-radius: var(--ha-border-radius-3xl);
      background: var(--card-background-color);
      color: var(--primary-text-color);
    }
    .eyebrow {
      margin: 0;
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
    }
    h2 {
      margin: var(--ha-space-1) 0 0;
      font-family: var(--ha-font-family-heading, inherit);
      font-size: clamp(24px, 3.4vw, 40px);
      font-weight: 800;
      font-stretch: 116%;
      line-height: 1.15;
      letter-spacing: -0.01em;
      overflow-wrap: anywhere;
    }
    .sentence {
      margin: var(--ha-space-2) 0 0;
      font-size: var(--ha-font-size-l);
      line-height: var(--ha-line-height-normal);
      color: var(--secondary-text-color);
    }
    .note {
      margin: var(--ha-space-1) 0 0;
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: var(--ha-space-3);
    }
    .tile {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      min-width: 0;
      padding: var(--ha-space-4);
      border-radius: var(--ha-border-radius-xl);
      background: var(--primary-background-color);
    }
    .tile.look {
      background: color-mix(
        in srgb,
        var(--warning-color) 20%,
        var(--primary-background-color)
      );
    }
    .numeral {
      font-size: clamp(32px, 5vw, 48px);
      font-weight: 800;
      font-stretch: 116%;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .label {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
      overflow-wrap: anywhere;
    }
    .rows {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--ha-space-2);
    }
    .row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--ha-space-3);
      padding: var(--ha-space-3) var(--ha-space-4);
      border-radius: var(--ha-border-radius-xl);
      background: var(--primary-background-color);
    }
    .row.attention {
      background: color-mix(
        in srgb,
        var(--warning-color) 14%,
        var(--primary-background-color)
      );
    }
    .text {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .when {
      flex: none;
      font-size: var(--ha-font-size-s);
      font-variant-numeric: tabular-nums;
      color: var(--secondary-text-color);
    }
    .dismiss {
      justify-self: start;
      min-height: 48px;
      padding: 0 var(--ha-space-5);
      border: 1px solid var(--outline-color);
      border-radius: var(--ha-border-radius-pill);
      background: none;
      color: var(--primary-text-color);
      font: inherit;
      font-weight: var(--ha-font-weight-medium);
      cursor: pointer;
    }
    .dismiss:hover {
      background: var(--ha-color-fill-neutral-quiet-hover);
    }
    .dismiss:focus-visible {
      outline: 3px solid var(--primary-color);
      outline-offset: 2px;
    }
    /* Phone: a compact title, three tiles across and tighter rows. */
    @media (max-width: 600px) {
      .digest {
        gap: var(--ha-space-3);
        padding: var(--ha-space-4);
        border-radius: 24px;
      }
      h2 {
        font-size: 20px;
        font-weight: 700;
        font-stretch: 100%;
      }
      .sentence {
        font-size: 14px;
      }
      .tiles {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--ha-space-2);
      }
      .tile {
        padding: var(--ha-space-3);
        border-radius: 16px;
      }
      .numeral {
        font-size: 28px;
        font-stretch: 100%;
      }
      .row {
        padding: var(--ha-space-2) var(--ha-space-3);
        border-radius: 16px;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-away-digest-card": HuiAwayDigestCard;
  }
}
