import {
  mdiCrosshairsGps,
  mdiHome,
  mdiMagnify,
  mdiMapMarker,
  mdiMapSearchOutline,
  mdiWeb,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { consumeLocalize } from "../common/decorators/consume-context-entry";
import { fireEvent } from "../common/dom/fire_event";
import {
  HOME_ZONE_ENTITY_ID,
  zoneColor,
} from "../common/map/entity-map-colors";
import type { LocalizeFunc } from "../common/translations/localize";
import "../components/ha-alert";
import "../components/ha-button";
import "../components/ha-list";
import "../components/ha-list-item";
import "../components/ha-spinner";
import "../components/ha-svg-icon";
import "../components/input/ha-input";
import type { HaInput } from "../components/input/ha-input";
import "../components/map/ha-locations-editor";
import type {
  HaLocationsEditor,
  MarkerLocation,
} from "../components/map/ha-locations-editor";
import type { ConfigUpdateValues } from "../data/core";
import { detectCoreConfig } from "../data/core";
import type { OpenStreetMapPlace } from "../data/openstreetmap";
import { reverseGeocode, searchPlaces } from "../data/openstreetmap";
import { showConfirmationDialog } from "../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../types";
import { onBoardingStyles } from "./styles";

const AMSTERDAM: [number, number] = [52.3731339, 4.8903147];
const darkMql = matchMedia("(prefers-color-scheme: dark)");
const LOCATION_MARKER_ID = "location";

@customElement("onboarding-location")
class OnboardingLocation extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** Where the map starts, when the person comes back to this stage. */
  @property({ attribute: false }) public initial?: [number, number];

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @state() private _working = false;

  @state() private _location: [number, number] = AMSTERDAM;

  @state() private _places?: OpenStreetMapPlace[] | null;

  @state() private _error?: string;

  @state() private _query = "";

  @state() private _highlightedMarker?: number;

  private _elevation?: string;

  private _unitSystem?: ConfigUpdateValues["unit_system"];

  private _currency?: ConfigUpdateValues["currency"];

  private _timeZone?: ConfigUpdateValues["time_zone"];

  private _country?: ConfigUpdateValues["country"];

  @query("ha-locations-editor", true) private map!: HaLocationsEditor;

  @query("ha-input") private _input?: HTMLElement;

  protected render(): TemplateResult {
    return html`
      <h1>
        ${this._localize(
          "ui.panel.page-onboarding.core-config.location_header"
        )}
      </h1>
      ${
        this._error
          ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
          : nothing
      }

      <p>
        ${this._localize("ui.panel.page-onboarding.core-config.intro_location")}
      </p>

      <div class="choices">
        <ha-button
          appearance="outlined"
          .disabled=${this._working}
          @click=${this._detectFromDevice}
        >
          <ha-svg-icon slot="start" .path=${mdiCrosshairsGps}></ha-svg-icon>
          ${this._localize("ui.panel.page-onboarding.core-config.use_device")}
        </ha-button>
        <p class="note">
          ${this._localize(
            "ui.panel.page-onboarding.core-config.use_device_note"
          )}
        </p>
        <ha-button
          appearance="outlined"
          .disabled=${this._working}
          @click=${this._whoAmI}
        >
          <ha-svg-icon slot="start" .path=${mdiWeb}></ha-svg-icon>
          ${this._localize("ui.panel.page-onboarding.core-config.use_internet")}
        </ha-button>
        <p class="note">
          ${this._localize(
            "ui.panel.page-onboarding.core-config.use_internet_note"
          )}
        </p>
      </div>

      <div class="location-search">
        <ha-input
          label=${this._localize(
            "ui.panel.page-onboarding.core-config.address_label"
          )}
          .value=${this._query}
          .disabled=${this._working}
          @input=${this._queryChanged}
          @keyup=${this._stopKeyup}
        >
          <ha-svg-icon slot="start" .path=${mdiMagnify}></ha-svg-icon>
          ${
            this._working
              ? html`<ha-spinner slot="end" size="small"></ha-spinner>`
              : nothing
          }
        </ha-input>
        <ha-button
          class="outside"
          appearance="outlined"
          .disabled=${this._working || this._query.trim() === ""}
          @click=${this._runSearch}
        >
          <ha-svg-icon slot="start" .path=${mdiMapSearchOutline}></ha-svg-icon>
          ${this._localize("ui.panel.page-onboarding.core-config.search_osm")}
        </ha-button>
        <p class="note">
          ${this._localize("ui.panel.page-onboarding.core-config.search_note")}
        </p>
        ${
          this._places !== undefined
            ? html`
                <ha-list activatable>
                  ${
                    this._places?.length
                      ? this._places.map((place) => {
                          const primary = [
                            place.name || place.address[place.category],
                            place.address.house_number,
                            place.address.road || place.address.waterway,
                            place.address.village || place.address.town,
                            place.address.suburb || place.address.subdivision,
                            place.address.city || place.address.municipality,
                          ]
                            .filter(Boolean)
                            .join(", ");
                          const secondary = [
                            place.address.county ||
                              place.address.state_district ||
                              place.address.region,
                            place.address.state,
                            place.address.country,
                          ]
                            .filter(Boolean)
                            .join(", ");
                          return html`<ha-list-item
                            @click=${this._itemClicked}
                            .placeId=${place.place_id}
                            .selected=${this._highlightedMarker === place.place_id}
                            .activated=${this._highlightedMarker === place.place_id}
                            .twoline=${primary && secondary}
                          >
                            ${primary || secondary}
                            <span slot="secondary"
                              >${primary ? secondary : ""}</span
                            >
                          </ha-list-item>`;
                        })
                      : html`<ha-list-item noninteractive
                          >${
                            this._places === null
                              ? ""
                              : this._localize(
                                  "ui.panel.page-onboarding.core-config.no_results"
                                )
                          }</ha-list-item
                        >`
                  }
                </ha-list>
              `
            : nothing
        }
      </div>
      <ha-locations-editor
        class="flex"
        .locations=${this._markerLocations(
          this._location,
          this._places,
          this._highlightedMarker,
          zoneColor(HOME_ZONE_ENTITY_ID, false, [], getComputedStyle(this))
        )}
        zoom="14"
        .themeMode=${darkMql.matches ? "dark" : "light"}
        .disabled=${this._working}
        @location-updated=${this._locationChanged}
        @marker-clicked=${this._markerClicked}
      ></ha-locations-editor>

      <div class="lookup">
        <ha-button
          appearance="outlined"
          .disabled=${this._working}
          @click=${this._reverseGeocode}
        >
          <ha-svg-icon slot="start" .path=${mdiMapMarker}></ha-svg-icon>
          ${this._localize("ui.panel.page-onboarding.core-config.lookup_osm")}
        </ha-button>
        <p class="note">
          ${this._localize("ui.panel.page-onboarding.core-config.lookup_note")}
        </p>
      </div>

      <div class="footer">
        <ha-button @click=${this._save} .disabled=${this._working}>
          ${this._localize("ui.panel.page-onboarding.core-config.finish")}
        </ha-button>
      </div>
    `;
  }

  protected willUpdate(changedProps: PropertyValues<this>) {
    super.willUpdate(changedProps);
    if (changedProps.has("initial") && this.initial) {
      this._location = this.initial;
    }
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    setTimeout(() => this._input!.focus(), 100);
    this.addEventListener("keyup", (ev) => {
      if (ev.key !== "Enter") {
        return;
      }
      // Enter on a focused button or list item activates that control; it
      // must not also save the step with a half-finished choice.
      const activates = ev
        .composedPath()
        .some(
          (el) =>
            el instanceof HTMLElement &&
            ["button", "a", "ha-button", "ha-list-item", "ha-input"].includes(
              el.localName
            )
        );
      if (!activates) {
        this._save(ev);
      }
    });
  }

  protected updated(changedProps: PropertyValues) {
    if (changedProps.has("_highlightedMarker") && this._highlightedMarker) {
      const place = this._places?.find(
        (plc) => plc.place_id === this._highlightedMarker
      );
      if (place?.boundingbox?.length === 4) {
        this.map.fitBounds(
          [
            [place.boundingbox[0], place.boundingbox[2]],
            [place.boundingbox[1], place.boundingbox[3]],
          ],
          { zoom: 16, pad: 0 }
        );
      } else {
        this.map.fitMarker(String(this._highlightedMarker), { zoom: 16 });
      }
    }
  }

  private _markerLocations = memoizeOne(
    (
      location: [number, number] | undefined,
      places: OpenStreetMapPlace[] | null | undefined,
      highlightedMarker: number | undefined,
      homeColor: string
    ): MarkerLocation[] => {
      // Drawn like the home zone on a map
      const home: Pick<
        MarkerLocation,
        "iconPath" | "zone_marker" | "radius_color"
      > = {
        iconPath: mdiHome,
        zone_marker: true,
        radius_color: homeColor,
      };
      if (!places) {
        return [
          {
            id: LOCATION_MARKER_ID,
            ...home,
            latitude: (location || AMSTERDAM)[0],
            longitude: (location || AMSTERDAM)[1],
            location_editable: true,
          },
        ];
      }
      return places?.length
        ? places.map((place) => ({
            id: String(place.place_id),
            ...(place.place_id === highlightedMarker
              ? home
              : { iconPath: mdiMapMarker }),
            latitude:
              location && place.place_id === highlightedMarker
                ? location[0]
                : Number(place.lat),
            longitude:
              location && place.place_id === highlightedMarker
                ? location[1]
                : Number(place.lon),
            location_editable: place.place_id === highlightedMarker,
            clickable: true,
          }))
        : [];
    }
  );

  private _locationChanged(ev) {
    this._location = ev.detail.location;
  }

  private _markerClicked(ev) {
    if (ev.detail.id === LOCATION_MARKER_ID) {
      return;
    }
    this._highlightedMarker = Number(ev.detail.id);
    const place = this._places!.find(
      (plc) => plc.place_id === Number(ev.detail.id)
    )!;
    this._location = [Number(place.lat), Number(place.lon)];
    this._country = place.address.country_code.toUpperCase();
  }

  private _itemClicked(ev) {
    this._highlightedMarker = ev.currentTarget.placeId;
    const place = this._places!.find(
      (plc) => plc.place_id === ev.currentTarget.placeId
    )!;
    this._location = [Number(place.lat), Number(place.lon)];
    this._country = place.address.country_code.toUpperCase();
  }

  private _queryChanged(ev: Event) {
    this._query = (ev.target as HaInput).value ?? "";
  }

  // Pressing Enter in the field never contacts the outside service; only the
  // labelled button does. The key is kept from reaching the step's own
  // Enter handler as well.
  private _stopKeyup(ev: KeyboardEvent) {
    ev.stopPropagation();
  }

  private _runSearch() {
    this._searchAddress(this._query);
  }

  private async _searchAddress(address: string) {
    this._working = true;
    this._highlightedMarker = undefined;
    this._error = undefined;
    this._places = null;
    this.map.addEventListener(
      "markers-updated",
      () => {
        setTimeout(() => {
          if ((this._places?.length || 0) > 2) {
            this.map.fitMap({ pad: 0.5 });
          }
        }, 500);
      },
      {
        once: true,
      }
    );
    try {
      this._places = await searchPlaces(address, this.hass, true, 3);
      if (this._places?.length) {
        this._highlightedMarker = this._places[0].place_id;
        this._location = [
          Number(this._places[0].lat),
          Number(this._places[0].lon),
        ];
        this._country = this._places[0].address.country_code.toUpperCase();
      }
    } catch (e: any) {
      this._places = undefined;
      this._error = e.message;
    } finally {
      this._working = false;
    }
  }

  // Contacts the outside address service, and only when the person asks.
  private async _reverseGeocode() {
    if (!this._location) {
      return;
    }
    this._working = true;
    this._error = undefined;
    this._places = null;
    try {
      const reverse = await reverseGeocode(this._location, this.hass);
      this._country = reverse.address.country_code.toUpperCase();
      this._places = [reverse];
      this._highlightedMarker = reverse.place_id;
    } catch (e: any) {
      this._places = undefined;
      this._error = e.message;
    } finally {
      this._working = false;
    }
  }

  // Uses the position the browser reports. Nothing is looked up afterwards.
  private _detectFromDevice() {
    this._error = undefined;
    if (!window.isSecureContext || !navigator.geolocation) {
      this._error = this._localize(
        "ui.panel.page-onboarding.core-config.device_unavailable"
      );
      return;
    }
    this._working = true;
    navigator.geolocation.getCurrentPosition(
      (result) => {
        this.map.addEventListener(
          "markers-updated",
          () => {
            this.map.fitMarker(LOCATION_MARKER_ID);
          },
          {
            once: true,
          }
        );
        this._places = undefined;
        this._highlightedMarker = undefined;
        this._location = [result.coords.latitude, result.coords.longitude];
        if (result.coords.altitude) {
          this._elevation = String(Math.round(result.coords.altitude));
        }
        this._working = false;
      },
      () => {
        this._working = false;
        this._error = this._localize(
          "ui.panel.page-onboarding.core-config.device_unavailable"
        );
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  }

  private async _whoAmI() {
    const confirm = await showConfirmationDialog(this, {
      title: this._localize(
        "ui.panel.page-onboarding.core-config.title_location_detect"
      ),
      text: this._localize(
        "ui.panel.page-onboarding.core-config.intro_location_detect"
      ),
    });
    if (!confirm) {
      return;
    }
    this._working = true;
    try {
      const values = await detectCoreConfig(this.hass);

      if (values.latitude && values.longitude) {
        this.map.addEventListener(
          "markers-updated",
          () => {
            this.map.fitMarker(LOCATION_MARKER_ID);
          },
          {
            once: true,
          }
        );
        this._location = [Number(values.latitude), Number(values.longitude)];
      }
      if (values.elevation) {
        this._elevation = String(values.elevation);
      }
      if (values.unit_system) {
        this._unitSystem = values.unit_system;
      }
      if (values.time_zone) {
        this._timeZone = values.time_zone;
      }
      if (values.currency) {
        this._currency = values.currency;
      }
      if (values.country) {
        this._country = values.country;
      }
    } catch (err: any) {
      this._error = this._localize(
        "ui.panel.page-onboarding.core-config.detect_failed",
        { error: err.message }
      );
    } finally {
      this._working = false;
    }
  }

  private async _save(ev) {
    if (!this._location) {
      return;
    }
    ev.preventDefault();
    fireEvent(this, "value-changed", {
      value: {
        location: this._location!,
        country: this._country,
        elevation: this._elevation,
        unit_system: this._unitSystem,
        time_zone: this._timeZone,
        currency: this._currency,
      },
    });
  }

  static get styles(): CSSResultGroup {
    return [
      onBoardingStyles,
      css`
        .choices,
        .location-search,
        .lookup {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: var(--ha-space-2);
        }
        .choices {
          margin-top: var(--ha-space-4);
        }
        .location-search {
          margin-top: var(--ha-space-6);
          margin-bottom: var(--ha-space-4);
        }
        .location-search ha-input {
          width: 100%;
        }
        .lookup {
          margin-top: var(--ha-space-4);
          margin-bottom: var(--ha-space-4);
        }
        ha-button {
          --ha-button-height: 44px;
        }
        .note {
          margin: 0 0 var(--ha-space-3);
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
          line-height: var(--ha-line-height-normal);
        }
        ha-locations-editor {
          display: block;
          height: 300px;
          margin-top: 8px;
          border-radius: var(--mdc-shape-large, 16px);
          overflow: hidden;
        }
        ha-list {
          width: 100%;
          border: 1px solid var(--divider-color);
          box-sizing: border-box;
          border-top-width: 0;
          border-bottom-left-radius: var(--mdc-shape-small, 4px);
          border-bottom-right-radius: var(--mdc-shape-small, 4px);
          --mdc-list-vertical-padding: 0;
        }
        ha-list-item {
          height: 72px;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "onboarding-location": OnboardingLocation;
  }
}
