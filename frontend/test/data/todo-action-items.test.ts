import type {
  Connection,
  HassEntities,
  UnsubscribeFunc,
} from "home-assistant-js-websocket";
import { describe, expect, it, vi } from "vitest";
import {
  TodoActionItemLoader,
  todoActionItemOptions,
  todoActionItemTarget,
} from "../../src/data/todo-action-items";
import { TodoItemStatus, type TodoItem } from "../../src/data/todo";

const item = (uid: string, summary: string): TodoItem => ({
  uid,
  summary,
  status: TodoItemStatus.NeedsAction,
});
const states = {
  "todo.one": {
    entity_id: "todo.one",
    state: "2",
    attributes: { supported_features: 6 },
  },
} as unknown as HassEntities;

describe("to-do action item suggestions", () => {
  it("only resolves one known list with the required feature", () => {
    expect(todoActionItemTarget(["todo.one"], states, "update_item")).toBe(
      "todo.one"
    );
    expect(
      todoActionItemTarget(["todo.one", "todo.one"], states, "remove_item")
    ).toBe("todo.one");
    for (const target of [
      undefined,
      null,
      [],
      ["todo.missing"],
      ["todo.one", "todo.two"],
      ["{{ target }}"],
    ]) {
      expect(
        todoActionItemTarget(target, states, "update_item")
      ).toBeUndefined();
    }
    for (const state of ["unknown", "unavailable"]) {
      expect(
        todoActionItemTarget(
          ["todo.one"],
          {
            "todo.one": { ...states["todo.one"], state },
          },
          "update_item"
        )
      ).toBeUndefined();
    }
    expect(
      todoActionItemTarget(
        ["todo.one"],
        {
          "todo.one": {
            ...states["todo.one"],
            attributes: { supported_features: 2 },
          },
        },
        "update_item"
      )
    ).toBeUndefined();
  });

  it("uses exact UIDs, distinguishes duplicate summaries, and excludes descriptions", () => {
    const items = [
      { ...item("001", "Milk"), description: "Do not expose this detail" },
      item("002", "Milk"),
      item("003", "Bread"),
      item("004", ""),
      item("", "No stable identifier"),
    ];
    const before = structuredClone(items);
    expect(todoActionItemOptions(items)).toEqual([
      { value: "001", label: "Milk (001)" },
      { value: "002", label: "Milk (002)" },
      { value: "003", label: "Bread" },
      { value: "004", label: "004" },
    ]);
    expect(items).toEqual(before);
  });

  it("omits a UID shadowed by an earlier summary or duplicate UID", () => {
    expect(
      todoActionItemOptions([
        item("first", "second"),
        item("second", "Milk"),
        item("first", "Bread"),
        item("third", "Eggs"),
      ])
    ).toEqual([
      { value: "first", label: "second" },
      { value: "third", label: "Eggs" },
    ]);
  });

  it("updates same-count renames and detaches a late subscription", async () => {
    let listener!: (result: { items: TodoItem[] }) => void;
    let finish!: (unsubscribe: UnsubscribeFunc) => void;
    const unsubscribe = vi.fn();
    const subscribeMessage = vi.fn(
      (callback: (result: { items: TodoItem[] }) => void) => {
        listener = callback;
        return new Promise<UnsubscribeFunc>((resolve) => {
          finish = resolve;
        });
      }
    );
    const loader = new TodoActionItemLoader();
    const publish = vi.fn();
    const pending = loader.load(
      { subscribeMessage } as unknown as Connection,
      "todo.one",
      publish
    );
    listener({ items: [item("001", "Milk")] });
    listener({ items: [item("001", "Bread")] });
    expect(publish).toHaveBeenLastCalledWith([
      { value: "001", label: "Bread" },
    ]);
    expect(subscribeMessage).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
      { type: "todo/item/subscribe", entity_id: "todo.one" }
    );
    loader.invalidate();
    listener({ items: [item("stale", "Old session")] });
    finish(unsubscribe);
    await pending;
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it("detaches an established subscription before replacing it", async () => {
    const unsubscribe = vi.fn();
    const connection = {
      subscribeMessage: vi.fn().mockResolvedValue(unsubscribe),
    } as unknown as Connection;
    const loader = new TodoActionItemLoader();
    await loader.load(connection, "todo.one", vi.fn());
    await loader.load(connection, "todo.two", vi.fn());
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    loader.invalidate();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
  });

  it("does not expose backend errors after permission denial", async () => {
    const connection = {
      subscribeMessage: vi.fn().mockRejectedValue({
        code: "unauthorized",
        message: "Sensitive detail",
      }),
    } as unknown as Connection;
    const publish = vi.fn();
    await new TodoActionItemLoader().load(connection, "todo.one", publish);
    expect(publish).toHaveBeenCalledExactlyOnceWith([]);
  });
});
