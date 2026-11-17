import { describe, expect, it } from "vitest";
import {
  canInstallCandidate,
  driveName,
  isOfflineJob,
  isOfflinePackJob,
  packNeedsNetwork,
  packPartOutcome,
  packRows,
  progressFromPackJob,
  startOfflineUpdate,
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

const packEntry = (over: Record<string, unknown> = {}) =>
  candidate({
    path: "ham-offline-pack-123/manifest.json",
    filename: "ham-offline-pack-123",
    kind: "pack",
    pack: {
      format: 1,
      build: "123",
      board: "rpi4-64",
      parts: [
        {
          kind: "os",
          available: true,
          file: "x.raucb",
          size: 5,
          version: "17.0",
        },
        {
          kind: "supervisor",
          available: false,
          file: null,
          size: 0,
          version: "2026.1",
        },
        {
          kind: "core",
          available: false,
          file: null,
          size: 0,
          version: "2026.11",
        },
        { kind: "weird", available: true },
      ],
    },
    ...over,
  });

describe("offline update packs", () => {
  it("reads a pack with its parts in install order and drops unknown parts", () => {
    const [item] = parseCandidates({ candidates: [packEntry()] });
    expect(item.kind).toBe("pack");
    expect(item.pack?.build).toBe("123");
    expect(item.pack?.parts.map((part) => part.kind)).toEqual([
      "supervisor",
      "core",
      "os",
    ]);
    expect(item.pack?.parts[2].version).toBe("17.0");
  });

  it("keeps single files as bundles and drops a pack without a summary", () => {
    const list = parseCandidates({
      candidates: [candidate(), packEntry({ pack: undefined })],
    });
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe("bundle");
    expect(list[0].pack).toBeUndefined();
  });

  it("allows installing only a pack that is ready", () => {
    const verdicts = ["ok", "incomplete", "no_os_part", "not_newer"];
    const installable = verdicts.filter((verdict) =>
      canInstallCandidate(
        parseCandidates({ candidates: [packEntry({ verdict })] })[0]
      )
    );
    expect(installable).toEqual(["ok"]);
    expect(toVerdict("incomplete")).toBe("incomplete");
    expect(toVerdict("no_os_part")).toBe("no_os_part");
  });

  it("reports what the Supervisor does with each part", () => {
    const [item] = parseCandidates({
      candidates: [
        packEntry({
          pack: {
            build: "9",
            board: "rpi4-64",
            parts: [
              {
                kind: "supervisor",
                available: true,
                file: "s",
                size: 1,
                version: "1",
              },
              { kind: "core", available: false },
              { kind: "os", available: true, file: "o", size: 1, version: "2" },
            ],
          },
        }),
      ],
    });
    expect(packRows(item.pack!).map((row) => row.outcome)).toEqual([
      "needs_network",
      "skipped",
      "installed",
    ]);
    expect(packNeedsNetwork(item.pack!)).toBe(true);
    expect(
      packPartOutcome({
        kind: "os",
        available: false,
        file: "",
        size: 0,
        version: "",
      })
    ).toBe("skipped");
    const osOnly = parseCandidates({ candidates: [packEntry()] })[0];
    expect(packNeedsNetwork(osOnly.pack!)).toBe(false);
  });

  it("follows the pack job through checking, copying and installing", () => {
    const job = (over: Record<string, unknown> = {}) => ({
      uuid: "j",
      name: "os_manager_update_from_pack",
      ...over,
    });
    expect(
      progressFromPackJob(job({ stage: "verifying", progress: 20 }))
    ).toEqual({
      stage: "verifying",
      percent: 20,
    });
    expect(
      progressFromPackJob(job({ stage: "verifying", progress: 90 })).percent
    ).toBe(40);
    expect(
      progressFromPackJob(job({ stage: "copying", progress: 50 }))
    ).toEqual({
      stage: "copying",
      percent: 50,
    });
    expect(
      progressFromPackJob(job({ stage: "installing", progress: 70 })).stage
    ).toBe("installing");
    expect(progressFromPackJob(job({ done: true })).stage).toBe("done");
    const failed = progressFromPackJob(
      job({
        done: true,
        errors: [
          { message: "a.raucb: the checksum does not match the manifest" },
        ],
      })
    );
    expect(failed.stage).toBe("failed");
    expect(failed.message).toContain("checksum");
  });

  it("knows both job names and sends a pack to its own route", async () => {
    expect(
      isOfflineJob({ uuid: "a", name: "os_manager_update_from_file" })
    ).toBe(true);
    expect(
      isOfflineJob({ uuid: "a", name: "os_manager_update_from_pack" })
    ).toBe(true);
    expect(
      isOfflinePackJob({ uuid: "a", name: "os_manager_update_from_file" })
    ).toBe(false);
    const calls: any[] = [];
    const hass = {
      callWS: async (msg: any) => {
        calls.push(msg);
        return { job_id: "x" };
      },
    } as any;
    await startOfflineUpdate(hass, { drive_id: "d", path: "p", kind: "pack" });
    await startOfflineUpdate(hass, {
      drive_id: "d",
      path: "p",
      kind: "bundle",
    });
    expect(calls.map((call) => call.endpoint)).toEqual([
      "/os/offline_update/pack",
      "/os/offline_update",
    ]);
    expect(calls[0].data).toEqual({ drive_id: "d", path: "p" });
  });
});
