import type { HomeAssistant } from "../types";

export type BackupHostingTarget = "docker" | "virtualbox" | "vmware";
export interface BackupHostingJob {
  id: string;
  request_id: string;
  backup_id?: string;
  agent_id?: string;
  state: string;
  phase: string;
  target: BackupHostingTarget;
  instance_id?: string;
  lan_url?: string | null;
  lan_url_verified?: boolean;
  lan_url_verified_at?: string | null;
  error_code?: string | null;
  updated_at: string;
}
export interface BackupHostingBridge {
  id: string;
  url: string;
  paired: boolean;
  capabilities: {
    targets?: string[];
    target_status?: Record<string, { available: boolean; reason?: string }>;
  };
}
export interface BackupHostingStatus {
  bridges: BackupHostingBridge[];
  jobs?: BackupHostingJob[];
}
export interface BackupHostingPairRequest {
  url: string;
  fingerprint: string;
  client_id?: string;
  pairing_id?: string;
}
export const backupHostingStatus = (hass: HomeAssistant) =>
  hass.callWS<BackupHostingStatus>({ type: "backup/hosting/status" });
export const pairBackupHosting = (
  hass: HomeAssistant,
  request: BackupHostingPairRequest | { bridge_id: string }
) =>
  hass.callWS<{
    bridge_id: string;
    state: string;
    pairing_id?: string;
    expires_at?: string;
  }>({
    type: "backup/hosting/pair",
    ...request,
  });
export const startBackupHosting = (
  hass: HomeAssistant,
  request: {
    request_id: string;
    backup_id: string;
    agent_id: string;
    target: BackupHostingTarget;
    bridge_id: string;
    options: Record<string, unknown>;
    password?: string;
  }
) =>
  hass.callWS<BackupHostingJob>({ type: "backup/hosting/start", ...request });
export const backupHostingJobs = (hass: HomeAssistant, bridge_id: string) =>
  hass.callWS<{ jobs: BackupHostingJob[] }>({
    type: "backup/hosting/jobs",
    bridge_id,
  });
export const cancelBackupHosting = (
  hass: HomeAssistant,
  bridge_id: string,
  job_id: string
) =>
  hass.callWS<BackupHostingJob>({
    type: "backup/hosting/cancel",
    bridge_id,
    job_id,
  });

export const hostingJobActive = (job: BackupHostingJob) =>
  !["ready", "failed", "cancelled"].includes(job.state);

export const hostingJobNeedsKey = (job?: BackupHostingJob) =>
  job?.state === "needs_attention" && job.error_code === "incorrect_password";

export const availableHostingTargets = (
  bridge?: BackupHostingBridge
): BackupHostingTarget[] =>
  (bridge?.capabilities.targets || []).filter(
    (target): target is BackupHostingTarget =>
      ["docker", "virtualbox", "vmware"].includes(target) &&
      bridge?.capabilities.target_status?.[target]?.available === true
  );

const safeHostingUrl = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
};

// A stale URL on a failed or restarting job must never become an Open action.
export const readyHostingUrl = (job?: BackupHostingJob): string | undefined =>
  job?.state === "ready" ? safeHostingUrl(job.lan_url) : undefined;

// A sign-in link is an incomplete verification step, never a ready result.
export const signInHostingUrl = (
  job?: BackupHostingJob
): string | undefined => {
  if (
    job?.state !== "authentication_needed" ||
    job.lan_url_verified !== true ||
    !job.lan_url_verified_at ||
    job.lan_url_verified_at.length > 64 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      job.lan_url_verified_at
    ) ||
    !Number.isFinite(Date.parse(job.lan_url_verified_at))
  )
    return undefined;
  return safeHostingUrl(job.lan_url);
};

export const canAutoStartHosting = (options: {
  explicitAction: boolean;
  savedBridge: boolean;
  targets: BackupHostingTarget[];
  savedTarget?: BackupHostingTarget;
  protectedBackup: boolean;
  existingJob?: BackupHostingJob;
}) =>
  options.explicitAction &&
  options.savedBridge &&
  !options.protectedBackup &&
  !options.existingJob &&
  (options.targets.length === 1 ||
    (options.savedTarget !== undefined &&
      options.targets.includes(options.savedTarget)));
