import type { ReactiveControllerHost } from "lit";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DraftController } from "../../../../../src/panels/config/automation/editor-frame/draft-controller";
import type { DraftBinding } from "../../../../../src/panels/config/automation/editor-frame/draft-controller";
import {
  DRAFT_DELAY_MS,
  configHash,
} from "../../../../../src/panels/config/automation/editor-frame/draft-logic";

const calls: any[] = [];
let stored: Record<string, any> = {};

const hass: any = {
  localize: () => "",
  callWS: vi.fn(async (msg: any) => {
    calls.push(msg);
    const key = `${msg.kind}/${msg.item_id}`;
    switch (msg.type) {
      case "editor_drafts/save":
        stored[key] = {
          kind: msg.kind,
          item_id: msg.item_id,
          config: msg.config,
          base_hash: msg.base_hash,
          meta: msg.meta,
          updated: "2026-11-17T16:42:00.000Z",
        };
        return { saved: true, updated: "2026-11-17T16:42:00.000Z" };
      case "editor_drafts/get":
        return stored[key] ?? null;
      case "editor_drafts/list":
        return Object.values(stored);
      case "editor_drafts/discard":
        delete stored[key];
        return true;
      default:
        throw new Error("unexpected");
    }
  }),
};

const LIVE = { alias: "A", actions: [] };

const saves = () => calls.filter((c) => c.type === "editor_drafts/save");

const setup = (overrides: Partial<DraftBinding> = {}) => {
  const state = {
    id: "item1" as string | undefined,
    config: { ...LIVE } as Record<string, any> | undefined,
    dirty: false,
    applied: undefined as Record<string, any> | undefined,
  };
  const host: ReactiveControllerHost = {
    addController: () => undefined,
    removeController: () => undefined,
    requestUpdate: () => undefined,
    updateComplete: Promise.resolve(true),
  };
  const controller = new DraftController(host, {
    hass: () => hass,
    kind: () => "automation",
    itemId: () => state.id,
    config: () => state.config,
    dirty: () => state.dirty,
    readOnly: () => false,
    apply: (config) => {
      state.applied = config;
    },
    ...overrides,
  });
  return { state, controller };
};

const settle = async () => {
  await vi.advanceTimersByTimeAsync(0);
};

const edit = (
  state: { dirty: boolean; config?: Record<string, any> },
  controller: DraftController,
  alias: string
) => {
  state.dirty = true;
  state.config = { alias, actions: [] };
  controller.configChanged();
};

beforeEach(() => {
  vi.useFakeTimers();
  calls.length = 0;
  stored = {};
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DraftController", () => {
  test("saves a draft after the delay once the item is dirty, not before", async () => {
    const { state, controller } = setup();
    controller.configChanged();
    await settle();
    edit(state, controller, "B");
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS - 1);
    expect(saves()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2);
    expect(saves()).toHaveLength(1);
    expect(saves()[0].config).toEqual({ alias: "B", actions: [] });
    expect(saves()[0].base_hash).toBe(configHash(LIVE));
    expect(controller.status).toBe("saved");
  });

  test("a clean item is never saved", async () => {
    const { controller } = setup();
    controller.configChanged();
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS * 3);
    expect(saves()).toHaveLength(0);
  });

  test("a failed save shows the not-saved state and never throws", async () => {
    const { state, controller } = setup();
    controller.configChanged();
    await settle();
    hass.callWS.mockImplementationOnce(async () => {
      throw new Error("offline");
    });
    edit(state, controller, "B");
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS + 1);
    expect(controller.status).toBe("error");
  });

  test("offers a stored draft that differs from the live item", async () => {
    stored["automation/item1"] = {
      kind: "automation",
      item_id: "item1",
      config: { alias: "Draft", actions: [] },
      base_hash: configHash(LIVE),
      updated: "2026-11-17T16:42:00.000Z",
    };
    const { state, controller } = setup();
    controller.configChanged();
    await settle();
    expect(controller.offer?.draft.config.alias).toBe("Draft");
    expect(controller.offer?.liveChanged).toBe(false);
    controller.continueDraft();
    expect(state.applied).toEqual({ alias: "Draft", actions: [] });
    expect(controller.offer).toBeUndefined();
  });

  test("a draft equal to the live item is dropped instead of offered", async () => {
    stored["automation/item1"] = {
      kind: "automation",
      item_id: "item1",
      config: { ...LIVE },
      base_hash: configHash(LIVE),
      updated: null,
    };
    const { controller } = setup();
    controller.configChanged();
    await settle();
    expect(controller.offer).toBeUndefined();
    expect(stored["automation/item1"]).toBeUndefined();
  });

  test("discarding the offer removes the stored draft", async () => {
    stored["automation/item1"] = {
      kind: "automation",
      item_id: "item1",
      config: { alias: "Draft" },
      base_hash: null,
      updated: null,
    };
    const { controller } = setup();
    controller.configChanged();
    await settle();
    controller.discardOffer();
    await settle();
    expect(stored["automation/item1"]).toBeUndefined();
  });

  test("saving the item removes its draft", async () => {
    const { state, controller } = setup();
    controller.configChanged();
    await settle();
    edit(state, controller, "B");
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS + 1);
    expect(stored["automation/item1"]).toBeDefined();
    controller.saved();
    await settle();
    expect(stored["automation/item1"]).toBeUndefined();
    expect(controller.status).toBe("idle");
  });

  test("editing back to the live item removes the draft", async () => {
    const { state, controller } = setup();
    controller.configChanged();
    await settle();
    edit(state, controller, "B");
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS + 1);
    state.dirty = false;
    state.config = { ...LIVE };
    controller.configChanged();
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS + 1);
    expect(stored["automation/item1"]).toBeUndefined();
  });

  test("a new item offers the newest imported draft under its own id", async () => {
    stored["automation/new-abc"] = {
      kind: "automation",
      item_id: "new-abc",
      config: { alias: "Imported", triggers: [] },
      base_hash: null,
      meta: { imported: true },
      updated: null,
    };
    const { state, controller } = setup();
    state.id = undefined;
    controller.configChanged();
    await settle();
    expect(controller.offer?.draft.item_id).toBe("new-abc");
    controller.continueDraft();
    expect(controller.currentId()).toBe("new-abc");
    expect(controller.importedDisabled).toBe(true);
  });

  test("page hide sends the pending draft at once", async () => {
    const { state, controller } = setup();
    controller.hostConnected();
    controller.configChanged();
    await settle();
    edit(state, controller, "B");
    expect(saves()).toHaveLength(0);
    window.dispatchEvent(new Event("pagehide"));
    await settle();
    expect(saves()).toHaveLength(1);
    expect(saves()[0].config).toEqual({ alias: "B", actions: [] });
    controller.hostDisconnected();
  });

  test("the tab turning hidden sends the pending draft, visible does not", async () => {
    const { state, controller } = setup();
    controller.hostConnected();
    controller.configChanged();
    await settle();
    edit(state, controller, "C");
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(saves()).toHaveLength(0);
    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(saves()).toHaveLength(1);
    expect(saves()[0].config).toEqual({ alias: "C", actions: [] });
    visibility.mockRestore();
    controller.hostDisconnected();
  });

  test("one save per real change, and none while the editor sits idle", async () => {
    const { state, controller } = setup();
    controller.configChanged();
    await settle();
    edit(state, controller, "B");
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS + 1);
    expect(saves()).toHaveLength(1);
    const before = calls.length;
    // Five idle minutes: no timer, no message.
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(calls.length).toBe(before);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("the same content reported as changed again is not saved again", async () => {
    const { state, controller } = setup();
    controller.configChanged();
    await settle();
    edit(state, controller, "B");
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS + 1);
    expect(saves()).toHaveLength(1);
    // A new object with the same content and another key order.
    state.config = { actions: [], alias: "B" };
    controller.configChanged();
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS + 1);
    state.config = { actions: [], alias: "B", description: undefined };
    controller.configChanged();
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS + 1);
    expect(saves()).toHaveLength(1);
    edit(state, controller, "C");
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS + 1);
    expect(saves()).toHaveLength(2);
  });

  test("a config that only differs from the live item in key order or empty values is not saved", async () => {
    const { state, controller } = setup();
    controller.configChanged();
    await settle();
    state.dirty = true;
    state.config = { actions: [], alias: "A", description: undefined };
    controller.configChanged();
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS * 3);
    expect(saves()).toHaveLength(0);
  });

  test("a server that keeps saying too soon is asked a few times, then left alone", async () => {
    const { state, controller } = setup();
    controller.configChanged();
    await settle();
    const original = hass.callWS.getMockImplementation();
    hass.callWS.mockImplementation(async (msg: any) => {
      calls.push(msg);
      return { saved: false };
    });
    edit(state, controller, "B");
    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(saves().length).toBeLessThanOrEqual(6);
    expect(controller.status).toBe("error");
    expect(vi.getTimerCount()).toBe(0);
    hass.callWS.mockImplementation(original);
  });

  test("leaving the editor with a pending draft sends it", async () => {
    const { state, controller } = setup();
    controller.hostConnected();
    controller.configChanged();
    await settle();
    edit(state, controller, "D");
    controller.hostDisconnected();
    await settle();
    expect(saves()).toHaveLength(1);
  });
});
