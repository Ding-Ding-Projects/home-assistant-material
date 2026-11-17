import type { HassEntities } from "home-assistant-js-websocket";
import type { HomeAssistant } from "../../../../types";

/** How long to wait for a newly saved automation to show up. */
export const ENTITY_WAIT_MS = 30000;

export const findAutomationEntityId = (
  states: HassEntities,
  automationId: string
): string | undefined =>
  Object.keys(states).find(
    (entityId) =>
      entityId.startsWith("automation.") &&
      String(states[entityId].attributes.id) === automationId
  );

interface StateChangedData {
  entity_id: string;
  new_state?: { attributes?: Record<string, unknown> } | null;
}

/**
 * Wait for the entity of a just saved automation, by listening for state
 * changes instead of polling. Resolves with its entity id, or undefined when
 * it did not appear within the bound.
 */
export const waitForAutomationEntity = (
  hass: Pick<HomeAssistant, "states" | "connection">,
  automationId: string,
  timeoutMs = ENTITY_WAIT_MS
): Promise<string | undefined> => {
  const existing = findAutomationEntityId(hass.states, automationId);
  if (existing) {
    return Promise.resolve(existing);
  }
  return new Promise((resolve) => {
    let done = false;
    let unsubscribe: (() => void) | undefined;
    const finish = (entityId?: string) => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timer);
      unsubscribe?.();
      resolve(entityId);
    };
    const timer = setTimeout(() => finish(undefined), timeoutMs);
    hass.connection
      .subscribeEvents<{ data: StateChangedData }>((event) => {
        const data = event.data;
        if (
          data.entity_id.startsWith("automation.") &&
          String(data.new_state?.attributes?.id) === automationId
        ) {
          finish(data.entity_id);
        }
      }, "state_changed")
      .then((unsub) => {
        if (done) {
          unsub();
        } else {
          unsubscribe = unsub;
        }
      })
      .catch(() => {
        // Without the event stream only the timeout can end the wait.
      });
  });
};
