import { LitElement } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HaSectionTabs } from "../../../src/components/section-tabs/ha-section-tabs";

vi.mock("../../../src/components/ha-tab", () => ({}));
customElements.define("ha-tab", class extends LitElement {});
await import("../../../src/components/section-tabs/ha-section-tabs");

const tabs = [
  { path: "/config/a", label: "Alpha" },
  { path: "/config/b", label: "Beta" },
  { path: "/config/c", label: "Gamma" },
];

let element: HaSectionTabs | undefined;

// The saved choices are cached for the whole page, so each test has its own.
let counter = 0;
let surface = "";

const mount = async (activePath = "/config/a") => {
  element = document.createElement("ha-section-tabs") as HaSectionTabs;
  Object.assign(element, {
    tabs,
    activePath,
    surface,
    localize: (key: string) => key,
  });
  document.body.append(element);
  await element.updateComplete;
  return element;
};

const anchors = () =>
  Array.from(element!.querySelectorAll<HTMLAnchorElement>("a.section-tab"));

const press = (target: Element, init: KeyboardEventInit) => {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })
  );
};

beforeEach(() => {
  counter += 1;
  surface = `/config/test-${counter}`;
});

afterEach(() => {
  element?.remove();
  element = undefined;
});

describe("ha-section-tabs", () => {
  it("renders a tablist of tabs that stay real links", async () => {
    await mount("/config/b");
    const list = element!.querySelector("[role=tablist]")!;
    expect(list.getAttribute("aria-label")).toBeTruthy();
    expect(anchors().map((a) => a.getAttribute("role"))).toEqual([
      "tab",
      "tab",
      "tab",
    ]);
    expect(anchors().map((a) => a.getAttribute("href"))).toEqual(
      tabs.map((tab) => tab.path)
    );
    expect(anchors().map((a) => a.getAttribute("aria-selected"))).toEqual([
      "false",
      "true",
      "false",
    ]);
    // Every tab points at the one panel, which the layout gives that id.
    expect(
      new Set(anchors().map((a) => a.getAttribute("aria-controls")))
    ).toEqual(new Set(["section-panel"]));
  });

  it("keeps only the selected tab in the tab order", async () => {
    await mount("/config/b");
    expect(anchors().map((a) => a.tabIndex)).toEqual([-1, 0, -1]);
  });

  it("moves focus with the arrow keys, Home and End", async () => {
    await mount("/config/a");
    const [first, second, third] = anchors();
    first.focus();
    press(first, { key: "ArrowRight" });
    expect(document.activeElement).toBe(second);
    press(second, { key: "End" });
    expect(document.activeElement).toBe(third);
    press(third, { key: "ArrowRight" });
    expect(document.activeElement).toBe(first);
    press(first, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(third);
    press(third, { key: "Home" });
    expect(document.activeElement).toBe(first);
  });

  it("opens a tab with Space as well as Enter", async () => {
    await mount("/config/a");
    const second = anchors()[1];
    const clicked = vi.fn((ev: Event) => ev.preventDefault());
    second.addEventListener("click", clicked);
    press(second, { key: " " });
    expect(clicked).toHaveBeenCalledOnce();
  });

  it("pins with Alt, Shift and P and saves it for the surface", async () => {
    await mount("/config/a");
    press(anchors()[2], {
      key: "P",
      code: "KeyP",
      altKey: true,
      shiftKey: true,
    });
    await element!.updateComplete;
    expect(anchors().map((a) => a.dataset.path)).toEqual([
      "/config/c",
      "/config/a",
      "/config/b",
    ]);
    const saved = JSON.parse(localStorage.getItem("sectionTabs")!);
    expect(saved[surface].pinned).toEqual(["/config/c"]);
  });

  it("hides a tab, lists it for restoring and restores it", async () => {
    await mount("/config/a");
    press(anchors()[1], {
      key: "H",
      code: "KeyH",
      altKey: true,
      shiftKey: true,
    });
    await element!.updateComplete;
    expect(anchors().map((a) => a.dataset.path)).toEqual([
      "/config/a",
      "/config/c",
    ]);
    const restore = Array.from(
      element!.querySelectorAll<HTMLButtonElement>(".more-header .text-button")
    );
    expect(restore).toHaveLength(1);
    restore[0].click();
    await element!.updateComplete;
    expect(anchors()).toHaveLength(3);
    expect(element!.querySelector(".more-header .text-button")).toBeNull();
  });

  it("never hides the open tab", async () => {
    await mount("/config/a");
    press(anchors()[0], {
      key: "H",
      code: "KeyH",
      altKey: true,
      shiftKey: true,
    });
    await element!.updateComplete;
    expect(anchors()).toHaveLength(3);
  });

  it("reorders with Alt and the arrows", async () => {
    await mount("/config/a");
    press(anchors()[1], { key: "ArrowLeft", altKey: true });
    await element!.updateComplete;
    expect(anchors().map((a) => a.dataset.path)).toEqual([
      "/config/b",
      "/config/a",
      "/config/c",
    ]);
  });

  it("restores the saved choices on the next visit", async () => {
    await mount("/config/a");
    press(anchors()[2], { key: "ArrowLeft", altKey: true });
    await element!.updateComplete;
    press(anchors()[1], { key: "ArrowLeft", altKey: true });
    await element!.updateComplete;
    element!.remove();
    await mount("/config/a");
    expect(anchors().map((a) => a.dataset.path)).toEqual([
      "/config/c",
      "/config/a",
      "/config/b",
    ]);
  });
});
