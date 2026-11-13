import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getObjectDraft,
  hasInvalidObjectDrafts,
  setObjectDraft,
} from "../../src/common/object-editor/object-model";
import { HaEventAction } from "../../src/panels/config/automation/action/types/ha-automation-action-event";
import type { EventAction } from "../../src/data/script";

vi.mock("../../src/components/ha-selector/ha-selector-object", () => {
  customElements.define("ha-selector-object", class extends HTMLElement {});
  return {};
});
let element: HaEventAction;
const mount = async (action: EventAction) => {
  element = new HaEventAction();
  element.hass = { localize: (key: string) => key } as never;
  element.action = action;
  document.body.append(element);
  await element.updateComplete;
  return element;
};
const fields = () =>
  [
    ...element.shadowRoot!.querySelectorAll("ha-selector-object"),
  ] as unknown as (HTMLElement & {
    field: string;
    value: unknown;
    context: unknown;
    dictionaryOnly: boolean;
    disabled: boolean;
  })[];
const change = (target: HTMLElement, value: unknown, isValid?: boolean) =>
  target.dispatchEvent(
    new CustomEvent("value-changed", {
      detail: { value, isValid },
      bubbles: true,
      composed: true,
    })
  );
afterEach(() => {
  element?.remove();
});

describe("visual manual event data", () => {
  it("renders one dictionary without creating absent data or changing a template name", async () => {
    const action = { event: "{{ custom_event }}", alias: "Keep" };
    await mount(action);
    expect(fields()).toHaveLength(1);
    expect(fields()[0].dictionaryOnly).toBe(true);
    expect(fields()[0].value).toBeUndefined();
    expect(fields()[0].context).toEqual({
      draft_owner: action,
      draft_key: "event_data",
    });
    expect(element.action).toBe(action);
    expect(element.action).not.toHaveProperty("event_data");
  });
  it("keeps legacy template data separate and preserves action metadata when editing", async () => {
    const action = {
      event: "custom",
      event_data: { nested: [false, 0, null] },
      event_data_template: { name: "{{ name }}" },
      alias: "Keep",
      enabled: false,
    };
    await mount(action);
    expect(fields()).toHaveLength(2);
    expect(fields()[1].value).toBe(action.event_data_template);
    let value: unknown;
    element.addEventListener("value-changed", (event) => {
      value = (event as CustomEvent).detail.value;
    });
    change(fields()[0], { nested: [true, 0, null] });
    expect(value).toEqual({
      ...action,
      event_data: { nested: [true, 0, null] },
    });
    change(fields()[1], { name: "{{ other_name }}" });
    expect(value).toEqual({
      ...action,
      event_data_template: { name: "{{ other_name }}" },
    });
  });
  it("retains invalid draft ownership through name edits and blocks saving its replacement", async () => {
    const action = { event: "custom", event_data: { saved: true } };
    await mount(action);
    setObjectDraft(action, "event_data", {
      mode: "yaml",
      valid: false,
      yaml: "key: [unfinished",
    });
    let value: EventAction | undefined;
    element.addEventListener("value-changed", (event) => {
      value = (event as CustomEvent).detail.value;
    });
    const input = element.shadowRoot!.querySelector(
      "ha-input"
    ) as HTMLElement & { value: string };
    input.value = "{{ event_name }}";
    input.dispatchEvent(new Event("change"));
    expect(value?.event).toBe("{{ event_name }}");
    expect(getObjectDraft(value, "event_data")?.yaml).toBe("key: [unfinished");
    expect(hasInvalidObjectDrafts({ actions: [value] })).toBe(true);
  });
  it("ignores invalid and disabled edits and preserves an untouched legacy value", async () => {
    const action = {
      event: "custom",
      event_data: null,
    } as unknown as EventAction;
    await mount(action);
    expect(fields()[0].value).toBeNull();
    const changes = vi.fn();
    element.addEventListener("value-changed", changes);
    change(fields()[0], undefined, false);
    change(fields()[0], [1, 2]);
    element.disabled = true;
    await element.updateComplete;
    expect(fields()[0].disabled).toBe(true);
    change(fields()[0], { changed: true });
    expect(changes).not.toHaveBeenCalled();
    expect(element.action).toBe(action);
  });
});
