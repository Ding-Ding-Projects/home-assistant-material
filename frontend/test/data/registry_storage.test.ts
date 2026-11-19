import { describe, expect, it } from "vitest";
import {
  cancelRegistryGetBack,
  fetchRegistryGetBack,
  fetchRegistryRecordings,
  fetchRegistryStatus,
  isRegistryAgent,
  isValidRepositoryName,
  playRegistryRecording,
  refreshRegistryIndex,
  REGISTRY_WHERE_MAX_SECONDS,
  REGISTRY_WS,
  registryBars,
  registryOnlyRecordings,
  registryPlaceForAgent,
  registryProblemAdvice,
  registryProblemKey,
  registryStatusKey,
  registryVisibilityKey,
  repositoryChoiceForCamera,
  repositoryForBackups,
  repositoryForCamera,
  runRegistrySelfTest,
  setRegistryCameraRepository,
  setRegistryPlace,
  startRegistryGetBack,
  type RegistryPlace,
  type RegistryServerStatus,
  type RegistryWhereRow,
} from "../../src/data/registry_storage";

const place = (over: Partial<RegistryPlace> = {}): RegistryPlace => ({
  entry_id: "abc",
  registry: "docker_hub",
  address: null,
  username: "owner",
  default_repository: "owner/home-vault",
  camera_repositories: {},
  backups_repository: null,
  loaded: true,
  enabled: true,
  public: true,
  send: "events",
  keep_days: 30,
  used_bytes: 0,
  waiting_files: 0,
  waiting_bytes: 0,
  last_sent: null,
  last_problem: null,
  ...over,
});

describe("registryStatusKey", () => {
  it("reads one state per situation, not loaded first", () => {
    expect(registryStatusKey(place({ loaded: false, enabled: false }))).toBe(
      "not_loaded"
    );
    expect(registryStatusKey(place({ enabled: false }))).toBe("off");
    expect(registryStatusKey(place({ waiting_files: 2 }))).toBe("waiting");
    expect(registryStatusKey(place())).toBe("nothing_sent");
    expect(
      registryStatusKey(place({ last_sent: { entity_id: "camera.a", at: 1 } }))
    ).toBe("up_to_date");
  });

  it("reports unknown visibility instead of guessing", () => {
    expect(registryVisibilityKey({ public: true })).toBe("public");
    expect(registryVisibilityKey({ public: false })).toBe("private");
    expect(registryVisibilityKey({ public: null })).toBe("unknown");
  });
});

describe("per camera repositories", () => {
  const p = place({
    camera_repositories: { "camera.front": "owner/front" },
    backups_repository: "owner/backups",
  });

  it("uses the camera's own repository, else the default", () => {
    expect(repositoryForCamera(p, "camera.front")).toBe("owner/front");
    expect(repositoryForCamera(p, "camera.drive")).toBe("owner/home-vault");
    expect(repositoryChoiceForCamera(p, "camera.front")).toBe("own");
    expect(repositoryChoiceForCamera(p, "camera.drive")).toBe("default");
  });

  it("uses the backups repository, else the default", () => {
    expect(repositoryForBackups(p)).toBe("owner/backups");
    expect(repositoryForBackups(place())).toBe("owner/home-vault");
  });

  it("accepts only account/name in lower case", () => {
    expect(isValidRepositoryName("owner/home-vault")).toBe(true);
    expect(isValidRepositoryName("Owner/home")).toBe(false);
    expect(isValidRepositoryName("owner")).toBe(false);
    expect(isValidRepositoryName("owner/a/b")).toBe(false);
  });
});

describe("problems and recordings", () => {
  it("maps unknown reasons to unexpected and advises by kind", () => {
    expect(registryProblemKey("rate_limited")).toBe("rate_limited");
    expect(registryProblemKey("nonsense")).toBe("unexpected");
    expect(registryProblemAdvice("timeout")).toBe("later");
    expect(registryProblemAdvice("denied")).toBe("token");
    expect(registryProblemAdvice("tampered")).toBe("damaged");
    expect(registryProblemAdvice("rejected")).toBe("other");
  });

  it("reads the upload queue's own reason codes as registry reasons", () => {
    expect(registryProblemKey("sign_in")).toBe("auth_failed");
    expect(registryProblemKey("timed_out")).toBe("timeout");
    expect(registryProblemKey("locked")).toBe("wrong_password");
    expect(registryProblemKey("not_loaded")).toBe("not_ready");
    expect(registryProblemKey("gave_up")).toBe("unexpected");
    expect(registryProblemAdvice("sign_in")).toBe("token");
    expect(registryProblemAdvice("drive_error")).toBe("later");
  });

  it("lists recordings only in the registry, newest first", () => {
    const rec = (id: string, start: number, local: boolean) => ({
      id,
      entity_id: "camera.a",
      start,
      duration: 60,
      stored_size: 1,
      local,
    });
    expect(
      registryOnlyRecordings([
        rec("a", 1, true),
        rec("b", 2, false),
        rec("c", 3, false),
      ]).map((r) => r.id)
    ).toEqual(["c", "b"]);
  });

  it("recognises the backup location and its place", () => {
    expect(isRegistryAgent("registry_storage.abc")).toBe(true);
    expect(isRegistryAgent("backup.local")).toBe(false);
    const a = place({ entry_id: "one" });
    const b = place({ entry_id: "two" });
    expect(registryPlaceForAgent([a, b], "registry_storage.two")).toBe(b);
    expect(registryPlaceForAgent([a, b], "registry_storage.other")).toBe(a);
    expect(
      registryPlaceForAgent(undefined, "registry_storage.x")
    ).toBeUndefined();
  });

  it("clips timeline bars to the window", () => {
    const bars = registryBars(
      [
        { start: 50, duration: 100 },
        { start: 500, duration: 10 },
      ],
      100_000,
      200_000
    );
    expect(bars).toHaveLength(1);
    expect(bars[0].left).toBe(0);
    expect(bars[0].width).toBeCloseTo(0.5);
  });
});

/**
 * Every command the page sends and the keys it sends with it. The camera
 * recording integration's test_registry_contract.py holds the same table and
 * checks it against the commands the server registers, so a rename or a
 * changed payload on either side fails one of the two tests.
 */
const CONTRACT: Record<string, string[]> = {
  "camera_recording/registry/status": [],
  "camera_recording/registry/test": [],
  "camera_recording/registry/set": [
    "enabled",
    "keep_days",
    "public_understood",
    "send",
  ],
  "camera_recording/registry/camera_repository": ["entity_id", "repository"],
  "camera_recording/registry/refresh": [],
  "camera_recording/registry/where": ["end_time", "entity_id", "start_time"],
  "camera_recording/registry/play": ["entity_id", "name"],
  "camera_recording/registry/get_back": ["entity_id", "name"],
  "camera_recording/registry/get_back_status": ["job_id"],
  "camera_recording/registry/get_back_cancel": ["job_id"],
};

const SERVER_STATUS: RegistryServerStatus = {
  entry_id: "entry1",
  registry: "github",
  address: null,
  username: "owner",
  set_up: true,
  loaded: true,
  default_repository: "owner/home-vault",
  backups_repository: null,
  public: true,
  used_bytes: 2048,
  rate_limit_remaining: null,
  tested: null,
  upload: {
    domain: "registry_storage",
    set_up: true,
    loaded: true,
    enabled: true,
    send: "everything",
    keep_days: null,
    enabled_at: 1,
    waiting_files: 3,
    waiting_bytes: 300,
    sent_files: 1,
    sent_bytes: 10,
    given_up: 0,
    last_sent: { entity_id: "camera.a", name: "a.mp4", kind: "event", at: 5 },
    last_problem: { reason: "timed_out", at: 6 },
  },
  cameras: {
    "camera.a": {
      repository: "owner/a",
      own_repository: true,
      in_registry_files: 1,
      in_registry_bytes: 10,
      waiting_files: 0,
      waiting_bytes: 0,
      sending: [],
    },
    "camera.b": {
      repository: "owner/home-vault",
      own_repository: false,
      in_registry_files: 0,
      in_registry_bytes: 0,
      waiting_files: 0,
      waiting_bytes: 0,
      sending: [],
    },
  },
  playback: null,
  indexed_files: 1,
};

const recorder = (answer: (msg: Record<string, unknown>) => unknown) => {
  const sent: Record<string, unknown>[] = [];
  return {
    sent,
    hass: {
      callWS: async <T>(msg: Record<string, unknown>): Promise<T> => {
        sent.push(msg);
        return answer(msg) as T;
      },
    },
  };
};

const STATUS_COMMANDS: string[] = [
  REGISTRY_WS.status,
  REGISTRY_WS.set,
  REGISTRY_WS.cameraRepository,
];

describe("websocket contract with the server", () => {
  it("names exactly the commands the server registers", () => {
    expect(Object.values(REGISTRY_WS).sort()).toEqual(
      Object.keys(CONTRACT).sort()
    );
  });

  it("sends each command with the keys the server accepts", async () => {
    const { sent, hass } = recorder((msg) => {
      if (STATUS_COMMANDS.includes(msg.type as string)) {
        return SERVER_STATUS;
      }
      return msg.type === REGISTRY_WS.where ? [] : {};
    });
    await fetchRegistryStatus(hass);
    await runRegistrySelfTest(hass);
    await setRegistryPlace(hass, {
      enabled: true,
      public_understood: true,
      send: "events",
      keep_days: 30,
    });
    await setRegistryCameraRepository(hass, "camera.a", null);
    await refreshRegistryIndex(hass);
    await fetchRegistryRecordings(hass, "camera.a", 0, 100);
    await playRegistryRecording(hass, "camera.a", "a.mp4");
    await startRegistryGetBack(hass, "camera.a", "a.mp4");
    await fetchRegistryGetBack(hass, "job");
    await cancelRegistryGetBack(hass, "job");
    expect(sent.map((msg) => msg.type).sort()).toEqual(
      Object.keys(CONTRACT).sort()
    );
    for (const msg of sent) {
      const keys = Object.keys(msg)
        .filter((key) => key !== "type")
        .sort();
      expect([msg.type, keys]).toEqual([
        msg.type,
        CONTRACT[msg.type as string],
      ]);
    }
  });

  it("never sends a password over the websocket", () => {
    for (const keys of Object.values(CONTRACT)) {
      expect(keys.some((key) => key.includes("password"))).toBe(false);
    }
  });

  it("turns the server's status into the place the pages draw", async () => {
    const { hass } = recorder(() => SERVER_STATUS);
    const [p] = (await fetchRegistryStatus(hass)).places;
    expect(p).toEqual({
      entry_id: "entry1",
      registry: "github",
      address: null,
      username: "owner",
      default_repository: "owner/home-vault",
      camera_repositories: { "camera.a": "owner/a" },
      backups_repository: null,
      loaded: true,
      enabled: true,
      public: true,
      send: "everything",
      keep_days: null,
      used_bytes: 2048,
      waiting_files: 3,
      waiting_bytes: 300,
      last_sent: { entity_id: "camera.a", at: 5 },
      last_problem: { reason: "timed_out", at: 6 },
    });
    const none = recorder(() => ({ ...SERVER_STATUS, set_up: false }));
    expect((await fetchRegistryStatus(none.hass)).places).toEqual([]);
  });

  it("asks for at most eight days and keeps only rows in the registry", async () => {
    const rows: RegistryWhereRow[] = [
      {
        entry_id: null,
        name: "a.mp4",
        start: 10,
        end: 70,
        size: 5,
        here: false,
        kind: "event",
        in_registry: true,
      },
      {
        entry_id: "e",
        name: "b.mp4",
        start: 80,
        end: 90,
        size: 5,
        here: true,
        kind: "event",
        in_registry: false,
      },
    ];
    const { sent, hass } = recorder(() => rows);
    const end = 1_000_000_000;
    expect(await fetchRegistryRecordings(hass, "camera.a", 0, end)).toEqual([
      {
        id: "a.mp4",
        entity_id: "camera.a",
        start: 10,
        duration: 60,
        stored_size: 5,
        local: false,
      },
    ]);
    const msg = sent[0];
    expect(
      Date.parse(msg.end_time as string) - Date.parse(msg.start_time as string)
    ).toBe(REGISTRY_WHERE_MAX_SECONDS * 1000);
  });
});
