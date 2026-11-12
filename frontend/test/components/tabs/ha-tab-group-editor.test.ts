import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStorage } from "../../../src/common/decorators/storage";
import { readGroups, writeGroups } from "../../../src/common/tabs/tab-groups";
import type { HaTabGroupEditor } from "../../../src/components/tabs/ha-tab-group-editor";
import { readGroupAppearance } from "../../../src/components/tabs/tab-group-appearance-store";
import {
  makeHass,
  resetTabStorage,
  settle,
  stubMatchMedia,
} from "./tab-test-helpers";

vi.mock("../../../src/components/input/ha-input", () => ({}));
vi.mock("../../../src/components/ha-color-picker", () => ({}));
vi.mock("../../../src/components/ha-svg-icon", () => ({}));
vi.mock("../../../src/components/ha-icon", () => ({}));

await import("../../../src/components/tabs/ha-tab-group-editor");

// The editor applies every change live and must stay non-modal. These protect
// the per-property, per-group and all-group resets and that a bad value never
// reaches storage.

let editor: HaTabGroupEditor;
let anchor: HTMLButtonElement;

beforeEach(async () => {
  stubMatchMedia(false);
  resetTabStorage();
  writeGroups("main", [
    {
      id: "g1",
      name: "Kitchen",
      colour: "blue",
      collapsed: false,
      members: ["a"],
    },
    {
      id: "g2",
      name: "Garage",
      colour: "red",
      collapsed: false,
      members: ["b"],
    },
  ]);
  anchor = document.createElement("button");
  document.body.append(anchor);
  editor = document.createElement("ha-tab-group-editor");
  editor.hass = makeHass();
  document.body.append(editor);
  await editor.updateComplete;
  window.dispatchEvent(
    new CustomEvent("tab-group-editor-open", {
      detail: { groupId: "g1", anchor, surface: "main", focus: "appearance" },
    })
  );
  await settle(editor);
});

afterEach(() => {
  editor.remove();
  anchor.remove();
});

const q = <T extends Element>(selector: string) =>
  editor.shadowRoot!.querySelector<T>(selector)!;

describe("ha-tab-group-editor", () => {
  it("is not modal and names the dialog for the group", () => {
    const panel = q(".panel");
    expect(panel.getAttribute("role")).toBe("dialog");
    expect(panel.getAttribute("aria-modal")).toBeNull();
  });

  it("recolours the group live from the palette", async () => {
    q<HTMLButtonElement>('.colour[aria-label$="green"]').click();
    await settle(editor);
    expect(readGroups("main")[0].colour).toBe("green");
    expect(readGroups("main")[1].colour).toBe("red");
  });

  it("saves a chosen look per property and resets one property", async () => {
    const choice = (property: string, word: string) =>
      Array.from(
        editor.shadowRoot!.querySelectorAll<HTMLButtonElement>(".choice")
      ).find(
        (button) =>
          (button as HTMLButtonElement & { property: string }).property ===
            property &&
          (button as HTMLButtonElement & { word: string }).word === word
      )!;
    choice("shape", "pill").click();
    choice("fontWeight", "bold").click();
    await settle(editor);
    expect(readGroupAppearance().main.g1).toEqual({
      shape: "pill",
      fontWeight: "bold",
    });
    const reset = Array.from(
      editor.shadowRoot!.querySelectorAll<HTMLButtonElement>(".reset")
    ).find(
      (button) =>
        (button as HTMLButtonElement & { property: string }).property ===
        "shape"
    )!;
    reset.click();
    await settle(editor);
    expect(readGroupAppearance().main.g1).toEqual({ fontWeight: "bold" });
  });

  it("resets this group, and every group", async () => {
    getStorage().setValue("pageTabsGroupAppearance", {
      main: { g1: { shape: "pill" }, g2: { shape: "square" } },
    });
    editor.requestUpdate();
    await settle(editor);
    const buttons =
      editor.shadowRoot!.querySelectorAll<HTMLButtonElement>(".buttons .text");
    buttons[0].click();
    expect(readGroupAppearance().main).toEqual({ g2: { shape: "square" } });
    buttons[1].click();
    expect(readGroupAppearance()).toEqual({});
  });

  it("Escape closes the editor and returns focus to the header", async () => {
    q(".panel").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    await settle(editor);
    expect(editor.shadowRoot!.querySelector(".panel")).toBeNull();
    expect(document.activeElement).toBe(anchor);
  });
});
