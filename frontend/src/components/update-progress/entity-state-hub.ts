import type {
  Connection,
  HassEntity,
  HassEvent,
  UnsubscribeFunc,
} from "home-assistant-js-websocket";

/**
 * One `state_changed` subscription per connection, shared by every install
 * that is being followed. Each follower names the entity it wants and gets only
 * that entity's new states. The subscription is made with the first follower
 * and dropped with the last.
 */

type Listener = (state: HassEntity) => void;

interface Hub {
  listeners: Map<string, Set<Listener>>;
  count: number;
  pending: Promise<UnsubscribeFunc>;
  unsub?: UnsubscribeFunc;
}

const hubs = new WeakMap<Connection, Hub>();

const makeHub = (connection: Connection): Hub => {
  const hub: Hub = {
    listeners: new Map(),
    count: 0,
    pending: connection.subscribeEvents<HassEvent>((event) => {
      const data = event.data as {
        entity_id?: string;
        new_state?: HassEntity | null;
      };
      if (!data.entity_id || !data.new_state) {
        return;
      }
      const set = hub.listeners.get(data.entity_id);
      if (set) {
        for (const listener of [...set]) {
          listener(data.new_state);
        }
      }
    }, "state_changed"),
  };
  hub.pending.then(
    (unsub) => {
      if (hubs.get(connection) === hub && hub.count > 0) {
        hub.unsub = unsub;
      } else {
        unsub();
      }
    },
    () => {
      // A subscription that cannot be made only costs detail, not the run.
      if (hubs.get(connection) === hub) {
        hubs.delete(connection);
      }
    }
  );
  return hub;
};

/** Calls `listener` with each new state of the entity. Returns the stop. */
export const watchEntityState = (
  connection: Connection,
  entityId: string,
  listener: Listener
): (() => void) => {
  let hub = hubs.get(connection);
  if (!hub) {
    hub = makeHub(connection);
    hubs.set(connection, hub);
  }
  const mine = hub;
  let set = mine.listeners.get(entityId);
  if (!set) {
    set = new Set();
    mine.listeners.set(entityId, set);
  }
  set.add(listener);
  mine.count++;
  let stopped = false;
  return () => {
    if (stopped) {
      return;
    }
    stopped = true;
    const current = mine.listeners.get(entityId);
    current?.delete(listener);
    if (current && current.size === 0) {
      mine.listeners.delete(entityId);
    }
    mine.count--;
    if (mine.count === 0) {
      if (hubs.get(connection) === mine) {
        hubs.delete(connection);
      }
      mine.unsub?.();
      mine.unsub = undefined;
    }
  };
};
