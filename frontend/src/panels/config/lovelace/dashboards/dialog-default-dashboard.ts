import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-dialog";
import "../../../../components/ha-dialog-footer";
import "../../../../components/ha-form/ha-form";
import type { SchemaUnion } from "../../../../components/ha-form/types";
import type { DeviceKind } from "../../../../data/default-panel-overrides";
import {
  DEVICE_KINDS,
  normalizeOverrides,
} from "../../../../data/default-panel-overrides";
import type { LovelaceDashboard } from "../../../../data/lovelace/dashboard";
import { fetchDashboards } from "../../../../data/lovelace/dashboard";
import { DEFAULT_PANEL, getPanelTitle } from "../../../../data/panel";
import { saveDefaultPanelSettings } from "../../../../data/presentation-roles";
import { haStyleDialog } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import { readWallPanel } from "../../../lovelace/editor/tools/wall-panel";
import { PANEL_DASHBOARDS } from "./ha-config-lovelace-dashboards";

const SAME = "";

type FormData = { everyone: string } & Partial<Record<DeviceKind, string>>;

/**
 * The default dashboard for everyone, with an optional different one for
 * phones, tablets, desktops and wall panels. The kind of device is decided in
 * each browser from its width, so nothing about a device is stored or sent.
 * A person's own choice in their profile always wins.
 */
@customElement("dialog-default-dashboard")
export class DialogDefaultDashboard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _open = false;

  @state() private _data?: FormData;

  @state() private _dashboards?: LovelaceDashboard[];

  @state() private _error?: string;

  @state() private _saving = false;

  public async showDialog(): Promise<void> {
    const overrides = normalizeOverrides(
      this.hass.systemData?.default_panel_overrides
    );
    this._data = {
      everyone: this.hass.systemData?.default_panel || DEFAULT_PANEL,
      ...overrides,
    };
    this._error = undefined;
    this._open = true;
    try {
      this._dashboards = await fetchDashboards(this.hass);
    } catch (_err) {
      this._dashboards = [];
    }
  }

  public closeDialog(): void {
    this._open = false;
  }

  private _dialogClosed(): void {
    this._data = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private _options = memoizeOne((dashboards: LovelaceDashboard[]) => {
    const options: { value: string; label: string }[] = [];
    PANEL_DASHBOARDS.forEach((path) => {
      const panel = this.hass.panels[path];
      if (panel) {
        options.push({
          value: panel.url_path,
          label: getPanelTitle(this.hass, panel) || panel.url_path,
        });
      }
    });
    dashboards.forEach((dashboard) =>
      options.push({ value: dashboard.url_path, label: dashboard.title })
    );
    return options;
  });

  private _schema = memoizeOne(
    (options: { value: string; label: string }[], showWallPanel: boolean) => {
      const overrideSelector = {
        select: {
          mode: "dropdown" as const,
          options: [
            {
              value: SAME,
              label: this.hass.localize(
                "ui.panel.config.lovelace.dashboards.default_dialog.same_as_everyone"
              ),
            },
            ...options,
          ],
        },
      };
      return [
        {
          name: "everyone",
          required: true,
          selector: { select: { mode: "dropdown" as const, options } },
        },
        ...DEVICE_KINDS.filter(
          (kind) => kind !== "wall_panel" || showWallPanel
        ).map((kind) => ({
          name: kind,
          required: false,
          selector: overrideSelector,
        })),
      ] as const;
    }
  );

  protected render() {
    if (!this._data) {
      return nothing;
    }
    const wallPanelOn = (() => {
      try {
        const wall = readWallPanel();
        return (
          wall.screensaver.enabled ||
          wall.rotation.enabled ||
          wall.night.enabled
        );
      } catch (_err) {
        return false;
      }
    })();
    const schema = this._schema(
      this._options(this._dashboards ?? []),
      wallPanelOn || !!this._data.wall_panel
    );
    return html`
      <ha-dialog
        .open=${this._open}
        header-title=${this.hass.localize(
          "ui.panel.config.lovelace.dashboards.default_dialog.title"
        )}
        @closed=${this._dialogClosed}
      >
        <p>
          ${this.hass.localize(
            "ui.panel.config.lovelace.dashboards.default_dialog.description"
          )}
        </p>
        ${
          this._error
            ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
            : nothing
        }
        <ha-form
          autofocus
          .hass=${this.hass}
          .schema=${schema}
          .data=${this._data}
          .computeLabel=${this._computeLabel}
          .computeHelper=${this._computeHelper}
          @value-changed=${this._valueChanged}
        ></ha-form>
        <ha-dialog-footer slot="footer">
          <ha-button
            appearance="plain"
            slot="secondaryAction"
            @click=${this.closeDialog}
          >
            ${this.hass.localize("ui.common.cancel")}
          </ha-button>
          <ha-button
            slot="primaryAction"
            @click=${this._save}
            .disabled=${this._saving || !this._dashboards}
          >
            ${this.hass.localize("ui.common.save")}
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private _computeLabel = (
    schema: SchemaUnion<ReturnType<typeof this._schema>>
  ) =>
    this.hass.localize(
      `ui.panel.config.lovelace.dashboards.default_dialog.fields.${schema.name}`
    );

  private _computeHelper = (
    schema: SchemaUnion<ReturnType<typeof this._schema>>
  ) =>
    this.hass.localize(
      `ui.panel.config.lovelace.dashboards.default_dialog.helpers.${schema.name}`
    ) || undefined;

  private _valueChanged(ev: CustomEvent<{ value: FormData }>) {
    this._data = ev.detail.value;
  }

  private async _save() {
    if (!this._data) {
      return;
    }
    this._saving = true;
    this._error = undefined;
    try {
      const { everyone, ...rest } = this._data;
      await saveDefaultPanelSettings(
        this.hass.connection,
        everyone,
        normalizeOverrides(rest)
      );
      this.closeDialog();
    } catch (err: any) {
      this._error = err?.message ?? String(err);
    } finally {
      this._saving = false;
    }
  }

  static styles = [haStyleDialog];
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-default-dashboard": DialogDefaultDashboard;
  }
}
