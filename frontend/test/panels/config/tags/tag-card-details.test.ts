import { ContextProvider } from "@lit/context";
import { afterEach, expect, it, vi } from "vitest";
import type { HaMoreDetailsFacts } from "../../../../src/components/entity/ha-more-details-facts";
import { internationalizationContext } from "../../../../src/data/context";
import "../../../../src/panels/config/tags/ha-config-tags";
import type { HomeAssistant } from "../../../../src/types";

vi.mock("../../../../src/layouts/hass-tabs-subpage", () => ({}));
vi.mock("../../../../src/components/animation/ha-fade-in", () => ({}));

afterEach(() => document.body.replaceChildren());

it("expands only the chosen tag and keeps the other card closed after filtering", async () => {
  const tags = [
    { id: "tag-one", name: "Laundry", description: "Washing machine" },
    { id: "tag-two", name: "Hall" },
  ];
  const callWS = vi.fn().mockResolvedValue(tags);
  const hass = {
    auth: {},
    config: { components: ["tag"] },
    devices: {},
    states: {},
    localize: (key: string) => key,
    locale: { language: "en" },
    connection: { subscribeEvents: vi.fn().mockResolvedValue(() => {}) },
    callWS,
  } as unknown as HomeAssistant;
  const host = document.createElement("div");
  new ContextProvider(host, {
    context: internationalizationContext,
    initialValue: hass,
  });
  const page = document.createElement("ha-config-tags");
  page.hass = hass;
  host.append(page);
  document.body.append(host);
  const facts = () =>
    page.shadowRoot!.querySelectorAll<HaMoreDetailsFacts>(
      ".tag-card ha-more-details-facts"
    );
  await vi.waitFor(() => expect(facts()).toHaveLength(2));
  const forCard = (name: string) =>
    page.shadowRoot!.querySelector<HaMoreDetailsFacts>(
      `[aria-label="${name}"] ha-more-details-facts`
    )!;
  const first = forCard("Laundry");
  const second = forCard("Hall");
  await first.updateComplete;
  const toggle = first.shadowRoot!.querySelector("button")!;
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  toggle.click();
  await first.updateComplete;
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(
    first.shadowRoot!.querySelector("[role=region]")?.textContent
  ).toContain("tag-one");
  expect(second.shadowRoot!.querySelector("[role=region]")).toBeNull();
  page
    .shadowRoot!.querySelector("hass-tabs-subpage")!
    .dispatchEvent(
      new CustomEvent("top-bar-search-input", { detail: { value: "Hall" } })
    );
  await page.updateComplete;
  expect(facts()).toHaveLength(1);
  expect(facts()[0]).toBe(second);
  expect(second.shadowRoot!.querySelector("[role=region]")).toBeNull();
  expect(callWS.mock.calls.flat()).toContainEqual({ type: "tag/list" });
});
