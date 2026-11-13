import { mdiBackupRestore } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators";
import { consume } from "../common/decorators/consume";
import { consumeLocalize } from "../common/decorators/consume-context-entry";
import { fireEvent } from "../common/dom/fire_event";
import type { LocalizeFunc } from "../common/translations/localize";
import "../components/ha-button";
import "../components/ha-svg-icon";
import { translationsReadyContext } from "../mixins/lit-localize-lite-mixin";
import { renderSkeleton, skeletonStyles } from "./render-skeleton";
import { onBoardingStyles } from "./styles";

@customElement("onboarding-welcome")
class OnboardingWelcome extends LitElement {
  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @state()
  @consume({ context: translationsReadyContext, subscribe: true })
  private _translationsReady!: boolean;

  protected render(): TemplateResult {
    const ready = this._translationsReady;
    return html`
      <h1>
        ${
          ready
            ? this._localize("ui.panel.page-onboarding.welcome.header")
            : renderSkeleton("title")
        }
      </h1>
      <p>
        ${
          ready
            ? this._localize("ui.panel.page-onboarding.intro")
            : renderSkeleton("line")
        }
      </p>

      <div class="paths">
        <ha-button @click=${this._start} class="start" .disabled=${!ready}>
          ${
            ready
              ? this._localize("ui.panel.page-onboarding.welcome.start")
              : renderSkeleton("button")
          }
        </ha-button>
        <ha-button
          appearance="outlined"
          @click=${this._restoreBackupUpload}
          .disabled=${!ready}
        >
          <ha-svg-icon slot="start" .path=${mdiBackupRestore}></ha-svg-icon>
          ${
            ready
              ? this._localize("ui.panel.page-onboarding.restore.upload_backup")
              : renderSkeleton("chip")
          }
        </ha-button>
      </div>
      <p class="note">
        ${
          ready
            ? this._localize(
                "ui.panel.page-onboarding.restore.options.upload_description"
              )
            : renderSkeleton("line")
        }
      </p>
    `;
  }

  private _start(): void {
    fireEvent(this, "onboarding-step", {
      type: "init",
    });
  }

  private _restoreBackupUpload(): void {
    fireEvent(this, "onboarding-step", {
      type: "init",
      result: { restore: "upload" },
    });
  }

  static get styles(): CSSResultGroup {
    return [
      onBoardingStyles,
      css`
        :host {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          margin-bottom: calc(var(--ha-space-4) * -1);
        }
        h1 {
          width: 100%;
          margin-top: var(--ha-space-4);
          margin-bottom: var(--ha-space-2);
        }
        p {
          width: 100%;
          margin: 0;
        }
        .paths {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-3);
          width: 100%;
          margin: var(--ha-space-6) 0 var(--ha-space-3);
        }
        .note {
          margin: 0;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
      `,
      skeletonStyles,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "onboarding-welcome": OnboardingWelcome;
  }
}
