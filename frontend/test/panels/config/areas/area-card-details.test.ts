import { ContextProvider } from "@lit/context";
import { afterEach, expect, it, vi } from "vitest";
import type { HaMoreDetailsFacts } from "../../../../src/components/entity/ha-more-details-facts";
import { internationalizationContext } from "../../../../src/data/context";
import "../../../../src/panels/config/areas/ha-config-areas-dashboard";
import { loadRoomWizardDialog } from "../../../../src/panels/config/areas/room-wizard/show-dialog-room-wizard";
import { loadAreaRegistryDetailDialog } from "../../../../src/panels/config/areas/show-dialog-area-registry-detail";
import type { HomeAssistant } from "../../../../src/types";

vi.mock("../../../../src/layouts/hass-tabs-subpage", () => ({}));
vi.mock("../../../../src/components/ha-sortable", () => ({}));
vi.mock("../../../../src/components/animation/ha-fade-in", () => ({}));

afterEach(() => document.body.replaceChildren());

it("keeps area details, navigation, editing and sorting on distinct targets", async () => {
  const kitchen = {
    area_id: "kitchen",
    name: "Kitchen",
    floor_id: "ground",
    aliases: ["Cooking"],
  };
  const hall = { area_id: "hall", name: "Hall", floor_id: null, aliases: [] };
  const callWS = vi.fn();
  const hass = {
    areas: { kitchen, hall },
    floors: {
      ground: { floor_id: "ground", name: "Ground", aliases: [], level: 0 },
    },
    states: {},
    devices: {},
    entities: {},
    config: {},
    locale: { language: "en" },
    localize: (key: string) => key,
    callWS,
  } as unknown as HomeAssistant;
  const host = document.createElement("div");
  new ContextProvider(host, {
    context: internationalizationContext,
    initialValue: hass,
  });
  const page = document.createElement("ha-config-areas-dashboard");
  page.hass = hass;
  host.append(page);
  document.body.append(host);
  await page.updateComplete;
  await Promise.all([loadAreaRegistryDetailDialog(), loadRoomWizardDialog()]);
  const cards = page.shadowRoot!.querySelectorAll<
    HTMLElement & { sortableData?: { area_id: string } }
  >(".area-card");
  expect(cards).toHaveLength(2);
  const card = Array.from(cards).find(
    (item) => item.sortableData?.area_id === "kitchen"
  )!;
  const link = card.querySelector<HTMLAnchorElement>(".area-link")!;
  expect(link.getAttribute("href")).toBe("/config/areas/area/kitchen");
  const parent = card.closest("ha-sortable")!;
  expect(parent.getAttribute("draggable-selector")).toBe(".area-card");
  expect(parent.getAttribute("handle-selector")).toBe(".area-link");
  expect(link.contains(card.querySelector(".area-edit"))).toBe(false);
  const details = card.querySelector<HaMoreDetailsFacts>(".area-facts")!;
  expect(link.contains(details)).toBe(false);
  await details.updateComplete;
  const toggle = details.shadowRoot!.querySelector("button")!;
  const before = callWS.mock.calls.length;
  toggle.click();
  await details.updateComplete;
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  const body = details.shadowRoot!.querySelector("[role=region]")!.textContent;
  expect(body).toContain("kitchen");
  expect(body).toContain("Ground (ground)");
  expect(body).toContain("Cooking");
  expect(callWS).toHaveBeenCalledTimes(before);
});
