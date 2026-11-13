import type { TodoItem } from "../../../src/data/todo";
import { TodoItemStatus } from "../../../src/data/todo";
import type { MockHomeAssistant } from "../../../src/fake_data/provide_hass";

const initialItems = {
  items: [
    {
      uid: "12",
      summary: "Milk",
      status: TodoItemStatus.NeedsAction,
    },
    {
      uid: "13",
      summary: "Eggs",
      status: TodoItemStatus.NeedsAction,
    },
    {
      uid: "14",
      summary: "Oranges",
      status: TodoItemStatus.Completed,
    },
    {
      uid: "15",
      summary: "Beer",
      status: TodoItemStatus.NeedsAction,
    },
  ] as TodoItem[],
};

export const mockTodo = (hass: MockHomeAssistant) => {
  // Each demo or gallery instance owns its lists; never mutate the shared seed.
  const lists = new Map<string, TodoItem[]>();
  const listeners = new Map<
    string,
    Set<(value: { items: TodoItem[] }) => void>
  >();
  const list = (entityId: string) => {
    if (!lists.has(entityId)) {
      lists.set(
        entityId,
        initialItems.items.map((item) => ({ ...item }))
      );
    }
    return lists.get(entityId)!;
  };
  const snapshot = (entityId: string) => ({
    items: list(entityId).map((item) => ({ ...item })),
  });
  const publish = (entityId: string, currentHass: MockHomeAssistant) => {
    currentHass.mockEntities[entityId]?.update({
      state: String(
        list(entityId).filter(
          (item) => item.status !== TodoItemStatus.Completed
        ).length
      ),
    });
    for (const listener of listeners.get(entityId) ?? []) {
      listener(snapshot(entityId));
    }
  };
  const targets = (
    currentHass: MockHomeAssistant,
    data?: Record<string, unknown>,
    target?: Record<string, unknown>
  ) => {
    const value = target?.entity_id ?? data?.entity_id;
    const ids = Array.isArray(value) ? value : [value];
    if (
      !ids.length ||
      ids.some(
        (id) =>
          typeof id !== "string" ||
          !id.startsWith("todo.") ||
          !currentHass.states[id]
      )
    ) {
      throw { code: "invalid_target", message: "Choose a sample to-do list." };
    }
    return ids as string[];
  };
  hass.mockWS("todo/item/list", ({ entity_id }) => snapshot(entity_id));
  hass.mockWS("todo/item/move", () => undefined);
  hass.mockWS("todo/item/subscribe", ({ entity_id }, _hass, onChange) => {
    const callback = onChange;
    if (!callback) return () => undefined;
    const callbacks = listeners.get(entity_id) ?? new Set();
    listeners.set(entity_id, callbacks);
    callbacks.add(callback);
    callback(snapshot(entity_id));
    return () => callbacks.delete(callback);
  });
  hass.mockService("todo", "update_item", (data, target, currentHass) => {
    const ids = targets(currentHass, data, target);
    const matches = ids.map((id) => ({
      id,
      item: list(id).find(
        (item) => item.uid === data?.item || item.summary === data?.item
      ),
    }));
    if (matches.some(({ item }) => !item)) {
      throw { code: "not_found", message: "Sample to-do item not found." };
    }
    if (
      data?.status !== undefined &&
      data.status !== TodoItemStatus.NeedsAction &&
      data.status !== TodoItemStatus.Completed
    ) {
      throw { code: "invalid_status", message: "Choose a valid to-do status." };
    }
    for (const { id, item } of matches) {
      if (typeof data?.rename === "string") item!.summary = data.rename;
      if (data?.status !== undefined) item!.status = data.status;
      if (typeof data?.description === "string" || data?.description === null) {
        item!.description = data.description;
      }
      if (data?.due_datetime !== undefined) item!.due = data.due_datetime;
      else if (data?.due_date !== undefined) item!.due = data.due_date;
      publish(id, currentHass);
    }
  });
  hass.mockService("todo", "remove_item", (data, target, currentHass) => {
    const ids = targets(currentHass, data, target);
    const selected = Array.isArray(data?.item) ? data.item : [data?.item];
    if (!selected.length || selected.some((item) => typeof item !== "string")) {
      throw { code: "invalid_item", message: "Choose a sample to-do item." };
    }
    for (const id of ids) {
      if (
        selected.some(
          (value) =>
            !list(id).some(
              (item) => item.uid === value || item.summary === value
            )
        )
      ) {
        throw { code: "not_found", message: "Sample to-do item not found." };
      }
    }
    for (const id of ids) {
      lists.set(
        id,
        list(id).filter(
          (item) =>
            !selected.includes(item.uid) && !selected.includes(item.summary)
        )
      );
      publish(id, currentHass);
    }
  });
};
