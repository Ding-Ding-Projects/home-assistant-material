import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStorage } from "../../../src/common/decorators/storage";
import {
  readLocks,
  withLock,
  writeLocks,
} from "../../../src/common/locks/element-locks";
import { readGroups, writeGroups } from "../../../src/common/tabs/tab-groups";
import { groupLockKey } from "../../../src/common/tabs/tab-locks";
import type { HaTabGroupMenu } from "../../../src/components/tabs/ha-tab-group-menu";
import {
  makeHass,
  resetTabStorage,
  settle,
  stubMatchMedia,
} from "./tab-test-helpers";

vi.mock("../../../src/components/ha-svg-icon", () => ({}));

await import("../../../src/components/tabs/ha-tab-group-menu");

// The group menu is where a person reorders, ungroups, locks and closes a
// whole group. These protect the rules that keep them from losing work:
// ungrouping and removing keep the tabs open, a locked group cannot be taken
// apart, closing shows what stays open and why, and Shift skips the menu for
// the editor.

let menu: HaTabGroupMenu;
let anchor: HTMLButtonElement;

const group = (id: string, members: string[], collapsed = false) => ({
  id,
  name: id.toUpperCase(),
  colour: "blue" as const,
  collapsed,
  members,
});

const open = async (shift = false, groupId = "g1") => {
  window.dispatchEvent(
    new CustomEvent("tab-group-context-menu", {
      detail: { groupId, anchor, shift, surface: "main" },
    })
  );
  await settle(menu);
};

const item = (labelKey: string) =>
  Array.from(
    menu.shadowRoot!.querySelectorAll<HTMLButtonElement>("[role=menuitem]")
  ).find((button) => button.textContent!.includes(labelKey))!;

const editorEvents: CustomEvent[] = [];
const onEditor = (ev: Event) => editorEvents.push(ev as CustomEvent);

beforeEach(async () => {
  stubMatchMedia(false);
  resetTabStorage();
  // A strip docked on top reads left to right; the vertical wording has its own test.
  getStorage().setValue("pageTabsEdge", { main: "top" });
  editorEvents.length = 0;
  window.addEventListener("tab-group-editor-open", onEditor);
  anchor = document.createElement("button");
  document.body.append(anchor);
  menu = document.createElement("ha-tab-group-menu");
  menu.hass = makeHass();
  document.body.append(menu);
  await menu.updateComplete;
});

afterEach(() => {
  window.removeEventListener("tab-group-editor-open", onEditor);
  menu.remove();
  anchor.remove();
});

describe("ha-tab-group-menu", () => {
  it("lists every group action and returns focus to the header on Escape", async () => {
    writeGroups("main", [group("g1", ["a", "b"])]);
    await open();
    const labels = Array.from(
      menu.shadowRoot!.querySelectorAll("[role=menuitem]")
    ).map((button) => button.textContent!.trim());
    [
      "rename",
      "edit_appearance",
      "collapse",
      "move_left",
      "move_right",
      "move_start",
      "move_end",
      "ungroup",
      "close_tabs",
      "lock",
      "remove",
    ].forEach((name) =>
      expect(labels.some((label) => label.includes(`groups.${name}`))).toBe(
        true
      )
    );
    menu
      .shadowRoot!.querySelector(".panel")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    await settle(menu);
    expect(menu.shadowRoot!.querySelector(".panel")).toBeNull();
    expect(document.activeElement).toBe(anchor);
  });

  it("collapses and expands without touching the tabs", async () => {
    writeGroups("main", [group("g1", ["a", "b"])]);
    await open();
    item("groups.collapse").click();
    await settle(menu);
    expect(readGroups("main")[0].collapsed).toBe(true);
    expect(readGroups("main")[0].members).toEqual(["a", "b"]);
    await open();
    expect(item("groups.expand")).toBeTruthy();
  });

  it("moves the group as one block", async () => {
    writeGroups("main", [group("g1", ["a", "b"])]);
    await open();
    item("groups.move_right").click();
    await settle(menu);
    expect(getStorage().getValue("pageTabsOrder")).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
  });

  it("words the moves for a vertical strip", async () => {
    getStorage().setValue("pageTabsEdge", { main: "left" });
    writeGroups("main", [group("g1", ["a", "b"])]);
    await open();
    expect(item("groups.move_down")).toBeTruthy();
    expect(item("groups.move_up")).toBeTruthy();
  });

  it("ungroups and removes while the tabs stay open", async () => {
    writeGroups("main", [group("g1", ["a", "b"]), group("g2", ["c"])]);
    await open();
    item("groups.ungroup").click();
    await settle(menu);
    expect(readGroups("main").map((g) => g.id)).toEqual(["g2"]);
    await open(false, "g2");
    item("groups.remove").click();
    await settle(menu);
    expect(readGroups("main")).toEqual([]);
    expect(getStorage().getValue("pageTabsClosed")).toBeUndefined();
  });

  it("will not take a locked group apart or close its tabs", async () => {
    writeGroups("main", [group("g1", ["a", "b"])]);
    writeLocks(withLock(readLocks(), groupLockKey("main", "g1"), true));
    await open();
    expect(item("groups.ungroup").disabled).toBe(true);
    expect(item("groups.remove").disabled).toBe(true);
    expect(item("groups.close_tabs").disabled).toBe(true);
    expect(item("groups.unlock")).toBeTruthy();
    item("groups.remove").click();
    await settle(menu);
    expect(readGroups("main")).toHaveLength(1);
  });

  it("previews what closes and what stays before closing", async () => {
    writeGroups("main", [group("g1", ["a", "d"])]);
    await open();
    item("groups.close_tabs").click();
    await settle(menu);
    const text = menu.shadowRoot!.textContent!;
    expect(text).toContain("ui.page_tabs.groups.close_count");
    expect(text).toContain("ui.page_tabs.groups.close_kept");
    expect(text).toContain("ui.page_tabs.groups.reason_current");
    menu
      .shadowRoot!.querySelector<HTMLButtonElement>("#confirm-close")!
      .click();
    await settle(menu);
    // The page in use (d) stays open; the group stays too.
    expect(getStorage().getValue("pageTabsClosed")).toEqual(["a"]);
    expect(readGroups("main")[0].members).toEqual(["a", "d"]);
  });

  it("Rename opens the editor on the name", async () => {
    writeGroups("main", [group("g1", ["a"])]);
    await open();
    item("groups.rename").click();
    await settle(menu);
    expect(editorEvents).toHaveLength(1);
    expect(editorEvents[0].detail).toMatchObject({
      groupId: "g1",
      anchor,
      focus: "name",
    });
  });

  it("Shift opens the appearance editor directly, with no menu", async () => {
    writeGroups("main", [group("g1", ["a"])]);
    await open(true);
    expect(menu.shadowRoot!.querySelector(".panel")).toBeNull();
    expect(editorEvents[0].detail).toMatchObject({
      groupId: "g1",
      focus: "appearance",
    });
  });
});
