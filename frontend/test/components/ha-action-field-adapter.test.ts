import { afterEach, describe, expect, it, vi } from "vitest";
import { HaActionFieldAdapter } from "../../src/components/ha-action-field-adapter";
import type { ActionFieldAdapterKind } from "../../src/data/action-field-adapters";
import type { HomeAssistant } from "../../src/types";

vi.mock("../../src/components/ha-form/ha-form", () => ({}));
afterEach(() => {
  document.body.innerHTML = "";
});
const mount = async (kind: ActionFieldAdapterKind, value?: unknown) => {
  const element = new HaActionFieldAdapter();
  element.hass = { localize: (key: string) => key } as HomeAssistant;
  element.kind = kind;
  element.value = value;
  const changes = vi.fn();
  element.addEventListener("value-changed", changes);
  document.body.append(element);
  await element.updateComplete;
  return { element, changes };
};
const change = (element: HaActionFieldAdapter, value: unknown) =>
  element.shadowRoot!.querySelector("ha-form")!.dispatchEvent(
    new CustomEvent("value-changed", {
      detail: { value },
      bubbles: true,
      composed: true,
    })
  );
describe("action field visual adapter", () => {
  it("does not emit defaults or rewrite values on initial render", async () => {
    await Promise.all(
      [
        ["calendar-offset", { weeks: 2 }],
        ["wilight-trigger", "00107001"],
        ["calendar-offset", undefined],
      ].map(async ([kind, value]) => {
        const { changes } = await mount(kind as ActionFieldAdapterKind, value);
        expect(changes).not.toHaveBeenCalled();
      })
    );
  });
  it("emits the exclusive calendar map on a form edit", async () => {
    const { element, changes } = await mount("calendar-offset", { days: 2 });
    change(element, { amount: 2, unit: "weeks" });
    expect(changes.mock.calls[0][0].detail.value).toEqual({ weeks: 2 });
  });
  it("emits the encoded WiLight string on a form edit", async () => {
    const { element, changes } = await mount("wilight-trigger", "00107001");
    change(element, {
      weekdays: ["monday", "friday"],
      time: "18:30:00",
      active: false,
    });
    expect(changes.mock.calls[0][0].detail.value).toBe("03418300");
  });
  it("accepts clearing every weekday and turning the trigger off", async () => {
    const { element, changes } = await mount("wilight-trigger", "12707001");
    change(element, { weekdays: undefined, time: "07:00:00", active: false });
    expect(changes.mock.calls[0][0].detail.value).toBe("00007000");
  });
  it("ignores invalid and disabled edits", async () => {
    const { element, changes } = await mount("calendar-offset", { days: 2 });
    change(element, { amount: -1, unit: "days" });
    element.disabled = true;
    change(element, { amount: 3, unit: "days" });
    expect(changes).not.toHaveBeenCalled();
    expect(element.value).toEqual({ days: 2 });
  });
  it("does not replace unsupported input with defaults", async () => {
    const { element, changes } = await mount("calendar-offset", {
      unknown: true,
    });
    expect(element.shadowRoot!.querySelector("ha-form")).toBeNull();
    expect(changes).not.toHaveBeenCalled();
  });
});
