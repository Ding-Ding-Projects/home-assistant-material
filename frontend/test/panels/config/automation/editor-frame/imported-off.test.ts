import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  ENTITY_WAIT_MS,
  findAutomationEntityId,
  waitForAutomationEntity,
} from "../../../../../src/panels/config/automation/editor-frame/imported-off";

const state = (id: string) => ({ attributes: { id } }) as any;

const makeHass = (states: Record<string, any> = {}) => {
  let listener: ((event: any) => void) | undefined;
  const unsub = vi.fn();
  const hass: any = {
    states,
    connection: {
      subscribeEvents: vi.fn(async (cb: (event: any) => void) => {
        listener = cb;
        return unsub;
      }),
    },
  };
  return { hass, unsub, emit: (event: any) => listener?.(event) };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("findAutomationEntityId", () => {
  test("matches the stored id, as a string, on automation entities only", () => {
    const states = {
      "automation.a": state("1700"),
      "script.b": state("1700"),
    };
    expect(findAutomationEntityId(states, "1700")).toBe("automation.a");
    expect(findAutomationEntityId(states, "9")).toBeUndefined();
  });
});

describe("waitForAutomationEntity", () => {
  test("returns at once when the entity already exists", async () => {
    const { hass } = makeHass({ "automation.a": state("1") });
    await expect(waitForAutomationEntity(hass, "1")).resolves.toBe(
      "automation.a"
    );
    expect(hass.connection.subscribeEvents).not.toHaveBeenCalled();
  });

  test("resolves when the state event for the new automation arrives", async () => {
    const { hass, unsub, emit } = makeHass();
    const waiting = waitForAutomationEntity(hass, "1");
    await vi.advanceTimersByTimeAsync(0);
    emit({ data: { entity_id: "automation.other", new_state: state("2") } });
    emit({ data: { entity_id: "automation.new", new_state: state("1") } });
    await expect(waiting).resolves.toBe("automation.new");
    expect(unsub).toHaveBeenCalled();
  });

  test("gives up after the bound and says so with undefined", async () => {
    const { hass, unsub } = makeHass();
    const waiting = waitForAutomationEntity(hass, "1");
    await vi.advanceTimersByTimeAsync(ENTITY_WAIT_MS - 1);
    let settled = false;
    void waiting.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await expect(waiting).resolves.toBeUndefined();
    expect(unsub).toHaveBeenCalled();
  });

  test("a failing event stream still ends at the bound", async () => {
    const hass: any = {
      states: {},
      connection: {
        subscribeEvents: vi.fn(async () => {
          throw new Error("closed");
        }),
      },
    };
    const waiting = waitForAutomationEntity(hass, "1", 1000);
    await vi.advanceTimersByTimeAsync(1001);
    await expect(waiting).resolves.toBeUndefined();
  });
});
