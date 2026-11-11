import type { AutomationRepository } from "../../../data/automation_repos";

/** How the working copy relates to the live configuration. */
export type RepoMatch = "matches" | "diverged" | "unknown";

/** What is known about the Git remote of one automation. */
export type RepoRemoteKind = "none" | "host" | "local" | "unsafe";

export interface RepoStripState {
  /** Short id of the current commit, when there is one. */
  headShort?: string;
  /** Number of saved versions. */
  versions: number;
  match: RepoMatch;
  remoteKind: RepoRemoteKind;
  /** Host of the remote and never anything else of its address. */
  remoteHost?: string;
  /** Commits not yet sent to the remote, only when the server reports them. */
  unpushed?: number;
}

const SHORT_LENGTH = 7;

/**
 * The host of a Git remote address, or undefined when it has none (a folder on
 * this system) or cannot be read. A user name, password, port or path in the
 * address is never returned, so nothing sensitive can reach the screen.
 */
export const remoteHost = (remote: string | null | undefined) => {
  const value = typeof remote === "string" ? remote.trim() : "";
  if (!value || value.startsWith("/")) {
    return undefined;
  }
  const scheme = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(value);
  if (scheme) {
    // The authority ends at the first / ? or #. User info ends at the LAST @,
    // so an unescaped @ inside a password never reaches the screen.
    const authority = scheme[1];
    const hostPort = authority.slice(authority.lastIndexOf("@") + 1);
    const host = /^(\[[^\]]+\]|[^:]+)/.exec(hostPort);
    return host ? host[1] : undefined;
  }
  const scp = /^[^@/:\s]+@([^:/\s]+):/.exec(value);
  return scp ? scp[1] : undefined;
};

/**
 * The number of commits waiting to be sent, read only when the instance
 * reports it as a whole number. It never guesses.
 */
export const readUnpushed = (repo: unknown): number | undefined => {
  const value = (repo as { unpushed?: unknown } | undefined)?.unpushed;
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
};

/** Turns the repository status of one automation into what the strip shows. */
export const describeRepoStrip = (
  repo: AutomationRepository
): RepoStripState => {
  const head =
    typeof repo.head === "string" && repo.head ? repo.head : undefined;
  let match: RepoMatch = "unknown";
  if (head && typeof repo.dirty === "boolean") {
    match = repo.dirty ? "diverged" : "matches";
  }
  let remoteKind: RepoRemoteKind = "none";
  let host: string | undefined;
  if (repo.remote_unsafe) {
    remoteKind = "unsafe";
  } else if (typeof repo.remote === "string" && repo.remote.trim()) {
    host = remoteHost(repo.remote);
    remoteKind = host ? "host" : "local";
  }
  const unpushed =
    remoteKind === "host" || remoteKind === "local"
      ? readUnpushed(repo)
      : undefined;
  return {
    headShort: head?.slice(0, SHORT_LENGTH),
    versions:
      typeof repo.commits === "number" && repo.commits > 0 ? repo.commits : 0,
    match,
    remoteKind,
    remoteHost: host,
    unpushed,
  };
};
