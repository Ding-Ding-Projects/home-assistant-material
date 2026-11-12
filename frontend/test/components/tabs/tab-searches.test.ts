import type { TemplateResult } from "lit";
import { render } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStorage } from "../../../src/common/decorators/storage";
import {
  readLocks,
  withLock,
  writeLocks,
} from "../../../src/common/locks/element-locks";
import { readGroups, writeGroups } from "../../../src/common/tabs/tab-groups";
import { tabLockKey } from "../../../src/common/tabs/tab-locks";
import type { HaTabSearchAll } from "../../../src/components/tabs/ha-tab-search-all";
import type { HaTabSearchResults } from "../../../src/components/tabs/ha-tab-search-results";
import type { TabSearchesController } from "../../../src/components/tabs/ha-tab-searches";
import {
  isRevealed,
  clearReveals,
} from "../../../src/components/tabs/tab-search-reveal";
import type { TabModuleContext } from "../../../src/components/tabs/tab-types";
import {
  makeHass,
  resetTabStorage,
  settle,
  stubMatchMedia,
} from "./tab-test-helpers";

vi.mock("../../../src/components/input/ha-input", () => ({}));
vi.mock("../../../src/components/input/ha-input-search", () => ({}));
vi.mock("../../../src/components/ha-color-picker", () => ({}));
vi.mock("../../../src/components/ha-svg-icon", () => ({}));
vi.mock("../../../src/common/navigate", () => ({ navigate: vi.fn() }));
vi.mock("../../../src/dialogs/quick-bar/show-dialog-quick-bar", () => ({
  showQuickBar: vi.fn(),
}));
vi.mock("../../../src/components/locks/ha-lock-prompt", () => ({
  openLockPrompt: vi.fn(),
}));

const { navigate } = await import("../../../src/common/navigate");
const { openLockPrompt } =
  await import("../../../src/components/locks/ha-lock-prompt");
const searches = await import("../../../src/components/tabs/ha-tab-searches");
const { openMasterSearch } =
  await import("../../../src/components/tabs/ha-tab-search-all");

// The four searches each have their own field and their own text, they show
// where a tab sits and whether it is pinned or locked, acting on a result keeps
// the text, and a result inside a collapsed group is revealed for this visit
// without changing the saved collapsed state.

const group = (
  id: string,
  name: string,
  members: string[],
  collapsed = false
) => ({
  id,
  name,
  colour: "blue" as const,
  collapsed,
  members,
});

let container: HTMLDivElement;
let shell: HTMLDivElement;
let controller: TabSearchesController;
let hass = makeHass();

const redraw = async () => {
  const template = (
    controller as unknown as Record<string, () => TemplateResult>
  )["_renderDiscovery"]();
  render(template, container);
  await Promise.all(
    Array.from(container.querySelectorAll("ha-tab-search-results")).map(
      (element) => (element as HaTabSearchResults).updateComplete
    )
  );
};

const field = (selector: string) =>
  container.querySelector<HTMLElement & { value: string }>(selector)!;

const typeInto = async (selector: string, value: string) => {
  const input = field(selector);
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await redraw();
};

const resultsOf = (section: string) =>
  container
    .querySelector<HTMLElement>(section)!
    .closest("section")!
    .querySelector<HaTabSearchResults>("ha-tab-search-results");

const labels = (results: HaTabSearchResults | null) =>
  Array.from(results?.shadowRoot?.querySelectorAll(".label") ?? []).map(
    (label) => label.textContent!.trim()
  );

beforeEach(async () => {
  stubMatchMedia(false);
  resetTabStorage();
  clearReveals();
  vi.mocked(navigate).mockClear();
  vi.mocked(openLockPrompt).mockClear();
  hass = makeHass();
  writeGroups("main", [
    group("g1", "Kitchen", ["a", "b"], true),
    group("g2", "Garage", ["c"]),
  ]);
  container = document.createElement("div");
  shell = document.createElement("div");
  shell.innerHTML = '<button class="new-tab"></button>';
  document.body.append(container, shell);
  const host = {
    hass,
    requestUpdate: () => {
      void redraw();
    },
    addController: () => undefined,
    renderRoot: shell,
  };
  const ctx = {
    host,
    t: (key: string, values?: Record<string, string | number>) =>
      values?.name ? `${key}|${values.name}` : key,
    store: {},
  } as unknown as TabModuleContext;
  controller = new searches.TabSearchesController(ctx, () => undefined);
  await redraw();
});

afterEach(() => {
  render(undefined, container);
  container.remove();
  shell.remove();
  document.body.querySelector("ha-tab-search-all")?.remove();
});

describe("the strip search, the group names search and the search inside a group", () => {
  it("keep their own text and never share it", async () => {
    await typeInto('[data-search="strip"]', "al");
    await typeInto('[data-search="names"]', "gar");
    await typeInto('[data-search="inside"][data-group-id="g1"]', "bra");
    const state = controller as unknown as {
      _stripQuery: string;
      _namesQuery: string;
      _groupQueries: Record<string, string>;
    };
    expect(state._stripQuery).toBe("al");
    expect(state._namesQuery).toBe("gar");
    expect(state._groupQueries).toEqual({ g1: "bra" });
    // Each field still shows its own text after every redraw.
    expect(field('[data-search="strip"]').value).toBe("al");
    expect(field('[data-search="names"]').value).toBe("gar");
    expect(field('[data-search="inside"][data-group-id="g2"]').value).toBe("");
  });

  it("the strip search lists the matching open tabs only", async () => {
    getStorage().setValue("pageTabsClosed", ["c"]);
    await typeInto('[data-search="strip"]', "/a$/");
    expect(labels(resultsOf('[data-search="strip"]'))).toEqual([
      "Alpha",
      "Delta",
    ]);
  });

  it("the group names search lists groups by name", async () => {
    await typeInto('[data-search="names"]', "gar");
    const names = container.querySelectorAll(".group-list .entry-title");
    expect(Array.from(names).map((title) => title.textContent!.trim())).toEqual(
      ["Garage"]
    );
  });

  it("the search inside a group looks only at that group", async () => {
    await typeInto('[data-search="inside"][data-group-id="g1"]', "o");
    expect(
      labels(resultsOf('[data-search="inside"][data-group-id="g1"]'))
    ).toEqual(["Bravo"]);
    await typeInto('[data-search="inside"][data-group-id="g2"]', "a");
    expect(
      labels(resultsOf('[data-search="inside"][data-group-id="g2"]'))
    ).toEqual(["Charlie"]);
  });

  it("an unusable pattern lists everything instead of an empty list", async () => {
    await typeInto('[data-search="strip"]', "/(/");
    expect(labels(resultsOf('[data-search="strip"]'))).toHaveLength(4);
  });
});

describe("the results", () => {
  const row = (results: HaTabSearchResults | null, label: string) =>
    Array.from(results!.shadowRoot!.querySelectorAll("li")).find((li) =>
      li.textContent!.includes(label)
    )!;

  it("show the group, the collapsed note, pinned and locked state", async () => {
    getStorage().setValue("pageTabsPinned", ["d"]);
    writeLocks(withLock(readLocks(), tabLockKey("main", "c"), true));
    await typeInto('[data-search="strip"]', "/./");
    const results = resultsOf('[data-search="strip"]');
    expect(row(results, "Alpha").textContent).toContain(
      "ui.page_tabs.searches.in_group"
    );
    expect(row(results, "Alpha").textContent).toContain(
      "ui.page_tabs.searches.collapsed"
    );
    expect(row(results, "Delta").textContent).toContain(
      "ui.page_tabs.searches.pinned"
    );
    expect(row(results, "Charlie").textContent).toContain(
      "ui.page_tabs.searches.locked"
    );
  });

  it("reveal a tab in a collapsed group for this visit only", async () => {
    await typeInto('[data-search="strip"]', "Alpha");
    const results = resultsOf('[data-search="strip"]')!;
    results.shadowRoot!.querySelector<HTMLButtonElement>(".main")!.click();
    expect(navigate).toHaveBeenCalledWith("/a");
    expect(isRevealed("main", "a")).toBe(true);
    // The saved preference is untouched, and the query stays in its field.
    expect(readGroups("main")[0].collapsed).toBe(true);
    expect(field('[data-search="strip"]').value).toBe("Alpha");
  });

  it("ask to unlock a locked tab before opening it", async () => {
    writeLocks(withLock(readLocks(), tabLockKey("main", "c"), true));
    await typeInto('[data-search="strip"]', "Charlie");
    const results = resultsOf('[data-search="strip"]')!;
    results.shadowRoot!.querySelector<HTMLButtonElement>(".main")!.click();
    await settle(results);
    expect(navigate).not.toHaveBeenCalled();
    expect(openLockPrompt).toHaveBeenCalledWith(
      tabLockKey("main", "c"),
      expect.anything(),
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it("close a tab without losing the query, and protect the tab in use", async () => {
    await typeInto('[data-search="strip"]', "/./");
    const results = resultsOf('[data-search="strip"]')!;
    const closeOf = (label: string) =>
      row(results, label).querySelectorAll<HTMLButtonElement>(".icon")[2];
    closeOf("Delta").click(); // the page in use
    expect(getStorage().getValue("pageTabsClosed")).toBeUndefined();
    closeOf("Alpha").click();
    expect(getStorage().getValue("pageTabsClosed")).toEqual(["a"]);
    expect(field('[data-search="strip"]').value).toBe("/./");
  });

  it("pin from a result takes the tab out of its group", async () => {
    await typeInto('[data-search="strip"]', "Charlie");
    const results = resultsOf('[data-search="strip"]')!;
    row(results, "Charlie")
      .querySelectorAll<HTMLButtonElement>(".icon")[0]
      .click();
    expect(getStorage().getValue("pageTabsPinned")).toEqual(["c"]);
    expect(readGroups("main")[1].members).toEqual([]);
  });

  it("Move into group asks the picker, with the tab and its strip", async () => {
    const seen: CustomEvent[] = [];
    window.addEventListener("tab-group-picker-open", (ev) =>
      seen.push(ev as CustomEvent)
    );
    await typeInto('[data-search="strip"]', "Charlie");
    const results = resultsOf('[data-search="strip"]')!;
    row(results, "Charlie")
      .querySelectorAll<HTMLButtonElement>(".icon")[1]
      .click();
    expect(seen[0].detail).toMatchObject({ tabIds: ["c"], surface: "main" });
  });
});

describe("Search all tabs", () => {
  const openPanel = async () => {
    const anchor = document.createElement("button");
    document.body.append(anchor);
    await openMasterSearch(hass, anchor);
    const panel =
      document.body.querySelector<HaTabSearchAll>("ha-tab-search-all")!;
    await settle(panel);
    return { panel, anchor };
  };

  const listed = (panel: HaTabSearchAll) =>
    labels(
      panel.shadowRoot!.querySelector<HaTabSearchResults>(
        "ha-tab-search-results"
      )
    );

  const typeAll = async (panel: HaTabSearchAll, value: string) => {
    const input = panel.shadowRoot!.querySelector<
      HTMLElement & { value: string }
    >("#master-search")!;
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await settle(panel);
    await settle(
      panel.shadowRoot!.querySelector<HaTabSearchResults>(
        "ha-tab-search-results"
      )!
    );
  };

  it("looks through every open tab on every strip", async () => {
    getStorage().setValue("pageTabsClosed", ["b"]);
    getStorage().setValue("pageTabsSeen", { side: ["x1", "x2"] });
    const { panel } = await openPanel();
    expect(listed(panel).sort()).toEqual(
      ["Alpha", "Charlie", "Delta", "x1", "x2"].sort()
    );
    await typeAll(panel, "x");
    expect(listed(panel).sort()).toEqual(["x1", "x2"]);
  });

  it("keeps its own text apart from the catalog searches", async () => {
    await typeInto('[data-search="strip"]', "Alpha");
    const { panel } = await openPanel();
    await typeAll(panel, "Delta");
    const state = controller as unknown as { _stripQuery: string };
    expect(state._stripQuery).toBe("Alpha");
    expect(field('[data-search="strip"]').value).toBe("Alpha");
  });

  it("returns focus to where it was opened on Escape", async () => {
    const { panel, anchor } = await openPanel();
    panel
      .shadowRoot!.querySelector(".panel")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    await settle(panel);
    expect(panel.shadowRoot!.querySelector(".panel")).toBeNull();
    expect(document.activeElement).toBe(anchor);
  });

  it("opens with Alt Shift F while the bar is on the page", async () => {
    const press = () =>
      new KeyboardEvent("keydown", {
        code: "KeyF",
        key: "F",
        altKey: true,
        shiftKey: true,
        cancelable: true,
      });
    // Not connected: the shortcut does nothing.
    window.dispatchEvent(press());
    expect(document.body.querySelector("ha-tab-search-all")).toBeNull();
    controller.hostConnected();
    const event = press();
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() =>
      expect(document.body.querySelector("ha-tab-search-all")).not.toBeNull()
    );
    controller.hostDisconnected();
  });
});
