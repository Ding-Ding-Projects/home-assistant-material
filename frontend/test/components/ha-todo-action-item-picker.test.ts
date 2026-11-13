import { ContextProvider } from "@lit/context";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HaTodoActionItemPicker } from "../../src/components/ha-todo-action-item-picker";
import {
  configContext,
  connectionContext,
  statesContext,
} from "../../src/data/context";
import type { SelectOption } from "../../src/data/selector";
import type {
  HomeAssistantConfig,
  HomeAssistantConnection,
} from "../../src/types";

vi.mock("../../src/components/ha-selector/ha-selector-select", () => ({}));

afterEach(() => {
  document.body.innerHTML = "";
});

const fixture = async (value?: string | string[], disabled = false) => {
  const host = document.createElement("div");
  const subscribeMessage = vi.fn(
    (
      callback: (value: { items: { uid: string; summary: string }[] }) => void
    ): Promise<() => void> => {
      callback({ items: [{ uid: "001", summary: "Milk" }] });
      return Promise.resolve(vi.fn());
    }
  );
  const states = new ContextProvider(host, {
    context: statesContext,
    initialValue: {
      "todo.one": {
        entity_id: "todo.one",
        state: "1",
        attributes: { supported_features: 6 },
        last_changed: "",
        last_updated: "",
        context: { id: "", parent_id: null, user_id: null },
      },
    },
  });
  const config = new ContextProvider(host, {
    context: configContext,
    initialValue: { user: { id: "one" } } as HomeAssistantConfig,
  });
  const connection = new ContextProvider(host, {
    context: connectionContext,
    initialValue: {
      connected: true,
      connection: {
        subscribeMessage,
      } as unknown as HomeAssistantConnection["connection"],
      debugConnection: false,
      hassUrl: (path = "") => path,
    },
  });
  const element = new HaTodoActionItemPicker();
  element.entityIds = ["todo.one"];
  element.value = value;
  element.disabled = disabled;
  const changes = vi.fn();
  element.addEventListener("value-changed", changes);
  host.append(element);
  document.body.append(host);
  await element.updateComplete;
  await element.updateComplete;
  return { element, subscribeMessage, changes, config, connection, states };
};

const options = (element: HaTodoActionItemPicker) =>
  (element as unknown as { _options: SelectOption[] })._options;

describe("to-do action item picker data lifecycle", () => {
  it("updates a same-count rename without resubscribing on state updates", async () => {
    const { element, subscribeMessage, changes, states } = await fixture("001");
    subscribeMessage.mock.calls[0][0]({
      items: [{ uid: "001", summary: "Bread" }],
    });
    states.setValue({
      "todo.one": { ...states.value["todo.one"], state: "1" },
    });
    await element.updateComplete;
    expect(options(element)).toEqual([{ value: "001", label: "Bread" }]);
    expect(subscribeMessage).toHaveBeenCalledTimes(1);
    expect(changes).not.toHaveBeenCalled();
    expect(element.value).toBe("001");
  });
  it.each(
    [
      "Milk",
      "001",
      "Custom",
      "{{ item }}",
      { value: ["001", "Custom"] },
      undefined,
    ].map((value) => ({
      value: typeof value === "object" ? value.value : value,
    }))
  )("retains saved value $value without emitting", async ({ value }) => {
    const { element, changes } = await fixture(value);
    expect(element.value).toEqual(value);
    expect(changes).not.toHaveBeenCalled();
    element.entityIds = ["todo.one", "todo.two"];
    await element.updateComplete;
    expect(options(element)).toEqual([]);
    expect(element.value).toEqual(value);
    expect(changes).not.toHaveBeenCalled();
  });

  it("never subscribes while disabled and does not propagate disabled edits", async () => {
    const { element, subscribeMessage, changes } = await fixture("Milk", true);
    const event = new CustomEvent("value-changed", {
      detail: { value: "001" },
      bubbles: true,
      composed: true,
    });
    element
      .shadowRoot!.querySelector("ha-selector-select")!
      .dispatchEvent(event);
    expect(subscribeMessage).not.toHaveBeenCalled();
    expect(changes).not.toHaveBeenCalled();
    expect(element.value).toBe("Milk");
  });

  it("emits an explicit selection once from the keyed outer component", async () => {
    const { element, changes } = await fixture("Milk");
    element.action = "remove_item";
    element.key = "item";
    await element.updateComplete;
    element.shadowRoot!.querySelector("ha-selector-select")!.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: { value: ["Milk", "001"] },
        bubbles: true,
        composed: true,
      })
    );
    expect(changes).toHaveBeenCalledTimes(1);
    const event = changes.mock.calls[0][0];
    expect(event.target).toBe(element);
    expect(event.target.key).toBe("item");
    expect(event.detail.value).toEqual(["Milk", "001"]);
    expect(element.value).toBe("Milk");
  });

  it.each(["disabled", "target", "disconnect", "user", "connection"])(
    "discards a delayed response after %s changes",
    async (change) => {
      const { element, subscribeMessage, config, connection } =
        await fixture("saved");
      let resolve!: (unsubscribe: () => void) => void;
      subscribeMessage.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          })
      );
      element.action = "remove_item";
      await element.updateComplete;
      switch (change) {
        case "disabled":
          element.disabled = true;
          break;
        case "target":
          element.entityIds = null;
          break;
        case "disconnect":
          element.remove();
          break;
        case "user":
          config.setValue({ user: undefined } as HomeAssistantConfig);
          break;
        case "connection":
          connection.setValue({
            ...connection.value,
            connected: false,
          });
          break;
      }
      const unsubscribe = vi.fn();
      resolve(unsubscribe);
      await element.updateComplete;
      await Promise.resolve();
      expect(options(element)).toEqual([]);
      expect(element.value).toBe("saved");
    }
  );
});
