import { LitElement } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStorage } from "../../../src/common/decorators/storage";
import {
  grantUnlock,
  lockEverythingAgain,
} from "../../../src/common/locks/element-lock-session";
import {
  readLocks,
  withLock,
  writeLocks,
} from "../../../src/common/locks/element-locks";
import {
  setTabAppearance,
  writeTabAppearance,
} from "../../../src/common/tabs/tab-appearance-store";
import { readGroups, writeGroups } from "../../../src/common/tabs/tab-groups";
import { groupLockKey, tabLockKey } from "../../../src/common/tabs/tab-locks";
import type { HaSectionTabs } from "../../../src/components/section-tabs/ha-section-tabs";
import { sectionSurface } from "../../../src/components/section-tabs/section-surface";
import { readAllStrips } from "../../../src/components/tabs/tab-group-state";
import {
  makeHass,
  resetTabStorage,
  settle,
  stubMatchMedia,
} from "../tabs/tab-test-helpers";

const { navigate, openLockPrompt } = vi.hoisted(() => ({
  navigate: vi.fn(),
  openLockPrompt: vi.fn(),
}));

// The test browser has no popover API; the editors this menu opens need one.
Object.assign(HTMLElement.prototype, {
  showPopover: () => undefined,
  hidePopover: () => undefined,
});

vi.mock("../../../src/common/navigate", () => ({ navigate }));
vi.mock("../../../src/components/locks/ha-lock-prompt", () => ({
  openLockPrompt,
}));
vi.mock("../../../src/components/ha-tab", () => ({}));
customElements.define("ha-tab", class extends LitElement {});
await import("../../../src/components/section-tabs/ha-section-tabs");

// The section tabs share the model, the menu events, the looks and the locks
// of the wide strip under a strip name of their own. These protect what a
// person relies on: the three ways to open the menu send the documented event
// for this surface only, a locked tab does not open until it is unlocked, a
// group keeps its saved collapsed state, hiding many tabs shows a preview
// first and never touches the open tab, and Search all tabs can find them.

const tabs = [
  { path: "/config/a", label: "Alpha" },
  { path: "/config/b", label: "Bravo" },
  { path: "/config/c", label: "Charlie" },
];

let element: HaSectionTabs | undefined;
let counter = 0;
let route = "";
let surface = "";

const mount = async (activePath = "/config/a", withHass = true) => {
  element = document.createElement("ha-section-tabs") as HaSectionTabs;
  Object.assign(element, {
    tabs,
    activePath,
    surface: route,
    localize: (key: string) => key,
    ...(withHass ? { hass: makeHass() } : {}),
  });
  document.body.append(element);
  await settle(element);
  return element;
};

const anchors = () =>
  Array.from(element!.querySelectorAll<HTMLAnchorElement>("a.section-tab"));

const events: CustomEvent[] = [];
const record = (ev: Event) => events.push(ev as CustomEvent);

beforeEach(() => {
  counter += 1;
  route = `/config/shared-${counter}`;
  surface = sectionSurface(route);
  stubMatchMedia(false);
  resetTabStorage();
  getStorage().setValue("pageTabsAppearance", undefined);
  getStorage().setValue("pageTabsGroupAppearance", undefined);
  navigate.mockClear();
  openLockPrompt.mockClear();
  events.length = 0;
  ["tab-context-menu", "tab-group-context-menu", "strip-context-menu"].forEach(
    (name) => window.addEventListener(name, record)
  );
});

afterEach(() => {
  vi.useRealTimers();
  lockEverythingAgain();
  element?.remove();
  element = undefined;
  ["tab-context-menu", "tab-group-context-menu", "strip-context-menu"].forEach(
    (name) => window.removeEventListener(name, record)
  );
});

describe("the tab menu events of a section tab", () => {
  it("opens on a right click, with the surface of this strip", async () => {
    await mount();
    anchors()[1].dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
    );
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("tab-context-menu");
    expect(events[0].detail).toMatchObject({
      tabId: "/config/b",
      shift: false,
      surface,
    });
    expect(events[0].detail.anchor).toBe(anchors()[1]);
    // Never the surface of the wide strip, which has its own menu.
    expect(events[0].detail.surface).not.toBe("main");
  });

  it("opens the look editor at once for Shift with a right click", async () => {
    await mount();
    anchors()[2].dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        shiftKey: true,
      })
    );
    expect(events[0].detail).toMatchObject({ tabId: "/config/c", shift: true });
  });

  it("opens on the menu key and on Shift with F10", async () => {
    await mount();
    anchors()[0].dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ContextMenu",
        bubbles: true,
        cancelable: true,
      })
    );
    vi.useFakeTimers();
    vi.advanceTimersByTime(500);
    anchors()[0].dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "F10",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
    expect(events.map((ev) => ev.type)).toEqual([
      "tab-context-menu",
      "tab-context-menu",
    ]);
    expect(events[1].detail).toMatchObject({ tabId: "/config/a", surface });
  });

  it("opens on a long press with a finger, and the lift is not a tap", async () => {
    await mount();
    vi.useFakeTimers();
    const down = new MouseEvent("pointerdown", {
      bubbles: true,
      clientX: 10,
      clientY: 10,
    });
    Object.defineProperty(down, "pointerType", { value: "touch" });
    anchors()[1].dispatchEvent(down);
    vi.advanceTimersByTime(650);
    expect(events).toHaveLength(1);
    expect(events[0].detail).toMatchObject({ tabId: "/config/b", surface });
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    anchors()[1].dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("is cancelled when the finger moves, so a scroll is not a long press", async () => {
    await mount();
    vi.useFakeTimers();
    const down = new MouseEvent("pointerdown", {
      bubbles: true,
      clientX: 10,
      clientY: 10,
    });
    Object.defineProperty(down, "pointerType", { value: "touch" });
    anchors()[1].dispatchEvent(down);
    anchors()[1].dispatchEvent(
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 10,
        clientY: 60,
      })
    );
    vi.advanceTimersByTime(700);
    expect(events).toHaveLength(0);
  });

  it("leaves the browser menu alone when no instance is given", async () => {
    await mount("/config/a", false);
    const ev = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    anchors()[1].dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(events).toHaveLength(0);
  });

  it("sends the strip menu event for the empty row", async () => {
    await mount();
    element!
      .querySelector(".strip")!
      .dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
      );
    expect(events[0].type).toBe("strip-context-menu");
    expect(events[0].detail.surface).toBe(surface);
  });
});

describe("locks", () => {
  it("marks a locked tab, drops its address and does not open it", async () => {
    writeLocks(withLock(readLocks(), tabLockKey(surface, "/config/b"), true));
    await mount();
    const locked = anchors()[1];
    expect(locked.hasAttribute("href")).toBe(false);
    expect(locked.querySelector(".lock-mark")).not.toBeNull();
    expect(locked.getAttribute("aria-label")).toBe(
      "ui.page_tabs.dock.locked_name"
    );
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    locked.dispatchEvent(click);
    await settle(element!);
    expect(click.defaultPrevented).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    expect(openLockPrompt).toHaveBeenCalledOnce();
    expect(openLockPrompt.mock.calls[0][0]).toBe(
      tabLockKey(surface, "/config/b")
    );
    // The other tabs still open.
    expect(anchors()[0].getAttribute("href")).toBe("/config/a");
  });

  it("opens the tab once the lock prompt succeeds", async () => {
    writeLocks(withLock(readLocks(), tabLockKey(surface, "/config/b"), true));
    await mount();
    anchors()[1].dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );
    await settle(element!);
    grantUnlock(tabLockKey(surface, "/config/b"), {
      kind: "minutes",
      minutes: 5,
    });
    openLockPrompt.mock.calls[0][2].onSuccess();
    expect(navigate).toHaveBeenCalledWith("/config/b", { replace: true });
  });

  it("opens a locked tab with Enter through the same prompt", async () => {
    writeLocks(withLock(readLocks(), tabLockKey(surface, "/config/c"), true));
    await mount();
    anchors()[2].dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      })
    );
    await settle(element!);
    expect(openLockPrompt).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("locks every tab of a locked group", async () => {
    writeGroups(surface, [
      {
        id: "g1",
        name: "Group",
        colour: "blue",
        collapsed: false,
        members: ["/config/a", "/config/b"],
      },
    ]);
    writeLocks(withLock(readLocks(), groupLockKey(surface, "g1"), true));
    await mount("/config/c");
    expect(
      anchors().map((anchor) => anchor.classList.contains("locked"))
    ).toEqual([true, true, false]);
  });

  it("asks to unlock before the keyboard hides a locked tab", async () => {
    writeLocks(withLock(readLocks(), tabLockKey(surface, "/config/b"), true));
    await mount();
    anchors()[1].dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "H",
        code: "KeyH",
        altKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
    await settle(element!);
    expect(openLockPrompt).toHaveBeenCalledOnce();
    expect(anchors()).toHaveLength(3);
  });
});

describe("groups", () => {
  const saved = (collapsed = false) => [
    {
      id: "g1",
      name: "Pair",
      colour: "green" as const,
      collapsed,
      members: ["/config/b", "/config/c"],
    },
  ];

  it("draws a header chip with name and count before the members", async () => {
    writeGroups(surface, saved());
    await mount();
    const chips = element!.querySelectorAll<HTMLButtonElement>(".group-chip");
    expect(chips).toHaveLength(1);
    expect(chips[0].querySelector(".group-name")!.textContent).toBe("Pair");
    expect(chips[0].querySelector(".group-count")!.textContent).toBe("2");
    expect(chips[0].getAttribute("aria-expanded")).toBe("true");
    const order = Array.from(
      element!.querySelectorAll<HTMLElement>(".strip > *")
    ).map((el) => el.dataset.path ?? `group:${el.dataset.group}`);
    expect(order).toEqual(["/config/a", "group:g1", "/config/b", "/config/c"]);
  });

  it("collapses with the chip, saves it, and keeps the open tab in view", async () => {
    writeGroups(surface, saved());
    await mount("/config/c");
    element!.querySelector<HTMLButtonElement>(".group-chip")!.click();
    await settle(element!);
    expect(readGroups(surface)[0].collapsed).toBe(true);
    // The open tab of a collapsed group stays; the other member goes to the list.
    expect(anchors().map((anchor) => anchor.dataset.path)).toEqual([
      "/config/a",
      "/config/c",
    ]);
    const collapsedList = Array.from(
      element!.querySelectorAll(".more-popover h3")
    ).map((heading) => heading.textContent!.trim());
    expect(collapsedList).toContain(
      "ui.components.section_tabs.in_collapsed_groups"
    );
    expect(
      element!.querySelector(".more-popover a.more-link[data-path='/config/b']")
    ).not.toBeNull();
  });

  it("opens the menu of a group header from its own gestures", async () => {
    writeGroups(surface, saved());
    await mount();
    element!
      .querySelector(".group-chip")!
      .dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
      );
    expect(events[0].type).toBe("tab-group-context-menu");
    expect(events[0].detail).toMatchObject({ groupId: "g1", surface });
  });

  it("keeps a group of another surface out of this row", async () => {
    writeGroups(sectionSurface("/config/elsewhere"), saved());
    await mount();
    expect(element!.querySelector(".group-chip")).toBeNull();
  });

  it("moves a tab out of its group and saves the group", async () => {
    writeGroups(surface, saved());
    await mount();
    // Alt and the arrow past the last member leaves the group.
    anchors()[2].dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        altKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
    await settle(element!);
    expect(readGroups(surface)[0].members).toEqual(["/config/b"]);
  });

  it("takes a tab out of its group when it is pinned", async () => {
    writeGroups(surface, saved());
    await mount();
    anchors()[1].dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "P",
        code: "KeyP",
        altKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
    await settle(element!);
    expect(readGroups(surface)[0].members).toEqual(["/config/c"]);
    expect(anchors()[0].dataset.path).toBe("/config/b");
  });
});

describe("the look of a tab", () => {
  it("applies the saved look and label of a tab under the section's strip", async () => {
    writeTabAppearance(
      setTabAppearance(
        setTabAppearance({}, surface, "/config/b", "color", "#ff0000"),
        surface,
        "/config/b",
        "label",
        "Second"
      )
    );
    await mount();
    expect(anchors()[1].style.getPropertyValue("--tab-color")).toBe("#ff0000");
    expect(
      (anchors()[1].querySelector("ha-tab") as unknown as { name: string }).name
    ).toBe("Second");
    // The look of one strip never reaches another.
    expect(anchors()[0].style.getPropertyValue("--tab-color")).toBe("");
  });
});

describe("Search all tabs", () => {
  it("lists the tabs of the surface with their labels", async () => {
    await mount();
    const strips = readAllStrips(makeHass(), (name) => name);
    const strip = strips.find((item) => item.surface === surface);
    expect(strip?.tabs.map((tab) => tab.label)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
    ]);
    expect(strip?.surfaceLabel).toBe(
      "ui.components.section_tabs.surface_label"
    );
  });

  it("opens the section a result names, for this surface only", async () => {
    await mount();
    window.dispatchEvent(
      new CustomEvent("tab-search-activate", {
        detail: { surface: sectionSurface("/config/other"), id: "/config/b" },
      })
    );
    expect(navigate).not.toHaveBeenCalled();
    window.dispatchEvent(
      new CustomEvent("tab-search-activate", {
        detail: { surface, id: "/config/b" },
      })
    );
    expect(navigate).toHaveBeenCalledWith("/config/b", { replace: true });
  });
});

describe("hiding tabs by text from the menu", () => {
  const openStripMenu = async () => {
    element!
      .querySelector(".strip")!
      .dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
      );
    const menu = element!.querySelector("ha-section-tab-menu")!;
    await settle(menu as unknown as LitElement);
    return menu;
  };

  const item = (menu: Element, key: string) =>
    Array.from(
      menu.shadowRoot!.querySelectorAll<HTMLButtonElement>("[role=menuitem]")
    ).find((button) => button.textContent!.includes(key))!;

  it("previews before it hides, protects the open tab and offers Undo", async () => {
    await mount("/config/a");
    const toasts: CustomEvent[] = [];
    element!.addEventListener("hass-notification", (ev) =>
      toasts.push(ev as CustomEvent)
    );
    const menu = await openStripMenu();
    item(menu, "section_tabs.hide_containing").click();
    const dialog = menu.shadowRoot!.querySelector("ha-section-hide-dialog")!;
    await settle(dialog as unknown as LitElement);
    const text = () => dialog.shadowRoot!.textContent!;
    // No text yet: nothing hides and the dialog says why.
    expect(text()).toContain("blocked_empty");
    const confirm = () =>
      Array.from(
        dialog.shadowRoot!.querySelectorAll<HTMLButtonElement>(".text-button")
      ).find((button) => !button.classList.contains("quiet"))!;
    expect(confirm().disabled).toBe(true);

    const search = dialog.shadowRoot!.querySelector(
      "ha-input-search"
    ) as HTMLElement & { value: string };
    search.value = "/^(alpha|bravo)$/i";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await settle(dialog as unknown as LitElement);
    // Alpha is the open tab, so only Bravo would hide, and the preview says so.
    expect(text()).toContain("mode_pattern");
    expect(dialog.shadowRoot!.querySelector(".list")!.textContent).toContain(
      "Bravo"
    );
    expect(dialog.shadowRoot!.querySelectorAll(".kept")).toHaveLength(1);
    expect(dialog.shadowRoot!.querySelector(".kept")!.textContent).toContain(
      "Alpha"
    );
    // Nothing hid yet.
    expect(anchors()).toHaveLength(3);

    confirm().click();
    await settle(element!);
    expect(anchors().map((anchor) => anchor.dataset.path)).toEqual([
      "/config/a",
      "/config/c",
    ]);
    const saved = JSON.parse(localStorage.getItem("sectionTabs")!);
    expect(saved[route].hidden).toEqual(["/config/b"]);
    expect(toasts).toHaveLength(1);
    toasts[0].detail.action.action();
    await settle(element!);
    expect(anchors()).toHaveLength(3);
  });

  it("hides nothing for a pattern that cannot be used", async () => {
    await mount("/config/a");
    const menu = await openStripMenu();
    item(menu, "section_tabs.hide_not_containing").click();
    const dialog = menu.shadowRoot!.querySelector("ha-section-hide-dialog")!;
    await settle(dialog as unknown as LitElement);
    const search = dialog.shadowRoot!.querySelector(
      "ha-input-search"
    ) as HTMLElement & { value: string };
    search.value = "/(/";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await settle(dialog as unknown as LitElement);
    expect(dialog.shadowRoot!.textContent).toContain("blocked_invalid");
    expect(anchors()).toHaveLength(3);
  });
});

describe("the menu of a tab", () => {
  it("offers hide where the wide strip says close, and never hides the open tab", async () => {
    await mount("/config/a");
    anchors()[0].dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
    );
    const menu = element!.querySelector("ha-section-tab-menu")!;
    await settle(menu as unknown as LitElement);
    const labels = Array.from(
      menu.shadowRoot!.querySelectorAll<HTMLButtonElement>("[role=menuitem]")
    );
    const text = labels.map((button) => button.textContent!.trim());
    expect(text).toContain("ui.components.section_tabs.hide_tab");
    expect(text).not.toContain("ui.page_tabs.menu.close_tab");
    const hide = labels.find((button) =>
      button.textContent!.includes("section_tabs.hide_tab")
    )!;
    // The open tab stays in the row.
    expect(hide.getAttribute("aria-disabled")).toBe("true");
    expect(text).toContain("ui.page_tabs.menu.move_into_group");
    expect(text).toContain("ui.page_tabs.menu.edit_appearance");
    expect(text).toContain("ui.page_tabs.menu.lock_tab");
  });

  it("pins from the menu and saves it for the surface", async () => {
    await mount("/config/a");
    anchors()[2].dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
    );
    const menu = element!.querySelector("ha-section-tab-menu")!;
    await settle(menu as unknown as LitElement);
    Array.from(
      menu.shadowRoot!.querySelectorAll<HTMLButtonElement>("[role=menuitem]")
    )
      .find((button) => button.textContent!.includes("menu.pin_tab"))!
      .click();
    await settle(element!);
    const saved = JSON.parse(localStorage.getItem("sectionTabs")!);
    expect(saved[route].pinned).toEqual(["/config/c"]);
    // Only this surface's store changed: the wide strip's lists are untouched.
    expect(getStorage().getValue("pageTabsPinned")).toBeUndefined();
    expect(getStorage().getValue("pageTabsOrder")).toBeUndefined();
    expect(getStorage().getValue("pageTabsClosed")).toBeUndefined();
  });
});

describe("moving a tab into a group", () => {
  it("opens the shared picker for this surface and saves the group", async () => {
    writeGroups(surface, [
      {
        id: "g1",
        name: "Pair",
        colour: "green",
        collapsed: false,
        members: ["/config/b"],
      },
    ]);
    await mount("/config/c");
    anchors()[0].dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
    );
    const menu = element!.querySelector("ha-section-tab-menu")!;
    await settle(menu as unknown as LitElement);
    Array.from(
      menu.shadowRoot!.querySelectorAll<HTMLButtonElement>("[role=menuitem]")
    )
      .find((button) => button.textContent!.includes("move_into_group"))!
      .click();
    const picker = menu.shadowRoot!.querySelector("ha-tab-group-picker")!;
    await settle(picker as unknown as LitElement);
    const row = Array.from(
      picker.shadowRoot!.querySelectorAll<HTMLButtonElement>("button.row")
    ).find((button) => button.textContent!.includes("Pair"))!;
    row.click();
    await settle(element!);
    expect(readGroups(surface)[0].members).toEqual(["/config/b", "/config/a"]);
    // The wide strip's groups are a different list.
    expect(readGroups("main")).toEqual([]);
    expect(
      Array.from(element!.querySelectorAll<HTMLElement>(".strip > *")).map(
        (el) => el.dataset.path ?? `group:${el.dataset.group}`
      )
    ).toEqual(["group:g1", "/config/b", "/config/a", "/config/c"]);
  });
});
