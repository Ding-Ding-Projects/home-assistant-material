import type { ProgressKind, StageId } from "./update-progress-model";
import { logProviderFor } from "./update-progress-model";

/**
 * Which log shows the live output of an update. Core, the Supervisor and the
 * operating system restart something that the log itself lives in, so before
 * the restart begins the Supervisor's own log is read (the image pull and the
 * lines of this update only), and from the restart on the log of the thing that
 * restarts, which cannot be read for a while.
 */

export interface LogSource {
  provider: string | undefined;
  /** Only the lines of this update are kept. */
  filtered: boolean;
}

const RESTART_BEGUN: StageId[] = ["restart", "check"];

export const restartHasBegun = (stage: StageId | undefined): boolean =>
  !!stage && RESTART_BEGUN.includes(stage);

export const logSourceFor = (
  kind: ProgressKind,
  stage: StageId | undefined,
  slug: string | undefined,
  hassioLoaded: boolean
): LogSource => {
  const system = kind === "core" || kind === "supervisor" || kind === "os";
  if (system && hassioLoaded && !restartHasBegun(stage)) {
    return { provider: "supervisor", filtered: true };
  }
  return {
    provider: logProviderFor(kind, slug, hassioLoaded),
    filtered: false,
  };
};

// The Supervisor writes "date time LEVEL (Thread) [logger] message".
const LINE = /^\S+ \S+ [A-Z]+ \([^)]*\) \[(supervisor\.[\w.]+)\] (.*)$/;

const LOGGERS = [
  "supervisor.homeassistant.core",
  "supervisor.docker.interface",
  "supervisor.docker.manager",
  "supervisor.docker.homeassistant",
  "supervisor.docker.supervisor",
  "supervisor.jobs",
  "supervisor.supervisor",
  "supervisor.os.manager",
  "supervisor.host.control",
];

const PHRASES =
  /pull|download|extract|updat|install|image|restart|start(?:ed|ing)|stop(?:ped|ping)|attach|version/i;

/**
 * Keeps the lines of the update: those from the loggers that carry the image
 * pull and the update itself, and any line that names the target version. A
 * line that does not have the Supervisor's format, such as the second line of a
 * traceback, stays with the line before it.
 */
export const filterUpdateLog = (
  text: string,
  toVersion: string | undefined
): string => {
  const kept: string[] = [];
  let keeping = false;
  for (const line of text.split("\n")) {
    const match = LINE.exec(line);
    if (match) {
      const [, logger, message] = match;
      keeping =
        (LOGGERS.includes(logger) && PHRASES.test(message)) ||
        (!!toVersion && message.includes(toVersion));
    }
    if (keeping) {
      kept.push(line);
    }
  }
  return kept.join("\n");
};
