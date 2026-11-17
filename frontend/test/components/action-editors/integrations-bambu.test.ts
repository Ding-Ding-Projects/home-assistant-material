import { describe, expect, it } from "vitest";
import {
  BAMBU_COLOR_CHIPS,
  INTEGRATION_EDITORS_BAMBU,
} from "../../../src/components/action-editors/domains/integrations/bambu";
import type {
  QuickContext,
  QuickControl,
} from "../../../src/components/action-editors/quick-types";

const DEVICE = { device: { integration: "bambu_lab" } };
const TRAY = { entity: { integration: "bambu_lab" } };
const TEXT = { text: {} };
const BOOL = { boolean: {} };

/** Written by hand from the integration's services.yaml. */
const SERVICES: Record<string, Record<string, Record<string, unknown>>> = {
  send_command: { device_id: DEVICE, command: TEXT },
  print_project_file: {
    device_id: DEVICE,
    filepath: TEXT,
    plate: { number: { mode: "box", min: 1, max: 100 } },
    timelapse: BOOL,
    bed_leveling: BOOL,
    flow_cali: BOOL,
    vibration_cali: BOOL,
    layer_inspect: BOOL,
    use_ams: BOOL,
    ams_mapping: TEXT,
  },
  skip_objects: { device_id: DEVICE, objects: TEXT },
  move_axis: {
    device_id: DEVICE,
    axis: { select: { options: ["X", "Y", "Z", "Home"] } },
    distance: { number: { min: -100, max: 100, step: 1 } },
  },
  extrude_retract: {
    device_id: DEVICE,
    type: { select: { options: ["Extrude", "Retract"] } },
    force: BOOL,
  },
  retry_load_filament: {},
  done_load_filament: {},
  unload_filament: { device_id: DEVICE },
  load_filament: {
    entity_id: TRAY,
    temperature: { number: { min: 0, max: 250, step: 1 } },
  },
  set_filament: {
    entity_id: TRAY,
    tray_info_idx: TEXT,
    tray_color: TEXT,
    tray_type: TEXT,
    nozzle_temp_min: { number: { min: 160, max: 300, step: 1 } },
    nozzle_temp_max: { number: { min: 160, max: 300, step: 1 } },
  },
  get_filament_data: { device_id: DEVICE },
  read_rfid: { entity_id: TRAY },
  start_filament_drying: {
    device_id: DEVICE,
    temp: { number: { min: 45, max: 85, step: 1 } },
    rotate_tray: BOOL,
    duration: { number: { min: 1, max: 24 } },
  },
  stop_filament_drying: { device_id: DEVICE },
  force_filament_sync: { device_id: DEVICE },
};

const editor = INTEGRATION_EDITORS_BAMBU.bambu_lab;

const build = (
  service: string,
  data: Record<string, unknown> = {}
): QuickControl[] => {
  const ctx: QuickContext = {
    action: `bambu_lab.${service}`,
    data,
    fields: Object.fromEntries(
      Object.entries(SERVICES[service]).map(([key, selector]) => [
        key,
        { selector: selector as Record<string, unknown> },
      ])
    ),
    domainServices: [],
    entities: [],
  };
  return editor.controls[service](ctx);
};

const find = (controls: QuickControl[], key: string) =>
  controls.find((control) => control.key === key);

const kindOf = (controls: QuickControl[], key: string) =>
  find(controls, key)?.kind;

describe("Bambu Lab integration editors", () => {
  it("covers exactly the fifteen registered actions", () => {
    expect(Object.keys(INTEGRATION_EDITORS_BAMBU)).toEqual(["bambu_lab"]);
    expect(Object.keys(editor.controls).sort()).toEqual(
      Object.keys(SERVICES).sort()
    );
    expect(Object.keys(SERVICES)).toHaveLength(15);
  });

  it("gives every field of every action its own control", () => {
    const missing: string[] = [];
    Object.entries(SERVICES).forEach(([service, fields]) => {
      const controls = build(service);
      Object.keys(fields).forEach((key) => {
        if (!find(controls, key)) missing.push(`${service}.${key}`);
      });
    });
    expect(missing).toEqual([]);
  });

  it("prefixes every label with the integration", () => {
    const wrong: string[] = [];
    Object.keys(SERVICES).forEach((service) => {
      build(service).forEach((control) => {
        if (
          !control.labelKey.startsWith(
            "ui.components.action-editors.fields.bambu_lab__"
          )
        ) {
          wrong.push(`${service}.${control.key}`);
        }
      });
    });
    expect(wrong).toEqual([]);
  });

  it("uses a proper control for each kind of value", () => {
    expect(kindOf(build("print_project_file"), "plate")).toBe("stepper");
    expect(kindOf(build("print_project_file"), "timelapse")).toBe("switch");
    expect(kindOf(build("print_project_file"), "ams_mapping")).toBe("text");
    expect(kindOf(build("move_axis"), "axis")).toBe("tiles");
    expect(kindOf(build("move_axis"), "distance")).toBe("slider");
    expect(kindOf(build("extrude_retract"), "type")).toBe("tiles");
    expect(kindOf(build("load_filament"), "temperature")).toBe("slider");
    expect(kindOf(build("load_filament"), "entity_id")).toBe("selector");
    expect(kindOf(build("set_filament"), "tray_info_idx")).toBe("selector");
    expect(kindOf(build("set_filament"), "nozzle_temp_min")).toBe("slider");
    expect(kindOf(build("start_filament_drying"), "temp")).toBe("slider");
    expect(kindOf(build("start_filament_drying"), "duration")).toBe("slider");
    expect(kindOf(build("start_filament_drying"), "device_id")).toBe(
      "selector"
    );
  });

  it("keeps drying temperature and nozzle limits from the service", () => {
    const temp = find(build("start_filament_drying"), "temp") as Extract<
      QuickControl,
      { kind: "slider" }
    >;
    expect([temp.min, temp.max]).toEqual([45, 85]);
    const distance = find(build("move_axis"), "distance") as Extract<
      QuickControl,
      { kind: "slider" }
    >;
    expect([distance.min, distance.max]).toEqual([-100, 100]);
  });

  it("hides the distance when the axis is Home but keeps stored values", () => {
    expect(find(build("move_axis", { axis: "Home" }), "distance")).toBe(
      undefined
    );
    expect(find(build("move_axis", { axis: "X" }), "distance")).toBeDefined();
    const stored = find(
      build("move_axis", { axis: "X", distance: 25 }),
      "distance"
    );
    expect((stored as { value?: number }).value).toBe(25);
  });

  it("stores filament colours as eight hex digits", () => {
    BAMBU_COLOR_CHIPS.forEach((chip) => {
      expect(chip.text).toMatch(/^[0-9A-F]{8}$/);
    });
    const color = find(build("set_filament"), "tray_color") as Extract<
      QuickControl,
      { kind: "text" }
    >;
    expect(color.chips?.length).toBe(BAMBU_COLOR_CHIPS.length);
    expect(color.maxLength).toBe(9);
  });

  it("guards raw G-code and the other risky actions with a caution", () => {
    [
      "send_command",
      "print_project_file",
      "move_axis",
      "extrude_retract",
    ].forEach((service) => {
      expect(editor.cautions?.[service], service).toContain("bambu_lab__");
    });
    const command = find(build("send_command"), "command") as Extract<
      QuickControl,
      { kind: "text" }
    >;
    expect(command.multiline).toBe(true);
    expect(
      command.chips?.some((chip) => chip.text === "\n" && !chip.replace)
    ).toBe(true);
  });

  it("keeps a stored value visible and leaves templates alone", () => {
    const stored = find(
      build("print_project_file", { filepath: "cache/a.3mf" }),
      "filepath"
    ) as Extract<QuickControl, { kind: "text" }>;
    expect(stored.value).toBe("cache/a.3mf");
    expect(
      find(build("load_filament", { temperature: "{{ 220 }}" }), "temperature")
    ).toBe(undefined);
  });
});
