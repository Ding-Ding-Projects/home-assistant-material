import { mdiDotsVertical, mdiUndo } from "@mdi/js";
import { describe, expect, it } from "vitest";
import {
  isToolPillMenu,
  orderToolPillItems,
  TOOL_PILL_MENU_ORDER,
} from "../../src/layouts/tool-pill-order";

const iconButton = (path: string) => {
  const el = document.createElement("ha-icon-button") as HTMLElement & {
    path?: string;
  };
  el.path = path;
  return el;
};

describe("isToolPillMenu", () => {
  it("recognises menu elements and the three dot button", () => {
    expect(isToolPillMenu(document.createElement("ha-dropdown"))).toBe(true);
    expect(
      isToolPillMenu(document.createElement("ha-integration-overflow-menu"))
    ).toBe(true);
    expect(isToolPillMenu(iconButton(mdiDotsVertical))).toBe(true);
  });

  it("does not treat other actions as the menu", () => {
    expect(isToolPillMenu(iconButton(mdiUndo))).toBe(false);
    expect(isToolPillMenu(document.createElement("ha-button"))).toBe(false);
  });

  it("treats a wrapper that ends with a menu as the menu", () => {
    const wrapper = document.createElement("div");
    wrapper.append(iconButton(mdiUndo), document.createElement("ha-dropdown"));
    expect(isToolPillMenu(wrapper)).toBe(true);
    const plain = document.createElement("div");
    plain.append(document.createElement("ha-dropdown"), iconButton(mdiUndo));
    expect(isToolPillMenu(plain)).toBe(false);
  });
});

describe("orderToolPillItems", () => {
  it("puts only the menu last, in any arrangement", () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    const slot = document.createElement("slot");
    root.append(slot);
    const undo = iconButton(mdiUndo);
    const menu = document.createElement("ha-dropdown");
    const redo = iconButton(mdiUndo);
    undo.slot = menu.slot = redo.slot = "";
    host.append(undo, menu, redo);
    document.body.append(host);
    orderToolPillItems(slot);
    expect(menu.style.order).toBe(TOOL_PILL_MENU_ORDER);
    expect(undo.style.order).toBe("");
    expect(redo.style.order).toBe("");
    host.remove();
  });
});
