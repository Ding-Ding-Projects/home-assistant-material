import type {
  AutoUpdateInfo,
  BackupChoiceName,
  BackupKind,
} from "../../../../data/auto-update";
import { UpdateEntityFeature } from "../../../../data/update";
import type { UpdateEntity } from "../../../../data/update";
import { supportsFeature } from "../../../../common/entity/supports-feature";
import { updateRole } from "./update-queue";

/**
 * Which updates get a backup first. Everything here is a plain function so the
 * page, "Update everything" and the hand buttons decide in exactly one place,
 * the same way the server decides for automatic updates.
 */

export const BACKUP_KINDS: BackupKind[] = [
  "core",
  "supervisor",
  "os",
  "app",
  "integration",
  "device",
];

export const SYSTEM_BACKUP_KINDS: BackupKind[] = ["core", "supervisor", "os"];

/**
 * A backup made before Core or the operating system is a backup of Core only,
 * so it does not hold the apps. If that ever changes, set this and a run that
 * makes one backup at the start covers the apps in it.
 */
export const SYSTEM_BACKUP_COVERS_APPS = false;

export interface BackupSettings {
  kinds: Record<BackupKind, boolean>;
  /** The identifiers of the apps chosen one by one. */
  apps: string[];
  /** The identifiers of the apps that were installed when they were chosen. */
  seen: string[];
  /** What happens to an app installed later. */
  later: boolean;
}

export type PresetChoice = Exclude<BackupChoiceName, "custom">;

export const PRESET_CHOICES: PresetChoice[] = ["system", "all", "none"];

export const presetKinds = (
  choice: PresetChoice
): Record<BackupKind, boolean> =>
  Object.fromEntries(
    BACKUP_KINDS.map((kind) => [
      kind,
      choice === "all" ||
        (choice === "system" && SYSTEM_BACKUP_KINDS.includes(kind)),
    ])
  ) as Record<BackupKind, boolean>;

export const presetSettings = (choice: PresetChoice): BackupSettings => ({
  kinds: presetKinds(choice),
  apps: [],
  seen: [],
  later: choice === "all",
});

/** The stored choice; a server that predates the per-kind choice has one boolean. */
export const settingsFromInfo = (
  info: Pick<
    AutoUpdateInfo,
    | "backup"
    | "backup_kinds"
    | "backup_apps"
    | "backup_apps_seen"
    | "backup_apps_later"
  >
): BackupSettings => {
  if (!info.backup_kinds) {
    return presetSettings(info.backup ? "all" : "none");
  }
  return {
    kinds: { ...presetKinds("none"), ...info.backup_kinds },
    apps: info.backup_apps ?? [],
    seen: info.backup_apps_seen ?? [],
    later: info.backup_apps_later ?? info.backup_kinds.app,
  };
};

/** The preset the values match, otherwise custom. */
export const choiceFor = (settings: BackupSettings): BackupChoiceName => {
  for (const choice of PRESET_CHOICES) {
    const preset = presetKinds(choice);
    if (!BACKUP_KINDS.every((kind) => preset[kind] === settings.kinds[kind])) {
      continue;
    }
    if (choice === "all") {
      return settings.later ? "all" : "custom";
    }
    if (!settings.apps.length && !settings.later) {
      return choice;
    }
  }
  return "custom";
};

/** Whether a backup is requested before an update of this kind installs. */
export const wantsBackup = (
  kind: BackupKind,
  settings: BackupSettings,
  supportsBackup: boolean,
  appSlug?: string | null
): boolean => {
  if (!supportsBackup) {
    return false;
  }
  if (settings.kinds[kind]) {
    return true;
  }
  if (kind !== "app" || !appSlug) {
    return false;
  }
  return (
    settings.apps.includes(appSlug) ||
    (!settings.seen.includes(appSlug) && settings.later)
  );
};

/** Removes the chosen apps that are not installed any more. */
export const pruneApps = (chosen: string[], installed: string[]): string[] => {
  const present = new Set(installed);
  return [...new Set(chosen)].filter((slug) => present.has(slug));
};

/**
 * What kind of update an entity is. The server's own answer wins so the page
 * and the automatic updates never disagree; without it Core, the Supervisor and
 * the operating system come from the same role logic the queue uses, other
 * Supervisor updates are apps, firmware is a device and a community store
 * update is an integration.
 */
export const backupKindOf = (
  entity: UpdateEntity,
  platform: string | undefined,
  serverKind?: BackupKind
): BackupKind => {
  if (serverKind) {
    return serverKind;
  }
  const role = updateRole(entity);
  if (role !== "other") {
    return role;
  }
  if (platform === "hassio") {
    return "app";
  }
  if (entity.attributes.device_class === "firmware") {
    return "device";
  }
  return platform === "hacs" ? "integration" : "device";
};

export interface BackupSubject {
  entityId: string;
  kind: BackupKind;
  appSlug?: string | null;
  supportsBackup: boolean;
}

export const subjectFor = (
  entity: UpdateEntity,
  platform: string | undefined,
  info: AutoUpdateInfo | undefined
): BackupSubject => {
  const server = info?.entities.find(
    (item) => item.entity_id === entity.entity_id
  );
  const kind = backupKindOf(entity, platform, server?.backup_kind);
  return {
    entityId: entity.entity_id,
    kind,
    appSlug: server?.backup_app ?? null,
    supportsBackup: supportsFeature(entity, UpdateEntityFeature.BACKUP),
  };
};

export const subjectWantsBackup = (
  subject: BackupSubject,
  settings: BackupSettings
): boolean =>
  wantsBackup(subject.kind, settings, subject.supportsBackup, subject.appSlug);

export interface QueueBackupPlan {
  /** The steps that ask for a backup, each with the install call. */
  carriers: string[];
  /** Steps that want a backup but are covered by one made earlier in the run. */
  covered: Record<string, string>;
}

/**
 * Which steps of a run ask for a backup. Core, the Supervisor and the
 * operating system share one backup made by the first of them that wants one;
 * each app that wants one gets its own right before its step, unless the
 * system backup already holds apps.
 */
export const planQueueBackups = (
  steps: BackupSubject[],
  settings: BackupSettings,
  systemCoversApps = SYSTEM_BACKUP_COVERS_APPS
): QueueBackupPlan => {
  const carriers: string[] = [];
  const covered: Record<string, string> = {};
  let systemCarrier: string | undefined;
  for (const step of steps) {
    if (!subjectWantsBackup(step, settings)) {
      continue;
    }
    const system = SYSTEM_BACKUP_KINDS.includes(step.kind);
    if (system) {
      if (systemCarrier) {
        covered[step.entityId] = systemCarrier;
      } else {
        systemCarrier = step.entityId;
        carriers.push(step.entityId);
      }
    } else if (step.kind === "app" && systemCarrier && systemCoversApps) {
      covered[step.entityId] = systemCarrier;
    } else {
      carriers.push(step.entityId);
    }
  }
  return { carriers, covered };
};

/** Whether this step of a run asks for a backup; an older stored run asks as before. */
export const stepWantsBackup = (
  queue: { backup: boolean; backupSteps?: string[] },
  entityId: string,
  supportsBackup: boolean
): boolean =>
  queue.backupSteps
    ? queue.backupSteps.includes(entityId) && supportsBackup
    : queue.backup && supportsBackup;

/** Turning a backup off for Core, the Supervisor or the system needs the two keys. */
export const needsSystemConfirmation = (
  before: BackupSettings,
  after: BackupSettings
): boolean =>
  SYSTEM_BACKUP_KINDS.some((kind) => before.kinds[kind] && !after.kinds[kind]);

export type BackupSummaryKey =
  | "summary_system"
  | "summary_all"
  | "summary_none"
  | "summary_custom"
  | "summary_no_supervisor";

export const summaryKey = (
  choice: BackupChoiceName,
  hasSupervisor: boolean
): BackupSummaryKey =>
  choice === "custom"
    ? hasSupervisor
      ? "summary_custom"
      : "summary_no_supervisor"
    : (`summary_${choice}` as BackupSummaryKey);

/** What the mark on an update row says. */
export type BackupMark = "backup_first" | "no_backup" | "unsupported";

export const markFor = (
  subject: BackupSubject,
  settings: BackupSettings
): BackupMark =>
  !subject.supportsBackup
    ? "unsupported"
    : subjectWantsBackup(subject, settings)
      ? "backup_first"
      : "no_backup";
