import type { LitElement } from "lit";
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
import type { HaPhoneBar } from "../../../src/components/phone/ha-phone-bar";
import {
  makeHass,
  resetTabStorage,
  settle,
  stubMatchMedia,
} from "../tabs/tab-test-helpers";

// The test browser has no popover API; the panels the sheet opens need one.
Object.assign(HTMLElement.prototype, {
  showPopover: () => undefined,
  hidePopover: () => undefined,
});

const { navigate, openLockPrompt, openLockWizard } = vi.hoisted(() => ({
  navigate: vi.fn(),
  openLockPrompt: vi.fn(),
  openLockWizard: vi.fn(),
}));

// What the New tab list offers; the real entries need a full account.
const offered = vi.hoisted(() => ({
  settings: [
    { path: "/config/automation", title: "Automations", iconPath: "m-auto" },
  ],
  tools: [
    {
      path: "/config/tools/converter",
      title: "File converter",
      iconPath: "m-conv",
    },
  ],
}));

vi.mock("../../../src/common/navigate", () => ({ navigate }));
vi.mock("../../../src/components/page-catalog-entries", () => ({
  computeSettingsEntries: () => offered.settings,
  computeToolEntries: () => offered.tools,
  loadCatalogTranslations: async () => undefined,
}));
vi.mock("../../../src/components/locks/ha-lock-prompt", () => ({
  openLockPrompt,
}));
vi.mock("../../../src/components/locks/ha-lock-wizard", () => ({
  openLockWizard,
}));
await import("../../../src/components/phone/ha-phone-bar");
const { chooseDestination } =
  await import("../../../src/components/tabs/destination-tabs");

// The Pages sheet shows the same pages as the wide strip, so these protect
// what a person on a phone relies on: a locked page does not open and cannot
// be closed until it is unlocked, groups are sections that fold, every change
// is written to the stores the wide strip reads, and a page keeps the look it
// was given.

let bar: HaPhoneBar;

const sheet = () => bar.shadowRoot!;

const titles = () =>
  Array.from(sheet().querySelectorAll(".card .card-title")).map((el) =>
    el.textContent!.trim()
  );

const card = (title: string) =>
  Array.from(sheet().querySelectorAll<HTMLElement>(".card")).find(
    (el) => el.querySelector(".card-title")!.textContent!.trim() === title
  )!;

const group = (id: string, members: string[], collapsed = false) => ({
  id,
  name: "Pair",
  colour: "green" as const,
  collapsed,
  members,
});

const mount = async () => {
  bar = document.createElement("ha-phone-bar") as HaPhoneBar;
  bar.hass = makeHass();
  bar.phone = true;
  document.body.append(bar);
  await settle(bar);
};

const openActions = async (title: string) => {
  card(title).querySelector<HTMLButtonElement>(".more")!.click();
  await settle(bar);
  return sheet().querySelector("ha-phone-tab-actions")!;
};

const chooseAction = async (actions: Element, key: string) => {
  Array.from(actions.shadowRoot!.querySelectorAll<HTMLButtonElement>(".row"))
    .find((row) => row.textContent!.includes(key))!
    .click();
  await settle(bar);
};

beforeEach(() => {
  stubMatchMedia(false);
  resetTabStorage();
  getStorage().setValue("pageTabsAppearance", undefined);
  navigate.mockClear();
  openLockPrompt.mockClear();
  openLockWizard.mockClear();
});

afterEach(() => {
  lockEverythingAgain();
  bar?.remove();
});

describe("the sheet's sections", () => {
  it("lists the pinned pages, then the groups, then the pages in no group", async () => {
    getStorage().setValue("pageTabsPinned", ["c"]);
    writeGroups("main", [group("g1", ["a", "b"])]);
    await mount();
    expect(titles()).toEqual(["Charlie", "Alpha", "Bravo", "Delta"]);
    const sections = Array.from(sheet().querySelectorAll("section.open-group"));
    expect(sections.map((el) => el.getAttribute("aria-labelledby"))).toEqual([
      "open-pinned",
      "group-g1",
      "open-pages",
    ]);
    const toggle = sheet().querySelector(".group-toggle")!;
    expect(toggle.querySelector(".group-name")!.textContent).toBe("Pair");
    expect(toggle.querySelector(".group-count")!.textContent).toBe("2");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    // The group carries its colour, like the header of the wide strip.
    expect(
      sections[1].getAttribute("style") ??
        (sections[1] as HTMLElement).style.cssText
    ).toContain("--group-colour");
  });

  it("shows plain cards when there is no group and nothing is pinned", async () => {
    await mount();
    expect(sheet().querySelector(".group-toggle")).toBeNull();
    expect(sheet().querySelector("section.open-group")).toBeNull();
    expect(titles()).toEqual(["Alpha", "Bravo", "Charlie", "Delta"]);
  });

  it("folds a group, saves it, and a search still finds what is inside", async () => {
    writeGroups("main", [group("g1", ["a", "b"])]);
    await mount();
    sheet().querySelector<HTMLButtonElement>(".group-toggle")!.click();
    await settle(bar);
    expect(readGroups("main")[0].collapsed).toBe(true);
    expect(titles()).toEqual(["Charlie", "Delta"]);
    expect(
      sheet().querySelector(".group-toggle")!.getAttribute("aria-expanded")
    ).toBe("false");

    const search = sheet().querySelector("#sheet-search") as HTMLElement & {
      value: string;
    };
    search.value = "alpha";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await settle(bar);
    expect(titles()).toEqual(["Alpha"]);
    // A search never changes the saved state of the group.
    expect(readGroups("main")[0].collapsed).toBe(true);
  });

  it("opens the menu of a group header with the wide strip's own event", async () => {
    writeGroups("main", [group("g1", ["a", "b"])]);
    await mount();
    const seen: CustomEvent[] = [];
    const record = (ev: Event) => seen.push(ev as CustomEvent);
    window.addEventListener("tab-group-context-menu", record);
    sheet().querySelector<HTMLButtonElement>(".group-more")!.click();
    window.removeEventListener("tab-group-context-menu", record);
    expect(seen).toHaveLength(1);
    expect(seen[0].detail).toMatchObject({ groupId: "g1", surface: "main" });
    expect(seen[0].detail.anchor.classList.contains("group-bar")).toBe(true);
  });

  it("keeps a group of another strip out of the sheet", async () => {
    writeGroups("section:/config/x", [group("g9", ["a", "b"])]);
    await mount();
    expect(sheet().querySelector(".group-toggle")).toBeNull();
  });
});

describe("locks", () => {
  it("marks a locked page, drops its close button and does not open it", async () => {
    writeLocks(withLock(readLocks(), tabLockKey("main", "a"), true));
    await mount();
    const locked = card("Alpha");
    expect(locked.classList.contains("locked")).toBe(true);
    expect(locked.querySelector(".lock-mark")).not.toBeNull();
    expect(locked.querySelector(".card-close")).toBeNull();
    expect(card("Bravo").querySelector(".card-close")).not.toBeNull();

    locked.querySelector<HTMLButtonElement>(".card-main")!.click();
    await settle(bar);
    expect(navigate).not.toHaveBeenCalled();
    expect(openLockPrompt).toHaveBeenCalledOnce();
    expect(openLockPrompt.mock.calls[0][0]).toBe(tabLockKey("main", "a"));
    // Unlocking opens the page.
    grantUnlock(tabLockKey("main", "a"), { kind: "minutes", minutes: 5 });
    openLockPrompt.mock.calls[0][2].onSuccess();
    expect(navigate).toHaveBeenCalledWith("/a");
  });

  it("opens an unlocked page as before", async () => {
    await mount();
    card("Bravo").querySelector<HTMLButtonElement>(".card-main")!.click();
    expect(navigate).toHaveBeenCalledWith("/b");
    expect(openLockPrompt).not.toHaveBeenCalled();
  });

  it("locks every page of a locked group", async () => {
    writeGroups("main", [group("g1", ["a", "b"])]);
    writeLocks(withLock(readLocks(), groupLockKey("main", "g1"), true));
    await mount();
    expect(card("Alpha").classList.contains("locked")).toBe(true);
    expect(card("Bravo").classList.contains("locked")).toBe(true);
    expect(card("Charlie").classList.contains("locked")).toBe(false);
    card("Bravo").querySelector<HTMLButtonElement>(".card-main")!.click();
    await settle(bar);
    expect(openLockPrompt.mock.calls[0][0]).toBe(groupLockKey("main", "g1"));
  });

  it("does not close a locked page by swiping, and says why", async () => {
    writeLocks(withLock(readLocks(), tabLockKey("main", "a"), true));
    await mount();
    const target = card("Alpha");
    const fire = (type: string, x: number) =>
      target.dispatchEvent(
        new MouseEvent(type, { bubbles: true, clientX: x, clientY: 0 })
      );
    fire("pointerdown", 300);
    fire("pointermove", 100);
    fire("pointerup", 100);
    await settle(bar);
    expect(getStorage().getValue("pageTabsClosed") ?? []).toEqual([]);
    expect(sheet().querySelector(".live")!.textContent).toContain(
      "ui.phone.reason_locked"
    );
    // An ordinary page does close by swiping.
    const other = card("Bravo");
    const swipe = (type: string, x: number) =>
      other.dispatchEvent(
        new MouseEvent(type, { bubbles: true, clientX: x, clientY: 0 })
      );
    swipe("pointerdown", 300);
    swipe("pointermove", 100);
    swipe("pointerup", 100);
    await settle(bar);
    expect(getStorage().getValue("pageTabsClosed")).toEqual(["b"]);
  });

  it("keeps locked and pinned pages when every other page closes", async () => {
    writeLocks(withLock(readLocks(), tabLockKey("main", "a"), true));
    getStorage().setValue("pageTabsPinned", ["c"]);
    await mount();
    sheet().querySelector<HTMLButtonElement>(".header-more")!.click();
    await settle(bar);
    await chooseAction(
      sheet().querySelector("ha-phone-tab-actions")!,
      "action_close_others_all"
    );
    // Delta is the page in use, Alpha is locked and Charlie is pinned.
    expect(getStorage().getValue("pageTabsClosed")).toEqual(["b"]);
  });

  it("offers Lock page and opens the lock window for that page, closing the sheet's own panel", async () => {
    await mount();
    const actions = await openActions("Bravo");
    await chooseAction(actions, "action_lock");
    expect(openLockWizard).toHaveBeenCalledOnce();
    expect(openLockWizard.mock.calls[0][0]).toMatchObject({
      key: tabLockKey("main", "b"),
      onStartDefault: false,
    });
    expect(sheet().querySelector("ha-phone-tab-actions")).toBeNull();
  });

  it("offers Unlock page for a locked page and asks through the prompt", async () => {
    writeLocks(withLock(readLocks(), tabLockKey("main", "b"), true));
    await mount();
    const actions = await openActions("Bravo");
    const keys = Array.from(actions.shadowRoot!.querySelectorAll(".row")).map(
      (row) => row.textContent!
    );
    expect(keys.some((text) => text.includes("action_unlock"))).toBe(true);
    expect(keys.some((text) => text.includes("action_lock"))).toBe(false);
    await chooseAction(actions, "action_unlock");
    expect(openLockPrompt.mock.calls[0][0]).toBe(tabLockKey("main", "b"));
  });
});

describe("groups from the per-page actions", () => {
  it("moves a page into a group through the shared picker and saves it for the strip", async () => {
    writeGroups("main", [group("g1", ["b"])]);
    await mount();
    const actions = await openActions("Charlie");
    await chooseAction(actions, "action_move_into_group");
    const picker = sheet().querySelector("ha-tab-group-picker")!;
    await settle(picker as unknown as LitElement);
    const row = Array.from(
      picker.shadowRoot!.querySelectorAll<HTMLButtonElement>("button.row")
    ).find((button) => button.textContent!.includes("Pair"))!;
    row.click();
    await settle(bar);
    expect(readGroups("main")[0].members).toEqual(["b", "c"]);
    // The group is a section of its own, at the place of its first member
    // among the pages in no group, as the wide strip draws it.
    expect(titles()).toEqual(["Alpha", "Bravo", "Charlie", "Delta"]);
    expect(sheet().querySelector(".group-count")!.textContent).toBe("2");
  });

  it("removes a page from its group", async () => {
    writeGroups("main", [group("g1", ["a", "b"])]);
    await mount();
    const actions = await openActions("Alpha");
    await chooseAction(actions, "action_remove_from_group");
    expect(readGroups("main")[0].members).toEqual(["b"]);
  });

  it("does not offer Remove from group to a page in no group", async () => {
    await mount();
    const actions = await openActions("Alpha");
    const text = Array.from(actions.shadowRoot!.querySelectorAll(".row")).map(
      (row) => row.textContent!
    );
    expect(text.some((item) => item.includes("action_remove_from_group"))).toBe(
      false
    );
  });

  it("will not let a pinned page join a group", async () => {
    getStorage().setValue("pageTabsPinned", ["a"]);
    await mount();
    const actions = await openActions("Alpha");
    const row = Array.from(
      actions.shadowRoot!.querySelectorAll<HTMLButtonElement>(".row")
    ).find((item) => item.textContent!.includes("action_move_into_group"))!;
    expect(row.getAttribute("aria-disabled")).toBe("true");
  });

  it("takes a page out of its group when it is pinned", async () => {
    writeGroups("main", [group("g1", ["a", "b"])]);
    await mount();
    const actions = await openActions("Alpha");
    await chooseAction(actions, "action_pin");
    expect(readGroups("main")[0].members).toEqual(["b"]);
    expect(getStorage().getValue("pageTabsPinned")).toEqual(["a"]);
  });
});

describe("moves", () => {
  const press = (title: string, key: string) =>
    card(title)
      .querySelector(".handle")!
      .dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
        })
      );

  it("moves a page inside its group and saves the group the way the strip does", async () => {
    writeGroups("main", [group("g1", ["a", "b"])]);
    await mount();
    press("Alpha", "ArrowDown");
    await settle(bar);
    expect(readGroups("main")[0].members).toEqual(["b", "a"]);
    expect(titles()).toEqual(["Bravo", "Alpha", "Charlie", "Delta"]);
    // The pages in no group did not change place.
    expect(getStorage().getValue("pageTabsPinned") ?? []).toEqual([]);
  });

  it("will not move a page out of its group with the keys", async () => {
    writeGroups("main", [group("g1", ["a", "b"])]);
    await mount();
    press("Alpha", "ArrowUp");
    await settle(bar);
    expect(readGroups("main")[0].members).toEqual(["a", "b"]);
    expect(sheet().querySelector(".live")!.textContent).toContain(
      "ui.phone.reason_at_top"
    );
  });

  it("moves a pinned page among the pinned pages and saves the pinned list", async () => {
    getStorage().setValue("pageTabsPinned", ["a", "b"]);
    await mount();
    press("Alpha", "ArrowDown");
    await settle(bar);
    expect(getStorage().getValue("pageTabsPinned")).toEqual(["b", "a"]);
  });
});

describe("the look of a page", () => {
  it("applies the look and the label the person gave a page on the strip", async () => {
    writeTabAppearance(
      setTabAppearance(
        setTabAppearance({}, "main", "b", "color", "#00ff00"),
        "main",
        "b",
        "label",
        "Second"
      )
    );
    await mount();
    expect(titles()).toEqual(["Alpha", "Second", "Charlie", "Delta"]);
    const styled = card("Second");
    expect(styled.style.getPropertyValue("--tab-color")).toBe("#00ff00");
    expect(card("Alpha").style.getPropertyValue("--tab-color")).toBe("");
    // The label is the visible name everywhere the sheet names the page.
    expect(styled.querySelector(".more")!.getAttribute("aria-label")).toContain(
      "ui.phone.more_actions"
    );
  });

  it("opens the shared look editor from Edit appearance", async () => {
    await mount();
    const editor = sheet().querySelector(
      "ha-tab-appearance-editor"
    ) as unknown as { show: (target: unknown) => Promise<void> };
    const show = vi.spyOn(editor, "show").mockResolvedValue(undefined);
    const actions = await openActions("Bravo");
    await chooseAction(actions, "action_edit_appearance");
    expect(show).toHaveBeenCalledOnce();
    expect(show.mock.calls[0][0]).toMatchObject({
      surface: "main",
      tabId: "b",
      label: "Bravo",
    });
  });
});

// A settings page or tool opened as a tab is a page of the sheet like any other:
// it is listed with its title, selected by the address, opened by its own
// route and never added twice. The wide strip reads the same saved list.
describe("settings pages and tools in the sheet", () => {
  const withConfig = () => {
    const hass = makeHass();
    hass.panels = {
      ...hass.panels,
      config: {
        url_path: "config",
        title: null,
        icon: null,
        component_name: "config",
        config: null,
        config_panel_domain: undefined,
      },
    } as unknown as typeof hass.panels;
    return hass;
  };

  const mountWithConfig = async () => {
    bar = document.createElement("ha-phone-bar") as HaPhoneBar;
    bar.hass = withConfig();
    bar.phone = true;
    document.body.append(bar);
    await settle(bar);
  };

  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("lists an opened settings page as a page and marks it by the address", async () => {
    chooseDestination("settings", "/config/automation");
    window.history.pushState({}, "", "/config/automation");
    await mountWithConfig();
    expect(titles()).toContain("Automations");
    expect(card("Automations").classList.contains("selected")).toBe(true);
    expect(card("Delta").classList.contains("selected")).toBe(false);
  });

  it("opens it by its own route, not by its id", async () => {
    chooseDestination("tool", "/config/tools/converter");
    await mountWithConfig();
    card("File converter")
      .querySelector<HTMLButtonElement>(".card-main")!
      .click();
    expect(navigate).toHaveBeenCalledWith("/config/tools/converter");
  });

  it("opens a catalog row as a tab once, and the same row again adds none", async () => {
    await mountWithConfig();
    expect(titles()).not.toContain("Automations");
    const toggle = async () => {
      sheet().querySelector<HTMLButtonElement>(".new-tab-row")!.click();
      await settle(bar);
    };
    const chooseRow = async () => {
      await toggle();
      Array.from(sheet().querySelectorAll<HTMLButtonElement>("button.entry"))
        .find((el) => el.textContent!.includes("Automations"))!
        .click();
      await settle(bar);
      expect(navigate).toHaveBeenLastCalledWith("/config/automation");
      // Back to the open pages.
      await toggle();
    };
    await chooseRow();
    expect(titles().filter((title) => title === "Automations")).toHaveLength(1);
    await chooseRow();
    expect(titles().filter((title) => title === "Automations")).toHaveLength(1);
    expect(getStorage().getValue("pageTabsDestinations")).toEqual({
      main: ["settings:config/automation"],
    });
  });

  it("goes to the neighbouring page when the one in use is closed", async () => {
    chooseDestination("settings", "/config/automation");
    chooseDestination("tool", "/config/tools/converter");
    window.history.pushState({}, "", "/config/automation");
    await mountWithConfig();
    card("Automations")
      .querySelector<HTMLButtonElement>(".card-close")!
      .click();
    await settle(bar);
    expect(navigate).toHaveBeenLastCalledWith("/config/tools/converter");
    expect(getStorage().getValue("pageTabsClosed")).toContain(
      "settings:config/automation"
    );
  });
});

describe("persistent bottom navigation", () => {
  const flushViewport = async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    await settle(bar);
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps navigation visible after scrolling down or up", async () => {
    await mount();
    vi.stubGlobal("scrollY", 500);
    window.dispatchEvent(new Event("scroll"));
    await flushViewport();
    expect(sheet().querySelector("nav.bar")?.classList.contains("hidden")).toBe(
      false
    );
    expect(
      document.documentElement.style.getPropertyValue(
        "--ha-phone-bar-visible-height"
      )
    ).not.toBe("0px");
    vi.stubGlobal("scrollY", 200);
    window.dispatchEvent(new Event("scroll"));
    await flushViewport();
    expect(sheet().querySelector("nav.bar")?.classList.contains("hidden")).toBe(
      false
    );
  });

  it("tracks visual viewport resize and scroll without mistaking browser chrome for a keyboard", async () => {
    const viewport = Object.assign(new EventTarget(), {
      height: 600,
      offsetTop: 40,
    });
    vi.stubGlobal("visualViewport", viewport);
    vi.stubGlobal("innerHeight", 844);
    await mount();
    await flushViewport();
    expect(
      document.documentElement.style.getPropertyValue(
        "--ha-phone-viewport-inset-bottom"
      )
    ).toBe("204px");
    expect(sheet().querySelector("nav.bar")?.classList.contains("hidden")).toBe(
      false
    );
    viewport.offsetTop = 70;
    viewport.dispatchEvent(new Event("scroll"));
    await flushViewport();
    expect(
      document.documentElement.style.getPropertyValue(
        "--ha-phone-viewport-inset-bottom"
      )
    ).toBe("174px");
    viewport.height = 800;
    viewport.dispatchEvent(new Event("resize"));
    await flushViewport();
    expect(
      document.documentElement.style.getPropertyValue(
        "--ha-phone-viewport-inset-bottom"
      )
    ).toBe("0px");
  });

  it("hides only for an editable control and restores after keyboard dismissal", async () => {
    const viewport = Object.assign(new EventTarget(), {
      height: 500,
      offsetTop: 0,
    });
    vi.stubGlobal("visualViewport", viewport);
    vi.stubGlobal("innerHeight", 844);
    await mount();
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    viewport.dispatchEvent(new Event("resize"));
    await flushViewport();
    expect(sheet().querySelector("nav.bar")?.classList.contains("hidden")).toBe(
      true
    );
    input.blur();
    viewport.height = 844;
    viewport.dispatchEvent(new Event("resize"));
    await flushViewport();
    expect(sheet().querySelector("nav.bar")?.classList.contains("hidden")).toBe(
      false
    );
    input.remove();
    bar.remove();
    expect(
      document.documentElement.style.getPropertyValue(
        "--ha-phone-viewport-inset-bottom"
      )
    ).toBe("");
  });
});
