import { describe, expect, it } from "vitest";
import type {
  Cell,
  FourBoard,
} from "../../../../../src/panels/config/core/updates/going-back/game-logic";
import {
  COLS,
  COOKIE_TARGET,
  MOLE_HOLES,
  MOLE_TARGET,
  MOLE_TIME_LIMIT_MS,
  cookieDone,
  dropDisc,
  emptyBoard,
  findWin,
  flipCoin,
  fourOutcome,
  landingRow,
  legalColumns,
  moleOutcome,
  newMoleGame,
  nextMoleHole,
  opponentMove,
  pressCookie,
  whackHole,
} from "../../../../../src/panels/config/core/updates/going-back/game-logic";

// The games are the only way past the backup before going back to an older
// build. A rule that silently lets a step finish early, or never lets it
// finish, would either weaken that guard or lock a person out of it.

/** A fixed sequence of random numbers, repeated. */
const sequence =
  (...values: number[]) =>
  () => {
    const value = values.shift() ?? 0;
    values.push(value);
    return value;
  };

const board = (rows: string[]): Cell[] =>
  rows
    .join("")
    .split("")
    .map((c) => (c === "R" ? 1 : c === "Y" ? 2 : 0));

describe("coin", () => {
  it("is decided by one random bit", () => {
    expect(flipCoin((bytes) => bytes.fill(1))).toBe("heads");
    expect(flipCoin((bytes) => bytes.fill(254))).toBe("tails");
  });

  it("uses the cryptographic source by default and gives both sides", () => {
    const seen = new Set(Array.from({ length: 64 }, () => flipCoin()));
    expect(seen).toEqual(new Set(["heads", "tails"]));
  });
});

describe("cookie", () => {
  it("adds exactly one per press and stops at 100", () => {
    let count = 0;
    for (let i = 0; i < 99; i++) {
      count = pressCookie(count);
    }
    expect(count).toBe(99);
    expect(cookieDone(count)).toBe(false);
    count = pressCookie(count);
    expect(cookieDone(count)).toBe(true);
    expect(pressCookie(count)).toBe(COOKIE_TARGET);
  });
});

describe("whack-a-mole", () => {
  it("never puts the next mole in the hole it just left", () => {
    for (let previous = 0; previous < MOLE_HOLES; previous++) {
      for (const value of [0, 0.2, 0.5, 0.8, 0.999]) {
        const hole = nextMoleHole(() => value, previous);
        expect(hole).not.toBe(previous);
        expect(hole).toBeGreaterThanOrEqual(0);
        expect(hole).toBeLessThan(MOLE_HOLES);
      }
    }
  });

  it("counts only a hit on the hole with the mole", () => {
    const game = { ...newMoleGame(true), startedAt: 0, up: 2 };
    expect(whackHole(game, 1, 100).hit).toBe(false);
    const result = whackHole(game, 2, 100);
    expect(result.hit).toBe(true);
    expect(result.game.hits).toBe(1);
    expect(result.game.up).toBeNull();
  });

  it("is won with 10 hits inside 30 seconds and lost after", () => {
    const won = { ...newMoleGame(true), startedAt: 0, hits: MOLE_TARGET };
    expect(moleOutcome(won, 10_000)).toBe("won");
    const late = { ...newMoleGame(true), startedAt: 0, hits: 9, up: 1 };
    expect(moleOutcome(late, MOLE_TIME_LIMIT_MS + 1)).toBe("lost");
    expect(whackHole(late, 1, MOLE_TIME_LIMIT_MS + 1).hit).toBe(false);
  });

  it("has no time limit in the untimed game, but still needs 10 hits", () => {
    const untimed = { ...newMoleGame(false), startedAt: 0, hits: 9, up: 4 };
    expect(moleOutcome(untimed, 10 * MOLE_TIME_LIMIT_MS)).toBe("playing");
    const result = whackHole(untimed, 4, 10 * MOLE_TIME_LIMIT_MS);
    expect(moleOutcome(result.game, 10 * MOLE_TIME_LIMIT_MS)).toBe("won");
  });

  it("does not count presses before the game starts", () => {
    expect(whackHole({ ...newMoleGame(true), up: 0 }, 0, 0).hit).toBe(false);
  });
});

describe("four in a row", () => {
  it("drops a disc to the lowest free row and refuses a full column", () => {
    let current: FourBoard = emptyBoard();
    for (let i = 0; i < 6; i++) {
      const result = dropDisc(current, 0, 1)!;
      expect(result.row).toBe(5 - i);
      current = result.board;
    }
    expect(landingRow(current, 0)).toBe(-1);
    expect(dropDisc(current, 0, 2)).toBeUndefined();
    expect(legalColumns(current)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it.each([
    [
      "row",
      [".......", ".......", ".......", ".......", ".......", "RRRR..."],
      [35, 36, 37, 38],
    ],
    [
      "column",
      [".......", ".......", "Y......", "Y......", "Y......", "Y......"],
      [14, 21, 28, 35],
    ],
    [
      "diagonal",
      [".......", ".......", "...R...", "..RY...", ".RYY...", "RYYR..."],
      [17, 23, 29, 35],
    ],
    [
      "other diagonal",
      [".......", ".......", "Y......", "RY.....", "RRY....", "RRRY..."],
      [14, 22, 30, 38],
    ],
  ])("finds four in a %s", (_name, rows, cells) => {
    expect(new Set(findWin(board(rows))?.cells)).toEqual(new Set(cells));
  });

  it("reads the outcome from the person's side", () => {
    expect(
      fourOutcome(
        board([
          ".......",
          ".......",
          ".......",
          ".......",
          ".......",
          "RRRR...",
        ])
      )
    ).toBe("won");
    expect(
      fourOutcome(
        board([
          ".......",
          ".......",
          ".......",
          ".......",
          ".......",
          "YYYY...",
        ])
      )
    ).toBe("lost");
    const full = board([
      "RRYYRRY",
      "YYRRYYR",
      "RRYYRRY",
      "YYRRYYR",
      "RRYYRRY",
      "YYRRYYR",
    ]);
    expect(fourOutcome(full)).toBe("draw");
  });

  it("takes its own winning move", () => {
    const rows = [
      ".......",
      ".......",
      ".......",
      "Y......",
      "Y......",
      "YRR.R..",
    ];
    expect(opponentMove(board(rows), sequence(0.99), { slip: 0 })).toBe(0);
  });

  it("blocks the person's winning move, even when it slips", () => {
    const rows = [
      ".......",
      ".......",
      ".......",
      ".......",
      "Y......",
      "RRR.YY.",
    ];
    expect(opponentMove(board(rows), sequence(0), { slip: 1 })).toBe(3);
  });

  it("never plays a full column", () => {
    const rows = [
      "R......",
      "Y......",
      "R......",
      "Y......",
      "R......",
      "Y......",
    ];
    for (const value of [0, 0.3, 0.6, 0.99]) {
      const move = opponentMove(board(rows), sequence(value), { slip: 1 });
      expect(move).not.toBe(0);
      expect(move).toBeGreaterThanOrEqual(0);
      expect(move).toBeLessThan(COLS);
    }
  });

  it("can be beaten: a person who plays well wins against a slipping home", () => {
    // The person always takes a win, blocks a loss, else plays the middle-most
    // column; with the home slipping on every move the person must win.
    let current: FourBoard = emptyBoard();
    const random = sequence(0.1, 0.7, 0.4, 0.9, 0.2);
    for (
      let turn = 0;
      turn < 21 && fourOutcome(current) === "playing";
      turn++
    ) {
      const mine = legalColumns(current);
      const pick =
        mine.find((col) => findWin(dropDisc(current, col, 1)!.board)) ??
        mine.find((col) => findWin(dropDisc(current, col, 2)!.board)) ??
        [...mine].sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3))[0];
      current = dropDisc(current, pick, 1)!.board;
      if (fourOutcome(current) !== "playing") {
        break;
      }
      current = dropDisc(
        current,
        opponentMove(current, random, { slip: 1 }),
        2
      )!.board;
    }
    expect(fourOutcome(current)).toBe("won");
  });
});
