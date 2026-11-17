import { describe, expect, it } from "vitest";
import {
  canInstallCandidate,
  driveName,
  megabytes,
  offlineErrorKind,
  offlineUpdateSupported,
  parseCandidates,
  progressFromJob,
  toVerdict,
} from "../../../src/data/hassio/os-offline-update";

const candidate = (over: Record<string, unknown> = {}) => ({
  drive_id: "drive-1",
  vendor: "SanDisk",
  model: "Ultra",
  label: "UPDATES",
  filesystem: "vfat",
  path: "/haos_rpi4-64-18.6.raucb",
  filename: "haos_rpi4-64-18.6.raucb",
  size: 300 * 1024 * 1024,
  board: "rpi4-64",
  version: "18.6",
  verdict: "ok",
  ...over,
});

describe("offline update files", () => {
  it("reads the candidate list and drops entries it cannot send back", () => {
    const list = parseCandidates({
      candidates: [
        candidate(),
        candidate({ drive_id: "" }),
        candidate({ path: "" }),
        "nope",
        candidate({ filename: "", path: "/dir/file.raucb", verdict: "weird" }),
      ],
    });
    expect(list).toHaveLength(2);
    expect(list[1].filename).toBe("file.raucb");
    expect(list[1].verdict).toBe("unsupported");
    expect(parseCandidates({})).toEqual([]);
    expect(parseCandidates(null)).toEqual([]);
  });

  it("allows installing only a file that is ready", () => {
    const verdicts = [
      "ok",
      "wrong_board",
      "not_newer",
      "too_large",
      "no_space",
      "unsupported",
    ];
    const installable = verdicts.filter((verdict) =>
      canInstallCandidate(
        parseCandidates({ candidates: [candidate({ verdict })] })[0]
      )
    );
    expect(installable).toEqual(["ok"]);
    expect(toVerdict("not_newer")).toBe("not_newer");
    expect(toVerdict(undefined)).toBe("unsupported");
  });

  it("names the drive and sizes the file", () => {
    const [item] = parseCandidates({ candidates: [candidate()] });
    expect(driveName(item)).toBe("SanDisk Ultra, UPDATES");
    expect(driveName({ ...item, label: "", vendor: "", model: "" })).toBe("");
    expect(megabytes(300 * 1024 * 1024)).toBe("300");
    expect(megabytes(2.5 * 1024 * 1024)).toBe("2.5");
  });

  it("shows the feature only when the operating system reports it", () => {
    expect(offlineUpdateSupported({ offline_update: true })).toBe(true);
    expect(offlineUpdateSupported({ offline_update: false })).toBe(false);
    expect(offlineUpdateSupported({})).toBe(false);
    expect(offlineUpdateSupported(undefined)).toBe(false);
  });

  it("tells the Supervisor's refusals apart", () => {
    expect(
      offlineErrorKind({ error_key: "hassos_offline_update_not_allowed_error" })
    ).toBe("not_allowed");
    expect(
      offlineErrorKind({
        body: { error_key: "hassos_offline_update_not_found_error" },
      })
    ).toBe("not_found");
    expect(
      offlineErrorKind({ error_key: "hassos_update_in_progress_error" })
    ).toBe("in_progress");
    expect(offlineErrorKind({ status_code: 409 })).toBe("in_progress");
    expect(offlineErrorKind(new Error("boom"))).toBe("other");
    expect(offlineErrorKind(undefined)).toBe("other");
  });
});

describe("offline update job progress", () => {
  const job = (over: Record<string, unknown> = {}) => ({
    uuid: "job-1",
    name: "os_manager_update_from_file",
    ...over,
  });

  it("keeps copying in the first half and installing in the second", () => {
    expect(progressFromJob(job({ stage: "copying", progress: 20 }))).toEqual({
      stage: "copying",
      percent: 20,
    });
    expect(
      progressFromJob(job({ stage: "copying", progress: 80 })).percent
    ).toBe(50);
    expect(progressFromJob(job({ stage: "installing" }))).toEqual({
      stage: "installing",
      percent: 50,
    });
    expect(
      progressFromJob(job({ stage: "installing", progress: 70 })).percent
    ).toBe(70);
    expect(
      progressFromJob(job({ stage: "installing", progress: 10 })).percent
    ).toBe(50);
  });

  it("starts at zero without any progress", () => {
    expect(progressFromJob(job())).toEqual({ stage: "copying", percent: 0 });
  });

  it("is done only when the job is done without errors", () => {
    expect(progressFromJob(job({ done: true, progress: 100 }))).toEqual({
      stage: "done",
      percent: 100,
    });
    const failed = progressFromJob(
      job({
        done: true,
        errors: [
          {
            message:
              "The update file is not signed for this system or is damaged",
          },
        ],
      })
    );
    expect(failed.stage).toBe("failed");
    expect(failed.message).toBe(
      "The update file is not signed for this system or is damaged"
    );
  });
});
