import type { Connection } from "home-assistant-js-websocket";
import { describe, expect, it, vi } from "vitest";
import { watchEntityState } from "../../../src/components/update-progress/entity-state-hub";

// Protects the promise that any number of followed installs share one
// state_changed subscription, that each gets only its own entity, and that the
// subscription ends with the last follower.

const fakeConnection = () => {
  let handler: ((event: any) => void) | undefined;
  const unsub = vi.fn();
  const subscribeEvents = vi.fn((cb: (event: any) => void) => {
    handler = cb;
    return Promise.resolve(unsub);
  });
  return {
    connection: { subscribeEvents } as unknown as Connection,
    subscribeEvents,
    unsub,
    emit: (entityId: string, state: string) =>
      handler?.({
        data: {
          entity_id: entityId,
          new_state: { entity_id: entityId, state },
        },
      }),
  };
};

describe("watchEntityState", () => {
  it("makes one subscription for several entities and routes by entity", async () => {
    const fake = fakeConnection();
    const a = vi.fn();
    const b = vi.fn();
    const stopA = watchEntityState(fake.connection, "update.a", a);
    const stopB = watchEntityState(fake.connection, "update.b", b);
    expect(fake.subscribeEvents).toHaveBeenCalledTimes(1);
    fake.emit("update.a", "on");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    stopA();
    stopB();
  });

  it("drops the subscription with the last follower, and only once", async () => {
    const fake = fakeConnection();
    const stopA = watchEntityState(fake.connection, "update.a", vi.fn());
    const stopB = watchEntityState(fake.connection, "update.b", vi.fn());
    await Promise.resolve();
    stopA();
    stopA();
    expect(fake.unsub).not.toHaveBeenCalled();
    stopB();
    expect(fake.unsub).toHaveBeenCalledTimes(1);
  });

  it("drops a subscription that finished after every follower had left", async () => {
    const fake = fakeConnection();
    const stop = watchEntityState(fake.connection, "update.a", vi.fn());
    stop();
    await Promise.resolve();
    await Promise.resolve();
    expect(fake.unsub).toHaveBeenCalledTimes(1);
    // A later follower gets a fresh subscription
    watchEntityState(fake.connection, "update.a", vi.fn());
    expect(fake.subscribeEvents).toHaveBeenCalledTimes(2);
  });
});
