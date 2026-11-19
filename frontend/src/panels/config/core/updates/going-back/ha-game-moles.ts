import type { TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { fireEvent } from "../../../../../common/dom/fire_event";
import { LanguageModeController } from "../../../../../common/language-mode/language-mode-controller";
import { playActionCue } from "../../../../../common/sound/action-sound";
import type { HomeAssistant } from "../../../../../types";
import { GAME_PREFIX, lessMotion } from "./game-events";
import type { MoleGame } from "./game-logic";
import {
  MOLE_HOLES,
  cryptoRandom,
  moleOutcome,
  moleTimeLeft,
  moleUpMs,
  newMoleGame,
  nextMoleHole,
  whackHole,
} from "./game-logic";
import { gameCardStyles } from "./game-styles";

const TICK_MS = 250;
const SQUASH_MS = 380;
const NEXT_MOLE_MS = 320;

/**
 * Whack-a-mole: moles rise out of dirt holes in a grass field. Ten hits win,
 * in 30 seconds, or with no time limit, where each mole waits to be hit.
 * Every hole is a real button, keys 1 to 6 hit the holes, and the score, the
 * time and the result are always written out.
 */
@customElement("ha-game-moles")
export class HaGameMoles extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _game: MoleGame = newMoleGame(true);

  @state() private _now = Date.now();

  @state() private _squash: number | null = null;

  @state() private _announce = "";

  private _lang = new LanguageModeController(this);

  private _tick?: ReturnType<typeof setInterval>;

  private _moleTimer?: ReturnType<typeof setTimeout>;

  private _won = false;

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stop();
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.hass.localize, `${GAME_PREFIX}.${key}`, values);
  }

  private _stop(): void {
    clearInterval(this._tick);
    clearTimeout(this._moleTimer);
    this._tick = undefined;
    this._moleTimer = undefined;
  }

  protected render(): TemplateResult {
    const outcome = moleOutcome(this._game, this._now);
    const seconds = Math.ceil(moleTimeLeft(this._game, this._now) / 1000);
    const time = `0:${String(seconds).padStart(2, "0")}`;
    const playing = outcome === "playing";
    return html`<div class="gcard">
      <div class="ghead">
        <span class="gtitle">${this._t("moles_title")}</span>
        <span class="score"
          >${
            this._game.timed
              ? this._t("moles_score", { hits: this._game.hits, time })
              : this._t("moles_score_untimed", { hits: this._game.hits })
          }</span
        >
      </div>
      <div
        class=${classMap({ field: true, still: lessMotion() })}
        @keydown=${this._keydown}
      >
        ${Array.from({ length: MOLE_HOLES }, (_, hole) =>
          this._renderHole(hole, playing)
        )}
      </div>
      <div class="gfoot">
        <p class="status" role="status" aria-live="polite">
          ${this._announce || this._statusText(outcome)}
        </p>
        <p class="hint">${this._t("moles_hint")}</p>
        <div class="row">
          ${
            outcome === "playing" || outcome === "won"
              ? nothing
              : html`<button class="gbtn filled" @click=${this._start}>
                  ${this._t(outcome === "lost" ? "moles_again" : "moles_start")}
                </button>`
          }
          <button
            class="gbtn"
            aria-pressed=${this._game.timed ? "false" : "true"}
            .disabled=${playing}
            @click=${this._toggleTimed}
          >
            ${this._t("moles_untimed")}
          </button>
        </div>
      </div>
    </div>`;
  }

  private _renderHole(hole: number, playing: boolean): TemplateResult {
    const up = this._game.up === hole;
    const squashed = this._squash === hole;
    const label = up
      ? this._t("moles_hole_up", { n: hole + 1 })
      : this._t("moles_hole", { n: hole + 1 });
    return html`<button
      class="hole"
      aria-label=${label}
      .disabled=${!playing}
      .hole=${hole}
      @click=${this._hit}
    >
      <span class="pit"></span>
      <span class="burrow">
        ${
          up || squashed
            ? html`<span class=${classMap({ mole: true, hit: squashed })}
                ><i class="l"></i><i class="r"></i><b></b><u></u
              ></span>`
            : nothing
        }
      </span>
      <span class="mound"></span>
      ${
        squashed
          ? html`<span class="star" aria-hidden="true">✦</span
              ><span class="soil s1"></span><span class="soil s2"></span
              ><span class="soil s3"></span>`
          : nothing
      }
    </button>`;
  }

  private _statusText(outcome: ReturnType<typeof moleOutcome>): string {
    if (outcome === "won") {
      return this._t("moles_won");
    }
    if (outcome === "lost") {
      return this._t("moles_lost", { hits: this._game.hits });
    }
    if (outcome === "ready") {
      return this._game.timed
        ? this._t("moles_ready")
        : this._t("moles_untimed_on");
    }
    return "";
  }

  private _toggleTimed = () => {
    this._stop();
    this._game = newMoleGame(!this._game.timed);
    this._announce = this._game.timed ? "" : this._t("moles_untimed_on");
  };

  private _start = () => {
    this._stop();
    const now = Date.now();
    this._now = now;
    this._game = { ...newMoleGame(this._game.timed), startedAt: now };
    this._raise();
    this._tick = setInterval(() => {
      this._now = Date.now();
      if (moleOutcome(this._game, this._now) === "lost") {
        this._stop();
        this._game = { ...this._game, up: null };
        this._announce = this._t("moles_lost", { hits: this._game.hits });
      }
    }, TICK_MS);
  };

  // Brings a mole up in a new hole; in the timed game it ducks again later.
  private _raise(): void {
    if (moleOutcome(this._game, Date.now()) !== "playing") {
      return;
    }
    const hole = nextMoleHole(cryptoRandom, this._game.up ?? this._squash);
    this._game = { ...this._game, up: hole };
    this._announce = this._t("moles_up", { n: hole + 1 });
    clearTimeout(this._moleTimer);
    if (this._game.timed) {
      this._moleTimer = setTimeout(
        () => this._raise(),
        moleUpMs(this._game.hits)
      );
    }
  }

  private _hit(ev: Event): void {
    const hole = (ev.currentTarget as HTMLElement & { hole: number }).hole;
    this._whack(hole);
  }

  private _keydown(ev: KeyboardEvent): void {
    const hole = Number(ev.key) - 1;
    if (Number.isInteger(hole) && hole >= 0 && hole < MOLE_HOLES) {
      ev.preventDefault();
      this._whack(hole);
    }
  }

  private _whack(hole: number): void {
    const now = Date.now();
    const result = whackHole(this._game, hole, now);
    if (!result.hit) {
      return;
    }
    playActionCue("impact");
    this._game = result.game;
    this._squash = hole;
    this._announce = this._t("moles_hit", { hits: this._game.hits });
    clearTimeout(this._moleTimer);
    if (moleOutcome(this._game, now) === "won") {
      this._stop();
      this._announce = this._t("moles_won");
      setTimeout(() => {
        this._squash = null;
      }, SQUASH_MS);
      if (!this._won) {
        this._won = true;
        playActionCue("success");
        fireEvent(this, "game-won");
      }
      return;
    }
    this._moleTimer = setTimeout(() => {
      this._squash = null;
      this._raise();
    }, NEXT_MOLE_MS);
  }

  static styles = [
    gameCardStyles,
    css`
      .field {
        margin: 0 var(--ha-space-3);
        border-radius: 18px;
        padding: 14px 10px 10px;
        background: radial-gradient(
          120% 90% at 50% 0%,
          #5fa348 0%,
          #3f7f34 55%,
          #2c5e28 100%
        );
        box-shadow:
          inset 0 2px 0 rgba(255, 255, 255, 0.18),
          inset 0 -10px 24px rgba(0, 0, 0, 0.28);
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px 8px;
      }
      .hole {
        position: relative;
        height: 74px;
        min-width: 44px;
        padding: 0;
        border: none;
        border-radius: 14px;
        background: transparent;
        cursor: pointer;
        display: grid;
        place-items: end center;
      }
      .hole[disabled] {
        cursor: default;
      }
      .pit {
        position: absolute;
        left: 8%;
        right: 8%;
        bottom: 6px;
        height: 26px;
        border-radius: 50%;
        background: radial-gradient(
          60% 70% at 50% 35%,
          #0e0906 0%,
          #2a1a10 70%,
          #4a2f1c 100%
        );
        box-shadow:
          0 3px 0 #6b4528,
          0 5px 6px rgba(0, 0, 0, 0.35);
      }
      .burrow {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 18px;
        height: 60px;
        overflow: hidden;
        display: grid;
        place-items: end center;
        pointer-events: none;
      }
      .mound {
        position: absolute;
        left: 2%;
        right: 2%;
        bottom: 0;
        height: 16px;
        border-radius: 50% 50% 46% 46%;
        background: linear-gradient(#7a5232, #5a3a22);
        clip-path: ellipse(50% 100% at 50% 100%);
      }
      .mole {
        position: relative;
        display: block;
        width: 46px;
        height: 50px;
        margin-bottom: -4px;
        border-radius: 24px 24px 14px 14px;
        background: radial-gradient(
          70% 60% at 38% 28%,
          #b98e66 0%,
          #8a6242 55%,
          #5e3f29 100%
        );
        box-shadow: inset 0 -8px 10px rgba(0, 0, 0, 0.3);
        transform-origin: 50% 100%;
        animation: rise 260ms cubic-bezier(0.2, 1.4, 0.4, 1) both;
      }
      .mole i {
        position: absolute;
        top: 16px;
        width: 7px;
        height: 8px;
        border-radius: 50%;
        background: #140d08;
        box-shadow: inset 1.5px -1.5px 0 #fff3;
      }
      .mole i.l {
        left: 11px;
      }
      .mole i.r {
        right: 11px;
      }
      .mole b {
        position: absolute;
        left: 50%;
        top: 25px;
        width: 14px;
        height: 10px;
        margin-left: -7px;
        border-radius: 50%;
        background: radial-gradient(circle at 40% 30%, #f3a9b4, #c96c7c);
      }
      .mole u {
        position: absolute;
        left: 50%;
        top: 35px;
        width: 10px;
        height: 7px;
        margin-left: -5px;
        border-radius: 0 0 3px 3px;
        background: #fbf6ec;
        box-shadow: inset -5px 0 0 -4px #c9c2b4;
      }
      .mole.hit {
        animation: squash 340ms ease-in both;
        filter: brightness(0.8);
      }
      .star {
        position: absolute;
        top: 0;
        right: 10px;
        color: #ffe08a;
        font-size: 18px;
        text-shadow: 0 1px 2px #0008;
        animation: pop 340ms ease-out both;
      }
      .soil {
        position: absolute;
        bottom: 14px;
        width: 5px;
        height: 4px;
        border-radius: 50%;
        background: #6b4528;
        animation: fling 380ms ease-out both;
      }
      .s1 {
        left: 30%;
        --dx: -14px;
      }
      .s2 {
        left: 50%;
        --dx: 2px;
      }
      .s3 {
        left: 64%;
        --dx: 16px;
      }
      @keyframes rise {
        from {
          transform: translateY(100%);
        }
        to {
          transform: translateY(0);
        }
      }
      @keyframes squash {
        to {
          transform: translateY(40%) scaleY(0.7);
        }
      }
      @keyframes pop {
        from {
          transform: scale(0.4);
          opacity: 0;
        }
        to {
          transform: scale(1);
          opacity: 1;
        }
      }
      @keyframes fling {
        to {
          transform: translate(var(--dx), -18px);
          opacity: 0;
        }
      }
      .still .mole,
      .still .mole.hit,
      .still .star,
      .still .soil {
        animation: none;
      }
      .still .mole.hit {
        transform: translateY(8px) scaleY(0.82);
      }
      @media (prefers-reduced-motion: reduce) {
        .mole,
        .mole.hit,
        .star,
        .soil {
          animation: none;
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-game-moles": HaGameMoles;
  }
}
