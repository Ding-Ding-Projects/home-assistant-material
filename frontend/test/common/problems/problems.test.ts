// Protects the problem detector's two pieces of real logic: finding the
// entity ids a card or step names (including nested cards and targets, never
// templates), and the store's binding of problems to elements, which
// Teleport waits on after a navigation.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configEntityIds,
  configKey,
  missingEntities,
} from "../../../src/common/problems/missing-entities";
import {
  activeProblems,
  bindTarget,
  clearProblem,
  ignoreProblem,
  resetProblemStore,
  setProblem,
  targetsFor,
  unbindTarget,
  whenTarget,
} from "../../../src/common/problems/problem-store";

const problem = (id: string, severity: "error" | "warning" = "error") => ({
  id,
  source: "test",
  severity,
  title: "t",
  location: id,
  path: "/x",
});

describe("configEntityIds", () => {
  it("finds entity fields, entity rows, targets and nested cards", () => {
    expect(
      configEntityIds({
        type: "vertical-stack",
        cards: [
          { type: "tile", entity: "light.kitchen" },
          { type: "entities", entities: ["sensor.a", { entity: "sensor.b" }] },
        ],
        tap_action: { target: { entity_id: ["switch.fan"] } },
      })
    ).toEqual(["light.kitchen", "sensor.a", "sensor.b", "switch.fan"]);
  });

  it("skips templates, wildcards and plain text", () => {
    expect(
      configEntityIds({
        entity: "{{ states.light | first }}",
        entity_id: "all",
        name: "light.kitchen",
      })
    ).toEqual([]);
  });

  it("reports only the ids missing from states", () => {
    expect(
      missingEntities({ entities: ["light.a", "light.b"] }, { "light.a": {} })
    ).toEqual(["light.b"]);
  });

  it("gives the same config the same key and different configs different keys", () => {
    expect(configKey({ entity: "light.a" })).toBe(
      configKey({ entity: "light.a" })
    );
    expect(configKey({ entity: "light.a" })).not.toBe(
      configKey({ entity: "light.b" })
    );
  });
});

describe("problem store", () => {
  afterEach(() => {
    resetProblemStore();
    window.localStorage.clear();
  });

  it("lists errors before warnings and hides ignored problems", () => {
    setProblem(problem("b", "warning"));
    setProblem(problem("a"));
    expect(activeProblems().map((p) => p.id)).toEqual(["a", "b"]);
    ignoreProblem("a");
    expect(activeProblems().map((p) => p.id)).toEqual(["b"]);
    clearProblem("b");
    expect(activeProblems()).toEqual([]);
  });

  it("binds connected elements and forgets unbound ones", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    bindTarget("a", el);
    expect(targetsFor("a")).toEqual([el]);
    unbindTarget("a", el);
    expect(targetsFor("a")).toEqual([]);
    el.remove();
  });

  it("resolves a teleport wait when the element appears, or undefined after the timeout", async () => {
    vi.useFakeTimers();
    const el = document.createElement("div");
    document.body.appendChild(el);
    const waiting = whenTarget("late", 1000);
    bindTarget("late", el);
    await expect(waiting).resolves.toBe(el);
    const never = whenTarget("never", 1000);
    vi.advanceTimersByTime(1001);
    await expect(never).resolves.toBeUndefined();
    vi.useRealTimers();
    el.remove();
  });
});
