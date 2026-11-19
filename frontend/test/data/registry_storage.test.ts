import { describe, expect, it } from "vitest";
import {
  isRegistryAgent,
  isValidRepositoryName,
  passwordFormProblem,
  ratePassword,
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
  withCameraRepository,
  type RegistryPlace,
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
  backup_count: 0,
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

  it("sets and clears a camera without touching the others", () => {
    const current = { "camera.a": "x/a" };
    expect(withCameraRepository(current, "camera.b", " x/b ")).toEqual({
      "camera.a": "x/a",
      "camera.b": "x/b",
    });
    expect(withCameraRepository(current, "camera.a", "")).toEqual({});
    expect(withCameraRepository(current, "camera.a", null)).toEqual({});
    expect(current).toEqual({ "camera.a": "x/a" });
  });

  it("accepts only account/name in lower case", () => {
    expect(isValidRepositoryName("owner/home-vault")).toBe(true);
    expect(isValidRepositoryName("Owner/home")).toBe(false);
    expect(isValidRepositoryName("owner")).toBe(false);
    expect(isValidRepositoryName("owner/a/b")).toBe(false);
  });
});

describe("password form", () => {
  const good = "correct horse battery staple";
  const form = (over = {}) => ({
    old_password: "an old long password here",
    password: good,
    password_confirmation: good,
    understand: true,
    ...over,
  });

  it("rates length first, then obvious, then strong", () => {
    expect(ratePassword("")).toBe("empty");
    expect(ratePassword("short")).toBe("too_short");
    expect(ratePassword("aaaaaaaaaaaaaaaa")).toBe("obvious");
    expect(ratePassword("passwordpassword")).toBe("obvious");
    expect(ratePassword(good)).toBe("very_strong");
  });

  it("names the first problem in a stable order", () => {
    expect(passwordFormProblem(form(), true)).toBeUndefined();
    expect(passwordFormProblem(form({ old_password: "" }), true)).toBe("empty");
    expect(passwordFormProblem(form({ password: "short" }), true)).toBe(
      "too_short"
    );
    expect(
      passwordFormProblem(form({ password_confirmation: "different" }), true)
    ).toBe("mismatch");
    expect(passwordFormProblem(form({ old_password: good }), true)).toBe(
      "same_as_old"
    );
    expect(passwordFormProblem(form({ understand: false }), true)).toBe(
      "understand"
    );
  });

  it("does not ask for the old password when the form has none", () => {
    expect(
      passwordFormProblem(form({ old_password: "" }), false)
    ).toBeUndefined();
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
