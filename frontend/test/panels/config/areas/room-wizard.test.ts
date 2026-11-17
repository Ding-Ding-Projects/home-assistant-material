import { describe, expect, it } from "vitest";
import type {
  DeviceInput,
  EntityInput,
  StarterText,
} from "../../../../src/panels/config/areas/room-wizard/room-wizard";
import {
  buildStarterConfig,
  buildWizardDevices,
  clearDraft,
  emptyDraft,
  loadDraft,
  nameMatchesRoom,
  offerStarters,
  parseDraft,
  preselectByName,
  roomCapabilities,
  saveDraft,
  unassignedDevices,
} from "../../../../src/panels/config/areas/room-wizard/room-wizard";

const devices: DeviceInput[] = [
  { id: "d_lamp", name: "Study lamp", areaId: null },
  { id: "d_window", name: "Study window sensor", areaId: null },
  { id: "d_plug", name: "Plug 3", areaId: null },
  { id: "d_motion", name: "Motion sensor 2", areaId: null },
  { id: "d_temp", name: "Desk temperature", areaId: null },
  { id: "d_kitchen", name: "Kitchen light", areaId: "kitchen" },
  { id: "d_off", name: "Study old lamp", areaId: null, disabled: true },
  { id: "d_svc", name: "Study service", areaId: null, isService: true },
];

const entities: EntityInput[] = [
  { entityId: "light.study_lamp", deviceId: "d_lamp" },
  { entityId: "sensor.study_lamp_power", deviceId: "d_lamp" },
  {
    entityId: "binary_sensor.study_window",
    deviceId: "d_window",
    deviceClass: "window",
  },
  { entityId: "switch.plug_3", deviceId: "d_plug" },
  {
    entityId: "binary_sensor.motion_2",
    deviceId: "d_motion",
    deviceClass: "motion",
  },
  {
    entityId: "sensor.desk_temperature",
    deviceId: "d_temp",
    deviceClass: "temperature",
  },
  {
    entityId: "light.diagnostic_led",
    deviceId: "d_plug",
    category: "diagnostic",
  },
  { entityId: "light.kitchen", deviceId: "d_kitchen" },
];

const text: StarterText = (key, values) =>
  `${key}|${Object.entries(values ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join(",")}`;

const wizardDevices = buildWizardDevices(devices, entities);
const byId = (ids: string[]) =>
  wizardDevices.filter((device) => ids.includes(device.id));

describe("name-based pre-selection", () => {
  it("matches the room name inside a device name, ignoring case", () => {
    expect(nameMatchesRoom("STUDY lamp", "study")).toBe(true);
    expect(nameMatchesRoom("Plug 3", "Study")).toBe(false);
    expect(nameMatchesRoom("Study lamp", " ")).toBe(false);
  });

  it("ticks only unassigned devices whose name says the room", () => {
    const unassigned = unassignedDevices(wizardDevices);
    expect(preselectByName(unassigned, "Study").sort()).toEqual([
      "d_lamp",
      "d_window",
    ]);
  });

  it("leaves out disabled devices and services", () => {
    expect(wizardDevices.map((d) => d.id)).not.toContain("d_off");
    expect(wizardDevices.map((d) => d.id)).not.toContain("d_svc");
  });

  it("classifies devices and ignores diagnostic entities", () => {
    const plug = wizardDevices.find((d) => d.id === "d_plug")!;
    expect(plug.kind).toBe("plug");
    expect(plug.entities.map((e) => e.entityId)).toEqual(["switch.plug_3"]);
    expect(wizardDevices.find((d) => d.id === "d_lamp")!.kind).toBe("light");
    expect(wizardDevices.find((d) => d.id === "d_window")!.kind).toBe(
      "opening"
    );
  });
});

describe("offered starters", () => {
  it("offers nothing as available for an empty room", () => {
    expect(offerStarters([]).every((offer) => !offer.available)).toBe(true);
  });

  it("offers the light starter for a light only", () => {
    const offers = offerStarters(byId(["d_lamp"]));
    const available = offers.filter((o) => o.available).map((o) => o.id);
    expect(available).toEqual(["light_when_dark"]);
    const motion = offers.find((o) => o.id === "motion_light")!;
    expect(motion.missing).toEqual(["motion"]);
  });

  it("unlocks the motion starter once a motion sensor and a light are there", () => {
    const offers = offerStarters(byId(["d_lamp", "d_motion"]));
    expect(offers.find((o) => o.id === "motion_light")!.available).toBe(true);
  });

  it("offers both temperature starters for a temperature sensor", () => {
    const available = offerStarters(byId(["d_temp"]))
      .filter((o) => o.available)
      .map((o) => o.id);
    expect(available).toEqual(["temp_high", "temp_low"]);
  });

  it("offers the open-too-long starter for an opening sensor", () => {
    const available = offerStarters(byId(["d_window"]))
      .filter((o) => o.available)
      .map((o) => o.id);
    expect(available).toEqual(["open_too_long"]);
  });
});

describe("starter configurations", () => {
  const caps = roomCapabilities(
    byId(["d_lamp", "d_window", "d_motion", "d_temp"])
  );

  it("is switched off, named after the room, with the real entity ids", () => {
    const config = buildStarterConfig("light_when_dark", "Study", caps, text)!;
    expect(config.initial_state).toBe(false);
    expect(config.alias).toContain("Study");
    expect(config.triggers).toEqual([
      { trigger: "sun", event: "sunset", offset: 0 },
    ]);
    expect(config.actions).toEqual([
      { action: "light.turn_on", target: { entity_id: ["light.study_lamp"] } },
    ]);
  });

  it("builds the open sensor automation with a ten minute wait", () => {
    const config = buildStarterConfig("open_too_long", "Study", caps, text)!;
    expect(config.triggers[0]).toMatchObject({
      trigger: "state",
      entity_id: ["binary_sensor.study_window"],
      to: "on",
      for: { minutes: 10 },
    });
    expect(config.actions[0]).toMatchObject({
      action: "persistent_notification.create",
    });
    expect(config.initial_state).toBe(false);
  });

  it("builds motion on and off with the lights of the room", () => {
    const config = buildStarterConfig("motion_light", "Study", caps, text)!;
    expect(config.triggers).toHaveLength(2);
    expect(config.triggers[1]).toMatchObject({
      to: "off",
      for: { minutes: 5 },
      entity_id: ["binary_sensor.motion_2"],
    });
    const choose = (config.actions[0] as { choose: { sequence: unknown[] }[] })
      .choose;
    expect(choose[0].sequence[0]).toMatchObject({
      action: "light.turn_on",
      target: { entity_id: ["light.study_lamp"] },
    });
    expect(choose[1].sequence[0]).toMatchObject({ action: "light.turn_off" });
  });

  it("builds numeric state triggers for temperature", () => {
    const high = buildStarterConfig("temp_high", "Study", caps, text)!;
    const low = buildStarterConfig("temp_low", "Study", caps, text)!;
    expect(high.triggers[0]).toMatchObject({
      trigger: "numeric_state",
      entity_id: ["sensor.desk_temperature"],
      above: 26,
    });
    expect(low.triggers[0]).toMatchObject({ below: 16 });
  });

  it("builds nothing when the room lacks what the starter needs", () => {
    const empty = roomCapabilities(byId(["d_lamp"]));
    expect(buildStarterConfig("motion_light", "Study", empty, text)).toBe(
      undefined
    );
    expect(buildStarterConfig("temp_high", "Study", empty, text)).toBe(
      undefined
    );
  });
});

describe("draft", () => {
  const makeStorage = () => {
    const map = new Map<string, string>();
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
      removeItem: (key: string) => void map.delete(key),
    };
  };

  it("saves and resumes per user", () => {
    const storage = makeStorage();
    const draft = {
      ...emptyDraft(),
      step: "devices" as const,
      name: "Study",
      areaId: "study",
      selectedDeviceIds: ["d_lamp"],
      createdAutomations: { light_when_dark: "123" },
    };
    expect(saveDraft(storage, "user-a", draft)).toBe(true);
    expect(loadDraft(storage, "user-a")).toEqual(draft);
    expect(loadDraft(storage, "user-b")).toBeUndefined();
  });

  it("clears a finished draft", () => {
    const storage = makeStorage();
    saveDraft(storage, "u", { ...emptyDraft(), name: "x" });
    clearDraft(storage, "u");
    expect(loadDraft(storage, "u")).toBeUndefined();
  });

  it("ignores anything that is not a draft", () => {
    expect(parseDraft(null)).toBeUndefined();
    expect(parseDraft("not json")).toBeUndefined();
    expect(parseDraft(JSON.stringify({ version: 99 }))).toBeUndefined();
    expect(
      parseDraft(JSON.stringify({ ...emptyDraft(), step: "nowhere" }))
    ).toBeUndefined();
  });

  it("keeps working when storage throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(saveDraft(broken, "u", emptyDraft())).toBe(false);
    expect(loadDraft(broken, "u")).toBeUndefined();
    expect(() => clearDraft(broken, "u")).not.toThrow();
  });
});
