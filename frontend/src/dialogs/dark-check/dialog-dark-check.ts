import { mdiCheckCircle, mdiContrastCircle, mdiCrosshairsGps } from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import {
  getChoice,
  readAppearanceStore,
  setChoice,
  writeAppearanceStore,
} from "../../common/appearance/element-appearance";
import { fireEvent } from "../../common/dom/fire_event";
import "../../components/ha-button";
import "../../components/ha-dialog";
import "../../components/ha-dialog-footer";
import "../../components/ha-icon-button";
import "../../components/ha-spinner";
import "../../components/ha-svg-icon";
import {
  listEditableCards,
  replaceCard,
} from "../../panels/lovelace/editor/tools/dashboard-edit";
import { locateElement } from "../../panels/lovelace/editor/tools/a11y-checker";
import type {
  DarkFinding,
  DarkReport,
} from "../../panels/lovelace/editor/tools/dark-readability";
import {
  nearestReadable,
  scanDarkReadability,
} from "../../panels/lovelace/editor/tools/dark-readability";
import type { Lovelace } from "../../panels/lovelace/types";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import { showToast } from "../../util/toast";

/**
 * The dark mode readability check: lists text on the page behind it that is
 * hard to read, says where each colour comes from and offers the fix that
 * changes that source. It measures the page as drawn now, so it is opened from
 * the page to be checked.
 */
@customElement("dialog-dark-check")
class DialogDarkCheck extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _open = false;

  @state() private _report?: DarkReport;

  @state() private _busy = false;

  public async showDialog(): Promise<void> {
    this._open = true;
    await this.updateComplete;
    this._scan();
  }

  public closeDialog(): void {
    this._open = false;
  }

  private _dialogClosed = () => {
    this._open = false;
    this._report = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  };

  private _t = (key: string, values?: Record<string, string | number>) =>
    this.hass.localize(`ui.dark_check.${key}` as any, values as any);

  private _scan = () => {
    this._busy = true;
    // Let the dialog draw first, then measure the page behind it.
    requestAnimationFrame(() => {
      this._report = scanDarkReadability({
        hass: this.hass,
        exclude: [this],
      });
      this._busy = false;
    });
  };

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass) {
      return nothing;
    }
    const report = this._report;
    const problems = report?.findings.length ?? 0;
    return html`
      <ha-dialog
        .open=${this._open}
        header-title=${this._t("title")}
        header-subtitle=${
          report
            ? problems
              ? this._t("problems_count", { count: problems })
              : this._t("none_found")
            : this._t("scanning")
        }
        @closed=${this._dialogClosed}
      >
        <div class="body">
          ${
            report && !report.darkMode
              ? html`<p class="warning" role="status">
                  ${this._t("mode_light")}
                </p>`
              : nothing
          }
          ${
            this._busy && !report
              ? html`<ha-spinner></ha-spinner>`
              : report
                ? html`
                    <h3 class="section-title">${this._t("section_title")}</h3>
                    <ul class="list">
                      ${report.findings.map((finding) =>
                        this._renderFinding(finding, report.darkMode)
                      )}
                      <li class="ok">
                        <span class="tile ok-tile"
                          ><ha-svg-icon .path=${mdiCheckCircle}></ha-svg-icon
                        ></span>
                        <span class="text">
                          <span class="title">${this._t("readable_all")}</span>
                          <span class="sub"
                            >${this._t("checked", {
                              checked: report.textChecked,
                            })}</span
                          >
                        </span>
                      </li>
                    </ul>
                    ${
                      report.textNotJudged
                        ? html`<p class="note">
                            ${this._t("not_judged", {
                              count: report.textNotJudged,
                            })}
                          </p>`
                        : nothing
                    }
                    ${
                      report.truncated
                        ? html`<p class="note">${this._t("truncated")}</p>`
                        : nothing
                    }
                  `
                : nothing
          }
        </div>
        <ha-dialog-footer slot="footer">
          <ha-button
            slot="secondaryAction"
            appearance="plain"
            .disabled=${this._busy}
            @click=${this._scan}
          >
            ${this._t("rescan")}
          </ha-button>
          <ha-button slot="primaryAction" @click=${this.closeDialog}>
            ${this.hass.localize("ui.common.close")}
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private _renderFinding(finding: DarkFinding, dark: boolean): TemplateResult {
    const { cause } = finding;
    const modeName = this._t(dark ? "mode_name_dark" : "mode_name_light");
    return html`
      <li class="problem">
        <span class="tile"
          ><ha-svg-icon .path=${mdiContrastCircle}></ha-svg-icon
        ></span>
        <span class="text">
          <span class="title">${finding.sample}</span>
          <span class="sub"
            >${this._t("ratio", {
              ratio: finding.ratio,
              mode: modeName,
              required: finding.required,
            })}${
              finding.count > 1
                ? ` · ${this._t("places", { count: finding.count })}`
                : ""
            }${finding.card ? ` · ${this._t("in_card", { card: finding.card })}` : ""}</span
          >
          <span class="sub">${this._causeText(finding)}</span>
        </span>
        <span class="actions">
          <ha-icon-button
            .path=${mdiCrosshairsGps}
            .label=${this._t("locate")}
            .title=${this._t("locate")}
            .finding=${finding}
            data-action="locate"
            @click=${this._action}
          ></ha-icon-button>
          ${
            cause.kind === "override"
              ? html`<ha-button
                    size="small"
                    .disabled=${this._busy}
                    .finding=${finding}
                    data-action="fix_override"
                    @click=${this._action}
                    >${this._t("fix")}</ha-button
                  >
                  <ha-button
                    size="small"
                    appearance="plain"
                    .disabled=${this._busy}
                    .finding=${finding}
                    data-action="reset_override"
                    @click=${this._action}
                    >${this._t("reset_override")}</ha-button
                  >`
              : cause.kind === "theme"
                ? html`<ha-button
                    size="small"
                    .disabled=${this._busy}
                    .finding=${finding}
                    data-action="fix_theme"
                    @click=${this._action}
                    >${this._t("fix")}</ha-button
                  >`
                : cause.kind === "card_style"
                  ? html`<ha-button
                      size="small"
                      .disabled=${this._busy || !this._cardTarget(finding)}
                      .finding=${finding}
                      data-action="fix_card"
                      @click=${this._action}
                      >${this._t("fix")}</ha-button
                    >`
                  : nothing
          }
        </span>
      </li>
    `;
  }

  private _causeText(finding: DarkFinding): string {
    const { cause } = finding;
    switch (cause.kind) {
      case "override":
        return this._t("cause_override", { color: cause.color });
      case "card_style":
        return this._cardTarget(finding)
          ? this._t("cause_card", { color: cause.color })
          : `${this._t("cause_card", { color: cause.color })} ${this._t("card_not_found")}`;
      case "theme":
        return `${this._t("cause_theme", {
          theme: cause.theme,
          variable: cause.variable,
        })} ${this._t("cause_theme_fix")}`;
      default:
        return this._t("cause_none");
    }
  }

  private _action(ev: Event) {
    const button = ev.currentTarget as HTMLElement & { finding: DarkFinding };
    const { finding } = button;
    switch (button.dataset.action) {
      case "locate":
        locateElement(finding.element);
        break;
      case "fix_override":
        this._fixOverride(finding);
        break;
      case "reset_override":
        this._resetOverride(finding);
        break;
      case "fix_theme":
        this._fixThemeText(finding);
        break;
      case "fix_card":
        this._fixCardStyle(finding);
        break;
      default:
    }
  }

  /** The best readable colour for a finding, as a hex value. */
  private _readable(finding: DarkFinding): string {
    return nearestReadable(
      finding.foreground,
      finding.background,
      finding.required
    );
  }

  private _fixOverride(finding: DarkFinding) {
    const { cause } = finding;
    if (cause.kind !== "override") {
      return;
    }
    const store = readAppearanceStore();
    const choice = getChoice(store, cause.target, cause.scope);
    writeAppearanceStore(
      setChoice(store, cause.target, cause.scope, {
        ...choice,
        textColor: this._readable(finding),
      })
    );
    this._afterFix();
  }

  private _resetOverride(finding: DarkFinding) {
    const { cause } = finding;
    if (cause.kind !== "override") {
      return;
    }
    const store = readAppearanceStore();
    const { textColor: _removed, ...rest } = getChoice(
      store,
      cause.target,
      cause.scope
    );
    writeAppearanceStore(setChoice(store, cause.target, cause.scope, rest));
    this._afterFix();
  }

  /**
   * A colour a theme sets cannot be changed here, because the theme belongs
   * to the server. The text gets an appearance choice of its own instead,
   * which the appearance tools can remove.
   */
  private _fixThemeText(finding: DarkFinding) {
    const target = finding.element as HTMLElement;
    const store = readAppearanceStore();
    const choice = getChoice(store, target, "element");
    writeAppearanceStore(
      setChoice(store, target, "element", {
        ...choice,
        textColor: this._readable(finding),
      })
    );
    this._afterFix();
  }

  private _lovelaceOf(card: HTMLElement): Lovelace | undefined {
    let node: Element | null = card;
    for (let depth = 0; node && depth < 20; depth++) {
      const found = (node as Element & { lovelace?: Lovelace }).lovelace;
      if (found && typeof found.saveConfig === "function") {
        return found;
      }
      node = node.parentElement
        ? node.parentElement
        : node.getRootNode() instanceof ShadowRoot
          ? (node.getRootNode() as ShadowRoot).host
          : null;
    }
    return undefined;
  }

  /** The dashboard, the card's place in it and its configuration, if found. */
  private _cardTarget(finding: DarkFinding) {
    const { cause } = finding;
    if (cause.kind !== "card_style") {
      return undefined;
    }
    const lovelace = this._lovelaceOf(cause.card);
    const config = (cause.card as HTMLElement & { config?: unknown }).config;
    if (!lovelace?.config || !config) {
      return undefined;
    }
    const wanted = JSON.stringify(config);
    const matches = listEditableCards(lovelace.config).filter(
      (entry) => JSON.stringify(entry.card) === wanted
    );
    // Two identical cards cannot be told apart, so none is changed.
    return matches.length === 1 ? { lovelace, entry: matches[0] } : undefined;
  }

  private async _fixCardStyle(finding: DarkFinding) {
    const target = this._cardTarget(finding);
    if (!target) {
      return;
    }
    this._busy = true;
    try {
      const card = structuredClone(target.entry.card) as Record<
        string,
        unknown
      >;
      card.style = {
        ...((card.style as Record<string, unknown> | undefined) ?? {}),
        text_color: this._readable(finding),
      };
      await target.lovelace.saveConfig(
        replaceCard(target.lovelace.config, target.entry.path, card as any)
      );
      this._afterFix();
    } catch (err: unknown) {
      showToast(this, {
        message: this._t("fix_failed", {
          error: err instanceof Error ? err.message : String(err),
        }),
      });
      this._busy = false;
    }
  }

  private _afterFix() {
    showToast(this, { message: this._t("fixed") });
    // The page redraws with the new colour; measure it again after that.
    window.setTimeout(() => this._scan(), 300);
  }

  static styles = [
    haStyle,
    css`
      ha-dialog {
        --dialog-content-padding: var(--ha-space-2) var(--ha-space-6);
      }
      .body {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-3);
      }
      .warning {
        margin: 0;
        padding: var(--ha-space-3) var(--ha-space-4);
        border-radius: var(--ha-border-radius-lg);
        background: var(
          --ha-color-warning-container,
          var(--secondary-background-color)
        );
        color: var(--ha-color-on-warning-container, var(--primary-text-color));
      }
      .section-title {
        margin: 0;
        font-size: var(--ha-font-size-l);
        font-weight: var(--ha-font-weight-title, 600);
      }
      .list {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      li {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3);
        padding: var(--ha-space-3) 0;
        border-top: 1px solid var(--divider-color);
      }
      li:first-child {
        border-top: none;
      }
      .tile {
        flex: none;
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        border-radius: var(--ha-border-radius-lg);
        background: var(
          --ha-color-error-container,
          var(--secondary-background-color)
        );
        color: var(--ha-color-on-error-container, var(--primary-text-color));
      }
      .ok-tile {
        background: var(
          --ha-color-success-container,
          var(--secondary-background-color)
        );
        color: var(--ha-color-on-success-container, var(--primary-text-color));
      }
      .text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .title {
        font-weight: var(--ha-font-weight-semibold, 600);
        overflow-wrap: anywhere;
      }
      .sub {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
        line-height: var(--ha-line-height-normal);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: var(--ha-space-1);
      }
      .note {
        margin: 0;
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
      }
      @media all and (max-width: 580px) {
        li {
          flex-wrap: wrap;
        }
        .actions {
          flex-basis: 100%;
          justify-content: flex-start;
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-dark-check": DialogDarkCheck;
  }
}
