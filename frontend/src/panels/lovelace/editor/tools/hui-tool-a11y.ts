import type { TemplateResult } from "lit";
import { html, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-button";
import type { A11yFinding, A11yReport } from "./a11y-checker";
import {
  locateElement,
  scanDashboardAccessibility,
  TARGET_COMFORT,
  TARGET_MIN,
} from "./a11y-checker";
import { ToolView } from "./tools-base";

@customElement("hui-tool-a11y")
export class HuiToolA11y extends ToolView {
  @state() private _report?: A11yReport;

  @state() private _scanning = false;

  protected render(): TemplateResult {
    const report = this._report;
    const fails = report?.findings.filter((f) => f.severity === "fail").length;
    return html`
      <p class="intro">${this._t("a11y.intro")}</p>
      <div class="row">
        <ha-button .disabled=${this._scanning} @click=${this._scan}>
          ${this._t(report ? "a11y.rescan" : "a11y.scan")}
        </ha-button>
        ${
          this._scanning
            ? html`<span class="hint" aria-live="polite"
                >${this._t("a11y.scanning")}</span
              >`
            : nothing
        }
      </div>
      ${
        report
          ? html`
              <div class="stats">
                <div class="stat">
                  <strong>${fails}</strong>${this._t("a11y.failures")}
                </div>
                <div class="stat">
                  <strong>${report.findings.length - (fails ?? 0)}</strong
                  >${this._t("a11y.advice")}
                </div>
                <div class="stat">
                  <strong>${report.textChecked}</strong>${this._t(
                    "a11y.text_checked"
                  )}
                </div>
                <div class="stat">
                  <strong>${report.controlsChecked}</strong>${this._t(
                    "a11y.controls_checked"
                  )}
                </div>
              </div>
              <p class="hint">
                ${this._t("a11y.not_judged", {
                  count: report.textNotJudged,
                })}
                ${this._t("a11y.reading_order")}
                ${report.truncated ? this._t("a11y.truncated") : nothing}
              </p>
              ${
                report.cards
                  ? report.findings.length
                    ? html`<ul class="list">
                        ${report.findings.map((f) => this._renderFinding(f))}
                      </ul>`
                    : html`<p class="empty">${this._t("a11y.clean")}</p>`
                  : html`<p class="empty">${this._t("a11y.no_cards")}</p>`
              }
            `
          : nothing
      }
    `;
  }

  private _renderFinding(finding: A11yFinding): TemplateResult {
    return html`<li>
      <div class="main">
        <b>${this._t(`a11y.kind.${finding.kind}`)}</b>
        <span>${this._describe(finding)}</span>
        <span class="muted">${finding.card}</span>
      </div>
      <span class="pill ${finding.severity === "fail" ? "error" : "warning"}">
        ${this._t(`a11y.severity.${finding.severity}`)}
      </span>
      <ha-button
        size="s"
        appearance="plain"
        .finding=${finding}
        @click=${this._locate}
      >
        ${this._t("a11y.locate")}
      </ha-button>
    </li>`;
  }

  private _describe(f: A11yFinding): string {
    switch (f.kind) {
      case "contrast":
        return this._t("a11y.describe.contrast", {
          sample: f.sample,
          ratio: f.ratio ?? 0,
          required: f.required ?? 0,
        });
      case "target":
        return this._t("a11y.describe.target", {
          tag: f.sample,
          width: f.width ?? 0,
          height: f.height ?? 0,
          min: f.severity === "fail" ? TARGET_MIN : TARGET_COMFORT,
        });
      default:
        return this._t("a11y.describe.name", { tag: f.sample });
    }
  }

  private async _scan() {
    this._scanning = true;
    // Let the "scanning" text paint before the measuring starts.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    try {
      this._report = scanDashboardAccessibility();
    } catch (err: unknown) {
      this._fail(err);
    } finally {
      this._scanning = false;
    }
  }

  private _locate(ev: Event) {
    const finding = (ev.currentTarget as HTMLElement & { finding: A11yFinding })
      .finding;
    if (finding.element.isConnected) {
      // The dialog covers the dashboard, so close it first.
      fireEvent(this, "close-tool");
      window.setTimeout(() => locateElement(finding.element), 400);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-tool-a11y": HuiToolA11y;
  }
}
