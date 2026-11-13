import type {
  Connection,
  HassEntities,
  UnsubscribeFunc,
} from "home-assistant-js-websocket";
import { supportsFeature } from "../common/entity/supports-feature";
import { UNAVAILABLE, UNKNOWN } from "./entity/entity";
import type { SelectOption } from "./selector";
import { subscribeItems, TodoListEntityFeature, type TodoItem } from "./todo";

export type TodoItemAction = "update_item" | "remove_item";

/** UIDs belong to one list; never suggest them for an unresolved target set. */
export const todoActionItemTarget = (
  entityIds: readonly string[] | null | undefined,
  states: HassEntities | undefined,
  action: TodoItemAction
): string | undefined => {
  const ids = [...new Set(entityIds)];
  if (ids.length !== 1 || !ids[0].startsWith("todo.")) return undefined;
  const entity = states?.[ids[0]];
  if (
    !entity ||
    entity.state === UNAVAILABLE ||
    entity.state === UNKNOWN ||
    !supportsFeature(
      entity,
      action === "remove_item"
        ? TodoListEntityFeature.DELETE_TODO_ITEM
        : TodoListEntityFeature.UPDATE_TODO_ITEM
    )
  ) {
    return undefined;
  }
  return ids[0];
};

export const todoActionItemOptions = (
  items: readonly TodoItem[]
): SelectOption[] => {
  const summaries = new Map<string, number>();
  const firstMatch = new Map<string, TodoItem>();
  for (const item of items) {
    summaries.set(item.summary, (summaries.get(item.summary) ?? 0) + 1);
    // Core resolves each value against UID or summary in list order.
    for (const value of [item.uid, item.summary]) {
      if (!firstMatch.has(value)) firstMatch.set(value, item);
    }
  }
  return items
    .filter((item) => item.uid && firstMatch.get(item.uid) === item)
    .map((item) => ({
      value: item.uid,
      label:
        !item.summary || (summaries.get(item.summary) ?? 0) > 1
          ? item.summary
            ? `${item.summary} (${item.uid})`
            : item.uid
          : item.summary,
    }));
};

/** Only the current request may publish options, including after disconnect. */
export class TodoActionItemLoader {
  private _generation = 0;

  private _unsubscribe?: UnsubscribeFunc;

  public invalidate(): void {
    this._generation++;
    this._unsubscribe?.();
    this._unsubscribe = undefined;
  }

  public async load(
    connection: Connection,
    entityId: string,
    publish: (options: SelectOption[]) => void
  ): Promise<void> {
    this.invalidate();
    const generation = this._generation;
    try {
      const unsubscribe = await subscribeItems(
        connection,
        entityId,
        ({ items }) => {
          if (generation === this._generation) {
            publish(todoActionItemOptions(items));
          }
        }
      );
      if (generation === this._generation) {
        this._unsubscribe = unsubscribe;
      } else {
        unsubscribe();
      }
    } catch {
      // Authorization failures and unavailable lists leave custom entry intact.
      if (generation === this._generation) publish([]);
    }
  }
}
