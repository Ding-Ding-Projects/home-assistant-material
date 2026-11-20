import { searchMatcher } from "../../../common/regex/filter";
import { isRegexQuery } from "../../../common/regex/query";
import type {
  ProblemSendRepository,
  ProblemSendState,
  ProblemSendStatus,
} from "../../../data/problem_log_send";

/** The chips above the list of problems. */
export type ProblemChip = "all" | "not_sent" | "held";

/** A problem whose send status is not known yet counts as not sent. */
export const statusOf = (
  file: string,
  statuses: Record<string, ProblemSendStatus> | undefined
): ProblemSendStatus => statuses?.[file] ?? "not_sent";

export const chipCounts = (
  files: readonly string[],
  statuses: Record<string, ProblemSendStatus> | undefined
): Record<ProblemChip, number> => {
  const result: Record<ProblemChip, number> = {
    all: files.length,
    not_sent: 0,
    held: 0,
  };
  for (const file of files) {
    const status = statusOf(file, statuses);
    if (status === "not_sent") {
      result.not_sent += 1;
    } else if (status === "held") {
      result.held += 1;
    }
  }
  return result;
};

export const matchesChip = (
  file: string,
  statuses: Record<string, ProblemSendStatus> | undefined,
  chip: ProblemChip
): boolean => chip === "all" || statusOf(file, statuses) === chip;

/** Why the send button is or is not usable right now. */
export type SendReadiness =
  | { kind: "ready"; count: number }
  | { kind: "off" }
  | { kind: "nothing_new" }
  | { kind: "wait"; count: number; at: Date };

/**
 * Whether one more send may start at `now`. The backend enforces the same
 * rule; this only decides how the button reads, so that it is disabled and
 * shows the next allowed time instead of failing when pressed.
 */
export const sendReadiness = (
  state: Pick<ProblemSendState, "enabled" | "next_allowed" | "counts">,
  now: Date
): SendReadiness => {
  if (!state.enabled) {
    return { kind: "off" };
  }
  const count = state.counts.not_sent;
  if (count === 0) {
    return { kind: "nothing_new" };
  }
  if (state.next_allowed) {
    const at = new Date(state.next_allowed);
    if (!Number.isNaN(at.getTime()) && at.getTime() > now.getTime()) {
      return { kind: "wait", count, at };
    }
  }
  return { kind: "ready", count };
};

/** Whole minutes left before a sign-in code expires, never below zero. */
export const minutesLeft = (expiresAt: string | null, now: Date): number => {
  if (!expiresAt) {
    return 0;
  }
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (Number.isNaN(ms) || ms <= 0) {
    return 0;
  }
  return Math.ceil(ms / 60000);
};

/**
 * The short label of the device page for the link text
 * ("github.com/login/device"), from the address the host gave.
 */
export const shortAddress = (url: string): string =>
  url.replace(/^https?:\/\//, "").replace(/\/$/, "");

/** The name offered for a new repository. */
export const DEFAULT_REPOSITORY_NAME = "home-problem-log";

/** Whether GitHub accepts the text as a new repository's name. */
export const validRepositoryName = (name: string): boolean =>
  name.length > 0 &&
  name.length <= 100 &&
  /^[A-Za-z0-9._-]+$/.test(name) &&
  name !== "." &&
  name !== ".." &&
  !name.toLowerCase().endsWith(".git");

/**
 * Whether the text has the shape of a GitHub app's client ID. The backend
 * checks the same shape; a client ID is public, not a secret.
 */
export const validClientId = (text: string): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9._-]{9,39}$/.test(text);

/**
 * The text sent to the server's own search: plain text as typed, nothing
 * for a pattern, which is then matched here against the whole list.
 */
export const serverQuery = (raw: string): string =>
  isRegexQuery(raw) ? "" : raw.trim();

/**
 * The repositories to show for the search text, private ones first. The
 * server already filtered plain text; a pattern is matched here.
 */
export const shownRepositories = (
  repositories: readonly ProblemSendRepository[],
  raw: string
): ProblemSendRepository[] => {
  const matches = searchMatcher(raw);
  return repositories
    .filter((repo) => matches(repo.full_name))
    .sort((a, b) => Number(b.private) - Number(a.private));
};
