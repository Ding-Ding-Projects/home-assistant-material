import {
  compact,
  L,
  notice,
  selector,
  slider,
  stepper,
  textBox,
  tiles,
  toggle,
} from "../../quick-helpers";
import type {
  DomainEditor,
  QuickContext,
  QuickControl,
} from "../../quick-types";

/**
 * Tailored editors for the community Bambu Lab integration (domain
 * `bambu_lab`, distributed through the community store). It registers fifteen
 * actions for Bambu Lab 3D printers and their AMS units. Every field of every
 * action gets a control. Labels live under `bambu_lab__<field>`.
 *
 * The printer, AMS and spool pickers are filtered to this integration. Colours
 * are stored by the integration as `RRGGBBAA` text, so the colour box offers
 * one-tap filament colours and accepts any hex value.
 */

type Ctx = QuickContext;
type Extra = Partial<Extract<QuickControl, { kind: "text" }>>;

const DOMAIN = "bambu_lab";

const lab = (name: string) => L(`${DOMAIN}__${name}`);

const noFields = (): QuickControl[] => [];

/** Printer, AMS or external spool device picker. */
const device = (ctx: Ctx) =>
  selector(
    ctx,
    "device_id",
    lab("device_id"),
    { device: { filter: { integration: DOMAIN } } },
    "other"
  );

/** AMS tray or external spool entity picker. */
const tray = (ctx: Ctx) =>
  selector(
    ctx,
    "entity_id",
    lab("entity_id"),
    { entity: { domain: "sensor", integration: DOMAIN } },
    "entity"
  );

const text = (ctx: Ctx, key: string, extra: Extra = {}) =>
  textBox(ctx, key, lab(key), extra);

const info = (name: string): QuickControl =>
  notice(name, lab(`note_${name}`), "info");

/** Filament colours as the integration stores them: `RRGGBBAA`. */
export const BAMBU_COLOR_CHIPS: { id: string; text: string }[] = [
  { id: `${DOMAIN}__color_black`, text: "000000FF" },
  { id: `${DOMAIN}__color_white`, text: "FFFFFFFF" },
  { id: `${DOMAIN}__color_grey`, text: "808080FF" },
  { id: `${DOMAIN}__color_red`, text: "FF0000FF" },
  { id: `${DOMAIN}__color_orange`, text: "FFA500FF" },
  { id: `${DOMAIN}__color_yellow`, text: "FFFF00FF" },
  { id: `${DOMAIN}__color_green`, text: "00AE42FF" },
  { id: `${DOMAIN}__color_blue`, text: "0000FFFF" },
  { id: `${DOMAIN}__color_purple`, text: "800080FF" },
  { id: `${DOMAIN}__color_pink`, text: "FFC0CBFF" },
  { id: `${DOMAIN}__color_brown`, text: "8B4513FF" },
  { id: `${DOMAIN}__color_clear`, text: "FFFFFF00" },
].map((chip) => ({ ...chip, replace: true }));

/** G-code worth one tap. A command must end with a new line. */
export const BAMBU_GCODE_CHIPS: {
  id: string;
  text: string;
  replace?: boolean;
}[] = [
  { id: `${DOMAIN}__chip_newline`, text: "\n" },
  { id: `${DOMAIN}__chip_m105`, text: "M105\n", replace: true },
  { id: `${DOMAIN}__chip_m115`, text: "M115\n", replace: true },
  { id: `${DOMAIN}__chip_g28`, text: "G28\n", replace: true },
];

const FILE_CHIPS = [{ id: `${DOMAIN}__chip_cache`, text: "cache/" }];

const MAPPING_CHIPS = [
  { id: `${DOMAIN}__chip_map_first`, text: "0", replace: true },
  { id: `${DOMAIN}__chip_map_four`, text: "0,1,2,3", replace: true },
  { id: `${DOMAIN}__chip_map_external`, text: "-1", replace: true },
];

/** Bambu filament profile identifiers, as the integration ships them. */
const FILAMENTS: [string, string][] = [
  ["GFA00", "Bambu PLA Basic"],
  ["GFA01", "Bambu PLA Matte"],
  ["GFA02", "Bambu PLA Metal"],
  ["GFA05", "Bambu PLA Silk"],
  ["GFA06", "Bambu PLA Silk+"],
  ["GFA07", "Bambu PLA Marble"],
  ["GFA08", "Bambu PLA Sparkle"],
  ["GFA09", "Bambu PLA Tough"],
  ["GFA11", "Bambu PLA Aero"],
  ["GFA12", "Bambu PLA Glow"],
  ["GFA15", "Bambu PLA Galaxy"],
  ["GFA16", "Bambu PLA Wood"],
  ["GFA50", "Bambu PLA-CF"],
  ["GFB00", "Bambu ABS"],
  ["GFB01", "Bambu ASA"],
  ["GFB50", "Bambu ABS-GF"],
  ["GFC00", "Bambu PC"],
  ["GFG00", "Bambu PETG Basic"],
  ["GFG01", "Bambu PETG Translucent"],
  ["GFG02", "Bambu PETG HF"],
  ["GFG50", "Bambu PETG-CF"],
  ["GFN03", "Bambu PA-CF"],
  ["GFN05", "Bambu PA6-CF"],
  ["GFS04", "Bambu PVA"],
  ["GFU01", "Bambu TPU 95A"],
  ["GFU00", "Bambu TPU 95A HF"],
  ["GFL99", "Generic PLA"],
  ["GFL95", "Generic PLA High Speed"],
  ["GFL96", "Generic PLA Silk"],
  ["GFL98", "Generic PLA-CF"],
  ["GFG99", "Generic PETG"],
  ["GFG98", "Generic PETG-CF"],
  ["GFB99", "Generic ABS"],
  ["GFB98", "Generic ASA"],
  ["GFC99", "Generic PC"],
  ["GFN99", "Generic PA"],
  ["GFN98", "Generic PA-CF"],
  ["GFU99", "Generic TPU"],
  ["GFS99", "Generic PVA"],
  ["GFS98", "Generic HIPS"],
  ["GFL01", "PolyTerra PLA"],
  ["GFL00", "PolyLite PLA"],
];

export const BAMBU_FILAMENT_TYPES = [
  "PLA",
  "PLA-CF",
  "PLA-AERO",
  "PETG",
  "PETG-CF",
  "ABS",
  "ASA",
  "PC",
  "PA",
  "PA-CF",
  "PA6-CF",
  "PET-CF",
  "TPU",
  "PVA",
  "BVOH",
  "HIPS",
  "PP",
  "PE",
  "PPS-CF",
];

const filamentId = (ctx: Ctx) =>
  selector(
    ctx,
    "tray_info_idx",
    lab("tray_info_idx"),
    {
      select: {
        mode: "dropdown",
        custom_value: true,
        options: FILAMENTS.map(([value, name]) => ({
          value,
          label: `${name} (${value})`,
        })),
      },
    },
    "list"
  );

const filamentType = (ctx: Ctx) =>
  selector(
    ctx,
    "tray_type",
    lab("tray_type"),
    {
      select: {
        mode: "dropdown",
        custom_value: true,
        options: BAMBU_FILAMENT_TYPES.map((value) => ({ value, label: value })),
      },
    },
    "list"
  );

const AXES = ["X", "Y", "Z", "Home"];

export const INTEGRATION_EDITORS_BAMBU: Record<string, DomainEditor> = {
  bambu_lab: {
    siblings: [
      "print_project_file",
      "skip_objects",
      "move_axis",
      "extrude_retract",
      "load_filament",
      "unload_filament",
    ],
    cautions: {
      send_command: lab("caution_send_command"),
      print_project_file: lab("caution_print_project_file"),
      move_axis: lab("caution_move_axis"),
      extrude_retract: lab("caution_extrude_retract"),
      unload_filament: lab("caution_unload_filament"),
      load_filament: lab("caution_load_filament"),
    },
    controls: {
      // Last resort: raw G-code goes straight to the printer.
      send_command: (ctx) => [
        info("send_command_newline"),
        ...compact([
          device(ctx),
          text(ctx, "command", {
            multiline: true,
            showCount: true,
            chips: BAMBU_GCODE_CHIPS,
          }),
        ]),
      ],
      print_project_file: (ctx) => [
        ...compact([
          device(ctx),
          text(ctx, "filepath", { chips: FILE_CHIPS }),
          stepper(ctx, "plate", lab("plate"), 1, 100, 1),
        ]),
        info("preflight"),
        ...compact([
          toggle(ctx, "timelapse", lab("timelapse")),
          toggle(ctx, "bed_leveling", lab("bed_leveling")),
          toggle(ctx, "flow_cali", lab("flow_cali")),
          toggle(ctx, "vibration_cali", lab("vibration_cali")),
          toggle(ctx, "layer_inspect", lab("layer_inspect")),
          toggle(ctx, "use_ams", lab("use_ams")),
          text(ctx, "ams_mapping", { chips: MAPPING_CHIPS }),
        ]),
      ],
      skip_objects: (ctx) =>
        compact([
          device(ctx),
          text(ctx, "objects", {
            chips: [{ id: `${DOMAIN}__chip_comma`, text: "," }],
          }),
        ]),
      move_axis: (ctx) => {
        const axis = ctx.data.axis;
        const homing = axis === "Home";
        return compact([
          device(ctx),
          tiles(ctx, "axis", lab("axis"), AXES, lab("axis__")),
          homing
            ? undefined
            : slider(ctx, "distance", lab("distance"), -100, 100, 1, {
                unit: "mm",
              }),
        ]);
      },
      extrude_retract: (ctx) =>
        compact([
          device(ctx),
          tiles(
            ctx,
            "type",
            lab("type"),
            ["Extrude", "Retract"],
            lab("type__")
          ),
          toggle(ctx, "force", lab("force")),
        ]),
      retry_load_filament: noFields,
      done_load_filament: noFields,
      unload_filament: (ctx) => compact([device(ctx)]),
      load_filament: (ctx) =>
        compact([
          tray(ctx),
          slider(ctx, "temperature", lab("temperature"), 0, 250, 1, {
            unit: "°C",
          }),
        ]),
      set_filament: (ctx) =>
        compact([
          tray(ctx),
          filamentId(ctx),
          filamentType(ctx),
          text(ctx, "tray_color", {
            chips: BAMBU_COLOR_CHIPS,
            maxLength: 9,
          }),
          slider(ctx, "nozzle_temp_min", lab("nozzle_temp_min"), 160, 300, 1, {
            unit: "°C",
          }),
          slider(ctx, "nozzle_temp_max", lab("nozzle_temp_max"), 160, 300, 1, {
            unit: "°C",
          }),
        ]),
      get_filament_data: (ctx) => compact([device(ctx)]),
      read_rfid: (ctx) => compact([tray(ctx)]),
      start_filament_drying: (ctx) => [
        ...compact([
          device(ctx),
          slider(ctx, "temp", lab("temp"), 45, 85, 1, { unit: "°C" }),
        ]),
        info("drying_limits"),
        ...compact([
          slider(ctx, "duration", lab("duration"), 1, 24, 1, { unit: "h" }),
          toggle(ctx, "rotate_tray", lab("rotate_tray")),
        ]),
      ],
      stop_filament_drying: (ctx) => compact([device(ctx)]),
      force_filament_sync: (ctx) => compact([device(ctx)]),
    },
  },
};
