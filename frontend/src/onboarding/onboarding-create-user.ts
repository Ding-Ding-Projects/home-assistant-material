import type { ContextType } from "@lit/context";
import { genClientId } from "home-assistant-js-websocket";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, query, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import { consume } from "../common/decorators/consume";
import { fireEvent } from "../common/dom/fire_event";
import "../components/ha-alert";
import "../components/ha-button";
import "../components/input/ha-input";
import type { HaInput } from "../components/input/ha-input";
import { internationalizationContext } from "../data/context";
import { onboardUserStep } from "../data/onboarding";
import {
  accountComplete,
  accountErrors,
  PASSWORD_MIN_LENGTH,
  reportPassword,
} from "./onboarding-logic";
import type { AccountFieldErrors } from "./onboarding-logic";
import { onBoardingStyles } from "./styles";

type FieldName = "name" | "username" | "password" | "password_confirm";

/**
 * The account step. Fields validate as the person types, the password shows
 * its strength and whether the confirmation matches as text, and a show
 * button reveals the password on request. The password is held only in the
 * fields and the state of this element; it is never written to storage or
 * placed in a label or a live message.
 */
@customElement("onboarding-create-user")
class OnboardingCreateUser extends LitElement {
  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: ContextType<typeof internationalizationContext>;

  @state() private _loading = false;

  @state() private _errorMsg?: string;

  @state() private _values: Record<FieldName, string> = {
    name: "",
    username: "",
    password: "",
    password_confirm: "",
  };

  @state() private _touched: Partial<Record<FieldName, boolean>> = {};

  /** Whether the person has edited the username by hand. */
  private _usernameEdited = false;

  @query("ha-input[name='name']", true) private _nameInput?: HaInput;

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._i18n.localize(
      `ui.panel.page-onboarding.user.${key}` as any,
      values as any
    );
  }

  protected render(): TemplateResult {
    const errors = accountErrors(this._values, this._touched);
    const report = reportPassword(
      this._values.password,
      this._values.password_confirm
    );
    const ready = accountComplete(this._values);
    return html`
      <h1>${this._t("header")}</h1>
      <p>${this._t("intro")}</p>

      ${
        this._errorMsg
          ? html`<ha-alert alert-type="error">${this._errorMsg}</ha-alert>`
          : nothing
      }

      <div class="fields">
        ${this._renderField("name", errors, "name", {
          autocomplete: "name",
          hint: this._t("helper.name"),
        })}
        ${this._renderField("username", errors, "username", {
          autocomplete: "username",
          hint: this._t("helper.username"),
        })}
        <div class="field">
          <ha-input
            name="password"
            type="password"
            password-toggle
            autocomplete="new-password"
            .label=${this._t("data.password")}
            .value=${this._values.password}
            .disabled=${this._loading}
            required
            aria-describedby="password-note"
            @input=${this._handleInput}
            @blur=${this._handleBlur}
          ></ha-input>
          <div class="meter" role="presentation" data-level=${report.strength}>
            <span
              style=${styleMap({ width: `${Math.round(report.score * 100)}%` })}
            ></span>
          </div>
          <p id="password-note" class="msg" aria-live="polite">
            ${
              errors.password
                ? html`<span class="error"
                    >${this._t("error.password_too_short", {
                      min: PASSWORD_MIN_LENGTH,
                    })}</span
                  >`
                : report.strength === "empty"
                  ? this._t("helper.password")
                  : this._t("strength", {
                      level: this._t(`strength_level.${report.strength}`),
                      count: report.length,
                    })
            }
          </p>
        </div>
        <div class="field">
          <ha-input
            name="password_confirm"
            type="password"
            password-toggle
            autocomplete="new-password"
            .label=${this._t("data.password_confirm")}
            .value=${this._values.password_confirm}
            .disabled=${this._loading}
            required
            @input=${this._handleInput}
            @blur=${this._handleBlur}
          ></ha-input>
          <p class="msg" aria-live="polite">
            ${
              errors.password_confirm
                ? html`<span class="error"
                    >${this._t("error.password_not_match")}</span
                  >`
                : report.confirmTouched && report.matches
                  ? html`<span class="ok">${this._t("match_ok")}</span>`
                  : nothing
            }
          </p>
        </div>
      </div>
      <div class="footer">
        <ha-button
          @click=${this._submitForm}
          .disabled=${this._loading || !ready}
        >
          ${this._t("create_account")}
        </ha-button>
      </div>
    `;
  }

  private _renderField(
    name: FieldName,
    errors: AccountFieldErrors,
    labelKey: string,
    options: { autocomplete: string; hint: string }
  ): TemplateResult {
    const error = errors[name as "name" | "username"];
    return html`<div class="field">
      <ha-input
        name=${name}
        autocomplete=${options.autocomplete}
        .label=${this._t(`data.${labelKey}`)}
        .value=${this._values[name]}
        .disabled=${this._loading}
        required
        @input=${this._handleInput}
        @blur=${this._handleBlur}
      ></ha-input>
      <p class="msg" aria-live="polite">
        ${
          error
            ? html`<span class="error"
                >${this._t(
                  error === "not_normalized"
                    ? "error.username_not_normalized"
                    : `error.${name}_required`
                )}</span
              >`
            : options.hint
        }
      </p>
    </div>`;
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    setTimeout(() => this._nameInput?.focus(), 100);
    this.addEventListener("keypress", (ev) => {
      if (ev.key === "Enter" && accountComplete(this._values)) {
        this._submitForm(ev);
      }
    });
  }

  private _handleInput(ev: Event): void {
    const input = ev.currentTarget as HaInput;
    const name = input.getAttribute("name") as FieldName;
    const value = String(input.value ?? "");
    const values = { ...this._values, [name]: value };
    if (name === "name" && !this._usernameEdited) {
      values.username = value.trim().split(" ")[0].toLowerCase();
    }
    if (name === "username") {
      this._usernameEdited = value.length > 0;
    }
    this._values = values;
    // Fields already visited keep reporting as the person types.
    if (name === "name" && !this._usernameEdited && values.username) {
      this._touched = { ...this._touched, username: true };
    }
    if (name === "password" && values.password_confirm) {
      this._touched = { ...this._touched, password_confirm: true };
    }
    if (name === "password_confirm") {
      this._touched = { ...this._touched, password_confirm: true };
    }
  }

  private _handleBlur(ev: Event): void {
    const name = (ev.currentTarget as HaInput).getAttribute(
      "name"
    ) as FieldName;
    this._touched = { ...this._touched, [name]: true };
  }

  private async _submitForm(ev): Promise<void> {
    ev.preventDefault();
    if (this._loading || !accountComplete(this._values)) {
      return;
    }
    this._loading = true;
    this._errorMsg = "";

    try {
      const clientId = genClientId();

      const result = await onboardUserStep({
        client_id: clientId,
        name: this._values.name,
        username: this._values.username,
        password: this._values.password,
        language: this._i18n.language,
      });

      fireEvent(this, "onboarding-step", {
        type: "user",
        result,
      });
    } catch (err: any) {
      // eslint-disable-next-line
      console.error(err);
      this._loading = false;
      this._errorMsg = err.body.message;
    }
  }

  static get styles(): CSSResultGroup {
    return [
      onBoardingStyles,
      css`
        .fields {
          display: grid;
          gap: var(--ha-space-2);
        }
        .field {
          display: grid;
          gap: var(--ha-space-1);
        }
        ha-input {
          min-height: 44px;
        }
        .msg {
          margin: 0;
          min-height: 1.25em;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .msg .error {
          color: var(--error-color);
        }
        .msg .ok {
          color: var(--success-color);
        }
        .meter {
          height: 6px;
          border-radius: 3px;
          background: var(--divider-color);
          overflow: hidden;
        }
        .meter span {
          display: block;
          height: 100%;
          border-radius: 3px;
          background: var(--error-color);
          transition: width 150ms ease;
        }
        .meter[data-level="fair"] span {
          background: var(--warning-color);
        }
        .meter[data-level="strong"] span {
          background: var(--success-color);
        }
        @media (prefers-reduced-motion: reduce) {
          .meter span {
            transition: none;
          }
        }
        ha-input:focus-within {
          outline: 2px solid var(--primary-color);
          outline-offset: 2px;
          border-radius: var(--ha-border-radius-lg);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "onboarding-create-user": OnboardingCreateUser;
  }
}
