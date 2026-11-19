import type { TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { fireEvent } from "../../../../../common/dom/fire_event";
import { LanguageModeController } from "../../../../../common/language-mode/language-mode-controller";
import { playActionCue } from "../../../../../common/sound/action-sound";
import type { HomeAssistant } from "../../../../../types";
import { GAME_PREFIX, lessMotion } from "./game-events";
import type { Cell, Player } from "./game-logic";
import {
  COLS,
  ROWS,
  cryptoRandom,
  dropDisc,
  emptyBoard,
  findWin,
  fourOutcome,
  landingRow,
  opponentMove,
} from "./game-logic";
import { gameCardStyles } from "./game-styles";

const HOME_DELAY_MS = 520;

/**
 * Four in a row against the home on a moulded blue rack. The person plays
 * red and moves first. Each column is a real button, keys 1 to 7 choose a
 * column, and the turn and the result are always written out. Only a win
 * counts; a draw or a loss means a new game.
 */
@customElement("ha-game-four")
export class HaGameFour extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _board: Cell[] = emptyBoard();

  @state() private _homeThinking = false;

  @state() private _last?: { index: number; rows: number };

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
    const outcome = fourOutcome(this._board);
    const win = findWin(this._board);
    const winCells = new Set(win?.cells ?? []);
    const canPlay = outcome === "playing" && !this._homeThinking;
    const still = lessMotion();
    return html`<div class="gcard">
      <div class="ghead">
        <span class="gtitle">${this._t("four_title")}</span>
        <span class="turn">
          <span
            class=${classMap({
              dot: true,
              y: this._homeThinking,
            })}
            aria-hidden="true"
          ></span>
          ${
            outcome !== "playing"
              ? this._resultText(outcome)
              : this._homeThinking
                ? this._t("four_home_turn")
                : this._t("four_your_turn")
          }
        </span>
      </div>
      <div class="legend">
        <span>${this._t("four_you")}</span><span>${this._t("four_home")}</span>
      </div>
      <div class="rackwrap" @keydown=${this._keydown}>
        <div class=${classMap({ rack: true, still })}>
          ${Array.from({ length: COLS }, (_, col) => {
            const full = landingRow(this._board, col) < 0;
            return html`<button
              class="col"
              .col=${col}
              .disabled=${!canPlay || full}
              aria-label=${
                full
                  ? this._t("four_column_full", { n: col + 1 })
                  : this._t("four_column", { n: col + 1 })
              }
              @click=${this._choose}
            >
              ${Array.from({ length: ROWS }, (__, row) => {
                const index = row * COLS + col;
                const cell = this._board[index];
                const dropping = this._last?.index === index && !still;
                return html`<span
                  class=${classMap({
                    cell: true,
                    r: cell === 1,
                    y: cell === 2,
                    win: winCells.has(index),
                    drop: dropping,
                  })}
                  style=${styleMap(
                    dropping ? { "--fall": String(this._last!.rows) } : {}
                  )}
                ></span>`;
              })}
            </button>`;
          })}
        </div>
        <div class="feet" aria-hidden="true"><span></span><span></span></div>
      </div>
      <div class="gfoot">
        <p class="status" role="status" aria-live="polite">${this._announce}</p>
        <p class="hint">${this._t("four_hint")}</p>
        ${
          outcome === "lost" || outcome === "draw"
            ? html`<button class="gbtn filled" @click=${this._newGame}>
                ${this._t("four_new")}
              </button>`
            : nothing
        }
      </div>
    </div>`;
  }

  private _resultText(outcome: ReturnType<typeof fourOutcome>): string {
    if (outcome === "won") {
      return this._t("four_won");
    }
    if (outcome === "lost") {
      return this._t("four_lost");
    }
    return this._t("four_draw");
  }

  private _choose(ev: Event): void {
    this._play((ev.currentTarget as HTMLElement & { col: number }).col);
  }

  private _keydown(ev: KeyboardEvent): void {
    const col = Number(ev.key) - 1;
    if (Number.isInteger(col) && col >= 0 && col < COLS) {
      ev.preventDefault();
      this._play(col);
    }
  }

  private _place(col: number, player: Player): boolean {
    const result = dropDisc(this._board, col, player);
    if (!result) {
      return false;
    }
    this._board = result.board;
    this._last = { index: result.row * COLS + col, rows: result.row + 1 };
    playActionCue("key-turn", player === 1 ? 1 : 0.8);
    return true;
  }

  private _play(col: number): void {
    if (fourOutcome(this._board) !== "playing" || this._homeThinking) {
      return;
    }
    if (!this._place(col, 1)) {
      return;
    }
    const outcome = fourOutcome(this._board);
    if (outcome !== "playing") {
      this._finish(outcome, this._t("four_dropped_you", { n: col + 1 }));
      return;
    }
    this._announce = this._t("four_dropped_you", { n: col + 1 });
    this._homeThinking = true;
    this._timer = setTimeout(
      () => {
        this._homeThinking = false;
        const move = opponentMove(this._board, cryptoRandom);
        if (move < 0 || !this._place(move, 2)) {
          return;
        }
        const after = fourOutcome(this._board);
        const said = this._t("four_dropped_home", { n: move + 1 });
        if (after !== "playing") {
          this._finish(after, said);
        } else {
          this._announce = `${said} ${this._t("four_your_turn")}`;
        }
      },
      lessMotion() ? 0 : HOME_DELAY_MS
    );
  }

  private _finish(outcome: ReturnType<typeof fourOutcome>, said: string): void {
    this._announce = `${said} ${this._resultText(outcome)}`;
    if (outcome === "won" && !this._won) {
      this._won = true;
      playActionCue("success");
      fireEvent(this, "game-won");
    } else if (outcome !== "won") {
      playActionCue("refused");
    }
  }

  private _newGame = () => {
    clearTimeout(this._timer);
    this._board = emptyBoard();
    this._last = undefined;
    this._homeThinking = false;
    this._announce = this._t("four_your_turn");
  };

  static styles = [
    gameCardStyles,
    css`
      .turn {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
      }
      .dot {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: radial-gradient(
          circle at 34% 28%,
          #ff9a8c,
          #e5392b 45%,
          #a41e14
        );
      }
      .dot.y {
        background: radial-gradient(
          circle at 34% 28%,
          #fff3a8,
          #f6c82a 45%,
          #b98a08
        );
      }
      .legend {
        display: flex;
        gap: var(--ha-space-4);
        padding: 0 var(--ha-space-4) var(--ha-space-2);
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
      }
      .rackwrap {
        margin: 0 var(--ha-space-3);
        padding-bottom: 10px;
      }
      .rack {
        border-radius: 16px;
        padding: 10px 6px;
        background: linear-gradient(
          160deg,
          #3d6fe0 0%,
          #2450b8 55%,
          #17398c 100%
        );
        box-shadow:
          inset 0 2px 0 rgba(255, 255, 255, 0.35),
          inset 0 -6px 12px rgba(0, 0, 0, 0.35),
          0 8px 14px rgba(0, 0, 0, 0.45);
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 2px;
        overflow: hidden;
      }
      .col {
        min-width: 44px;
        padding: 2px;
        border: none;
        border-radius: 12px;
        background: transparent;
        display: flex;
        flex-direction: column;
        gap: 6px;
        cursor: pointer;
      }
      .col:hover:not([disabled]) {
        background: rgba(255, 255, 255, 0.08);
      }
      .col[disabled] {
        cursor: default;
      }
      .cell {
        display: block;
        aspect-ratio: 1;
        border-radius: 50%;
        background: radial-gradient(circle at 50% 40%, #0a0c12 0%, #11141c 70%);
        box-shadow:
          inset 0 3px 5px rgba(0, 0, 0, 0.8),
          0 1px 0 rgba(255, 255, 255, 0.25);
      }
      .cell.r {
        background: radial-gradient(
          circle at 34% 28%,
          #ff9a8c 0%,
          #e5392b 45%,
          #a41e14 100%
        );
        box-shadow:
          inset 0 0 0 3px rgba(120, 16, 10, 0.55),
          inset 0 -4px 6px rgba(0, 0, 0, 0.3),
          0 1px 0 rgba(255, 255, 255, 0.25);
      }
      .cell.y {
        background: radial-gradient(
          circle at 34% 28%,
          #fff3a8 0%,
          #f6c82a 45%,
          #b98a08 100%
        );
        box-shadow:
          inset 0 0 0 3px rgba(140, 100, 0, 0.5),
          inset 0 -4px 6px rgba(0, 0, 0, 0.25),
          0 1px 0 rgba(255, 255, 255, 0.25);
      }
      .cell.win {
        outline: 3px solid #fff;
        outline-offset: -1px;
      }
      .cell.drop {
        animation: drop calc(160ms + var(--fall, 1) * 55ms)
          cubic-bezier(0.5, 0, 1, 1) both;
      }
      @keyframes drop {
        0% {
          transform: translateY(calc(var(--fall, 1) * -110%));
        }
        70% {
          transform: translateY(0);
        }
        84% {
          transform: translateY(-14%);
        }
        100% {
          transform: translateY(0);
        }
      }
      .feet {
        display: flex;
        justify-content: space-between;
        margin: 0 6px;
      }
      .feet span {
        width: 34px;
        height: 10px;
        border-radius: 0 0 8px 8px;
        background: linear-gradient(#17398c, #0f2861);
      }
      .still .cell.drop {
        animation: none;
      }
      @media (prefers-reduced-motion: reduce) {
        .cell.drop {
          animation: none;
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-game-four": HaGameFour;
  }
}
