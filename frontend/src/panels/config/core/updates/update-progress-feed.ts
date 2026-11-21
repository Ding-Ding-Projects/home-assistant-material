import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { ReactiveController, ReactiveControllerHost } from "lit";
import { redactDetails } from "../../../../common/activity/redact-details";
import { isComponentLoaded } from "../../../../common/config/is_component_loaded";
import type { SupervisorJobData } from "../../../../common/app-jobs/app-job-logic";
import { updateInstallTracker } from "../../../../components/update-progress/update-install-tracker";
import { fetchErrorLog } from "../../../../data/error_log";
import { fetchHassioLogs } from "../../../../data/hassio/supervisor";
import type { UpdateEntity } from "../../../../data/update";
import { updateIsInstalling } from "../../../../data/update";
import { filterUpdateLog, logSourceFor } from "./update-log-source";
import type { JobNode } from "./update-job-tree";
import { flattenJobTree, updateJobFacts } from "./update-job-tree";
import { resolveStart, startFoundLater } from "./update-start-time";
import type { HomeAssistant } from "../../../../types";
import type {
  PercentSamples,
  ProgressKind,
  ProgressRecord,
  StageId,
  StageRow,
  StageSignals,
  TrackerStage,
} from "./update-progress-model";
import {
  addPercentSample,
  appSlugOf,
  cleanPercent,
  currentStage,
  deriveStages,
  estimateRemainingMs,
  loadRecords,
  prepareLogLines,
  progressKindOf,
  RECORD_KEEP_MS,
  storeRecords,
  versionArrival,
} from "./update-progress-model";
import {
  loadStoredQueue,
  STEP_SETTLE_MS,
  SYSTEM_STEP_SETTLE_MS,
} from "./update-queue";

/** How often the log of a running update is read. */
export const LOG_POLL_MS = 3000;

/** How many of the newest lines are asked for. */
const LOG_TAIL = 60;

export type OutputState = "none" | "waiting" | "live" | "unavailable";

export interface OutputView {
  lines: string[];
  state: OutputState;
}

/** Everything one row needs to show its progress block. */
export interface ProgressView {
  record: ProgressRecord;
  kind: ProgressKind;
  running: boolean;
  percent?: number;
  /** The Supervisor's stage word for the image pull, if one was reported. */
  jobStage?: string | null;
  stages: StageRow[];
  estimateMs?: number;
  output: OutputView;
  /** Whether the Supervisor jobs could be read at all. */
  jobsAvailable: boolean;
}

/** The percentage the job or the entity really reported; a job that said nothing yet shows none. */
const reportedPercent = (
  root: JobNode | undefined,
  entity: UpdateEntity
): number | undefined => {
  if (root && ((root.progress ?? 0) > 0 || !!root.stage)) {
    return cleanPercent(root.progress);
  }
  return cleanPercent(entity.attributes.update_percentage);
};

const hasErrors = (job: SupervisorJobData): string | undefined => {
  const message = (job.errors ?? [])
    .map((error) => error.message?.trim())
    .find((text): text is string => !!text);
  return message;
};

/**
 * Follows every update that installs on the updates page, and keeps what the
 * row needs: a record that survives the reload that follows a Core restart,
 * the Supervisor job of the update, and the newest lines of its log. It starts
 * nothing: it only reads.
 */
export class UpdateProgressFeed implements ReactiveController {
  private _host: ReactiveControllerHost;

  private _getHass: () => HomeAssistant;

  private _records = new Map<string, ProgressRecord>();

  private _jobs = new Map<string, JobNode>();

  private _logs = new Map<
    string,
    { lines: string[]; state: OutputState; busy: boolean }
  >();

  private _idleSince = new Map<string, number>();

  private _unsub?: UnsubscribeFunc;

  private _timer?: ReturnType<typeof setInterval>;

  public jobsAvailable = false;

  constructor(host: ReactiveControllerHost, getHass: () => HomeAssistant) {
    this._host = host;
    this._getHass = getHass;
    host.addController(this);
  }

  hostConnected() {
    for (const record of loadRecords()) {
      this._records.set(record.entityId, record);
    }
    void this._subscribeJobs();
    this._timer = setInterval(() => this._pollLogs(), LOG_POLL_MS);
  }

  hostDisconnected() {
    this._unsub?.();
    this._unsub = undefined;
    clearInterval(this._timer);
    this._timer = undefined;
  }

  // ---- jobs ----

  private _subscribing = false;

  private async _subscribeJobs(): Promise<void> {
    const hass = this._getHass();
    if (
      this._unsub ||
      this._subscribing ||
      !hass?.user?.is_admin ||
      !isComponentLoaded(hass.config, "hassio")
    ) {
      return;
    }
    this._subscribing = true;
    try {
      this._unsub = await hass.connection.subscribeMessage<{
        event?: string;
        data?: SupervisorJobData;
      }>(
        (message) => {
          if (message?.event === "job" && message.data) {
            this._jobs.set(message.data.uuid, message.data);
            this._host.requestUpdate();
          }
        },
        { type: "supervisor/subscribe" }
      );
      this.jobsAvailable = true;
      await this._readJobs();
    } catch (_err) {
      // Not an administrator or no Supervisor: the entity's own report is used.
      this.jobsAvailable = false;
    } finally {
      this._subscribing = false;
    }
  }

  private async _readJobs(): Promise<void> {
    const hass = this._getHass();
    try {
      const info = await hass.connection.sendMessagePromise<{
        jobs?: JobNode[];
      }>({ type: "supervisor/api", endpoint: "/jobs/info", method: "get" });
      // The tree comes nested and without parent ids; the events carry the ids.
      flattenJobTree(info?.jobs ?? [], this._jobs);
      this._host.requestUpdate();
    } catch (_err) {
      // Events still carry the jobs that change from now on.
    }
  }

  private _turnedOn = new Map<string, number>();

  private _seenIdle = new Set<string>();

  // When the Supervisor began the job of an update that is running.
  private _runningJobCreated(entity: UpdateEntity): string | undefined {
    const facts = this._jobFor(
      progressKindOf(
        entity,
        this._getHass().entities?.[entity.entity_id]?.platform
      ),
      appSlugOf(entity)
    );
    return facts.root && !facts.root.done ? facts.created : undefined;
  }

  /** The job of this update, the newest running job below it and what they say. */
  private _jobFor(kind: ProgressKind, slug: string | undefined) {
    return updateJobFacts(this._jobs, kind, slug);
  }

  // ---- logs ----

  private _pollLogs(): void {
    let jobsWanted = false;
    for (const record of this._records.values()) {
      if (!record.result) {
        void this._readLog(record);
        jobsWanted ||= record.startUnknown === true || record.backup === null;
      }
    }
    // A page opened in the middle of an update may have missed its jobs: read
    // them again until the start and the backup are known.
    if (jobsWanted) {
      void this._subscribeJobs();
      if (this.jobsAvailable) {
        void this._readJobs();
      }
    }
  }

  private async _readLog(
    record: ProgressRecord
  ): Promise<string[] | undefined> {
    const hass = this._getHass();
    const entity = hass.states[record.entityId] as UpdateEntity | undefined;
    const hassio = isComponentLoaded(hass.config, "hassio");
    const slug = entity ? appSlugOf(entity) : undefined;
    const source = logSourceFor(record.kind, record.lastStage, slug, hassio);
    const provider = source.provider;
    const slot = this._logs.get(record.entityId) ?? {
      lines: [],
      state: "waiting" as OutputState,
      busy: false,
    };
    this._logs.set(record.entityId, slot);
    if (slot.busy) {
      return slot.lines;
    }
    if (!provider && !(record.kind === "core" || record.kind === "entity")) {
      slot.state = "none";
      return undefined;
    }
    slot.busy = true;
    try {
      let text: string;
      if (provider) {
        const response = await fetchHassioLogs(
          hass,
          provider,
          `entries=:-${LOG_TAIL}:`
        );
        if (!response.ok) {
          throw new Error("log not available");
        }
        text = await response.text();
        if (source.filtered) {
          text = filterUpdateLog(text, record.toVersion ?? undefined);
        }
      } else {
        text = (await fetchErrorLog(hass))
          .split("\n")
          .slice(-LOG_TAIL)
          .join("\n");
      }
      slot.lines = prepareLogLines(text);
      slot.state = "live";
    } catch (_err) {
      // A restart takes the log away for a while; the lines already read stay.
      slot.state = "unavailable";
    } finally {
      slot.busy = false;
      this._host.requestUpdate();
    }
    return slot.lines;
  }

  // ---- records ----

  private _save(): void {
    storeRecords([...this._records.values()]);
  }

  /**
   * Looks at every update entity and keeps the records in step with it. Called
   * when the page gets new data. `askedBackup` is what a queue run was started
   * with, when the update belongs to one.
   */
  public sync(entities: UpdateEntity[], now = Date.now()): void {
    const hass = this._getHass();
    let changed = false;
    for (const entity of entities) {
      const id = entity.entity_id;
      const installing = updateIsInstalling(entity);
      // Only a change seen by this page counts; an update that was already
      // running when the page opened has no known start from here.
      if (!installing) {
        this._turnedOn.delete(id);
        this._seenIdle.add(id);
      } else if (this._seenIdle.has(id)) {
        this._turnedOn.set(id, now);
        this._seenIdle.delete(id);
      }
      let record = this._records.get(id);
      const run = updateInstallTracker.get(id);
      if (installing && (!record || record.result)) {
        // The real start: an install this page started itself (a run the
        // page only adopted after a reload carries the time it was noticed,
        // not the time it began), or else the queue step that was started
        // before a reload. Without either, the start is not known.
        const { startedAt } = resolveStart(
          {
            runStartedAt: run?.canRetry ? run.startedAt : undefined,
            jobCreated: this._runningJobCreated(entity),
            queueStartedAt: loadStoredQueue()?.steps.find(
              (step) => step.entityId === id && step.state === "updating"
            )?.startedAt,
            seenTurnedOnAt: this._turnedOn.get(id),
          },
          now
        );
        record = {
          entityId: id,
          kind: progressKindOf(entity, hass.entities?.[id]?.platform),
          title: entity.attributes.title || id,
          fromVersion: entity.attributes.installed_version,
          toVersion: entity.attributes.latest_version,
          startedAt: startedAt ?? now,
          startUnknown: startedAt === undefined ? true : undefined,
          // An install this page did not start has no known backup choice.
          backup: run?.canRetry ? run.backupRequested : null,
        };
        this._records.set(id, record);
        this._logs.delete(id);
        this._idleSince.delete(id);
        changed = true;
      }
      if (!record || record.result) {
        continue;
      }
      const before = JSON.stringify(record);
      if (record.startUnknown && installing) {
        // The jobs may only have been read after this record was made.
        const found = startFoundLater(
          record,
          {
            runStartedAt: run?.canRetry ? run.startedAt : undefined,
            jobCreated: this._runningJobCreated(entity),
            queueStartedAt: loadStoredQueue()?.steps.find(
              (step) => step.entityId === id && step.state === "updating"
            )?.startedAt,
          },
          now
        );
        if (found !== undefined) {
          record.startedAt = found;
          delete record.startUnknown;
        }
      }
      const { root, leaf, backupRunning, backupSeen } = this._jobFor(
        record.kind,
        appSlugOf(entity)
      );
      if (record.backup === null && (backupRunning || backupSeen)) {
        // A backup job below the update job: one was made for this update.
        record.backup = true;
      }
      const percent = reportedPercent(root, entity);
      const samples: PercentSamples | undefined = addPercentSample(
        record.samples,
        installing || root ? percent : undefined,
        now
      );
      record.samples = samples;
      const stage = currentStage(
        this._signals(
          record,
          run?.stage,
          leaf,
          backupRunning,
          percent !== undefined
        )
      );
      if (stage) {
        record.lastStage = stage;
      }
      if (installing) {
        this._idleSince.delete(id);
      } else {
        this._conclude(record, entity, root, run, now);
      }
      if (JSON.stringify(record) !== before) {
        changed = true;
      }
    }
    if (changed) {
      this._save();
      this._host.requestUpdate();
    }
  }

  private _signals(
    record: ProgressRecord,
    tracker: TrackerStage | undefined,
    leaf: JobNode | undefined,
    backupRunning: boolean,
    hasPercent: boolean
  ): StageSignals {
    return {
      kind: record.kind,
      backupRequested: record.backup ?? undefined,
      tracker:
        backupRunning && record.backup !== false ? "backing_up" : tracker,
      jobStage: leaf?.stage,
      hasPercent,
    };
  }

  // An update that stopped installing has either arrived, failed or is in the
  // restart gap. Only a clear signal ends the record.
  private _conclude(
    record: ProgressRecord,
    entity: UpdateEntity,
    root: JobNode | undefined,
    run: ReturnType<typeof updateInstallTracker.get>,
    now: number
  ): void {
    const arrival = versionArrival(record, {
      state: entity.state,
      installedVersion: entity.attributes.installed_version,
    });
    const reached = arrival.arrived;
    const jobError = root?.done ? hasErrors(root) : undefined;
    let result: "done" | "failed" | undefined;
    let error: string | undefined;
    if (run?.stage === "failed") {
      result = "failed";
      error = run.error;
    } else if (jobError) {
      result = "failed";
      error = jobError;
    } else if (run?.stage === "done" || reached) {
      result = "done";
    } else if (
      entity.state === "unavailable" ||
      entity.state === "unknown" ||
      this._getHass().connected === false
    ) {
      // Restarting: nothing is concluded.
      this._idleSince.delete(record.entityId);
      return;
    } else {
      const since = this._idleSince.get(record.entityId) ?? now;
      this._idleSince.set(record.entityId, since);
      const settle =
        record.kind === "app" || record.kind === "entity"
          ? STEP_SETTLE_MS
          : SYSTEM_STEP_SETTLE_MS;
      if (now - since > settle) {
        result = "failed";
      }
    }
    if (!result) {
      return;
    }
    record.result = result;
    record.finishedAt = now;
    if (result === "done") {
      record.samples = undefined;
      // Going back ends at an older version than the record started for.
      if (reached && arrival.version) {
        record.toVersion = arrival.version;
      }
    } else if (error) {
      record.error = redactDetails(error).slice(0, 1000);
    }
    const slot = this._logs.get(record.entityId);
    record.lastLines = (slot?.lines ?? []).slice(-10);
    void this._readLog(record).then((lines) => {
      if (lines?.length) {
        record.lastLines = lines.slice(-10);
        this._save();
      }
    });
  }

  /** Closes a finished record, for example when the person dismisses it. */
  public dismiss(entityId: string): void {
    if (this._records.delete(entityId)) {
      this._logs.delete(entityId);
      this._save();
      this._host.requestUpdate();
    }
  }

  /** Records that ended well leave after an hour; failed ones stay. */
  public prune(now = Date.now()): void {
    for (const record of [...this._records.values()]) {
      if (
        record.result === "done" &&
        (record.finishedAt ?? 0) + RECORD_KEEP_MS < now
      ) {
        this._records.delete(record.entityId);
      }
    }
  }

  /** What the row of an update shows; undefined when there is nothing to show. */
  public view(
    entity: UpdateEntity,
    now = Date.now()
  ): ProgressView | undefined {
    const record = this._records.get(entity.entity_id);
    if (!record) {
      return undefined;
    }
    const run = updateInstallTracker.get(entity.entity_id);
    const { root, leaf, backupRunning } = this._jobFor(
      record.kind,
      appSlugOf(entity)
    );
    const percent = record.result ? undefined : reportedPercent(root, entity);
    const signals = this._signals(
      record,
      run?.stage,
      leaf,
      backupRunning,
      percent !== undefined
    );
    signals.end = record.result;
    if (record.result === "failed") {
      signals.failedAt = record.lastStage;
    }
    const slot = this._logs.get(entity.entity_id);
    const lines = record.result
      ? (record.lastLines ?? slot?.lines ?? [])
      : (slot?.lines ?? []);
    return {
      record,
      kind: record.kind,
      running: !record.result,
      percent,
      jobStage: leaf?.stage,
      stages: deriveStages(signals),
      estimateMs: record.result
        ? undefined
        : estimateRemainingMs(record.samples, now),
      output: {
        lines,
        state: record.result
          ? lines.length
            ? "live"
            : (slot?.state ?? "waiting")
          : (slot?.state ?? "waiting"),
      },
      jobsAvailable: this.jobsAvailable,
    };
  }

  /** The step that was under way, for an announcement. */
  public stageOf(view: ProgressView): StageId | undefined {
    return view.stages.find((row) => row.state === "running")?.id;
  }
}
