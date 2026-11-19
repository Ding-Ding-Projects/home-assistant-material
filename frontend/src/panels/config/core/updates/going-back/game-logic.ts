/**
 * The rules of the games in the super confirmation, as plain functions so
 * they can be tested without a page. Nothing here touches the page, a timer
 * or the network.
 */

/** A number from 0 (inclusive) to 1 (exclusive). */
export type RandomFn = () => number;

/** Fills an array with random bytes; the browser's crypto by default. */
export type ByteSource = (bytes: Uint8Array<ArrayBuffer>) => void;

const cryptoBytes: ByteSource = (bytes) => {
  crypto.getRandomValues(bytes);
};

/** A uniform random number from the browser's cryptographic source. */
export const cryptoRandom: RandomFn = () => {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] / 2 ** 32;
};

/** A whole number from 0 to `count - 1`. */
export const randomIndex = (random: RandomFn, count: number): number =>
  Math.min(count - 1, Math.floor(random() * count));

// Coin

export type CoinSide = "heads" | "tails";

/** A fair coin: one random bit from the cryptographic source. */
export const flipCoin = (source: ByteSource = cryptoBytes): CoinSide => {
  const bytes = new Uint8Array(1);
  source(bytes);
  return bytes[0] % 2 === 1 ? "heads" : "tails";
};

// Cookie

export const COOKIE_TARGET = 100;

/** One press adds exactly one cookie, up to the target. */
export const pressCookie = (count: number): number =>
  Math.min(COOKIE_TARGET, Math.max(0, Math.floor(count)) + 1);

export const cookieDone = (count: number): boolean => count >= COOKIE_TARGET;

// Whack-a-mole

export const MOLE_HOLES = 6;
export const MOLE_TARGET = 10;
export const MOLE_TIME_LIMIT_MS = 30_000;

export interface MoleGame {
  hits: number;
  /** Which hole has a mole up, or null. */
  up: number | null;
  /** When the game started, or null before the first mole. */
  startedAt: number | null;
  /** With the time limit; without it the mole waits to be hit. */
  timed: boolean;
}

export const newMoleGame = (timed: boolean): MoleGame => ({
  hits: 0,
  up: null,
  startedAt: null,
  timed,
});

/** The next hole for a mole: never the hole it just left. */
export const nextMoleHole = (
  random: RandomFn,
  previous: number | null
): number => {
  if (previous === null) {
    return randomIndex(random, MOLE_HOLES);
  }
  const pick = randomIndex(random, MOLE_HOLES - 1);
  return pick >= previous ? pick + 1 : pick;
};

/** How long a mole stays up in the timed game; it gets quicker with each hit. */
export const moleUpMs = (hits: number): number =>
  Math.max(700, 1300 - hits * 60);

export type MoleOutcome = "ready" | "playing" | "won" | "lost";

export const moleOutcome = (game: MoleGame, now: number): MoleOutcome => {
  if (game.hits >= MOLE_TARGET) {
    return "won";
  }
  if (game.startedAt === null) {
    return "ready";
  }
  if (game.timed && now - game.startedAt > MOLE_TIME_LIMIT_MS) {
    return "lost";
  }
  return "playing";
};

/** The time left in the timed game, in milliseconds. */
export const moleTimeLeft = (game: MoleGame, now: number): number =>
  game.startedAt === null
    ? MOLE_TIME_LIMIT_MS
    : Math.max(0, MOLE_TIME_LIMIT_MS - (now - game.startedAt));

/**
 * A press on a hole. Only the hole with a mole counts, and only while the
 * game is being played. A hit sends the mole down.
 */
export const whackHole = (
  game: MoleGame,
  hole: number,
  now: number
): { game: MoleGame; hit: boolean } => {
  if (moleOutcome(game, now) !== "playing" || game.up !== hole) {
    return { game, hit: false };
  }
  return { game: { ...game, hits: game.hits + 1, up: null }, hit: true };
};

// Four in a row

export const ROWS = 6;
export const COLS = 7;

/** 0 is empty, 1 is the person (red), 2 is the home (yellow). */
export type Cell = 0 | 1 | 2;
export type Player = 1 | 2;
export type FourBoard = readonly Cell[];

export const emptyBoard = (): Cell[] => new Array<Cell>(ROWS * COLS).fill(0);

const at = (row: number, col: number): number => row * COLS + col;

/** The row a disc dropped in `col` lands in (row 0 is the top), or -1. */
export const landingRow = (board: FourBoard, col: number): number => {
  if (col < 0 || col >= COLS) {
    return -1;
  }
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[at(row, col)] === 0) {
      return row;
    }
  }
  return -1;
};

export const legalColumns = (board: FourBoard): number[] => {
  const columns: number[] = [];
  for (let col = 0; col < COLS; col++) {
    if (board[at(0, col)] === 0) {
      columns.push(col);
    }
  }
  return columns;
};

/** Drops a disc; returns the new board and its row, or undefined when full. */
export const dropDisc = (
  board: FourBoard,
  col: number,
  player: Player
): { board: Cell[]; row: number } | undefined => {
  const row = landingRow(board, col);
  if (row < 0) {
    return undefined;
  }
  const next = [...board];
  next[at(row, col)] = player;
  return { board: next, row };
};

const DIRECTIONS: [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/** Four in a line: the player and the cell indexes, or undefined. */
export const findWin = (
  board: FourBoard
): { player: Player; cells: number[] } | undefined => {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const player = board[at(row, col)];
      if (player === 0) {
        continue;
      }
      for (const [dRow, dCol] of DIRECTIONS) {
        const cells = [at(row, col)];
        for (let step = 1; step < 4; step++) {
          const r = row + dRow * step;
          const c = col + dCol * step;
          if (
            r < 0 ||
            r >= ROWS ||
            c < 0 ||
            c >= COLS ||
            board[at(r, c)] !== player
          ) {
            break;
          }
          cells.push(at(r, c));
        }
        if (cells.length === 4) {
          return { player, cells };
        }
      }
    }
  }
  return undefined;
};

export const boardFull = (board: FourBoard): boolean =>
  legalColumns(board).length === 0;

export type FourOutcome = "playing" | "won" | "lost" | "draw";

/** The game from the person's side. */
export const fourOutcome = (board: FourBoard): FourOutcome => {
  const win = findWin(board);
  if (win) {
    return win.player === 1 ? "won" : "lost";
  }
  return boardFull(board) ? "draw" : "playing";
};

const other = (player: Player): Player => (player === 1 ? 2 : 1);

// Scores one line of four cells for `player`.
const windowScore = (cells: Cell[], player: Player): number => {
  const mine = cells.filter((cell) => cell === player).length;
  const theirs = cells.filter((cell) => cell === other(player)).length;
  if (mine && theirs) {
    return 0;
  }
  if (mine === 3) {
    return 5;
  }
  if (mine === 2) {
    return 2;
  }
  if (theirs === 3) {
    return -4;
  }
  return 0;
};

/** How good the board looks for `player`, without searching. */
export const scoreBoard = (board: FourBoard, player: Player): number => {
  let score = 0;
  // The middle column holds the most lines.
  for (let row = 0; row < ROWS; row++) {
    if (board[at(row, 3)] === player) {
      score += 3;
    }
  }
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      for (const [dRow, dCol] of DIRECTIONS) {
        const endRow = row + dRow * 3;
        const endCol = col + dCol * 3;
        if (endRow < 0 || endRow >= ROWS || endCol < 0 || endCol >= COLS) {
          continue;
        }
        const cells: Cell[] = [];
        for (let step = 0; step < 4; step++) {
          cells.push(board[at(row + dRow * step, col + dCol * step)]);
        }
        score += windowScore(cells, player);
      }
    }
  }
  return score;
};

const WIN_SCORE = 100_000;

const negamax = (
  board: FourBoard,
  depth: number,
  player: Player,
  alpha: number,
  beta: number
): number => {
  const win = findWin(board);
  if (win) {
    // The player before has just won; sooner wins weigh more.
    return -(WIN_SCORE + depth);
  }
  const columns = legalColumns(board);
  if (!columns.length) {
    return 0;
  }
  if (depth === 0) {
    return scoreBoard(board, player) - scoreBoard(board, other(player));
  }
  let best = -Infinity;
  let low = alpha;
  for (const col of orderColumns(columns)) {
    const next = dropDisc(board, col, player)!;
    const value = -negamax(next.board, depth - 1, other(player), -beta, -low);
    best = Math.max(best, value);
    low = Math.max(low, value);
    if (low >= beta) {
      break;
    }
  }
  return best;
};

// Middle columns first, so the search cuts sooner.
const orderColumns = (columns: number[]): number[] =>
  [...columns].sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3));

export interface OpponentOptions {
  /** How many moves ahead the home looks. */
  depth?: number;
  /**
   * How often the home plays a merely safe move instead of its best one, so
   * it can be beaten. It never misses a win of its own or a block.
   */
  slip?: number;
}

/**
 * The home's move: it takes a winning move, blocks an immediate win of the
 * person, and otherwise searches a few moves ahead with some randomness, so
 * it is beatable but not trivial.
 */
export const opponentMove = (
  board: FourBoard,
  random: RandomFn,
  { depth = 4, slip = 0.2 }: OpponentOptions = {}
): number => {
  const columns = legalColumns(board);
  if (!columns.length) {
    return -1;
  }
  for (const col of columns) {
    if (findWin(dropDisc(board, col, 2)!.board)) {
      return col;
    }
  }
  for (const col of columns) {
    if (findWin(dropDisc(board, col, 1)!.board)) {
      return col;
    }
  }
  // Moves that do not hand the person a win straight away.
  const safe = columns.filter((col) => {
    const after = dropDisc(board, col, 2)!.board;
    return !legalColumns(after).some((reply) =>
      findWin(dropDisc(after, reply, 1)!.board)
    );
  });
  const choices = safe.length ? safe : columns;
  if (random() < slip) {
    return choices[randomIndex(random, choices.length)];
  }
  let bestValue = -Infinity;
  let best: number[] = [];
  for (const col of choices) {
    const next = dropDisc(board, col, 2)!;
    // A little noise breaks ties differently each game.
    const value =
      -negamax(next.board, depth - 1, 1, -Infinity, Infinity) + random() * 0.5;
    if (value > bestValue + 1e-9) {
      bestValue = value;
      best = [col];
    } else if (Math.abs(value - bestValue) <= 1e-9) {
      best.push(col);
    }
  }
  return best[randomIndex(random, best.length)];
};
