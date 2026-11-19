import type { TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { fireEvent } from "../../../../../common/dom/fire_event";
import { LanguageModeController } from "../../../../../common/language-mode/language-mode-controller";
import { playActionCue } from "../../../../../common/sound/action-sound";
import type { HomeAssistant } from "../../../../../types";
import { GAME_PREFIX, lessMotion } from "./game-events";
import type { CoinSide } from "./game-logic";
import { flipCoin } from "./game-logic";
import { gameCardStyles } from "./game-styles";

const SPIN_MS = 1700;

/**
 * A struck metal coin on a felt table. The side is decided by one random bit
 * from the browser's cryptographic source when Spin is pressed; the spin is
 * only a picture of it. Heads finishes the step; tails means spin again.
 */
@customElement("ha-game-coin")
export class HaGameCoin extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _spins: CoinSide[] = [];

  @state() private _spinning = false;

  @state() private _announce = "";

  private _lang = new LanguageModeController(this);

  private _timer?: ReturnType<typeof setTimeout>;

  private _won = false;

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this._timer);
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.hass.localize, `${GAME_PREFIX}.${key}`, values);
  }

  protected render(): TemplateResult {
    const last = this._spinning
      ? undefined
      : this._spins[this._spins.length - 1];
    const shown = this._spins.length
      ? this._t("coin_spins", {
          list: [
            ...this._spins
              .slice(0, this._spinning ? -1 : undefined)
              .map((side) =>
                this._t(side === "heads" ? "coin_heads" : "coin_tails")
              ),
            ...(this._spinning ? ["?"] : []),
          ].join(" · "),
        })
      : this._t("coin_none");
    return html`<div class="gcard">
      <div class="ghead">
        <span class="gtitle">${this._t("coin_title")}</span>
        <span class="score">${shown}</span>
      </div>
      <div class=${classMap({ table: true, still: lessMotion() })}>
        <span class=${classMap({ shadow: true, spin: this._spinning })}></span>
        ${
          this._spinning
            ? html`<span class="edge" aria-hidden="true"></span>`
            : nothing
        }
        <div
          class=${classMap({
            coin: true,
            spin: this._spinning,
            tails: last === "tails",
          })}
          aria-hidden="true"
        >
          <span class="face"></span>
        </div>
      </div>
      <div class="gfoot">
        <p class="status" role="status" aria-live="polite">${this._announce}</p>
        <button
          class="gbtn filled"
          .disabled=${this._spinning || last === "heads"}
          @click=${this._spin}
        >
          ${this._spinning ? this._t("coin_spinning") : this._t("coin_spin")}
        </button>
      </div>
    </div>`;
  }

  private _spin = () => {
    if (this._spinning || this._won) {
      return;
    }
    const side = flipCoin();
    this._spins = [...this._spins, side];
    this._spinning = true;
    this._announce = this._t("coin_spinning");
    this._timer = setTimeout(
      () => {
        this._spinning = false;
        if (side === "heads") {
          this._announce = this._t("coin_result_heads");
          this._won = true;
          playActionCue("success");
          fireEvent(this, "game-won");
        } else {
          this._announce = this._t("coin_result_tails");
          playActionCue("toggle-off");
        }
      },
      lessMotion() ? 0 : SPIN_MS
    );
  };

  static styles = [
    gameCardStyles,
    css`
      .table {
        margin: 0 var(--ha-space-3);
        height: 190px;
        border-radius: 18px;
        background: radial-gradient(
          120% 100% at 50% 0%,
          #2f6b4f 0%,
          #1f4a38 60%,
          #143226 100%
        );
        box-shadow:
          inset 0 0 0 6px #5a3a22,
          inset 0 0 0 8px #3b2515,
          inset 0 10px 30px rgba(0, 0, 0, 0.4);
        display: grid;
        place-items: center;
        position: relative;
        perspective: 600px;
      }
      .coin {
        width: 110px;
        height: 110px;
        border-radius: 50%;
        background: radial-gradient(
          circle at 35% 28%,
          #fff4c2 0%,
          #f0c64a 30%,
          #c7922a 62%,
          #8c6212 100%
        );
        box-shadow:
          inset 0 0 0 5px #b7872a,
          inset 0 0 0 7px #f5d77a,
          inset 0 0 0 9px #9a6e18,
          0 2px 0 #6e4c0c;
        display: grid;
        place-items: center;
        position: relative;
      }
      .coin::before {
        content: "";
        position: absolute;
        inset: 11px;
        border-radius: 50%;
        border: 2px dotted rgba(110, 76, 12, 0.7);
      }
      .face {
        width: 52px;
        height: 60px;
        border-radius: 26px 26px 18px 18px;
        background: linear-gradient(140deg, #f7de8e, #b98a26);
        box-shadow:
          inset 2px 2px 0 rgba(255, 255, 255, 0.5),
          inset -3px -3px 0 rgba(110, 76, 12, 0.55);
      }
      .coin.tails .face {
        width: 46px;
        height: 46px;
        border-radius: 50%;
        background: transparent;
        box-shadow:
          inset 0 0 0 6px #b98a26,
          inset 2px 2px 0 6px rgba(255, 255, 255, 0.35);
      }
      /* The milled edge, seen while the coin is on its edge. */
      .edge {
        position: absolute;
        right: 26px;
        top: 26px;
        width: 54px;
        height: 12px;
        border-radius: 6px;
        background: repeating-linear-gradient(
          90deg,
          #c7922a 0 3px,
          #8c6212 3px 5px
        );
        transform: rotate(-18deg);
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.4);
        opacity: 0.9;
        animation: edge 1700ms ease-in-out both;
      }
      @keyframes edge {
        0%,
        100% {
          opacity: 0;
        }
        20%,
        70% {
          opacity: 0.9;
        }
      }
      .still .edge {
        display: none;
      }
      .shadow {
        position: absolute;
        bottom: 30px;
        width: 120px;
        height: 16px;
        border-radius: 50%;
        background: radial-gradient(
          closest-side,
          rgba(0, 0, 0, 0.45),
          transparent
        );
      }
      .coin.spin {
        animation: spin 1700ms cubic-bezier(0.15, 0.6, 0.35, 1) both;
      }
      .shadow.spin {
        animation: shadow 1700ms ease-in both;
      }
      @keyframes spin {
        0% {
          transform: translateY(0) rotateY(0deg) rotateX(0deg);
        }
        20% {
          transform: translateY(-34px) rotateY(900deg) rotateX(12deg);
        }
        65% {
          transform: translateY(-6px) rotateY(1800deg) rotateX(-18deg);
        }
        82% {
          transform: translateY(0) rotateY(2140deg) rotateX(10deg);
        }
        92% {
          transform: rotateY(2160deg) rotateX(-4deg);
        }
        100% {
          transform: rotateY(2160deg) rotateX(0deg);
        }
      }
      @keyframes shadow {
        0% {
          transform: scaleX(1);
          opacity: 1;
        }
        20% {
          transform: scaleX(0.4);
          opacity: 0.4;
        }
        80% {
          transform: scaleX(0.7);
          opacity: 0.7;
        }
        100% {
          transform: scaleX(1);
          opacity: 1;
        }
      }
      .still .coin.spin,
      .still .shadow.spin {
        animation: none;
      }
      @media (prefers-reduced-motion: reduce) {
        .coin.spin,
        .shadow.spin {
          animation: none;
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-game-coin": HaGameCoin;
  }
}
