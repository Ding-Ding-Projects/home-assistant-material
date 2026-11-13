import {
  mdiAlertOutline,
  mdiBellOutline,
  mdiCardOutline,
  mdiChevronLeft,
  mdiDelete,
  mdiDockBottom,
  mdiFormatListBulleted,
  mdiGestureTapButton,
  mdiMenu,
  mdiPlay,
  mdiRestore,
  mdiSwapHorizontal,
  mdiToggleSwitchOutline,
  mdiWindowMaximize,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { keyed } from "lit/directives/keyed";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type {
  CurvePoints,
  MotionKindId,
  MotionLock,
  MotionProfile,
  MotionSettings,
  NamedCurveId,
} from "../../common/appearance/motion-profiles";
import {
  activeProfile,
  allProfiles,
  applyMotionProfile,
  canAddProfile,
  copyActiveToNew,
  currentMotionLock,
  CURVE_X_MAX,
  CURVE_X_MIN,
  CURVE_Y_MAX,
  CURVE_Y_MIN,
  customCurve,
  DURATION_MAX,
  DURATION_MIN,
  editActiveProfile,
  effectiveDuration,
  getMotionSettings,
  isDefaultProfile,
  MOTION_KINDS,
  motionKindDefinition,
  NAMED_CURVE_IDS,
  namedCurve,
  PROFILE_NAME_MAX,
  removeProfile,
  renameProfile,
  resetToTheme,
  sanitizeDuration,
  sanitizeSpeed,
  selectProfile,
  setMotionSettings,
  SPEED_MAX,
  SPEED_MIN,
  subscribeMotionSettings,
  withKind,
} from "../../common/appearance/motion-profiles";
import { haMotionKeyframes } from "../../resources/motion-styles";
import { showConfirmationDialog } from "../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../types";
import "../chips/ha-filter-chip";
import "../ha-button";
import "../ha-card";
import "../ha-slider";
import type { HaSlider } from "../ha-slider";
import "../ha-svg-icon";
import "../ha-switch";
import type { HaSwitch } from "../ha-switch";
import "../input/ha-input";
import type { HaInput } from "../input/ha-input";
import "./ha-motion-curve-editor";

const KIND_ICONS: Record<MotionKindId, string> = {
  cards: mdiCardOutline,
  dialogs: mdiWindowMaximize,
  sheets: mdiDockBottom,
  menus: mdiMenu,
  buttons: mdiGestureTapButton,
  switches: mdiToggleSwitchOutline,
  lists: mdiFormatListBulleted,
  pages: mdiSwapHorizontal,
  toasts: mdiBellOutline,
};

const CURVE_FIELDS = [
  { index: 0, key: "curve_x1" },
  { index: 1, key: "curve_y1" },
  { index: 2, key: "curve_x2" },
  { index: 3, key: "curve_y2" },
] as const;

/**
 * The animation and transition editor: profiles, a master switch and speed,
 * every kind of element, a curve editor and a live preview. A profile is
 * written to the theme's motion variables, so every component that reads
 * them follows it at once. Reduced motion always wins.
 */
@customElement("ha-motion-editor")
export class HaMotionEditor extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @state() private _settings: MotionSettings = getMotionSettings();

  @state() private _kind: MotionKindId = "cards";

  /** On a narrow screen: the list of elements, or the detail of one. */
  @state() private _view: "list" | "detail" = "list";

  @state() private _replay = 0;

  @state() private _switchOn = true;

  @state() private _lock?: MotionLock = currentMotionLock();

  private _unsub?: UnsubscribeFunc;

  private _observer?: MutationObserver;

  private _media?: MediaQueryList;

  public connectedCallback() {
    super.connectedCallback();
    this._settings = getMotionSettings();
    this._unsub = subscribeMotionSettings((settings) => {
      this._settings = settings;
    });
    this._lock = currentMotionLock();
    this._observer = new MutationObserver(() => {
      this._lock = currentMotionLock();
    });
    this._observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-a11y-reduce-motion", "data-low-stimulation"],
    });
    this._media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    this._media?.addEventListener("change", this._mediaChanged);
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._unsub?.();
    this._observer?.disconnect();
    this._media?.removeEventListener("change", this._mediaChanged);
  }

  private _mediaChanged = () => {
    this._lock = currentMotionLock();
  };

  protected firstUpdated(_changed: PropertyValues) {
    this._playSample();
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.motion_editor.${key}` as any,
      values
    );
  }

  private _profileName(profile: MotionProfile): string {
    return profile.builtIn
      ? this._t(`profile_${profile.id}`)
      : profile.name || this._t("profile_unnamed");
  }

  private get _profile(): MotionProfile {
    return activeProfile(this._settings);
  }

  /** True when a built-in profile is in use and no more of the person's own fit. */
  private get _blocked(): boolean {
    return this._profile.builtIn && !canAddProfile(this._settings);
  }

  protected render(): TemplateResult {
    const profile = this._profile;
    const showList = !this.narrow || this._view === "list";
    const showDetail = !this.narrow || this._view === "detail";
    return html`
      <div class=${classMap({ content: true, narrow: this.narrow })}>
        ${this._renderLock()} ${this._renderProfiles(profile)}
        ${this._renderMaster(profile)}
        <div class="grid">
          ${showList ? this._renderKinds(profile) : nothing}
          ${showDetail ? this._renderDetail(profile) : nothing}
          ${showDetail ? this._renderPreview(profile) : nothing}
        </div>
      </div>
    `;
  }

  private _renderLock(): TemplateResult | symbol {
    if (!this._lock) {
      return nothing;
    }
    return html`<div class="lock" role="status">
      <ha-svg-icon .path=${mdiAlertOutline}></ha-svg-icon>
      <span>${this._t(`lock_${this._lock}`)}</span>
    </div>`;
  }

  private _renderProfiles(profile: MotionProfile): TemplateResult {
    return html`
      <div class="profiles">
        <div class="chips" role="group" aria-label=${this._t("profiles_label")}>
          ${allProfiles(this._settings).map(
            (item) =>
              html`<ha-filter-chip
                .label=${this._profileName(item)}
                .selected=${item.id === profile.id}
                .profileId=${item.id}
                @click=${this._chooseProfile}
              ></ha-filter-chip>`
          )}
        </div>
        <div class="profile-actions">
          <ha-button
            appearance="plain"
            .disabled=${!canAddProfile(this._settings)}
            @click=${this._saveAsMine}
            >${this._t("save_as_mine")}</ha-button
          >
          <ha-button
            appearance="plain"
            .disabled=${isDefaultProfile(profile) && profile.builtIn}
            @click=${this._reset}
          >
            <ha-svg-icon slot="start" .path=${mdiRestore}></ha-svg-icon>
            ${this._t("reset")}
          </ha-button>
        </div>
        ${
          profile.builtIn
            ? html`<p class="note">
                ${this._t(this._blocked ? "limit_reached" : "built_in_note")}
              </p>`
            : html`<div class="own">
                <ha-input
                  .label=${this._t("profile_name")}
                  maxlength=${PROFILE_NAME_MAX}
                  .value=${profile.name}
                  @change=${this._renameProfile}
                ></ha-input>
                <ha-button
                  appearance="plain"
                  variant="danger"
                  @click=${this._deleteProfile}
                >
                  <ha-svg-icon slot="start" .path=${mdiDelete}></ha-svg-icon>
                  ${this._t("delete_profile")}
                </ha-button>
              </div>`
        }
      </div>
    `;
  }

  private _renderMaster(profile: MotionProfile): TemplateResult {
    return html`
      <div class="master">
        <div class="master-switch">
          <span id="master-label" class="strong">${this._t("master")}</span>
          <ha-switch
            .checked=${profile.master}
            .disabled=${this._blocked}
            aria-labelledby="master-label"
            @change=${this._masterChanged}
          ></ha-switch>
        </div>
        <div class="master-speed">
          <span id="speed-label" class="strong">${this._t("speed")}</span>
          <ha-slider
            .min=${SPEED_MIN}
            .max=${SPEED_MAX}
            .step=${0.05}
            .value=${profile.speed}
            .disabled=${this._blocked || !profile.master}
            aria-labelledby="speed-label"
            aria-valuetext=${this._t("speed_value", { speed: profile.speed })}
            @change=${this._speedChanged}
          ></ha-slider>
          <output class="mono"
            >${this._t("speed_value", { speed: profile.speed })}</output
          >
        </div>
      </div>
    `;
  }

  private _renderKinds(profile: MotionProfile): TemplateResult {
    return html`
      <ha-card class="panel kinds">
        <h2>${this._t("elements_title")}</h2>
        <ul>
          ${MOTION_KINDS.map((kind) => {
            const setting = profile.kinds[kind.id];
            const name = this._t(`kind_${kind.id}`);
            const ms = effectiveDuration(profile, kind.id);
            return html`<li
              class=${classMap({ kind: true, selected: this._kind === kind.id })}
            >
              <button
                type="button"
                class="kind-button"
                aria-current=${this._kind === kind.id ? "true" : "false"}
                .kindId=${kind.id}
                @click=${this._selectKind}
              >
                <span class="tile"
                  ><ha-svg-icon .path=${KIND_ICONS[kind.id]}></ha-svg-icon
                ></span>
                <span class="kind-text">
                  <span class="strong">${name}</span>
                  <span class="muted"
                    >${
                      setting.enabled && profile.master
                        ? this._t("ms", { ms })
                        : this._t("off")
                    }</span
                  >
                </span>
              </button>
              <ha-switch
                .checked=${setting.enabled}
                .disabled=${this._blocked}
                .kindId=${kind.id}
                aria-label=${this._t("animate_kind", { kind: name })}
                @change=${this._kindEnabled}
              ></ha-switch>
            </li>`;
          })}
        </ul>
      </ha-card>
    `;
  }

  private _renderDetail(profile: MotionProfile): TemplateResult {
    const id = this._kind;
    const definition = motionKindDefinition(id);
    const setting = profile.kinds[id];
    const name = this._t(`kind_${id}`);
    const named = NAMED_CURVE_IDS.includes(setting.curve.id as NamedCurveId);
    return html`
      <ha-card class="panel detail">
        ${
          this.narrow
            ? html`<ha-button appearance="plain" @click=${this._backToList}>
                <ha-svg-icon slot="start" .path=${mdiChevronLeft}></ha-svg-icon>
                ${this._t("back_to_list")}
              </ha-button>`
            : nothing
        }
        <h2>${name}</h2>
        ${
          definition.adjustableCurve
            ? html`
                <ha-motion-curve-editor
                  .points=${setting.curve.points}
                  .disabled=${this._blocked}
                  .label=${this._t("curve_editor", { kind: name })}
                  .handleLabels=${[this._t("handle_1"), this._t("handle_2")]}
                  @motion-curve-changed=${this._curveDragged}
                ></ha-motion-curve-editor>
                <div
                  class="chips"
                  role="group"
                  aria-label=${this._t("curves_label")}
                >
                  ${NAMED_CURVE_IDS.map(
                    (curve) =>
                      html`<ha-filter-chip
                        .label=${this._t(`curve_${curve}`)}
                        .selected=${setting.curve.id === curve}
                        .curveId=${curve}
                        .disabled=${this._blocked}
                        @click=${this._chooseCurve}
                      ></ha-filter-chip>`
                  )}
                  ${
                    named
                      ? nothing
                      : html`<ha-filter-chip
                          .label=${this._t("curve_custom")}
                          .selected=${true}
                        ></ha-filter-chip>`
                  }
                </div>
              `
            : html`<p class="note">${this._t("curve_fixed")}</p>`
        }
        <div class="fields">
          <ha-input
            type="number"
            .label=${this._t("duration")}
            .value=${String(setting.duration)}
            .min=${DURATION_MIN}
            .max=${DURATION_MAX}
            .step=${10}
            .disabled=${this._blocked}
            @change=${this._durationChanged}
          >
            <span slot="end">ms</span>
          </ha-input>
          ${
            definition.adjustableCurve
              ? CURVE_FIELDS.map(
                  ({ index, key }) =>
                    html`<ha-input
                      type="number"
                      .label=${this._t(key)}
                      .value=${String(setting.curve.points[index])}
                      .min=${index % 2 === 0 ? CURVE_X_MIN : CURVE_Y_MIN}
                      .max=${index % 2 === 0 ? CURVE_X_MAX : CURVE_Y_MAX}
                      .step=${0.01}
                      .disabled=${this._blocked}
                      .pointIndex=${index}
                      @change=${this._pointChanged}
                    ></ha-input>`
                )
              : nothing
          }
        </div>
        <p class="note">${this._t("curve_help")}</p>
      </ha-card>
    `;
  }

  private _renderPreview(profile: MotionProfile): TemplateResult {
    const id = this._kind;
    return html`
      <ha-card class="panel preview">
        <h2>${this._t("preview_title")}</h2>
        <div
          class=${classMap({ stage: true, locked: !!this._lock })}
          aria-hidden="true"
        >
          ${this._renderSample(id)}
        </div>
        <p class="note">${this._t("preview_note")}</p>
        <div class="preview-actions">
          <ha-button appearance="filled" @click=${this._playSample}>
            <ha-svg-icon slot="start" .path=${mdiPlay}></ha-svg-icon>
            ${this._t("replay")}
          </ha-button>
        </div>
        <span class="sr-only" role="status"
          >${
            profile.master && profile.kinds[id].enabled
              ? this._t("preview_status", {
                  kind: this._t(`kind_${id}`),
                  ms: effectiveDuration(profile, id),
                })
              : this._t("preview_status_off", {
                  kind: this._t(`kind_${id}`),
                })
          }</span
        >
      </ha-card>
    `;
  }

  private _renderSample(id: MotionKindId): TemplateResult {
    const text = this._t("sample_text");
    switch (id) {
      case "cards":
        return keyed(
          this._replay,
          html`<ha-card class="sample-card">
            <div class="sample-pad">${text}</div>
          </ha-card>`
        );
      case "dialogs":
        return keyed(
          this._replay,
          html`<div class="sample-dialog">
            <span class="strong">${text}</span>
          </div>`
        );
      case "sheets":
        return keyed(
          this._replay,
          html`<div class="sample-sheet">
            <span class="strong">${text}</span>
          </div>`
        );
      case "menus":
        return keyed(
          this._replay,
          html`<div class="sample-menu">
            <span>${text} 1</span><span>${text} 2</span>
          </div>`
        );
      case "buttons":
        return keyed(
          this._replay,
          html`<div class="sample-press">
            <ha-button appearance="filled">${text}</ha-button>
          </div>`
        );
      case "switches":
        return html`<ha-switch .checked=${this._switchOn}></ha-switch>`;
      case "lists":
        return keyed(
          this._replay,
          html`<div class="sample-list">
            <div class="sample-row">${text} 1</div>
            <div class="sample-row">${text} 2</div>
            <div class="sample-row">${text} 3</div>
          </div>`
        );
      case "pages":
        return keyed(
          this._replay,
          html`<div class="sample-page">
            <span class="strong">${text}</span>
          </div>`
        );
      default:
        return keyed(
          this._replay,
          html`<div class="sample-toast">${text}</div>`
        );
    }
  }

  /** Plays the sample of the selected kind again. */
  private _playSample = () => {
    this._replay += 1;
    this._switchOn = false;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        this._switchOn = true;
      })
    );
  };

  private _save(settings: MotionSettings) {
    if (settings === this._settings) {
      return;
    }
    setMotionSettings(settings);
    this._settings = getMotionSettings();
    applyMotionProfile(activeProfile(this._settings));
  }

  private _edit(edit: (profile: MotionProfile) => MotionProfile) {
    this._save(
      editActiveProfile(
        this._settings,
        this._t("fork_name", { name: this._profileName(this._profile) }),
        edit
      )
    );
  }

  private _chooseProfile(ev: Event) {
    const chip = ev.currentTarget as HTMLElement & { profileId: string };
    this._save(selectProfile(this._settings, chip.profileId));
    // A chip toggles itself when pressed; it follows the choice instead.
    (chip as any).selected = chip.profileId === this._settings.activeId;
  }

  private _saveAsMine() {
    this._save(
      copyActiveToNew(
        this._settings,
        this._t("fork_name", { name: this._profileName(this._profile) })
      )
    );
  }

  private _reset() {
    const profile = this._profile;
    if (profile.builtIn) {
      this._save(resetToTheme(this._settings));
      return;
    }
    // Put the profile of the person's own back to the theme's values.
    this._edit((current) => ({
      ...current,
      master: true,
      speed: 1,
      kinds: Object.fromEntries(
        MOTION_KINDS.map((kind) => [
          kind.id,
          {
            enabled: true,
            duration: kind.duration,
            curve: namedCurve(kind.curve),
          },
        ])
      ) as MotionProfile["kinds"],
    }));
  }

  private _renameProfile(ev: Event) {
    this._save(
      renameProfile(
        this._settings,
        this._profile.id,
        (ev.currentTarget as HaInput).value ?? ""
      )
    );
  }

  private async _deleteProfile() {
    const profile = this._profile;
    const confirmed = await showConfirmationDialog(this, {
      title: this._t("delete_title"),
      text: this._t("delete_text", { name: this._profileName(profile) }),
      confirmText: this._t("delete_profile"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    this._save(removeProfile(this._settings, profile.id));
  }

  private _masterChanged(ev: Event) {
    const master = (ev.currentTarget as HaSwitch).checked;
    this._edit((profile) => ({ ...profile, master }));
  }

  private _speedChanged(ev: Event) {
    const speed = sanitizeSpeed((ev.currentTarget as HaSlider).value);
    this._edit((profile) => ({ ...profile, speed }));
  }

  private _selectKind(ev: Event) {
    this._kind = (
      ev.currentTarget as HTMLElement & { kindId: MotionKindId }
    ).kindId;
    this._view = "detail";
    this._playSample();
  }

  private _backToList() {
    this._view = "list";
  }

  private _kindEnabled(ev: Event) {
    const target = ev.currentTarget as HaSwitch & { kindId: MotionKindId };
    this._edit((profile) =>
      withKind(profile, target.kindId, { enabled: target.checked })
    );
  }

  private _durationChanged(ev: Event) {
    const kind = this._kind;
    const duration = sanitizeDuration(
      (ev.currentTarget as HaInput).value,
      motionKindDefinition(kind).duration
    );
    this._edit((profile) => withKind(profile, kind, { duration }));
  }

  private _chooseCurve(ev: Event) {
    const chip = ev.currentTarget as HTMLElement & { curveId: NamedCurveId };
    const kind = this._kind;
    this._edit((profile) =>
      withKind(profile, kind, { curve: namedCurve(chip.curveId) })
    );
    (chip as any).selected =
      this._profile.kinds[kind].curve.id === chip.curveId;
  }

  private _pointChanged(ev: Event) {
    const target = ev.currentTarget as HaInput & { pointIndex: number };
    const kind = this._kind;
    const points = [...this._profile.kinds[kind].curve.points];
    points[target.pointIndex] = Number(target.value);
    this._setCurve(kind, points);
  }

  private _curveDragged(ev: CustomEvent<{ points: CurvePoints }>) {
    this._setCurve(this._kind, ev.detail.points);
  }

  private _setCurve(kind: MotionKindId, points: number[]) {
    const curve = customCurve(points);
    this._edit((profile) => withKind(profile, kind, { curve }));
  }

  static get styles(): CSSResultGroup {
    return [
      haMotionKeyframes,
      css`
        :host {
          display: block;
        }
        .content {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
          max-width: 1280px;
          margin: 0 auto;
        }
        .strong {
          font-weight: var(--ha-font-weight-semibold, 600);
          color: var(--primary-text-color);
        }
        .muted,
        .note {
          color: var(--secondary-text-color);
        }
        .note {
          margin: 0;
          font-size: var(--ha-font-size-s);
        }
        .mono {
          font-family: var(--ha-font-family-code, monospace);
          min-width: 4ch;
        }
        .lock {
          display: flex;
          gap: var(--ha-space-3);
          align-items: flex-start;
          padding: var(--ha-space-4);
          border-radius: var(--ha-border-radius-2xl);
          background: var(--ha-color-warning-container, var(--warning-color));
          color: var(
            --ha-color-on-warning-container,
            var(--primary-text-color)
          );
        }
        .profiles {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-3);
        }
        .chips {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
        }
        .profile-actions,
        .own {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2);
        }
        .own ha-input {
          flex: 1;
          min-width: 180px;
          max-width: 320px;
        }
        .profiles .note {
          flex-basis: 100%;
        }
        .master {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
          gap: var(--ha-space-6);
        }
        .master-switch,
        .master-speed {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
        }
        .master-speed ha-slider {
          width: 160px;
        }
        .grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr) minmax(0, 1fr);
          gap: var(--ha-space-4);
          align-items: start;
        }
        .narrow .grid {
          grid-template-columns: minmax(0, 1fr);
        }
        .panel {
          padding: var(--ha-space-5);
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
        }
        h2 {
          margin: 0;
          font-size: var(--ha-font-size-l);
          font-weight: var(--ha-font-weight-title, 600);
        }
        ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
        }
        .kind {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          border-radius: var(--ha-border-radius-xl);
          padding-inline-end: var(--ha-space-2);
        }
        .kind.selected {
          background: var(
            --ha-color-surface-tone-2,
            var(--secondary-background-color)
          );
        }
        .kind-button {
          flex: 1;
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          padding: var(--ha-space-2);
          border: none;
          background: none;
          font: inherit;
          color: inherit;
          text-align: start;
          cursor: pointer;
          border-radius: var(--ha-border-radius-xl);
          min-height: 48px;
        }
        .kind-button:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: 2px;
        }
        .tile {
          display: grid;
          place-items: center;
          width: 40px;
          height: 40px;
          border-radius: var(--ha-border-radius-lg);
          background: var(
            --ha-color-primary-container,
            var(--secondary-background-color)
          );
          color: var(--ha-color-on-primary-container, var(--primary-color));
          flex: none;
        }
        .kind-text {
          display: flex;
          flex-direction: column;
        }
        .fields {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--ha-space-3);
        }
        .stage {
          min-height: 180px;
          display: grid;
          place-items: center;
          padding: var(--ha-space-4);
          overflow: hidden;
          border-radius: var(--ha-border-radius-xl);
          background: var(
            --ha-color-surface-tone-2,
            var(--secondary-background-color)
          );
        }
        .stage.locked * {
          animation: none !important;
        }
        .preview-actions {
          display: flex;
          gap: var(--ha-space-2);
        }
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip-path: inset(50%);
          white-space: nowrap;
        }
        .sample-card {
          width: min(100%, 220px);
        }
        .sample-pad {
          padding: var(--ha-space-5);
        }
        .sample-dialog,
        .sample-sheet,
        .sample-menu,
        .sample-toast,
        .sample-page {
          padding: var(--ha-space-4) var(--ha-space-5);
          border-radius: var(--ha-border-radius-2xl);
          background: var(--card-background-color);
          box-shadow: var(--ha-shadow-overlay, 0 2px 8px rgba(0, 0, 0, 0.2));
        }
        .sample-dialog {
          animation: sample-scale var(--ha-dialog-show-duration, 200ms) ease
            backwards;
        }
        .sample-sheet {
          width: 80%;
          align-self: end;
          border-end-start-radius: 0;
          border-end-end-radius: 0;
          animation: sample-up var(--ha-motion-sheets-duration, 300ms) ease
            backwards;
        }
        .sample-menu {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
          animation: ha-pop
            var(--ha-motion-menus-duration, var(--ha-animation-duration-normal))
            var(--ha-motion-menus-curve, var(--ha-motion-spring, ease))
            backwards;
        }
        .sample-press {
          animation: sample-press
            var(
              --ha-motion-buttons-duration,
              var(--ha-animation-duration-normal)
            )
            var(--ha-motion-buttons-curve, var(--ha-motion-spring, ease))
            backwards;
        }
        .sample-list {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
        }
        .sample-row {
          padding: var(--ha-space-3) var(--ha-space-4);
          border-radius: var(--ha-border-radius-lg);
          animation: sample-highlight
            var(--ha-motion-lists-duration, var(--ha-animation-duration-fast))
            var(--ha-motion-lists-curve, ease-out) backwards;
        }
        .sample-page {
          animation: sample-slide var(--ha-motion-pages-duration, 250ms)
            var(--ha-motion-pages-curve, ease) backwards;
        }
        .sample-toast {
          animation: sample-toast
            var(
              --ha-motion-toasts-duration,
              var(--ha-animation-duration-fast, 150ms)
            )
            var(--ha-motion-toasts-curve, ease) backwards;
        }
        @keyframes sample-scale {
          from {
            opacity: 0;
            transform: scale(0.85);
          }
        }
        @keyframes sample-up {
          from {
            transform: translateY(100%);
          }
        }
        @keyframes sample-press {
          0% {
            transform: scale(1);
          }
          50% {
            transform: scale(0.88);
          }
          100% {
            transform: scale(1);
          }
        }
        @keyframes sample-highlight {
          from {
            background: var(
              --ha-color-primary-container,
              var(--secondary-background-color)
            );
          }
        }
        @keyframes sample-slide {
          from {
            opacity: 0;
            transform: translateX(32px);
          }
        }
        @keyframes sample-toast {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
        }
        @media (max-width: 1100px) {
          .grid {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          }
          .preview {
            grid-column: 1 / -1;
          }
        }
        @media (max-width: 640px) {
          .grid {
            grid-template-columns: minmax(0, 1fr);
          }
          .master {
            justify-content: flex-start;
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-motion-editor": HaMotionEditor;
  }
}
