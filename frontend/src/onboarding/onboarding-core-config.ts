import { mdiCheck } from "@mdi/js";
import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { LOCAL_TIME_ZONE } from "../common/datetime/resolve-time-zone";
import { consumeLocalize } from "../common/decorators/consume-context-entry";
import { fireEvent } from "../common/dom/fire_event";
import type { LocalizeFunc } from "../common/translations/localize";
import "../components/ha-alert";
import "../components/ha-button";
import { COUNTRIES } from "../components/ha-country-picker";
import "../components/ha-form/ha-form";
import type { HaForm } from "../components/ha-form/ha-form";
import type { HaFormSchema } from "../components/ha-form/types";
import "../components/ha-spinner";
import "../components/ha-svg-icon";
import { saveCoreConfig } from "../data/core";
import { countryCurrency } from "../data/currency";
import { onboardCoreConfigStep } from "../data/onboarding";
import type { HomeAssistant, ValueChangedEvent } from "../types";
import { getLocalLanguage } from "../util/common-translation";
import {
  buildReview,
  defaultUnitSystem,
  previewRegion,
} from "./onboarding-logic";
import type { UnitSystemChoice } from "./onboarding-logic";
import "./onboarding-location";

type Stage = "location" | "details" | "review";

const STAGES: Stage[] = ["location", "details", "review"];

interface DetailsData {
  country: string;
  time_zone: string;
  language: string;
  unit_system: UnitSystemChoice;
  currency: string;
}

/**
 * The home step in three stages: where the home is, the regional choices with
 * a live preview of how they will look, and a review before anything is
 * saved. The two server calls and their order are unchanged: the core
 * configuration is saved, then the onboarding step is marked done.
 */
@customElement("onboarding-core-config")
class OnboardingCoreConfig extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @state() private _stage: Stage = "location";

  @state() private _working = false;

  @state() private _location?: [number, number];

  private _elevation = "0";

  @state() private _timeZone: string = LOCAL_TIME_ZONE;

  @state() private _language: string = getLocalLanguage();

  @state() private _country?: string;

  @state() private _unitSystem?: UnitSystemChoice;

  @state() private _currency?: string;

  @state() private _error?: string;

  /** Whether the person has chosen the value, so a new country leaves it be. */
  private _unitChosen = false;

  private _currencyChosen = false;

  private _progressed = false;

  @query("ha-form") private _form?: HaForm;

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._localize(
      `ui.panel.page-onboarding.core-config.${key}` as any,
      values as any
    );
  }

  private _currencies = memoizeOne((language: string) => {
    const codes: string[] = (Intl as any).supportedValuesOf
      ? (Intl as any).supportedValuesOf("currency")
      : [...new Set(Object.values(countryCurrency))];
    let names: Intl.DisplayNames | undefined;
    try {
      names = new Intl.DisplayNames(language, { type: "currency" });
    } catch (_err) {
      names = undefined;
    }
    return codes.map((code) => ({
      value: code,
      label: `${code} ${names?.of(code) ?? ""}`.trim(),
    }));
  });

  private _schema = memoizeOne(
    (currencies: { value: string; label: string }[]): HaFormSchema[] => [
      { name: "country", required: true, selector: { country: null } },
      { name: "time_zone", required: true, selector: { timezone: null } },
      {
        name: "language",
        required: true,
        selector: { language: { native_name: true } },
      },
      {
        name: "unit_system",
        required: true,
        selector: {
          select: {
            mode: "dropdown",
            options: [
              {
                value: "metric",
                label: this._t("unit_metric"),
              },
              {
                value: "us_customary",
                label: this._t("unit_us_customary"),
              },
            ],
          },
        },
      },
      {
        name: "currency",
        required: true,
        selector: { select: { mode: "dropdown", options: currencies } },
      },
    ]
  );

  private _computeLabel = (schema: HaFormSchema) =>
    this._t(`field.${schema.name}`);

  protected render(): TemplateResult {
    return html`
      ${this._renderStageRail()}
      ${
        this._stage === "location"
          ? html`<onboarding-location
              .hass=${this.hass}
              .initial=${this._location}
              @value-changed=${this._locationChanged}
            ></onboarding-location>`
          : this._stage === "details"
            ? this._renderDetails()
            : this._renderReview()
      }
    `;
  }

  private _renderStageRail(): TemplateResult {
    const current = STAGES.indexOf(this._stage);
    return html`<ol class="stages" aria-label=${this._t("stages_label")}>
      ${STAGES.map((stage, index) => {
        const done = index < current;
        const label = this._t(`stage.${stage}`);
        return html`<li
          class=${index === current ? "current" : done ? "done" : ""}
          aria-current=${index === current ? "step" : nothing}
        >
          ${
            done
              ? html`<button
                  type="button"
                  data-stage=${stage}
                  @click=${this._goToStage}
                >
                  <span class="mark"
                    ><ha-svg-icon .path=${mdiCheck}></ha-svg-icon
                  ></span>
                  ${label}
                  <span class="visually-hidden">${this._t("stage_done")}</span>
                </button>`
              : html`<span class="step"
                  ><span class="mark">${index + 1}</span>${label}</span
                >`
          }
        </li>`;
      })}
    </ol>`;
  }

  private _goToStage(ev: Event) {
    this._error = undefined;
    this._stage = (ev.currentTarget as HTMLElement).dataset.stage as Stage;
  }

  private get _effectiveUnit(): UnitSystemChoice {
    return this._unitSystem ?? defaultUnitSystem(this._country);
  }

  private get _effectiveCurrency(): string | undefined {
    return (
      this._currency ||
      (this._country ? countryCurrency[this._country] : undefined) ||
      "EUR"
    );
  }

  private _renderDetails(): TemplateResult {
    const currencies = this._currencies(this._language);
    const data: DetailsData = {
      country: this._country ?? "",
      time_zone: this._timeZone,
      language: this._language,
      unit_system: this._effectiveUnit,
      currency: this._effectiveCurrency!,
    };
    const preview = previewRegion({
      language: this._language,
      timeZone: this._timeZone,
      unitSystem: this._effectiveUnit,
      currency: this._effectiveCurrency,
    });
    const rows: [string, string][] = [
      ["date", preview.date],
      ["time", preview.time],
      ["number", preview.number],
      ["temperature", preview.temperature],
      ["distance", preview.distance],
      ["currency", preview.currency],
    ];
    return html`
      ${
        this._error
          ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
          : nothing
      }
      <h1>${this._t("details_header")}</h1>
      <p>${this._t("country_intro")}</p>
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${this._schema(currencies)}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._handleFormChanged}
      ></ha-form>
      <p class="problem" aria-live="polite">
        ${this._country ? nothing : this._t("error.country_required")}
      </p>
      <section class="preview" aria-labelledby="preview-title">
        <h2 id="preview-title">${this._t("preview_title")}</h2>
        <p class="note">${this._t("preview_note")}</p>
        <dl>
          ${rows
            .filter(([, value]) => value)
            .map(
              ([key, value]) =>
                html`<dt>${this._t(`preview.${key}`)}</dt>
                  <dd>${value}</dd>`
            )}
        </dl>
      </section>
      <div class="footer split">
        <ha-button appearance="plain" @click=${this._back}>
          ${this._t("back")}
        </ha-button>
        <ha-button @click=${this._toReview} .disabled=${!this._country}>
          ${this._t("review_action")}
        </ha-button>
      </div>
    `;
  }

  private _renderReview(): TemplateResult {
    const rows = buildReview({
      name: this.hass.user?.name,
      location: this._location,
      country: this._country,
      language: this._language,
      unitSystem: this._t(
        this._effectiveUnit === "us_customary"
          ? "unit_us_customary"
          : "unit_metric"
      ),
      currency: this._effectiveCurrency,
      timeZone: this._timeZone,
    });
    return html`
      ${
        this._error
          ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
          : nothing
      }
      <h1>${this._t("review_header")}</h1>
      <p>${this._t("review_intro")}</p>
      <dl class="review">
        ${rows.map(
          (row) =>
            html`<dt>${this._t(`review.${row.key}`)}</dt>
              <dd>${row.value}</dd>`
        )}
      </dl>
      <div class="footer split">
        <ha-button
          appearance="plain"
          @click=${this._back}
          .disabled=${this._working}
        >
          ${this._t("back")}
        </ha-button>
        <ha-button @click=${this._save} .disabled=${this._working}>
          ${
            this._working
              ? html`<ha-spinner size="small"></ha-spinner>`
              : this._t("save_and_continue")
          }
        </ha-button>
      </div>
    `;
  }

  private _back() {
    this._error = undefined;
    this._stage = this._stage === "review" ? "details" : "location";
  }

  private _toReview() {
    if (this._country) {
      this._stage = "review";
    }
  }

  private _handleFormChanged(ev: ValueChangedEvent<Partial<DetailsData>>) {
    const value = ev.detail.value;
    if (value.country !== (this._country ?? "")) {
      this._country = value.country || undefined;
    }
    if (value.time_zone) {
      this._timeZone = value.time_zone;
    }
    if (value.language) {
      this._language = value.language;
    }
    if (value.unit_system && value.unit_system !== this._effectiveUnit) {
      this._unitSystem = value.unit_system;
      this._unitChosen = true;
    }
    if (value.currency && value.currency !== this._effectiveCurrency) {
      this._currency = value.currency;
      this._currencyChosen = true;
    }
  }

  private _locationChanged(ev) {
    const value = ev.detail.value;
    this._location = value.location;
    if (value.elevation) {
      this._elevation = value.elevation;
    }
    if (value.currency && !this._currencyChosen) {
      this._currency = value.currency;
    }
    if (value.language) {
      this._language = value.language;
    }
    const timeZone = value.time_zone || value.timezone;
    if (timeZone) {
      this._timeZone = timeZone;
    }
    if (value.unit_system && !this._unitChosen) {
      this._unitSystem = value.unit_system;
    }
    if (value.country) {
      this._country = value.country;
    } else if (!this._country && navigator.language) {
      // Suggest the country of the browser language.
      const lang = navigator.language.split("-").pop()!.toUpperCase();
      if (COUNTRIES.includes(lang)) {
        this._country = lang;
      }
    }
    // A new country brings its usual currency unless one was chosen.
    if (!this._currencyChosen && !value.currency) {
      this._currency = undefined;
    }
    this._stage = "details";
    if (!this._progressed) {
      this._progressed = true;
      fireEvent(this, "onboarding-progress", { increase: 0.5 });
    }
  }

  protected updated(changedProps: PropertyValues) {
    super.updated(changedProps);
    if (changedProps.has("_stage") && this._stage === "details") {
      this._form?.focus();
    }
  }

  private async _save(ev) {
    if (!this._location || !this._country || !this._timeZone) {
      return;
    }
    ev.preventDefault();
    this._working = true;
    this._error = undefined;
    try {
      await saveCoreConfig(this.hass, {
        location_name: this._localize(
          "ui.panel.page-onboarding.core-config.location_name_default"
        ),
        latitude: this._location[0],
        longitude: this._location[1],
        elevation: Number(this._elevation),
        unit_system: this._effectiveUnit,
        time_zone: this._timeZone,
        currency: this._effectiveCurrency!,
        country: this._country,
        language: this._language,
      });
      const result = await onboardCoreConfigStep(this.hass);
      fireEvent(this, "onboarding-step", {
        type: "core_config",
        result,
      });
    } catch (err: any) {
      this._working = false;
      this._error = err.message;
    }
  }

  static styles = css`
    h1 {
      font-size: var(--ha-font-size-3xl);
      font-weight: var(--ha-font-weight-normal);
      line-height: var(--ha-line-height-condensed);
      margin: 0 0 var(--ha-space-2);
    }
    h2 {
      margin: 0;
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
    }
    p {
      font-size: var(--ha-font-size-m);
      line-height: var(--ha-line-height-condensed);
    }
    .stages {
      list-style: none;
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
      margin: 0 0 var(--ha-space-4);
      padding: 0;
    }
    .stages li {
      color: var(--secondary-text-color);
    }
    .stages li.current {
      color: var(--primary-text-color);
      font-weight: var(--ha-font-weight-medium);
    }
    .stages .step,
    .stages button {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-height: 44px;
      padding: 0 var(--ha-space-3);
      border: 0;
      border-radius: var(--ha-border-radius-pill, 24px);
      background: none;
      color: inherit;
      font: inherit;
    }
    .stages button {
      cursor: pointer;
      color: var(--primary-color);
    }
    .stages button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .stages li.current .step {
      background: var(--secondary-background-color);
    }
    .mark {
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      box-sizing: border-box;
      border-radius: 50%;
      border: 1px solid currentColor;
      font-size: var(--ha-font-size-s);
      --mdc-icon-size: 16px;
    }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
    .problem {
      margin: var(--ha-space-1) 0;
      min-height: 1.25em;
      color: var(--error-color);
      font-size: var(--ha-font-size-s);
    }
    .preview {
      margin-top: var(--ha-space-4);
      padding: var(--ha-space-4);
      border-radius: var(--ha-border-radius-xl);
      background: var(--secondary-background-color);
    }
    .note {
      margin: var(--ha-space-1) 0 var(--ha-space-3);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    dl {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      gap: var(--ha-space-1) var(--ha-space-4);
      margin: 0;
    }
    dt {
      color: var(--secondary-text-color);
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .review {
      margin-bottom: var(--ha-space-4);
    }
    .footer {
      margin-top: var(--ha-space-4);
      text-align: right;
    }
    .footer.split {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--ha-space-3);
    }
    @media all and (max-width: 450px) {
      dl {
        grid-template-columns: minmax(0, 1fr);
      }
      dt {
        margin-top: var(--ha-space-2);
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "onboarding-core-config": OnboardingCoreConfig;
  }
}
