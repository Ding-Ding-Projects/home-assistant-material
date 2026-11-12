import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStorage } from "../../../src/common/decorators/storage";
import { readGroups, writeGroups } from "../../../src/common/tabs/tab-groups";
import type { HaTabGroupPicker } from "../../../src/components/tabs/ha-tab-group-picker";
import {
  makeHass,
  resetTabStorage,
  settle,
  stubMatchMedia,
} from "./tab-test-helpers";

// The fields and the colour picker are heavy shared components; the picker's
// own behaviour is what is tested here, so they stay plain elements.
vi.mock("../../../src/components/input/ha-input", () => ({}));
vi.mock("../../../src/components/input/ha-input-search", () => ({}));
vi.mock("../../../src/components/ha-color-picker", () => ({}));
vi.mock("../../../src/components/ha-svg-icon", () => ({}));

await import("../../../src/components/tabs/ha-tab-group-picker");

// The picker is the only way to put a tab in a group without dragging, so
// these protect what a person relies on: the list and its filter, the new
// group path, taking tabs out, the honest refusal for pinned tabs, and
// keyboard operation with focus returned to the tab.

let picker: HaTabGroupPicker;
let anchor: HTMLButtonElement;

const group = (id: string, name: string, members: string[]) => ({
  id,
  name,
  colour: "blue" as const,
  collapsed: false,
  members,
});

const open = async (detail: Record<string, unknown> = {}) => {
  window.dispatchEvent(
    new CustomEvent("tab-group-picker-open", {
      detail: { tabIds: ["a"], anchor, surface: "main", ...detail },
    })
  );
  await settle(picker);
};

const q = <T extends Element>(selector: string) =>
  picker.shadowRoot!.querySelector<T>(selector)!;

const type = async (selector: string, value: string) => {
  const field = q<HTMLElement & { value: string }>(selector);
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  await settle(picker);
};

beforeEach(async () => {
  stubMatchMedia(false);
  resetTabStorage();
  anchor = document.createElement("button");
  document.body.append(anchor);
  picker = document.createElement("ha-tab-group-picker");
  picker.hass = makeHass();
  document.body.append(picker);
  await picker.updateComplete;
});

afterEach(() => {
  picker.remove();
  anchor.remove();
});

describe("ha-tab-group-picker", () => {
  it("shows an honest empty state when no group exists", async () => {
    await open();
    expect(q(".list")).toBeTruthy();
    expect(picker.shadowRoot!.textContent).toContain(
      "ui.page_tabs.group_picker.no_groups"
    );
    // Only the No group row, and it cannot do anything for an ungrouped tab.
    const rows =
      picker.shadowRoot!.querySelectorAll<HTMLButtonElement>(".list .row");
    expect(rows).toHaveLength(1);
    expect(rows[0].disabled).toBe(true);
  });

  it("lists groups with their member counts and filters by name", async () => {
    writeGroups("main", [
      group("g1", "Kitchen", ["b"]),
      group("g2", "Garage", []),
    ]);
    await open();
    const text = () => picker.shadowRoot!.querySelector(".list")!.textContent;
    expect(text()).toContain("Kitchen");
    expect(text()).toContain("Garage");
    await type("#picker-search", "gar");
    expect(text()).not.toContain("Kitchen");
    expect(text()).toContain("Garage");
    await type("#picker-search", "/^K/");
    expect(text()).toContain("Kitchen");
    expect(text()).not.toContain("Garage");
    await type("#picker-search", "nothing");
    expect(picker.shadowRoot!.textContent).toContain(
      "ui.page_tabs.group_picker.no_match"
    );
  });

  it("moves the tab into the chosen group and returns focus to the tab", async () => {
    writeGroups("main", [group("g1", "Kitchen", [])]);
    await open();
    const row =
      picker.shadowRoot!.querySelectorAll<HTMLButtonElement>(".list .row")[1];
    row.click();
    await settle(picker);
    expect(readGroups("main")[0].members).toEqual(["a"]);
    expect(picker.shadowRoot!.querySelector(".panel")).toBeNull();
    expect(document.activeElement).toBe(anchor);
  });

  it("takes the tab out with No group", async () => {
    writeGroups("main", [group("g1", "Kitchen", ["a"])]);
    await open();
    picker.shadowRoot!.querySelector<HTMLButtonElement>(".list .row")!.click();
    await settle(picker);
    expect(readGroups("main")[0].members).toEqual([]);
  });

  it("makes a new group and moves the tabs in", async () => {
    await open({ tabIds: ["a", "b"], create: true });
    const create = q<HTMLButtonElement>(".primary");
    expect(create.disabled).toBe(true);
    await type("#new-name", "Rooms");
    q<HTMLButtonElement>('.colour[aria-label$="green"]').click();
    await settle(picker);
    q<HTMLButtonElement>(".primary").click();
    await settle(picker);
    expect(readGroups("main")).toEqual([
      {
        id: "g1",
        name: "Rooms",
        colour: "green",
        collapsed: false,
        members: ["a", "b"],
      },
    ]);
  });

  it("refuses a pinned tab in words and moves nothing", async () => {
    getStorage().setValue("pageTabsPinned", ["a"]);
    writeGroups("main", [group("g1", "Kitchen", [])]);
    await open({ tabIds: ["a"] });
    expect(picker.shadowRoot!.textContent).toContain(
      "ui.page_tabs.group_picker.all_pinned"
    );
    const rows =
      picker.shadowRoot!.querySelectorAll<HTMLButtonElement>(".list .row");
    expect(rows[1].disabled).toBe(true);
    expect(q<HTMLButtonElement>(".new-group").disabled).toBe(true);
    expect(readGroups("main")[0].members).toEqual([]);
  });

  it("moves only the tabs that are not pinned and says so", async () => {
    getStorage().setValue("pageTabsPinned", ["a"]);
    writeGroups("main", [group("g1", "Kitchen", [])]);
    await open({ tabIds: ["a", "b"] });
    expect(picker.shadowRoot!.textContent).toContain(
      "ui.page_tabs.group_picker.pinned_refused"
    );
    picker
      .shadowRoot!.querySelectorAll<HTMLButtonElement>(".list .row")[1]
      .click();
    await settle(picker);
    expect(readGroups("main")[0].members).toEqual(["b"]);
  });

  it("Escape cancels without changing anything and returns focus", async () => {
    writeGroups("main", [group("g1", "Kitchen", [])]);
    await open();
    q(".panel").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    await settle(picker);
    expect(picker.shadowRoot!.querySelector(".panel")).toBeNull();
    expect(readGroups("main")[0].members).toEqual([]);
    expect(document.activeElement).toBe(anchor);
  });

  it("moves between rows with the arrow keys", async () => {
    writeGroups("main", [
      group("g1", "Kitchen", []),
      group("g2", "Garage", []),
    ]);
    await open();
    const rows = picker.shadowRoot!.querySelectorAll<HTMLButtonElement>(
      ".list .row:not([disabled])"
    );
    rows[0].focus();
    rows[0].dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
    );
    expect(picker.shadowRoot!.activeElement).toBe(rows[1]);
    rows[1].dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true })
    );
    expect(picker.shadowRoot!.activeElement).toBe(rows[rows.length - 1]);
  });

  it("ignores a request for another strip", async () => {
    await open({ surface: "other" });
    expect(picker.shadowRoot!.querySelector(".panel")).toBeNull();
  });

  it("is a bottom sheet at phone width", async () => {
    picker.remove();
    stubMatchMedia(true);
    picker = document.createElement("ha-tab-group-picker");
    picker.hass = makeHass();
    document.body.append(picker);
    await picker.updateComplete;
    await open();
    expect(q(".panel").classList.contains("sheet")).toBe(true);
  });
});
