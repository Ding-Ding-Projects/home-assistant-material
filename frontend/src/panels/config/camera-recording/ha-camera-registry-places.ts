import { mdiAlertCircleOutline, mdiDocker } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { formatDateTime } from "../../../common/datetime/format_date_time";
import { formatTime } from "../../../common/datetime/format_time";
import { withLanguageMode } from "../../../common/language-mode/language-mode";
import { navigate } from "../../../common/navigate";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-button-toggle-group";
import "../../../components/ha-card";
import "../../../components/ha-slider";
import "../../../components/ha-svg-icon";
import "../../../components/ha-switch";
import "../../../components/input/ha-input";
import {
  changeRegistryPassword,
  fetchRegistryRecordings,
  fetchRegistryStatus,
  isValidRepositoryName,
  markRegistryPublicWarningSeen,
  passwordFormProblem,
  ratePassword,
  REGISTRY_DOMAIN,
  REGISTRY_KEEP_DAYS_RANGE,
  REGISTRY_NAMES,
  registryOnlyRecordings,
  registryProblemAdvice,
  registryProblemKey,
  registryStatusKey,
  registryVisibilityKey,
  repositoryChoiceForCamera,
  repositoryForBackups,
  repositoryForCamera,
  restoreRegistryRecording,
  runRegistrySelfTest,
  setRegistryPlace,
  setRegistryRepositories,
  withCameraRepository,
  type RegistryChange,
  type RegistryPlace,
  type RegistryRecording,
  type RegistrySendChoice,
  type RegistrySelfTestResult,
} from "../../../data/registry_storage";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../../types";
import { bytesToString } from "../../../util/bytes-to-string";
import { showToast } from "../../../util/toast";

const REFRESH_MS = 10_000;

interface PasswordDraft {
  old_password: string;
  password: string;
  password_confirmation: string;
  understand: boolean;
}

const EMPTY_PASSWORD: PasswordDraft = {
  old_password: "",
  password: "",
  password_confirmation: "",
  understand: false,
};

/**
 * The container registry as a place for camera recordings: what is sent, how
 * long it is kept, the repository each camera uses, getting a recording back,
 * and the settings behind it (default repository, access token, password and
 * a self-test). Everything stored there is locked with the owner's password
 * first, so the page says plainly what public means.
 *
 * With `embedded` it draws only its rows, to sit inside the page's own list of
 * places; without it, it is a card of its own.
 */
@customElement("ha-camera-registry-places")
export class HaCameraRegistryPlaces extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public embedded = false;

  /** Camera entity ids that can have their own repository; all cameras by default. */
  @property({ attribute: false }) public cameras?: string[];

  @state() private _places?: RegistryPlace[];

  @state() private _error?: string;

  @state() private _busy = new Set<string>();

  @state() private _managing = new Set<string>();

  @state() private _recordings?: RegistryRecording[];

  @state() private _repoDraft: Record<string, string> = {};

  @state() private _password: PasswordDraft = { ...EMPTY_PASSWORD };

  @state() private _passwordBusy = false;

  @state() private _selfTest?: RegistrySelfTestResult | "running";

  @state() private _restoring?: string;

  private _timer?: number;

  public connectedCallback() {
    super.connectedCallback();
    this._load();
    this._timer = window.setInterval(() => this._load(), REFRESH_MS);
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    window.clearInterval(this._timer);
  }

  private async _load() {
    if (!this.hass) {
      return;
    }
    try {
      this._places = (await fetchRegistryStatus(this.hass)).places;
      this._error = undefined;
    } catch (err: unknown) {
      // Before the place is added the server has no such command.
      if ((err as { code?: string } | undefined)?.code === "unknown_command") {
        this._places = [];
        this._error = undefined;
        return;
      }
      this._error = (err as Error | undefined)?.message ?? String(err);
    }
  }

  private _l(key: string, values?: Record<string, string | number>) {
    return withLanguageMode(this.hass.localize)(
      `ui.panel.config.camera_recording.registry.${key}` as "ui.panel.config.camera_recording.caption",
      values
    );
  }

  private _time(at: number) {
    return formatTime(new Date(at * 1000), this.hass.locale, this.hass.config);
  }

  private _placeName(place: RegistryPlace): string {
    return REGISTRY_NAMES[place.registry] ?? place.address ?? this._l("title");
  }

  private _cameraIds(): string[] {
    return (
      this.cameras ??
      Object.keys(this.hass.states).filter((id) => id.startsWith("camera."))
    );
  }

  private _cameraName(entityId: string): string {
    return this.hass.states[entityId]?.attributes.friendly_name ?? entityId;
  }

  protected render(): TemplateResult | typeof nothing {
    const places = this._places;
    if (places === undefined && !this._error) {
      return nothing;
    }
    const body = html`
      ${
        this._error
          ? html`<ha-alert alert-type="error"
              >${this._l("load_failed", { error: this._error })}</ha-alert
            >`
          : nothing
      }
      ${
        places?.length
          ? places.map((place) => this._renderPlace(place))
          : html`<div class="row">
              <ha-svg-icon class="icon" .path=${mdiDocker}></ha-svg-icon>
              <div class="text">
                <span class="name">${this._l("title")}</span>
                <span class="secondary">${this._l("not_set_up")}</span>
              </div>
              <ha-button appearance="plain" size="small" @click=${this._setUp}
                >${this._l("set_up")}</ha-button
              >
            </div>`
      }
    `;
    if (this.embedded) {
      return html`<div class="embedded">${body}</div>`;
    }
    return html`<ha-card>
      <h2 class="title">${this._l("title")}</h2>
      ${body}
    </ha-card>`;
  }

  private _summary(place: RegistryPlace): string {
    switch (registryStatusKey(place)) {
      case "not_loaded":
        return this._l("not_loaded");
      case "off":
        return this._l("off");
      case "waiting":
        return this._l("waiting_summary", {
          count: place.waiting_files,
          size: bytesToString(place.waiting_bytes),
        });
      case "up_to_date":
        return this._l("up_to_date_last", {
          time: this._time(place.last_sent!.at),
        });
      default:
        return this._l("nothing_sent_yet");
    }
  }

  private _visibility(place: RegistryPlace): string {
    switch (registryVisibilityKey(place)) {
      case "public":
        return this._l("public_locked");
      case "private":
        return this._l("private_locked");
      default:
        return this._l("unknown_locked");
    }
  }

  private _renderPlace(place: RegistryPlace) {
    const name = this._placeName(place);
    return html`
      <div class="row">
        <ha-svg-icon class="icon" .path=${mdiDocker}></ha-svg-icon>
        <div class="text">
          <span class="name">${name}</span>
          <span class="secondary">${this._visibility(place)}</span>
          <span class="secondary">${this._summary(place)}</span>
        </div>
        <ha-switch
          .checked=${place.enabled}
          .disabled=${this._busy.has(place.entry_id) || !place.loaded}
          .label=${name}
          .entryId=${place.entry_id}
          @change=${this._switchChanged}
        ></ha-switch>
      </div>
      ${place.enabled ? this._renderDetails(place, name) : nothing}
      ${this._managing.has(place.entry_id) ? this._renderManage(place) : nothing}
      <div class="manage-row">
        <ha-button
          appearance="plain"
          size="small"
          .entryId=${place.entry_id}
          @click=${this._toggleManage}
          >${
            this._managing.has(place.entry_id)
              ? this._l("manage.hide")
              : this._l("manage.show")
          }</ha-button
        >
      </div>
    `;
  }

  private _renderDetails(place: RegistryPlace, name: string) {
    const forever = place.keep_days === null;
    const sendButtons: { value: RegistrySendChoice; label: string }[] = [
      { value: "events", label: this._l("send_events") },
      { value: "everything", label: this._l("send_everything") },
    ];
    const last = place.last_sent;
    const problem = place.last_problem;
    return html`
      <section class="details" aria-label=${name}>
        <h3 class="overline">${name}</h3>
        <div class="field">
          <span class="label">${this._l("send")}</span>
          <ha-button-toggle-group
            size="s"
            .buttons=${sendButtons}
            .active=${place.send}
            .entryId=${place.entry_id}
            @value-changed=${this._sendChanged}
          ></ha-button-toggle-group>
        </div>
        <div class="field">
          <span class="label">${this._l("keep")}</span>
          <span class="value"
            >${
              forever
                ? this._l("keep_forever")
                : this._l("keep_days", { days: place.keep_days ?? 0 })
            }</span
          >
        </div>
        ${
          forever
            ? nothing
            : html`<ha-slider
                labeled
                min=${REGISTRY_KEEP_DAYS_RANGE.min}
                max=${REGISTRY_KEEP_DAYS_RANGE.max}
                step="1"
                .value=${place.keep_days ?? REGISTRY_KEEP_DAYS_RANGE.default}
                .entryId=${place.entry_id}
                .label=${this._l("keep")}
                @change=${this._keepChanged}
              ></ha-slider>`
        }
        <label class="field">
          <span class="label">${this._l("keep_forever_switch")}</span>
          <ha-switch
            .checked=${forever}
            .entryId=${place.entry_id}
            @change=${this._foreverChanged}
          ></ha-switch>
        </label>
        <div class="field">
          <span class="label">${this._l("used")}</span>
          <span class="value">${bytesToString(place.used_bytes)}</span>
        </div>
        <div class="field">
          <span class="label">${this._l("waiting")}</span>
          <span class="value"
            >${
              place.waiting_files
                ? this._l("waiting_value", {
                    count: place.waiting_files,
                    size: bytesToString(place.waiting_bytes),
                  })
                : this._l("nothing_waiting")
            }</span
          >
        </div>
        <div class="field">
          <span class="label">${this._l("last_sent")}</span>
          <span class="value"
            >${
              last
                ? this._l("last_sent_value", {
                    time: this._time(last.at),
                    camera: this._cameraName(last.entity_id),
                  })
                : this._l("none_yet")
            }</span
          >
        </div>
        <div class="field">
          <span class="label">${this._l("last_problem")}</span>
          <span class=${classMap({ value: true, bad: !!problem })}
            >${
              problem
                ? this._l("last_problem_value", {
                    time: this._time(problem.at),
                    reason: this._l(
                      `reasons.${registryProblemKey(problem.reason)}`
                    ),
                  })
                : this._l("no_problem")
            }</span
          >
        </div>
        ${
          problem && registryProblemAdvice(problem.reason) !== "other"
            ? html`<p class="note">
                ${this._l(`advice.${registryProblemAdvice(problem.reason)}`)}
              </p>`
            : nothing
        }
        ${this._renderRepositories(place)} ${this._renderGetBack()}
        <p class="warning">
          <ha-svg-icon .path=${mdiAlertCircleOutline}></ha-svg-icon>
          <span>${this._l("public_warning")}</span>
        </p>
      </section>
    `;
  }

  private _renderRepositories(place: RegistryPlace) {
    const cameras = this._cameraIds();
    return html`
      <h3 class="overline">${this._l("repository.title")}</h3>
      <p class="note">${this._l("repository.explain")}</p>
      <div class="field">
        <span class="label">${this._l("repository.default_name")}</span>
        <span class="value">${place.default_repository}</span>
      </div>
      <div class="field">
        <span class="label">${this._l("repository.backups")}</span>
        <span class="value">${repositoryForBackups(place)}</span>
      </div>
      ${cameras.map((entityId) => {
        const choice = repositoryChoiceForCamera(place, entityId);
        const draftKey = `${place.entry_id}|${entityId}`;
        const draft = this._repoDraft[draftKey];
        const editing = draft !== undefined;
        const invalid = editing && !!draft && !isValidRepositoryName(draft);
        return html`
          <div class="camera">
            <div class="field">
              <span class="label">${this._cameraName(entityId)}</span>
              <ha-button-toggle-group
                size="s"
                .buttons=${[
                  { value: "default", label: this._l("repository.default") },
                  { value: "own", label: this._l("repository.own") },
                ]}
                .active=${editing ? "own" : choice}
                .entryId=${place.entry_id}
                .cameraId=${entityId}
                @value-changed=${this._choiceChanged}
              ></ha-button-toggle-group>
            </div>
            ${
              choice === "own" && !editing
                ? html`<span class="secondary"
                    >${repositoryForCamera(place, entityId)}</span
                  >`
                : nothing
            }
            ${
              editing
                ? html`<div class="edit">
                    <ha-input
                      .label=${this._l("repository.name")}
                      .hint=${
                        invalid
                          ? this._l("repository.invalid")
                          : this._l("repository.name_hint")
                      }
                      .invalid=${invalid}
                      .value=${draft}
                      .draftKey=${draftKey}
                      @input=${this._draftInput}
                    ></ha-input>
                    <ha-button
                      size="small"
                      .disabled=${!draft || invalid}
                      .entryId=${place.entry_id}
                      .cameraId=${entityId}
                      @click=${this._saveCameraRepository}
                      >${this._l("repository.save")}</ha-button
                    >
                  </div>`
                : nothing
            }
          </div>
        `;
      })}
    `;
  }

  private _renderGetBack() {
    const recordings = registryOnlyRecordings(this._recordings ?? []);
    return html`
      <h3 class="overline">${this._l("get_back")}</h3>
      ${
        recordings.length
          ? recordings.slice(0, 6).map(
              (rec) =>
                html`<div class="field">
                  <span class="label"
                    >${this._cameraName(rec.entity_id)} ·
                    ${this._l("get_back_item", {
                      time: formatDateTime(
                        new Date(rec.start * 1000),
                        this.hass.locale,
                        this.hass.config
                      ),
                      duration: `${Math.round(rec.duration / 60)} min`,
                    })}</span
                  >
                  <ha-button
                    appearance="plain"
                    size="small"
                    .disabled=${this._restoring === rec.id}
                    .recordingId=${rec.id}
                    @click=${this._restore}
                    >${this._l("get_back_button")}</ha-button
                  >
                </div>`
            )
          : html`<p class="note">${this._l("get_back_none")}</p>`
      }
    `;
  }

  private _renderManage(place: RegistryPlace) {
    const draft = this._password;
    const rating = ratePassword(draft.password);
    const problem = passwordFormProblem(draft, true);
    const defaultDraftKey = `${place.entry_id}|default`;
    const defaultDraft = this._repoDraft[defaultDraftKey];
    const defaultInvalid =
      defaultDraft !== undefined && !isValidRepositoryName(defaultDraft);
    const test = this._selfTest;
    return html`
      <section class="details manage" aria-label=${this._l("manage.title")}>
        <h3 class="overline">${this._l("manage.title")}</h3>
        <div class="field">
          <span class="label"
            >${this._l("manage.account", { name: place.username })}</span
          >
          <span class="value">${this._placeName(place)}</span>
        </div>
        <ha-input
          .label=${this._l("repository.default_name")}
          .hint=${
            defaultInvalid
              ? this._l("repository.invalid")
              : this._l("repository.name_hint")
          }
          .invalid=${defaultInvalid}
          .value=${defaultDraft ?? place.default_repository}
          .draftKey=${defaultDraftKey}
          @input=${this._draftInput}
        ></ha-input>
        <ha-button
          size="small"
          .disabled=${
            defaultDraft === undefined ||
            defaultInvalid ||
            defaultDraft === place.default_repository
          }
          .entryId=${place.entry_id}
          @click=${this._saveDefaultRepository}
          >${this._l("repository.save")}</ha-button
        >

        <h3 class="overline">${this._l("manage.token_title")}</h3>
        <p class="note">${this._l("manage.token_text")}</p>
        <ha-button appearance="plain" size="small" @click=${this._changeToken}
          >${this._l("manage.token_button")}</ha-button
        >

        <h3 class="overline">${this._l("password.title")}</h3>
        <p class="note">${this._l("password.intro")}</p>
        ${this._passwordInput("old_password", this._l("password.old"))}
        ${this._passwordInput("password", this._l("password.new"))}
        <p
          class=${classMap({ note: true, bad: rating === "too_short" || rating === "obvious" })}
        >
          ${this._l(`password.rating.${rating}`)}
        </p>
        ${this._passwordInput("password_confirmation", this._l("password.again"))}
        <label class="field">
          <span class="label">${this._l("password.understand")}</span>
          <ha-switch
            .checked=${draft.understand}
            @change=${this._understandChanged}
          ></ha-switch>
        </label>
        ${
          problem && draft.password
            ? html`<p class="note bad">
                ${this._l(`password.problem.${problem}`)}
              </p>`
            : nothing
        }
        <ha-button
          size="small"
          .disabled=${!!problem || this._passwordBusy}
          .entryId=${place.entry_id}
          @click=${this._changePassword}
          >${this._l("password.button")}</ha-button
        >

        <h3 class="overline">${this._l("manage.self_test_title")}</h3>
        <p class="note">${this._l("manage.self_test_text")}</p>
        <ha-button
          appearance="plain"
          size="small"
          .disabled=${test === "running"}
          .entryId=${place.entry_id}
          @click=${this._runSelfTest}
          >${
            test === "running"
              ? this._l("manage.self_test_running")
              : this._l("manage.self_test_button")
          }</ha-button
        >
        ${
          test && test !== "running"
            ? html`<p class=${classMap({ note: true, bad: !test.ok })}>
                ${
                  test.ok
                    ? this._l("manage.self_test_passed", {
                        seconds: Math.round(test.seconds * 10) / 10,
                      })
                    : this._l("manage.self_test_failed", {
                        reason: this._l(
                          `reasons.${registryProblemKey(test.reason ?? "")}`
                        ),
                      })
                }
              </p>`
            : nothing
        }
      </section>
    `;
  }

  private _passwordInput(field: keyof PasswordDraft, label: string) {
    return html`<ha-input
      type="password"
      password-toggle
      .label=${label}
      .value=${String(this._password[field])}
      .autocomplete=${field === "old_password" ? "current-password" : "new-password"}
      .field=${field}
      @input=${this._passwordInputChanged}
    ></ha-input>`;
  }

  private async _change(entryId: string, change: RegistryChange) {
    this._busy = new Set(this._busy).add(entryId);
    try {
      this._places = (
        await setRegistryPlace(this.hass, entryId, change)
      ).places;
      this._error = undefined;
    } catch (err: unknown) {
      this._error = (err as Error | undefined)?.message ?? String(err);
    } finally {
      const busy = new Set(this._busy);
      busy.delete(entryId);
      this._busy = busy;
    }
  }

  private async _switchChanged(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      entryId: string;
      checked: boolean;
    };
    if (!target.checked) {
      await this._change(target.entryId, { enabled: false });
      return;
    }
    const confirmed = await showConfirmationDialog(this, {
      title: this._l("confirm_title"),
      text: this._l("public_warning"),
      confirmText: this._l("confirm_ok"),
      dismissText: this._l("confirm_cancel"),
    });
    if (!confirmed) {
      target.checked = false;
      return;
    }
    markRegistryPublicWarningSeen();
    await this._change(target.entryId, {
      enabled: true,
      video_leaves_home_confirmed: true,
    });
    this._loadRecordings();
  }

  private async _sendChanged(ev: CustomEvent<{ value: RegistrySendChoice }>) {
    const target = ev.currentTarget as HTMLElement & { entryId: string };
    await this._change(target.entryId, { send: ev.detail.value });
  }

  private async _keepChanged(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      entryId: string;
      value: number;
    };
    await this._change(target.entryId, { keep_days: Number(target.value) });
  }

  private async _foreverChanged(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      entryId: string;
      checked: boolean;
    };
    await this._change(target.entryId, {
      keep_days: target.checked ? null : REGISTRY_KEEP_DAYS_RANGE.default,
    });
  }

  private async _loadRecordings() {
    try {
      this._recordings = (await fetchRegistryRecordings(this.hass)).recordings;
    } catch {
      this._recordings = undefined;
    }
  }

  private _toggleManage(ev: Event) {
    const id = (ev.currentTarget as HTMLElement & { entryId: string }).entryId;
    const next = new Set(this._managing);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this._managing = next;
    if (this._recordings === undefined) {
      this._loadRecordings();
    }
  }

  private _draftInput(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      draftKey: string;
      value: string;
    };
    this._repoDraft = { ...this._repoDraft, [target.draftKey]: target.value };
  }

  private _choiceChanged(ev: CustomEvent<{ value: string }>) {
    const target = ev.currentTarget as HTMLElement & {
      entryId: string;
      cameraId: string;
    };
    const key = `${target.entryId}|${target.cameraId}`;
    if (ev.detail.value === "own") {
      const place = this._places?.find((p) => p.entry_id === target.entryId);
      this._repoDraft = {
        ...this._repoDraft,
        [key]: place?.camera_repositories[target.cameraId] ?? "",
      };
      return;
    }
    const draft = { ...this._repoDraft };
    delete draft[key];
    this._repoDraft = draft;
    this._applyRepositories(target.entryId, {
      camera_repositories: { [target.cameraId]: null },
    });
  }

  private _saveCameraRepository(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      entryId: string;
      cameraId: string;
    };
    const key = `${target.entryId}|${target.cameraId}`;
    const name = this._repoDraft[key]?.trim();
    const place = this._places?.find((p) => p.entry_id === target.entryId);
    if (!name || !place || !isValidRepositoryName(name)) {
      return;
    }
    // Send only this camera: the server merges it into the map it holds.
    const merged = withCameraRepository(
      place.camera_repositories,
      target.cameraId,
      name
    );
    const draft = { ...this._repoDraft };
    delete draft[key];
    this._repoDraft = draft;
    this._applyRepositories(target.entryId, {
      camera_repositories: { [target.cameraId]: merged[target.cameraId] },
    });
  }

  private _saveDefaultRepository(ev: Event) {
    const entryId = (ev.currentTarget as HTMLElement & { entryId: string })
      .entryId;
    const key = `${entryId}|default`;
    const name = this._repoDraft[key]?.trim();
    if (!name || !isValidRepositoryName(name)) {
      return;
    }
    const draft = { ...this._repoDraft };
    delete draft[key];
    this._repoDraft = draft;
    this._applyRepositories(entryId, { default_repository: name });
  }

  private async _applyRepositories(
    entryId: string,
    change: Parameters<typeof setRegistryRepositories>[2]
  ) {
    this._busy = new Set(this._busy).add(entryId);
    try {
      this._places = (
        await setRegistryRepositories(this.hass, entryId, change)
      ).places;
      this._error = undefined;
      showToast(this, { message: this._l("repository.saved") });
    } catch (err: unknown) {
      this._error = (err as Error | undefined)?.message ?? String(err);
    } finally {
      const busy = new Set(this._busy);
      busy.delete(entryId);
      this._busy = busy;
    }
  }

  private async _restore(ev: Event) {
    const id = (ev.currentTarget as HTMLElement & { recordingId: string })
      .recordingId;
    this._restoring = id;
    try {
      await restoreRegistryRecording(this.hass, id);
      showToast(this, { message: this._l("got_back") });
      await this._loadRecordings();
    } catch (err: unknown) {
      this._error = this._l("get_back_failed", {
        error: (err as Error | undefined)?.message ?? String(err),
      });
    } finally {
      this._restoring = undefined;
    }
  }

  private _changeToken() {
    navigate(`/config/integrations/integration/${REGISTRY_DOMAIN}`);
  }

  private _passwordInputChanged(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      field: keyof PasswordDraft;
      value: string;
    };
    this._password = { ...this._password, [target.field]: target.value };
  }

  private _understandChanged(ev: Event) {
    this._password = {
      ...this._password,
      understand: (ev.currentTarget as HTMLElement & { checked: boolean })
        .checked,
    };
  }

  private async _changePassword(ev: Event) {
    const entryId = (ev.currentTarget as HTMLElement & { entryId: string })
      .entryId;
    const draft = this._password;
    if (passwordFormProblem(draft, true)) {
      return;
    }
    this._passwordBusy = true;
    try {
      await changeRegistryPassword(
        this.hass,
        entryId,
        draft.old_password,
        draft.password,
        draft.password_confirmation
      );
      showToast(this, { message: this._l("password.changed") });
      this._password = { ...EMPTY_PASSWORD };
    } catch (err: unknown) {
      this._error = this._l("password.failed", {
        error: (err as Error | undefined)?.message ?? String(err),
      });
    } finally {
      this._passwordBusy = false;
    }
  }

  private async _runSelfTest(ev: Event) {
    const entryId = (ev.currentTarget as HTMLElement & { entryId: string })
      .entryId;
    this._selfTest = "running";
    try {
      this._selfTest = await runRegistrySelfTest(this.hass, entryId);
    } catch (err: unknown) {
      this._selfTest = {
        ok: false,
        reason: (err as { code?: string } | undefined)?.code ?? "unexpected",
        seconds: 0,
      };
    }
  }

  private _setUp() {
    navigate(`/config/integrations/dashboard/add?domain=${REGISTRY_DOMAIN}`);
  }

  static styles: CSSResultGroup = css`
    ha-card {
      padding: var(--ha-space-4);
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    .embedded {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    .title {
      margin: 0;
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
      line-height: var(--ha-line-height-condensed);
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      min-height: 60px;
    }
    .icon {
      flex: none;
      color: var(--secondary-text-color);
    }
    .text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .name {
      font-size: var(--ha-font-size-m);
    }
    .secondary,
    .note {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
      overflow-wrap: anywhere;
    }
    .note {
      margin: 0;
    }
    .note.bad,
    .value.bad {
      color: var(--error-color);
    }
    ha-switch,
    ha-button {
      flex: none;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
    }
    .manage-row {
      display: flex;
      justify-content: flex-end;
    }
    .details {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      padding: var(--ha-space-3);
      border-radius: var(--ha-border-radius-lg);
      background: var(--secondary-background-color);
    }
    .overline {
      margin: var(--ha-space-2) 0 0;
      font-size: var(--ha-font-size-xs);
      font-weight: var(--ha-font-weight-medium);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
    }
    .overline:first-child {
      margin-top: 0;
    }
    .field {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
      min-height: 44px;
    }
    .label {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .value {
      font-size: var(--ha-font-size-s);
      text-align: end;
      overflow-wrap: anywhere;
    }
    .camera {
      display: flex;
      flex-direction: column;
    }
    .edit {
      display: flex;
      align-items: flex-start;
      gap: var(--ha-space-2);
    }
    .edit ha-input {
      flex: 1;
      min-width: 0;
    }
    ha-slider {
      width: 100%;
    }
    .warning {
      display: flex;
      gap: var(--ha-space-2);
      align-items: flex-start;
      margin: var(--ha-space-2) 0 0;
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .warning ha-svg-icon {
      flex: none;
      --mdc-icon-size: 20px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-camera-registry-places": HaCameraRegistryPlaces;
  }
}
