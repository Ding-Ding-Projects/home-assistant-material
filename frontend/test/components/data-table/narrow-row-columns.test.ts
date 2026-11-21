import { describe, expect, it } from "vitest";
import { rowDetailsColumn } from "../../../src/components/data-table/row-details-column";
import {
  closeRowDetailsOnKey,
  isRowDetailsToggleElement,
} from "../../../src/components/data-table/row-details";
import {
  entityQuickActionsColumn,
  quickRowButtons,
} from "../../../src/components/entity/entity-row-details";
import type { HomeAssistant } from "../../../src/types";

// On a phone, a table row's name must keep its width when the row also holds
// quick action and details buttons. The shared column helpers mark their
// column so it moves to a line of its own instead of squeezing the name; a
// table built with them cannot forget it.

const host = { hass: { states: {} } as unknown as HomeAssistant };

describe("shared row columns on a phone", () => {
  it("lets the details column move under the name", () => {
    const column = rowDetailsColumn(
      "Details",
      host,
      (row: { id: string }) => row.id,
      (row: { id: string }) => row.id
    );
    expect(column.showNarrow).toBe(true);
    expect(column.narrowWrap).toBe(true);
  });

  it("lets the quick actions column move under the name", () => {
    const column = entityQuickActionsColumn("Quick actions", host);
    expect(column.showNarrow).toBe(true);
    expect(column.narrowWrap).toBe(true);
  });

  it("keeps both buttons one press away on a phone row too", () => {
    expect(quickRowButtons(true)).toBe("both");
    expect(quickRowButtons(false)).toBe("both");
  });
});

describe("closing row details from the keyboard", () => {
  it("closes the row's details on Escape", () => {
    expect(closeRowDetailsOnKey("Escape", ["a", "b"], "a")).toEqual(["b"]);
    expect(closeRowDetailsOnKey("Escape", new Set(["a"]), "a")).toEqual([]);
  });

  it("leaves other keys and closed rows to others", () => {
    expect(closeRowDetailsOnKey("Enter", ["a"], "a")).toBeUndefined();
    expect(closeRowDetailsOnKey("Escape", ["b"], "a")).toBeUndefined();
  });

  it("recognises an element that can take focus back", () => {
    const plain = document.createElement("div");
    expect(isRowDetailsToggleElement(plain)).toBe(false);
    const toggle = Object.assign(document.createElement("div"), {
      focusRowDetailsToggle: () => true,
    });
    expect(isRowDetailsToggleElement(toggle)).toBe(true);
  });
});
