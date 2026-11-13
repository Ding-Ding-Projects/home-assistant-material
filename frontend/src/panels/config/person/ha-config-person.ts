import { mdiInformationOutline, mdiPencil, mdiPlus } from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
import { formatDateTime } from "../../../common/datetime/format_date_time";
import { formatTime } from "../../../common/datetime/format_time";
import { computeDomain } from "../../../common/entity/compute_domain";
import { stringCompare } from "../../../common/string/compare";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-icon-button";
import "../../../components/ha-list";
import "../../../components/ha-list-item";
import "../../../components/ha-svg-icon";
import "../../../components/user/ha-person-badge";
import type { Person } from "../../../data/person";
import {
  createPerson,
  deletePerson,
  fetchPersons,
  updatePerson,
} from "../../../data/person";
import type { User } from "../../../data/user";
import { fetchUsers } from "../../../data/user";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-loading-screen";
import "../../../layouts/hass-tabs-subpage";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant, Route } from "../../../types";
import { documentationUrl } from "../../../util/documentation-url";
import { configSections } from "../config-sections";
import {
  loadPersonDetailDialog,
  showPersonDetailDialog,
} from "./show-dialog-person-detail";

const AVATAR_TONES = 4;

@customElement("ha-config-person")
export class HaConfigPerson extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ attribute: false }) public route!: Route;

  @state() private _storageItems?: Person[];

  @state() private _configItems?: Person[];

  private _usersLoad?: Promise<User[]>;

  /** The person entity of every person, keyed by the person's id. */
  private _personEntities = memoizeOne(
    (states: HomeAssistant["states"]): Map<string, HassEntity> => {
      const entities = new Map<string, HassEntity>();
      for (const stateObj of Object.values(states)) {
        if (
          computeDomain(stateObj.entity_id) === "person" &&
          stateObj.attributes.id
        ) {
          entities.set(stateObj.attributes.id, stateObj);
        }
      }
      return entities;
    }
  );

  protected render() {
    if (
      !this.hass ||
      this._storageItems === undefined ||
      this._configItems === undefined
    ) {
      return html` <hass-loading-screen></hass-loading-screen> `;
    }
    const hass = this.hass;
    const hasSignInlessPerson = this._storageItems.some(
      (person) => !person.user_id
    );
    return html`
      <hass-tabs-subpage
        .hass=${this.hass}
        .route=${this.route}
        back-path="/config"
        .tabs=${configSections.persons}
        .summary=${hass.localize("ui.panel.config.person.summary")}
      >
        <div class="page">
          <header>
            <div class="titles">
              <p>
                <a
                  href=${documentationUrl(hass, "/integrations/person/")}
                  target="_blank"
                  rel="noreferrer"
                >
                  ${hass.localize("ui.panel.config.person.learn_more")}
                </a>
              </p>
            </div>
            <ha-button size="l" @click=${this._createPerson}>
              <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
              ${hass.localize("ui.panel.config.person.add_person")}
            </ha-button>
          </header>
          ${
            this._storageItems.length === 0
              ? html`<div class="empty">
                  <p>
                    ${hass.localize(
                      "ui.panel.config.person.no_persons_created_yet"
                    )}
                  </p>
                  <ha-button appearance="filled" @click=${this._createPerson}>
                    <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
                    ${hass.localize("ui.panel.config.person.create_person")}
                  </ha-button>
                </div>`
              : html`<div class="cards">
                  ${this._storageItems.map((person, index) =>
                    this._renderPerson(person, index)
                  )}
                </div>`
          }
          ${
            this._configItems.length > 0
              ? html`<section class="yaml">
                  <h2>
                    ${hass.localize("ui.panel.config.person.yaml_persons")}
                  </h2>
                  <p>
                    ${hass.localize(
                      "ui.panel.config.person.note_about_persons_configured_in_yaml"
                    )}
                  </p>
                  <ha-card outlined>
                    <ha-list>
                      ${this._configItems.map(
                        (entry) => html`
                          <ha-list-item graphic="avatar">
                            <ha-person-badge
                              .person=${entry}
                              slot="graphic"
                            ></ha-person-badge>
                            <span>${entry.name}</span>
                          </ha-list-item>
                        `
                      )}
                    </ha-list>
                  </ha-card>
                </section>`
              : nothing
          }
          ${
            hasSignInlessPerson
              ? html`<div class="note">
                  <ha-svg-icon .path=${mdiInformationOutline}></ha-svg-icon>
                  <span
                    >${hass.localize(
                      "ui.panel.config.person.note_no_sign_in"
                    )}</span
                  >
                </div>`
              : nothing
          }
        </div>
      </hass-tabs-subpage>
    `;
  }

  private _renderPerson(person: Person, index: number) {
    const hass = this.hass!;
    const trackers = (person.device_trackers ?? [])
      .map(
        (entityId) =>
          hass.states[entityId]?.attributes.friendly_name ?? entityId
      )
      .join(", ");
    return html`
      <ha-card
        outlined
        class="person"
        .entry=${person}
        @click=${this._openEditEntry}
      >
        <div class="top">
          <ha-person-badge
            .person=${person}
            class=${classMap({
              avatar: true,
              [`tone-${index % AVATAR_TONES}`]: true,
            })}
          ></ha-person-badge>
          <div class="text">
            <span class="name">${person.name}</span>
            <span class="where">${this._presence(person)}</span>
          </div>
          <ha-icon-button
            .path=${mdiPencil}
            .label=${hass.localize("ui.panel.config.person.edit_person", {
              name: person.name,
            })}
            .entry=${person}
            @click=${this._openEditEntry}
          ></ha-icon-button>
        </div>
        <div class="chips">
          <span class="chip ${classMap({ "can-sign-in": !!person.user_id })}">
            ${hass.localize(
              person.user_id
                ? "ui.panel.config.person.can_sign_in"
                : "ui.panel.config.person.no_sign_in"
            )}
          </span>
          ${trackers ? html`<span class="chip">${trackers}</span>` : nothing}
        </div>
      </ha-card>
    `;
  }

  /** Where the person is, and since when, from their person entity. */
  private _presence(person: Person): string {
    const hass = this.hass!;
    const stateObj = this._personEntities(hass.states).get(person.id);
    if (!stateObj || stateObj.state === "unavailable") {
      return hass.localize("ui.panel.config.person.state_unknown");
    }
    const since = new Date(stateObj.last_changed);
    const sameDay = since.toDateString() === new Date().toDateString();
    return hass.localize("ui.panel.config.person.state_since", {
      state: hass.formatEntityState(stateObj),
      time: sameDay
        ? formatTime(since, hass.locale, hass.config)
        : formatDateTime(since, hass.locale, hass.config),
    });
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    this._fetchData();
    loadPersonDetailDialog();
  }

  private async _fetchData() {
    this._usersLoad = fetchUsers(this.hass!.callWS);
    const personData = await fetchPersons(this.hass!);

    this._storageItems = personData.storage.sort((ent1, ent2) =>
      stringCompare(ent1.name, ent2.name, this.hass!.locale.language)
    );
    this._configItems = personData.config.sort((ent1, ent2) =>
      stringCompare(ent1.name, ent2.name, this.hass!.locale.language)
    );
    this._openDialogIfPersonSpecifiedInRoute();
  }

  private _openDialogIfPersonSpecifiedInRoute() {
    if (!this.route.path.includes("/edit/")) {
      return;
    }

    const routeSegments = this.route.path.split("/edit/");
    const personId = routeSegments.length > 1 ? routeSegments[1] : null;
    if (!personId) {
      return;
    }

    const personToEdit = this._storageItems!.find((p) => p.id === personId);
    if (personToEdit) {
      this._openDialog(personToEdit);
    } else {
      showAlertDialog(this, {
        title: this.hass?.localize(
          "ui.panel.config.person.person_not_found_title"
        ),
        text: this.hass?.localize("ui.panel.config.person.person_not_found"),
      });
    }
  }

  private _createPerson() {
    this._openDialog();
  }

  private _openEditEntry(ev: Event) {
    ev.stopPropagation();
    const entry: Person = (ev.currentTarget! as any).entry;
    this._openDialog(entry);
  }

  private _allowedUsers(users: User[], currentPerson?: Person) {
    const used = new Set();
    for (const coll of [this._configItems, this._storageItems]) {
      for (const pers of coll!) {
        if (pers.user_id) {
          used.add(pers.user_id);
        }
      }
    }
    const currentUserId = currentPerson ? currentPerson.user_id : undefined;
    return users.filter(
      (user) => user.id === currentUserId || !used.has(user.id)
    );
  }

  private async _openDialog(entry?: Person) {
    const users = await this._usersLoad!;

    showPersonDetailDialog(this, {
      entry,
      users: this._allowedUsers(users, entry),
      createEntry: async (values) => {
        const created = await createPerson(this.hass!, values);
        this._storageItems = this._storageItems!.concat(created).sort(
          (ent1, ent2) =>
            stringCompare(ent1.name, ent2.name, this.hass!.locale.language)
        );
      },
      updateEntry: async (values) => {
        const updated = await updatePerson(this.hass!, entry!.id, values);
        this._storageItems = this._storageItems!.map((ent) =>
          ent === entry ? updated : ent
        );
      },
      removeEntry: async () => {
        if (
          !(await showConfirmationDialog(this, {
            title: this.hass!.localize(
              "ui.panel.config.person.confirm_delete_title",
              { name: entry!.name }
            ),
            text: this.hass!.localize(
              "ui.panel.config.person.confirm_delete_text"
            ),
            dismissText: this.hass!.localize("ui.common.cancel"),
            confirmText: this.hass!.localize("ui.common.delete"),
            destructive: true,
          }))
        ) {
          return false;
        }

        try {
          await deletePerson(this.hass!, entry!.id);
          this._storageItems = this._storageItems!.filter(
            (ent) => ent !== entry
          );
          return true;
        } catch (_err: any) {
          return false;
        }
      },
      refreshUsers: () => {
        this._usersLoad = fetchUsers(this.hass!.callWS);
      },
    });
  }

  static styles = [
    haStyle,
    css`
      :host {
        display: block;
      }
      .page {
        box-sizing: border-box;
        max-width: 1100px;
        margin: 0 auto;
        padding: var(--ha-space-4) var(--ha-space-8) var(--ha-space-8);
      }
      @media (max-width: 600px) {
        .page {
          padding: var(--ha-space-2) var(--ha-space-3) var(--ha-space-6);
        }
      }
      header {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: var(--ha-space-3);
        margin-bottom: var(--ha-space-5);
      }
      .titles {
        flex: 1;
        min-width: 220px;
      }
      .titles p {
        margin: 0;
        font-size: var(--ha-font-size-l);
        color: var(--secondary-text-color);
      }
      a {
        color: var(--primary-color);
      }
      .cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
        gap: var(--ha-space-4);
      }
      .person {
        box-sizing: border-box;
        padding: var(--ha-space-5) var(--ha-space-6);
        border-radius: var(--ha-border-radius-3xl);
        background: var(--card-background-color);
        cursor: pointer;
      }
      .top {
        display: flex;
        align-items: center;
        gap: var(--ha-space-4);
      }
      .avatar {
        flex: none;
        width: 64px;
        height: 64px;
        --ha-picture-border-radius: var(--ha-border-radius-2xl);
        --person-badge-font-size: var(--ha-font-size-2xl);
        --ha-person-badge-font-size-long: var(--ha-font-size-xl);
        --light-primary-color: color-mix(
          in srgb,
          var(--tone, var(--primary-color)) 22%,
          var(--card-background-color)
        );
        --text-light-primary-color: var(--primary-text-color);
      }
      .tone-1 {
        --tone: var(--accent-color, var(--primary-color));
      }
      .tone-2 {
        --tone: var(--warning-color, var(--primary-color));
      }
      .tone-3 {
        --tone: var(--success-color, var(--primary-color));
      }
      .text {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: var(--ha-space-1);
        min-width: 0;
      }
      .name {
        font-size: var(--ha-font-size-xl);
        font-weight: var(--ha-font-weight-medium);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .where {
        color: var(--secondary-text-color);
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
        margin-top: var(--ha-space-4);
      }
      .chip {
        padding: var(--ha-space-1) var(--ha-space-3);
        border-radius: var(--ha-border-radius-pill);
        background: var(--secondary-background-color);
        font-size: var(--ha-font-size-s);
        font-weight: var(--ha-font-weight-medium);
      }
      .chip.can-sign-in {
        background: color-mix(
          in srgb,
          var(--primary-color) 18%,
          var(--card-background-color)
        );
      }
      .note {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3);
        margin-top: var(--ha-space-4);
        padding: var(--ha-space-4) var(--ha-space-5);
        border-radius: var(--ha-border-radius-xl);
        background: var(--secondary-background-color);
        color: var(--secondary-text-color);
      }
      .note ha-svg-icon {
        flex: none;
      }
      .yaml {
        margin-top: var(--ha-space-6);
      }
      .yaml h2 {
        margin: 0 0 var(--ha-space-1);
        font-size: var(--ha-font-size-l);
        font-weight: var(--ha-font-weight-medium);
      }
      .yaml p {
        margin: 0 0 var(--ha-space-3);
        color: var(--secondary-text-color);
      }
      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--ha-space-3);
        padding: var(--ha-space-8) var(--ha-space-4);
        border-radius: var(--ha-border-radius-3xl);
        background: var(--card-background-color);
        color: var(--secondary-text-color);
        text-align: center;
      }
      .empty p {
        margin: 0;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-person": HaConfigPerson;
  }
}
