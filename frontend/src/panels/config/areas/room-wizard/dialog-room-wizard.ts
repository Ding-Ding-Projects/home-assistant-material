import {
  mdiDevices,
  mdiDoorOpen,
  mdiLightbulbOutline,
  mdiMotionSensor,
  mdiPowerPlugOutline,
  mdiThermometer,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, queryAll, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../../../common/dom/fire_event";
import { computeDeviceNameDisplay } from "../../../../common/entity/compute_device_name";
import { modeText } from "../../../../common/language-mode/language-mode";
import { playPageEntry } from "../../../../common/motion/page-entry";
import "../../../../components/ha-alert";
import "../../../../components/ha-area-picker";
import "../../../../components/ha-button";
import "../../../../components/ha-checkbox";
import "../../../../components/ha-dialog";
import "../../../../components/ha-dialog-footer";
import "../../../../components/ha-floor-picker";
import "../../../../components/ha-icon-picker";
import "../../../../components/ha-svg-icon";
import "../../../../components/input/ha-input";
import type { HaInput } from "../../../../components/input/ha-input";
import { createAreaRegistryEntry } from "../../../../data/area/area_registry";
import type { AutomationConfig } from "../../../../data/automation";
import { saveAutomationConfig } from "../../../../data/automation";
import { updateDeviceRegistryEntry } from "../../../../data/device/device_registry";
import type { HassDialog } from "../../../../dialogs/make-dialog-manager";
import { haStyleDialog } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import type {
  DeviceInput,
  DeviceKind,
  EntityInput,
  NeedKind,
  RoomDraft,
  StarterId,
  WizardDevice,
  WizardStep,
} from "./room-wizard";
import {
  buildAreaCreateParams,
  buildStarterConfig,
  buildWizardDevices,
  clearDraft,
  emptyDraft,
  loadDraft,
  newAutomationId,
  offerStarters,
  preselectByName,
  roomCapabilities,
  saveDraft,
  WIZARD_STEPS,
} from "./room-wizard";

const KIND_ICONS: Record<DeviceKind, string> = {
  light: mdiLightbulbOutline,
  opening: mdiDoorOpen,
  motion: mdiMotionSensor,
  temperature: mdiThermometer,
  plug: mdiPowerPlugOutline,
  other: mdiDevices,
};

const PREFIX = "ui.panel.config.areas.room_wizard.";

const errorMessage = (err: unknown): string =>
  err instanceof Error
    ? err.message
    : typeof err === "object" && err && "message" in err
      ? String((err as { message: unknown }).message)
      : String(err);

@customElement("dialog-room-wizard")
class DialogRoomWizard
  extends LitElement
  implements HassDialog<Record<string, never>>
{
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _open = false;

  @state() private _draft: RoomDraft = emptyDraft();

  @state() private _useExisting = false;

  @state() private _busy = false;

  @state() private _error?: string;

  @state() private _resumed = false;

  @state() private _nameInvalid = false;

  @queryAll(".step-body > *") private _blocks!: NodeListOf<Element>;

  private _lastStep?: WizardStep;

  private _buildDevices = memoizeOne(
    (
      devices: HomeAssistant["devices"],
      entities: HomeAssistant["entities"],
      states: HomeAssistant["states"],
      localize: HomeAssistant["localize"]
    ): WizardDevice[] => {
      const deviceInputs: DeviceInput[] = Object.values(devices).map(
        (device) => ({
          id: device.id,
          name: computeDeviceNameDisplay(device, localize),
          areaId: device.area_id,
          disabled: Boolean(device.disabled_by),
          isService: device.entry_type === "service",
        })
      );
      const entityInputs: EntityInput[] = Object.values(entities).map(
        (entity) => ({
          entityId: entity.entity_id,
          deviceId: entity.device_id,
          hidden: entity.hidden,
          category: entity.entity_category,
          deviceClass:
            (states[entity.entity_id]?.attributes?.device_class as
              string | undefined) ?? null,
        })
      );
      return buildWizardDevices(deviceInputs, entityInputs);
    }
  );

  public showDialog(_params: Record<string, never>): void {
    const saved = loadDraft(this._storage(), this.hass.user?.id);
    this._resumed = Boolean(
      saved && (saved.step !== "name" || saved.name.trim() || saved.areaId)
    );
    this._draft = saved && saved.step !== "done" ? saved : emptyDraft();
    if (saved?.step === "done") {
      clearDraft(this._storage(), this.hass.user?.id);
    }
    this._useExisting = false;
    this._error = undefined;
    this._busy = false;
    this._nameInvalid = false;
    this._lastStep = undefined;
    this._open = true;
  }

  public closeDialog(): boolean {
    this._open = false;
    return true;
  }

  private _dialogClosed(): void {
    // Escape closes the dialog without going through closeDialog.
    this._open = false;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private _storage(): Storage {
    return window.localStorage;
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return modeText(
      this.hass.localize as any,
      `${PREFIX}${key}` as any,
      values
    );
  }

  private _starterText = (
    key: string,
    values?: Record<string, string | number>
  ): string => modeText(this.hass.localize as any, key as any, values);

  private _persist(patch: Partial<RoomDraft>): void {
    this._draft = { ...this._draft, ...patch };
    if (this._draft.step === "done") {
      clearDraft(this._storage(), this.hass.user?.id);
    } else {
      saveDraft(this._storage(), this.hass.user?.id, this._draft);
    }
  }

  private _devices(): WizardDevice[] {
    return this._buildDevices(
      this.hass.devices,
      this.hass.entities,
      this.hass.states,
      this.hass.localize
    );
  }

  /** The devices the room has: those already in it and those ticked. */
  private _roomDevices(): WizardDevice[] {
    const selected = new Set(this._draft.selectedDeviceIds);
    return this._devices().filter(
      (device) =>
        selected.has(device.id) ||
        (this._draft.areaId !== null && device.areaId === this._draft.areaId)
    );
  }

  protected updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    const step = this._draft.step;
    if (this._open && step !== this._lastStep) {
      this._lastStep = step;
      playPageEntry(Array.from(this._blocks));
    }
  }

  protected render() {
    if (!this._open) {
      return nothing;
    }
    const step = this._draft.step;
    const index = WIZARD_STEPS.indexOf(step);
    return html`
      <ha-dialog
        .open=${this._open}
        header-title=${this._t("title")}
        header-subtitle=${this._t("step_of", {
          step: index + 1,
          total: WIZARD_STEPS.length,
        })}
        @closed=${this._dialogClosed}
      >
        <div class="wizard">
          ${this._renderStrip(index)}
          ${
            this._resumed && step !== "done"
              ? html`<ha-alert alert-type="info">
                  ${this._t("resumed")}
                  <ha-button
                    slot="action"
                    appearance="plain"
                    size="small"
                    @click=${this._startOver}
                  >
                    ${this._t("start_over")}
                  </ha-button>
                </ha-alert>`
              : nothing
          }
          ${
            this._error
              ? html`<ha-alert alert-type="error">
                  ${this._error}
                  <ha-button
                    slot="action"
                    appearance="plain"
                    size="small"
                    @click=${this._next}
                  >
                    ${this.hass.localize("ui.common.retry")}
                  </ha-button>
                </ha-alert>`
              : nothing
          }
          <div class="step-body">${this._renderStep()}</div>
        </div>
        ${this._renderFooter()}
      </ha-dialog>
    `;
  }

  private _renderStrip(current: number) {
    return html`
      <ol class="strip">
        ${WIZARD_STEPS.map(
          (step, i) => html`
            <li
              class=${i === current ? "current" : i < current ? "past" : ""}
              aria-current=${i === current ? "step" : "false"}
            >
              <span class="num">${i + 1}</span>
              <span class="label">${this._t(`steps.${step}`)}</span>
            </li>
          `
        )}
      </ol>
    `;
  }

  private _renderStep() {
    switch (this._draft.step) {
      case "name":
        return this._renderName();
      case "devices":
        return this._renderDevices();
      case "starters":
        return this._renderStarters();
      default:
        return this._renderDone();
    }
  }

  private _renderName() {
    const locked = this._draft.areaId !== null;
    return html`
      <h2>${this._t("name_heading")}</h2>
      <p class="hint">${this._t("name_hint")}</p>
      ${
        this._useExisting
          ? html`<ha-area-picker
              .hass=${this.hass}
              .label=${this._t("existing_label")}
              .value=${this._draft.areaId ?? undefined}
              no-add
              .disabled=${locked && this._draft.areaId !== null}
              @value-changed=${this._existingChanged}
            ></ha-area-picker>`
          : html`
              <ha-input
                autofocus
                .label=${this._t("name_label")}
                .value=${this._draft.name}
                .disabled=${locked}
                required
                .validationMessage=${this._t("name_required")}
                .invalid=${this._nameInvalid}
                @input=${this._nameChanged}
              ></ha-input>
              <ha-floor-picker
                .hass=${this.hass}
                .label=${this._t("floor_label")}
                .value=${this._draft.floorId}
                .disabled=${locked}
                @value-changed=${this._floorChanged}
              ></ha-floor-picker>
              <ha-icon-picker
                .hass=${this.hass}
                .label=${this._t("icon_label")}
                .value=${this._draft.icon}
                .disabled=${locked}
                @value-changed=${this._iconChanged}
              ></ha-icon-picker>
            `
      }
      ${
        !locked
          ? html`<ha-checkbox
              class="existing-toggle"
              .checked=${this._useExisting}
              @change=${this._toggleExisting}
            >
              ${this._t("use_existing")}
            </ha-checkbox>`
          : nothing
      }
    `;
  }

  private _renderDevices() {
    const selected = new Set(this._draft.selectedDeviceIds);
    const nameMatches = new Set(
      preselectByName(this._candidateDevices(), this._draft.name)
    );
    const candidates = this._candidateDevices();
    return html`
      <h2>${this._t("devices_heading", { room: this._draft.name })}</h2>
      ${
        candidates.length
          ? html`<p class="hint">
                ${this._t("devices_summary", { count: candidates.length })}
              </p>
              <div class="tiles">
                ${candidates.map(
                  (device) => html`
                    <button
                      type="button"
                      class="tile"
                      aria-pressed=${selected.has(device.id) ? "true" : "false"}
                      .deviceId=${device.id}
                      @click=${this._toggleDevice}
                    >
                      <ha-svg-icon
                        .path=${KIND_ICONS[device.kind]}
                      ></ha-svg-icon>
                      <span class="tile-text">
                        <span class="tile-name">${device.name}</span>
                        <span class="tile-sub">
                          ${this._t(`kind.${device.kind}`)} ·
                          ${
                            nameMatches.has(device.id)
                              ? this._t("hint_name", {
                                  room: this._draft.name,
                                })
                              : this._t("hint_none")
                          }
                        </span>
                      </span>
                    </button>
                  `
                )}
              </div>`
          : html`<p class="hint">${this._t("devices_none")}</p>`
      }
    `;
  }

  /** Devices with no room yet, plus the ones this wizard already moved in. */
  private _candidateDevices(): WizardDevice[] {
    const selected = new Set(this._draft.selectedDeviceIds);
    return this._devices()
      .filter((device) => !device.areaId || selected.has(device.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private _renderStarters() {
    const offers = offerStarters(this._roomDevices());
    const chosen = new Set(this._draft.selectedStarterIds);
    return html`
      <h2>${this._t("starters_heading")}</h2>
      <p class="hint">${this._t("starters_hint")}</p>
      <div class="starters">
        ${offers.map((offer) => {
          const needs = this._needsText(offer.needs);
          return html`
            <button
              type="button"
              class="starter"
              aria-pressed=${
                offer.available && chosen.has(offer.id) ? "true" : "false"
              }
              ?disabled=${!offer.available}
              .starterId=${offer.id}
              @click=${this._toggleStarter}
            >
              <span class="tile-text">
                <span class="tile-name">
                  ${this._t(`starter.${offer.id}.title`, {
                    room: this._draft.name,
                  })}
                </span>
                <span class="tile-sub">
                  ${
                    offer.available
                      ? this._t("need_have", { needs })
                      : this._t("need_missing", { needs })
                  }
                </span>
              </span>
            </button>
          `;
        })}
      </div>
      <p class="note">${this._t("starters_note")}</p>
    `;
  }

  private _needsText(needs: NeedKind[]): string {
    return needs.map((need) => this._t(`need.${need}`)).join(" + ");
  }

  private _renderDone() {
    const created = Object.entries(this._draft.createdAutomations);
    const moved = this._draft.assignedDeviceIds.length;
    return html`
      <h2>${this._t("done_heading", { room: this._draft.name })}</h2>
      <p>
        ${
          moved
            ? this._t("done_devices", { count: moved })
            : this._t("done_no_devices")
        }
      </p>
      ${
        created.length
          ? html`<p>${this._t("done_automations")}</p>
              <ul class="links">
                ${created.map(
                  ([starterId, automationId]) => html`
                    <li>
                      <a
                        href=${`/config/automation/edit/${automationId}`}
                        @click=${this._linkClicked}
                      >
                        ${this._t(`starter.${starterId}.title`, {
                          room: this._draft.name,
                        })}
                      </a>
                    </li>
                  `
                )}
              </ul>`
          : html`<p>${this._t("done_no_automations")}</p>`
      }
      ${
        this._draft.areaId
          ? html`<p>
              <a
                href=${`/config/areas/area/${this._draft.areaId}`}
                @click=${this._linkClicked}
              >
                ${this._t("done_room", { room: this._draft.name })}
              </a>
            </p>`
          : nothing
      }
    `;
  }

  private _renderFooter() {
    const step = this._draft.step;
    if (step === "done") {
      return html`
        <ha-dialog-footer slot="footer">
          <ha-button slot="primaryAction" @click=${this.closeDialog}>
            ${this.hass.localize("ui.common.close")}
          </ha-button>
        </ha-dialog-footer>
      `;
    }
    const chosenStarters = this._availableChosenStarters().length;
    const primary =
      step === "name"
        ? this._t("next_devices")
        : step === "devices"
          ? this._t("next_starters")
          : this._t("create_starters", { count: chosenStarters });
    return html`
      <ha-dialog-footer slot="footer">
        ${
          step === "name"
            ? html`<ha-button
                slot="secondaryAction"
                appearance="plain"
                .disabled=${this._busy}
                @click=${this.closeDialog}
              >
                ${this.hass.localize("ui.common.cancel")}
              </ha-button>`
            : html`<ha-button
                slot="secondaryAction"
                appearance="plain"
                .disabled=${this._busy}
                @click=${this._back}
              >
                ${this.hass.localize("ui.common.back")}
              </ha-button>`
        }
        ${
          step !== "name"
            ? html`<ha-button
                slot="secondaryAction"
                appearance="plain"
                .disabled=${this._busy}
                @click=${this._skip}
              >
                ${this._t("skip_step")}
              </ha-button>`
            : nothing
        }
        <ha-button
          slot="primaryAction"
          .disabled=${this._busy || (step === "starters" && !chosenStarters)}
          @click=${this._next}
        >
          ${this._busy ? this._t("working") : primary}
        </ha-button>
      </ha-dialog-footer>
    `;
  }

  // ---- events --------------------------------------------------------

  private _nameChanged(ev: Event) {
    this._nameInvalid = false;
    this._persist({ name: (ev.target as HaInput).value ?? "" });
  }

  private _floorChanged(ev: CustomEvent<{ value: string | undefined }>) {
    this._persist({ floorId: ev.detail.value || null });
  }

  private _iconChanged(ev: CustomEvent<{ value: string | undefined }>) {
    this._persist({ icon: ev.detail.value || null });
  }

  private _toggleExisting(ev: Event) {
    this._useExisting = (
      ev.target as HTMLElement & { checked: boolean }
    ).checked;
    this._error = undefined;
    this._persist({ areaId: null, name: "" });
  }

  private _existingChanged(ev: CustomEvent<{ value: string | undefined }>) {
    const areaId = ev.detail.value || null;
    const area = areaId ? this.hass.areas[areaId] : undefined;
    this._persist({
      areaId: areaId && area ? areaId : null,
      name: area?.name ?? "",
    });
  }

  private _toggleDevice(ev: Event) {
    const id = (ev.currentTarget as HTMLElement & { deviceId: string })
      .deviceId;
    const selected = new Set(this._draft.selectedDeviceIds);
    if (selected.has(id)) {
      selected.delete(id);
    } else {
      selected.add(id);
    }
    this._persist({ selectedDeviceIds: [...selected] });
  }

  private _toggleStarter(ev: Event) {
    const id = (ev.currentTarget as HTMLElement & { starterId: StarterId })
      .starterId;
    const selected = new Set(this._draft.selectedStarterIds);
    if (selected.has(id)) {
      selected.delete(id);
    } else {
      selected.add(id);
    }
    this._persist({ selectedStarterIds: [...selected] });
  }

  private _linkClicked() {
    this.closeDialog();
  }

  private _startOver() {
    clearDraft(this._storage(), this.hass.user?.id);
    this._draft = emptyDraft();
    this._resumed = false;
    this._useExisting = false;
    this._error = undefined;
  }

  private _back() {
    const index = WIZARD_STEPS.indexOf(this._draft.step);
    this._error = undefined;
    this._persist({ step: WIZARD_STEPS[Math.max(index - 1, 0)] });
  }

  private _skip() {
    this._error = undefined;
    if (this._draft.step === "devices") {
      this._persist({
        step: "starters",
        selectedDeviceIds: [...this._draft.assignedDeviceIds],
      });
    } else if (this._draft.step === "starters") {
      this._persist({ step: "done", selectedStarterIds: [] });
    }
  }

  private async _next() {
    if (this._busy) {
      return;
    }
    this._error = undefined;
    this._busy = true;
    try {
      switch (this._draft.step) {
        case "name":
          await this._finishNameStep();
          break;
        case "devices":
          await this._finishDevicesStep();
          break;
        case "starters":
          await this._finishStartersStep();
          break;
        default:
          break;
      }
    } finally {
      this._busy = false;
    }
  }

  private async _finishNameStep() {
    const name = this._draft.name.trim();
    if (!name) {
      this._nameInvalid = true;
      return;
    }
    if (!this._draft.areaId) {
      try {
        const area = await createAreaRegistryEntry(
          this.hass,
          buildAreaCreateParams({ ...this._draft, name })
        );
        this._persist({ areaId: area.area_id, name: area.name });
      } catch (err) {
        this._error = this._t("error_area", { error: errorMessage(err) });
        return;
      }
    }
    const patch: Partial<RoomDraft> = { step: "devices" };
    if (this._draft.preselectedFor !== this._draft.name) {
      const ticked = new Set([
        ...this._draft.selectedDeviceIds,
        ...preselectByName(
          this._devices().filter((device) => !device.areaId),
          this._draft.name
        ),
      ]);
      patch.selectedDeviceIds = [...ticked];
      patch.preselectedFor = this._draft.name;
    }
    this._persist(patch);
  }

  private async _finishDevicesStep() {
    const areaId = this._draft.areaId;
    if (!areaId) {
      return;
    }
    const assigned = new Set(this._draft.assignedDeviceIds);
    const failed: string[] = [];
    for (const deviceId of this._draft.selectedDeviceIds) {
      if (assigned.has(deviceId)) {
        continue;
      }
      try {
        // Sequential on purpose: each move is reported on its own.
        // eslint-disable-next-line no-await-in-loop
        await updateDeviceRegistryEntry(this.hass, deviceId, {
          area_id: areaId,
        });
        assigned.add(deviceId);
      } catch (err) {
        failed.push(errorMessage(err));
      }
    }
    this._persist({ assignedDeviceIds: [...assigned] });
    if (failed.length) {
      this._error = this._t("error_devices", { error: failed[0] });
      return;
    }
    this._persist({ step: "starters" });
  }

  private _availableChosenStarters(): StarterId[] {
    const chosen = new Set(this._draft.selectedStarterIds);
    return offerStarters(this._roomDevices())
      .filter((offer) => offer.available && chosen.has(offer.id))
      .map((offer) => offer.id);
  }

  private async _finishStartersStep() {
    const caps = roomCapabilities(this._roomDevices());
    const created = { ...this._draft.createdAutomations };
    let index = 0;
    for (const starterId of this._availableChosenStarters()) {
      if (created[starterId]) {
        continue;
      }
      const config = buildStarterConfig(
        starterId,
        this._draft.name,
        caps,
        this._starterText
      );
      if (!config) {
        continue;
      }
      const automationId = newAutomationId(index++);
      try {
        // eslint-disable-next-line no-await-in-loop
        await saveAutomationConfig(
          this.hass,
          automationId,
          config as unknown as AutomationConfig
        );
        created[starterId] = automationId;
      } catch (err) {
        this._persist({ createdAutomations: created });
        this._error = this._t("error_automations", {
          error: errorMessage(err),
        });
        return;
      }
    }
    this._persist({ createdAutomations: created, step: "done" });
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleDialog,
      css`
        .wizard {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
        }
        .strip {
          display: flex;
          gap: var(--ha-space-2);
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .strip li {
          flex: 1;
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          min-width: 0;
          color: var(--secondary-text-color);
        }
        .strip .num {
          flex: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--secondary-background-color);
          font-weight: var(--ha-font-weight-medium);
        }
        .strip .label {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .strip .current {
          color: var(--primary-text-color);
        }
        .strip .current .num,
        .strip .past .num {
          background: var(--primary-color);
          color: var(--text-primary-color);
        }
        .step-body {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
        }
        h2 {
          margin: 0;
          font-size: var(--ha-font-size-xl);
          font-weight: var(--ha-font-weight-medium);
        }
        p {
          margin: 0;
        }
        .hint,
        .note {
          color: var(--secondary-text-color);
        }
        .existing-toggle {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          min-height: 48px;
        }
        .tiles {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: var(--ha-space-3);
        }
        .tile,
        .starter {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          min-height: 48px;
          padding: var(--ha-space-3);
          border: 1px solid var(--divider-color);
          border-radius: var(--ha-border-radius-xl);
          background: var(--card-background-color);
          color: var(--primary-text-color);
          font: inherit;
          text-align: start;
          cursor: pointer;
        }
        .tile[aria-pressed="true"],
        .starter[aria-pressed="true"] {
          border-color: var(--primary-color);
          background: color-mix(
            in srgb,
            var(--primary-color) 14%,
            var(--card-background-color)
          );
        }
        .starter[disabled] {
          opacity: 0.55;
          cursor: default;
        }
        .tile:focus-visible,
        .starter:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: 2px;
        }
        .starters {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
        }
        .tile-text {
          display: flex;
          flex-direction: column;
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .tile-name {
          font-weight: var(--ha-font-weight-medium);
        }
        .tile-sub {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .links {
          margin: 0;
          padding-inline-start: var(--ha-space-5);
        }
        .links li {
          min-height: 32px;
        }
        a {
          color: var(--primary-color);
        }
        ha-alert ha-button {
          flex: none;
        }
        ha-alert ha-button::part(base) {
          white-space: nowrap;
        }
        @media (max-width: 600px) {
          .strip li {
            flex: none;
          }
          .strip li.current {
            flex: 1 1 auto;
          }
          .tiles {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .tile {
            flex-direction: column;
            align-items: flex-start;
          }
          .strip .label {
            display: none;
          }
          .strip .current .label {
            display: block;
          }
          h2 {
            font-size: 18px;
          }
          .step-body {
            gap: var(--ha-space-3);
          }
          .tiles {
            gap: var(--ha-space-2);
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-room-wizard": DialogRoomWizard;
  }
}
