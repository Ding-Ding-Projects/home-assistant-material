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

// A stale URL on a failed or restarting job must never become an Open action.
export const readyHostingUrl = (job?: BackupHostingJob): string | undefined => {
  if (job?.state !== "ready" || !job.lan_url) return undefined;
  try {
    const url = new URL(job.lan_url);
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
