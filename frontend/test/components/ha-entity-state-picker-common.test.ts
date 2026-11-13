import { describe, expect, it, vi } from "vitest";
import type { HassEntities } from "home-assistant-js-websocket";
import type { HomeAssistantFormatters } from "../../src/types";
import type { PickerComboBoxItem } from "../../src/components/ha-picker-combo-box";
import { HaEntityStatePicker } from "../../src/components/entity/ha-entity-state-picker";

vi.mock("../../src/components/ha-generic-picker", () => ({}));

const states = (lists: (string[] | undefined)[]): HassEntities =>
  Object.fromEntries(
    lists.map((list, index) => [
      `media_player.player_${index}`,
      {
        entity_id: `media_player.player_${index}`,
        attributes: { source_list: list },
        state: "on",
        last_changed: "2026-11-13T00:00:00Z",
        last_updated: "2026-11-13T00:00:00Z",
        context: { id: "test", parent_id: null, user_id: null },
      },
    ])
  );

const items = (lists: (string[] | undefined)[], common = true) => {
  const picker = new HaEntityStatePicker();
  const entities = states(lists);
  const internals = picker as unknown as Record<
    "_getItems",
    (
      states: HassEntities,
      formatters: HomeAssistantFormatters,
      language: string,
      entityIds: string[],
      attribute: string,
      hidden: undefined,
      extra: undefined,
      common: boolean
    ) => PickerComboBoxItem[]
  >;
  return internals
    ._getItems(
      entities,
      {
        formatEntityAttributeValue: (_entity, _attribute, value) => value,
      } as HomeAssistantFormatters,
      "en",
      [...Object.keys(entities), Object.keys(entities)[0]],
      "source",
      undefined,
      undefined,
      common
    )
    .map((item) => item.id);
};

describe("common action state choices", () => {
  it("intersects the advertised choices and removes duplicate targets and options", () => {
    expect(
      items([
        ["HDMI", "TV", "HDMI"],
        ["TV", "Radio"],
      ])
    ).toEqual(["TV"]);
  });
  it("keeps the union for trigger and condition selectors", () => {
    expect(
      items(
        [
          ["HDMI", "TV"],
          ["TV", "Radio"],
        ],
        false
      )
    ).toEqual(["HDMI", "TV", "Radio"]);
  });
  it("does not imply support when an entity has no option metadata", () => {
    expect(items([["HDMI"], undefined])).toEqual([]);
    expect(items([["HDMI"], []])).toEqual([]);
  });
  it("offers no choices when selected entities have disjoint options", () => {
    expect(items([["HDMI"], ["Radio"]])).toEqual([]);
  });
  it("retains an entered value even when it is absent from the suggestions", () => {
    const picker = new HaEntityStatePicker();
    picker.value = "Custom source";
    picker.commonOptionsOnly = true;
    picker.entityId = ["media_player.one", "media_player.two"];
    expect(picker.value).toBe("Custom source");
  });
});
