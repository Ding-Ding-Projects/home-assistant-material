import { ContextProvider } from "@lit/context";
import type { HassEntity } from "home-assistant-js-websocket";
import { afterEach, expect, it, vi } from "vitest";
import {
  formattersContext,
  internationalizationContext,
} from "../../../../src/data/context";
import "../../../../src/panels/config/tools/state/tools-state-renderer";
import type { HomeAssistant } from "../../../../src/types";

const entity = (entity_id: string, state: string): HassEntity => ({
  entity_id,
  state,
  attributes: { friendly_name: entity_id },
  context: { id: "fixture", user_id: null, parent_id: null },
  last_changed: "2026-11-22T12:00:00Z",
  last_updated: "2026-11-22T12:00:00Z",
});

afterEach(() => document.body.replaceChildren());

it("keeps each row's live controls with the correct entity as results change", async () => {
  const first = entity("switch.first", "off");
  const second = entity("switch.second", "on");
  const sensor = entity("sensor.temperature", "21");
  const removed = entity("switch.removed", "off");
  const callService = vi.fn().mockResolvedValue(undefined);
  const localize = (key: string) => key;
  const formatEntityName = (item: HassEntity) => item.entity_id;
  const hass = {
    states: Object.fromEntries(
      [first, second, sensor].map((item) => [item.entity_id, item])
    ),
    localize,
    formatEntityName,
    formatEntityState: (item: HassEntity) => item.state,
    callService,
    locale: { language: "en" },
  } as unknown as HomeAssistant;
  const host = document.createElement("div");
  new ContextProvider(host, {
    context: internationalizationContext,
    initialValue: hass,
  });
  new ContextProvider(host, { context: formattersContext, initialValue: hass });
  const list = document.createElement("tools-state-renderer");
  Object.assign(list, {
    hass,
    entities: [first, sensor, removed],
    virtualize: false,
  });
  host.append(list);
  document.body.append(host);
  await list.updateComplete;
  const controls = () =>
    list.shadowRoot!.querySelectorAll("ha-entity-quick-controls");
  expect(controls()).toHaveLength(1);
  const firstControl = controls()[0];
  expect(firstControl.entityId).toBe(first.entity_id);
  await firstControl.updateComplete;
  const toggle = firstControl.shadowRoot!.querySelector("ha-switch")!;
  toggle.checked = true;
  toggle.dispatchEvent(new Event("change"));
  expect(callService.mock.calls[0]).toContainEqual({
    entity_id: first.entity_id,
  });

  list.entities = [second, sensor];
  await list.updateComplete;
  expect(controls()).toHaveLength(1);
  expect(controls()[0].entityId).toBe(second.entity_id);
  expect(controls()[0]).not.toBe(firstControl);
  expect(firstControl.isConnected).toBe(false);
});
