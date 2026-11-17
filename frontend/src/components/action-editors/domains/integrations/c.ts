import { hasTemplate } from "../../../../common/string/has-template";
import {
  choice,
  claim,
  compact,
  duration,
  entityTiles,
  L,
  notice,
  selector,
  slider,
  stepper,
  temporal,
  textBox,
  toggle,
} from "../../quick-helpers";
import type {
  DomainEditor,
  QuickContext,
  QuickControl,
  QuickFieldInfo,
  QuickValueType,
} from "../../quick-types";

/**
 * Tailored editors for the integrations hive to media_extractor (alphabetical
 * share "c"). Each service lists its fields once as data; one builder turns
 * the list into the same rich controls the other domain modules use. Ranges,
 * units and options come from each integration's services.yaml.
 */

type SpecKind =
  | "slider"
  | "stepper"
  | "tiles"
  | "rt"
  | "switch"
  | "text"
  | "time"
  | "date"
  | "datetime"
  | "dur"
  | "color"
  | "ent"
  | "sel";

interface Spec {
  /** Field key. */
  k: string;
  t: SpecKind;
  /** The service requires the field. */
  r?: 1;
  /** Name of the field group the service declares it under. */
  g?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Unit shown beside a numeral. */
  u?: string;
  /** Option values. */
  o?: string[];
  /** Selector configuration passed through to the selector control. */
  s?: Record<string, any>;
  /** Value type of a passed-through selector. */
  vt?: QuickValueType;
  /** Entity domain. */
  d?: string;
  /** Several entities. */
  m?: 0 | 1;
  /** Duration storage format. */
  f?: "seconds" | "hms";
  /** Colour model. */
  sp?: "rgb" | "hs" | "xy" | "rgbw" | "rgbww";
  /** Multi-line text with a counter. */
  ml?: 1;
  /** Password input. */
  pw?: 1;
  /** Input type of a text box. */
  it?: string;
  chips?: [string, string][];
}

const SPECS: Record<string, Record<string, Spec[]>> = {
  hive: {
    boost_heating_on: [
      { k: "time_period", r: 1, t: "dur", f: "hms" },
      { k: "temperature", t: "slider", min: 7, max: 35, step: 0.5, u: "°" },
    ],
    boost_heating_off: [{ k: "entity_id", r: 1, t: "ent", d: "climate", m: 0 }],
    boost_hot_water: [
      { k: "entity_id", r: 1, t: "ent", d: "water_heater", m: 0 },
      { k: "time_period", r: 1, t: "dur", f: "hms" },
      { k: "on_off", r: 1, t: "tiles", o: ["on", "off"] },
    ],
  },
  home_connect: {
    set_program_and_options: [
      {
        k: "device_id",
        r: 1,
        t: "sel",
        s: { device: { integration: "home_connect" } },
        vt: "other",
      },
      {
        k: "affects_to",
        r: 1,
        t: "tiles",
        o: ["active_program", "selected_program"],
      },
      { k: "program", t: "rt" },
      {
        k: "heating_ventilation_air_conditioning_air_conditioner_option_setpoint_temperature",
        g: "air_conditioner_options",
        t: "stepper",
        min: -1000,
        max: 10000,
        step: 0.1,
        u: "°C",
      },
      {
        k: "heating_ventilation_air_conditioning_air_conditioner_option_fan_speed_percentage",
        g: "air_conditioner_options",
        t: "stepper",
        min: 1,
        max: 100,
        step: 1,
        u: "%",
      },
      {
        k: "heating_ventilation_air_conditioning_air_conditioner_option_fan_speed_mode",
        g: "air_conditioner_options",
        t: "tiles",
        o: [
          "heating_ventilation_air_conditioning_air_conditioner_enum_type_fan_speed_mode_automatic",
          "heating_ventilation_air_conditioning_air_conditioner_enum_type_fan_speed_mode_manual",
        ],
      },
      {
        k: "consumer_products_cleaning_robot_option_reference_map_id",
        g: "cleaning_robot_options",
        t: "tiles",
        o: [
          "consumer_products_cleaning_robot_enum_type_available_maps_temp_map",
          "consumer_products_cleaning_robot_enum_type_available_maps_map_1",
          "consumer_products_cleaning_robot_enum_type_available_maps_map_2",
          "consumer_products_cleaning_robot_enum_type_available_maps_map_3",
        ],
      },
      {
        k: "consumer_products_cleaning_robot_option_cleaning_mode",
        g: "cleaning_robot_options",
        t: "tiles",
        o: [
          "consumer_products_cleaning_robot_enum_type_cleaning_modes_silent",
          "consumer_products_cleaning_robot_enum_type_cleaning_modes_standard",
          "consumer_products_cleaning_robot_enum_type_cleaning_modes_power",
          "consumer_products_cleaning_robot_enum_type_cleaning_mode_intelligent_mode",
          "consumer_products_cleaning_robot_enum_type_cleaning_mode_vacuum_only",
          "consumer_products_cleaning_robot_enum_type_cleaning_mode_mop_only",
          "consumer_products_cleaning_robot_enum_type_cleaning_mode_vacuum_and_mop",
          "consumer_products_cleaning_robot_enum_type_cleaning_mode_mop_after_vacuum",
        ],
      },
      {
        k: "consumer_products_cleaning_robot_option_suction_power",
        g: "cleaning_robot_options",
        t: "tiles",
        o: [
          "consumer_products_cleaning_robot_enum_type_suction_power_silent",
          "consumer_products_cleaning_robot_enum_type_suction_power_standard",
          "consumer_products_cleaning_robot_enum_type_suction_power_max",
        ],
      },
      {
        k: "consumer_products_coffee_maker_option_bean_amount",
        g: "coffee_maker_options",
        t: "tiles",
        o: [
          "consumer_products_coffee_maker_enum_type_bean_amount_very_mild",
          "consumer_products_coffee_maker_enum_type_bean_amount_mild",
          "consumer_products_coffee_maker_enum_type_bean_amount_mild_plus",
          "consumer_products_coffee_maker_enum_type_bean_amount_normal",
          "consumer_products_coffee_maker_enum_type_bean_amount_normal_plus",
          "consumer_products_coffee_maker_enum_type_bean_amount_strong",
          "consumer_products_coffee_maker_enum_type_bean_amount_strong_plus",
          "consumer_products_coffee_maker_enum_type_bean_amount_very_strong",
          "consumer_products_coffee_maker_enum_type_bean_amount_very_strong_plus",
          "consumer_products_coffee_maker_enum_type_bean_amount_extra_strong",
          "consumer_products_coffee_maker_enum_type_bean_amount_double_shot",
          "consumer_products_coffee_maker_enum_type_bean_amount_double_shot_plus",
          "consumer_products_coffee_maker_enum_type_bean_amount_double_shot_plus_plus",
          "consumer_products_coffee_maker_enum_type_bean_amount_triple_shot",
          "consumer_products_coffee_maker_enum_type_bean_amount_triple_shot_plus",
          "consumer_products_coffee_maker_enum_type_bean_amount_coffee_ground",
        ],
      },
      {
        k: "consumer_products_coffee_maker_option_fill_quantity",
        g: "coffee_maker_options",
        t: "stepper",
        min: 0,
        max: 10000,
        step: 1,
        u: "ml",
      },
      {
        k: "consumer_products_coffee_maker_option_coffee_temperature",
        g: "coffee_maker_options",
        t: "tiles",
        o: [
          "consumer_products_coffee_maker_enum_type_coffee_temperature_88_c",
          "consumer_products_coffee_maker_enum_type_coffee_temperature_90_c",
          "consumer_products_coffee_maker_enum_type_coffee_temperature_92_c",
          "consumer_products_coffee_maker_enum_type_coffee_temperature_94_c",
          "consumer_products_coffee_maker_enum_type_coffee_temperature_95_c",
          "consumer_products_coffee_maker_enum_type_coffee_temperature_96_c",
          "consumer_products_coffee_maker_enum_type_coffee_temperature_98_c",
        ],
      },
      {
        k: "consumer_products_coffee_maker_option_bean_container_selection",
        g: "coffee_maker_options",
        t: "tiles",
        o: [
          "consumer_products_coffee_maker_enum_type_bean_container_selection_right",
          "consumer_products_coffee_maker_enum_type_bean_container_selection_left",
        ],
      },
      {
        k: "consumer_products_coffee_maker_option_flow_rate",
        g: "coffee_maker_options",
        t: "tiles",
        o: [
          "consumer_products_coffee_maker_enum_type_flow_rate_normal",
          "consumer_products_coffee_maker_enum_type_flow_rate_intense",
          "consumer_products_coffee_maker_enum_type_flow_rate_intense_plus",
        ],
      },
      {
        k: "consumer_products_coffee_maker_option_multiple_beverages",
        g: "coffee_maker_options",
        t: "switch",
      },
      {
        k: "consumer_products_coffee_maker_option_coffee_milk_ratio",
        g: "coffee_maker_options",
        t: "tiles",
        o: [
          "consumer_products_coffee_maker_enum_type_coffee_milk_ratio_10_percent",
          "consumer_products_coffee_maker_enum_type_coffee_milk_ratio_20_percent",
          "consumer_products_coffee_maker_enum_type_coffee_milk_ratio_25_percent",
          "consumer_products_coffee_maker_enum_type_coffee_milk_ratio_30_percent",
          "consumer_products_coffee_maker_enum_type_coffee_milk_ratio_40_percent",
          "consumer_products_coffee_maker_enum_type_coffee_milk_ratio_50_percent",
          "consumer_products_coffee_maker_enum_type_coffee_milk_ratio_55_percent",
          "consumer_products_coffee_maker_enum_type_coffee_milk_ratio_60_percent",
          "consumer_products_coffee_maker_enum_type_coffee_milk_ratio_65_percent",
          "consumer_products_coffee_maker_enum_type_coffee_milk_ratio_67_percent",
          "consumer_products_coffee_maker_enum_type_coffee_milk_ratio_70_percent",
          "consumer_products_coffee_maker_enum_type_coffee_milk_ratio_75_percent",
          "consumer_products_coffee_maker_enum_type_coffee_milk_ratio_80_percent",
          "consumer_products_coffee_maker_enum_type_coffee_milk_ratio_85_percent",
          "consumer_products_coffee_maker_enum_type_coffee_milk_ratio_90_percent",
        ],
      },
      {
        k: "consumer_products_coffee_maker_option_hot_water_temperature",
        g: "coffee_maker_options",
        t: "tiles",
        o: [
          "consumer_products_coffee_maker_enum_type_hot_water_temperature_white_tea",
          "consumer_products_coffee_maker_enum_type_hot_water_temperature_green_tea",
          "consumer_products_coffee_maker_enum_type_hot_water_temperature_black_tea",
          "consumer_products_coffee_maker_enum_type_hot_water_temperature_50_c",
          "consumer_products_coffee_maker_enum_type_hot_water_temperature_55_c",
          "consumer_products_coffee_maker_enum_type_hot_water_temperature_60_c",
          "consumer_products_coffee_maker_enum_type_hot_water_temperature_65_c",
          "consumer_products_coffee_maker_enum_type_hot_water_temperature_70_c",
          "consumer_products_coffee_maker_enum_type_hot_water_temperature_75_c",
          "consumer_products_coffee_maker_enum_type_hot_water_temperature_80_c",
          "consumer_products_coffee_maker_enum_type_hot_water_temperature_85_c",
          "consumer_products_coffee_maker_enum_type_hot_water_temperature_90_c",
          "consumer_products_coffee_maker_enum_type_hot_water_temperature_95_c",
          "consumer_products_coffee_maker_enum_type_hot_water_temperature_97_c",
          "consumer_products_coffee_maker_enum_type_hot_water_temperature_122_f",
          "consumer_products_coffee_maker_enum_type_hot_water_temperature_131_f",
          "consumer_products_coffee_maker_enum_type_hot_water_temperature_140_f",
          "consumer_products_coffee_maker_enum_type_hot_water_temperature_149_f",
          "consumer_products_coffee_maker_enum_type_hot_water_temperature_158_f",
          "consumer_products_coffee_maker_enum_type_hot_water_temperature_167_f",
          "consumer_products_coffee_maker_enum_type_hot_water_temperature_176_f",
          "consumer_products_coffee_maker_enum_type_hot_water_temperature_185_f",
          "consumer_products_coffee_maker_enum_type_hot_water_temperature_194_f",
          "consumer_products_coffee_maker_enum_type_hot_water_temperature_203_f",
          "consumer_products_coffee_maker_enum_type_hot_water_temperature_max",
        ],
      },
      {
        k: "b_s_h_common_option_start_in_relative",
        g: "dish_washer_options",
        t: "dur",
        f: "seconds",
      },
      {
        k: "dishcare_dishwasher_option_intensiv_zone",
        g: "dish_washer_options",
        t: "switch",
      },
      {
        k: "dishcare_dishwasher_option_brilliance_dry",
        g: "dish_washer_options",
        t: "switch",
      },
      {
        k: "dishcare_dishwasher_option_vario_speed_plus",
        g: "dish_washer_options",
        t: "switch",
      },
      {
        k: "dishcare_dishwasher_option_silence_on_demand",
        g: "dish_washer_options",
        t: "switch",
      },
      {
        k: "dishcare_dishwasher_option_half_load",
        g: "dish_washer_options",
        t: "switch",
      },
      {
        k: "dishcare_dishwasher_option_extra_dry",
        g: "dish_washer_options",
        t: "switch",
      },
      {
        k: "dishcare_dishwasher_option_hygiene_plus",
        g: "dish_washer_options",
        t: "switch",
      },
      {
        k: "dishcare_dishwasher_option_eco_dry",
        g: "dish_washer_options",
        t: "switch",
      },
      {
        k: "dishcare_dishwasher_option_zeolite_dry",
        g: "dish_washer_options",
        t: "switch",
      },
      {
        k: "laundry_care_dryer_option_drying_target",
        g: "dryer_options",
        t: "tiles",
        o: [
          "laundry_care_dryer_enum_type_drying_target_iron_dry",
          "laundry_care_dryer_enum_type_drying_target_gentle_dry",
          "laundry_care_dryer_enum_type_drying_target_cupboard_dry",
          "laundry_care_dryer_enum_type_drying_target_cupboard_dry_plus",
          "laundry_care_dryer_enum_type_drying_target_extra_dry",
        ],
      },
      {
        k: "cooking_common_option_hood_venting_level",
        g: "hood_options",
        t: "tiles",
        o: [
          "cooking_hood_enum_type_stage_fan_off",
          "cooking_hood_enum_type_stage_fan_stage_01",
          "cooking_hood_enum_type_stage_fan_stage_02",
          "cooking_hood_enum_type_stage_fan_stage_03",
          "cooking_hood_enum_type_stage_fan_stage_04",
          "cooking_hood_enum_type_stage_fan_stage_05",
        ],
      },
      {
        k: "cooking_common_option_hood_intensive_level",
        g: "hood_options",
        t: "tiles",
        o: [
          "cooking_hood_enum_type_intensive_stage_intensive_stage_off",
          "cooking_hood_enum_type_intensive_stage_intensive_stage_1",
          "cooking_hood_enum_type_intensive_stage_intensive_stage_2",
        ],
      },
      {
        k: "cooking_oven_option_setpoint_temperature",
        g: "oven_options",
        t: "stepper",
        min: 0,
        max: 10000,
        step: 1,
        u: "°C",
      },
      {
        k: "b_s_h_common_option_duration",
        g: "oven_options",
        t: "dur",
        f: "seconds",
      },
      {
        k: "cooking_oven_option_fast_pre_heat",
        g: "oven_options",
        t: "switch",
      },
      {
        k: "cooking_oven_option_warming_level",
        g: "warming_drawer_options",
        t: "tiles",
        o: [
          "cooking_oven_enum_type_warming_level_low",
          "cooking_oven_enum_type_warming_level_medium",
          "cooking_oven_enum_type_warming_level_high",
        ],
      },
      {
        k: "laundry_care_washer_option_rinse_plus",
        g: "washer_options",
        t: "tiles",
        o: ["laundry_care_washer_enum_type_rinse_plus_off"],
      },
      {
        k: "laundry_care_washer_option_temperature",
        g: "washer_options",
        t: "tiles",
        o: [
          "laundry_care_washer_enum_type_temperature_cold",
          "laundry_care_washer_enum_type_temperature_g_c_20",
          "laundry_care_washer_enum_type_temperature_g_c_30",
          "laundry_care_washer_enum_type_temperature_g_c_40",
          "laundry_care_washer_enum_type_temperature_g_c_50",
          "laundry_care_washer_enum_type_temperature_g_c_60",
          "laundry_care_washer_enum_type_temperature_g_c_70",
          "laundry_care_washer_enum_type_temperature_g_c_80",
          "laundry_care_washer_enum_type_temperature_g_c_90",
          "laundry_care_washer_enum_type_temperature_ul_cold",
          "laundry_care_washer_enum_type_temperature_ul_warm",
          "laundry_care_washer_enum_type_temperature_ul_hot",
          "laundry_care_washer_enum_type_temperature_ul_extra_hot",
        ],
      },
      {
        k: "laundry_care_washer_option_spin_speed",
        g: "washer_options",
        t: "tiles",
        o: [
          "laundry_care_washer_enum_type_spin_speed_off",
          "laundry_care_washer_enum_type_spin_speed_r_p_m_400",
          "laundry_care_washer_enum_type_spin_speed_r_p_m_600",
          "laundry_care_washer_enum_type_spin_speed_r_p_m_700",
          "laundry_care_washer_enum_type_spin_speed_r_p_m_800",
          "laundry_care_washer_enum_type_spin_speed_r_p_m_900",
          "laundry_care_washer_enum_type_spin_speed_r_p_m_1000",
          "laundry_care_washer_enum_type_spin_speed_r_p_m_1200",
          "laundry_care_washer_enum_type_spin_speed_r_p_m_1400",
          "laundry_care_washer_enum_type_spin_speed_r_p_m_1600",
          "laundry_care_washer_enum_type_spin_speed_ul_off",
          "laundry_care_washer_enum_type_spin_speed_ul_low",
          "laundry_care_washer_enum_type_spin_speed_ul_medium",
          "laundry_care_washer_enum_type_spin_speed_ul_high",
        ],
      },
      {
        k: "laundry_care_washer_option_stains",
        g: "washer_options",
        t: "tiles",
        o: ["laundry_care_washer_enum_type_stains_off"],
      },
      {
        k: "b_s_h_common_option_finish_in_relative",
        g: "washer_options",
        t: "dur",
        f: "seconds",
      },
      {
        k: "laundry_care_common_option_silent_mode",
        g: "washer_options",
        t: "switch",
      },
      {
        k: "laundry_care_washer_option_i_dos_1_active",
        g: "washer_options",
        t: "switch",
      },
      {
        k: "laundry_care_washer_option_i_dos_2_active",
        g: "washer_options",
        t: "switch",
      },
      {
        k: "laundry_care_washer_option_intensive_plus",
        g: "washer_options",
        t: "switch",
      },
      {
        k: "laundry_care_washer_option_less_ironing",
        g: "washer_options",
        t: "switch",
      },
      {
        k: "laundry_care_washer_option_mini_load",
        g: "washer_options",
        t: "switch",
      },
      {
        k: "laundry_care_washer_option_prewash",
        g: "washer_options",
        t: "switch",
      },
      {
        k: "laundry_care_washer_option_rinse_hold",
        g: "washer_options",
        t: "switch",
      },
      {
        k: "laundry_care_washer_option_soak",
        g: "washer_options",
        t: "switch",
      },
      {
        k: "laundry_care_washer_option_water_plus",
        g: "washer_options",
        t: "switch",
      },
      {
        k: "laundry_care_common_option_vario_perfect",
        g: "washer_options",
        t: "tiles",
        o: [
          "laundry_care_common_enum_type_vario_perfect_off",
          "laundry_care_common_enum_type_vario_perfect_eco_perfect",
          "laundry_care_common_enum_type_vario_perfect_speed_perfect",
        ],
      },
    ],
    change_setting: [
      {
        k: "device_id",
        r: 1,
        t: "sel",
        s: { device: { integration: "home_connect" } },
        vt: "other",
      },
      {
        k: "key",
        r: 1,
        t: "text",
        chips: [
          ["child_lock", "BSH.Common.Setting.ChildLock"],
          ["power_state", "BSH.Common.Setting.PowerState"],
          ["alarm_clock", "BSH.Common.Setting.AlarmClock"],
        ],
      },
      { k: "value", r: 1, t: "text", s: { object: null }, vt: "object" },
    ],
    start_selected_program: [
      {
        k: "device_id",
        r: 1,
        t: "sel",
        s: { device: { integration: "home_connect" } },
        vt: "other",
      },
      { k: "b_s_h_common_option_finish_in_relative", t: "dur", f: "seconds" },
      { k: "b_s_h_common_option_start_in_relative", t: "dur", f: "seconds" },
    ],
  },
  homekit: {
    reload: [],
    reset_accessory: [
      {
        k: "entity_id",
        r: 1,
        t: "sel",
        s: { entity: { multiple: true } },
        vt: "entity",
      },
    ],
    unpair: [
      {
        k: "device_id",
        r: 1,
        t: "sel",
        s: { device: { multiple: true, integration: "homekit" } },
        vt: "other",
      },
    ],
  },
  homematic: {
    virtualkey: [
      { k: "address", r: 1, t: "text" },
      { k: "channel", r: 1, t: "slider", min: 1, max: 6, step: 1 },
      { k: "param", r: 1, t: "text" },
      { k: "interface", t: "text" },
    ],
    set_variable_value: [
      { k: "name", r: 1, t: "text" },
      { k: "value", r: 1, t: "text" },
      { k: "entity_id", t: "ent", d: "homematic", m: 0 },
    ],
    set_device_value: [
      { k: "address", r: 1, t: "text" },
      { k: "channel", r: 1, t: "slider", min: 1, max: 6, step: 1 },
      { k: "param", r: 1, t: "text" },
      { k: "value", r: 1, t: "text" },
      { k: "interface", t: "text" },
      {
        k: "value_type",
        t: "tiles",
        o: ["boolean", "dateTime.iso8601", "double", "int", "string"],
      },
    ],
    reconnect: [],
    set_install_mode: [
      { k: "interface", r: 1, t: "text" },
      { k: "mode", t: "slider", min: 1, max: 2, step: 1 },
      { k: "time", t: "dur", f: "seconds" },
      { k: "address", t: "text" },
    ],
    put_paramset: [
      { k: "interface", r: 1, t: "text" },
      { k: "address", r: 1, t: "text" },
      { k: "paramset_key", r: 1, t: "text" },
      { k: "paramset", r: 1, t: "sel", s: { object: null }, vt: "object" },
      { k: "rx_mode", t: "text" },
    ],
  },
  homematicip_cloud: {
    activate_eco_mode_with_duration: [
      {
        k: "duration",
        r: 1,
        t: "slider",
        min: 1,
        max: 1440,
        step: 1,
        u: "minutes",
      },
      { k: "accesspoint_id", t: "text" },
    ],
    activate_eco_mode_with_period: [
      { k: "endtime", r: 1, t: "datetime" },
      { k: "accesspoint_id", t: "text" },
    ],
    activate_vacation: [
      { k: "endtime", r: 1, t: "datetime" },
      {
        k: "temperature",
        r: 1,
        t: "slider",
        min: 0,
        max: 55,
        step: 0.5,
        u: "°",
      },
      { k: "accesspoint_id", t: "text" },
    ],
    deactivate_eco_mode: [{ k: "accesspoint_id", t: "text" }],
    deactivate_vacation: [{ k: "accesspoint_id", t: "text" }],
    set_active_climate_profile: [
      { k: "entity_id", r: 1, t: "text" },
      {
        k: "climate_profile_index",
        r: 1,
        t: "slider",
        min: 1,
        max: 100,
        step: 1,
      },
    ],
    dump_hap_config: [
      { k: "config_output_path", t: "text" },
      { k: "config_output_file_prefix", t: "text" },
      { k: "anonymize", t: "switch" },
    ],
    reset_energy_counter: [{ k: "entity_id", r: 1, t: "text" }],
    set_home_cooling_mode: [
      { k: "cooling", t: "switch" },
      { k: "accesspoint_id", t: "text" },
    ],
    pull_latch: [
      {
        k: "device_id",
        r: 1,
        t: "sel",
        s: { device: { integration: "homematicip_cloud", multiple: true } },
        vt: "other",
      },
      { k: "pin", t: "text", pw: 1 },
    ],
  },
  homeworks: {
    send_command: [
      { k: "controller_id", r: 1, t: "text" },
      {
        k: "command",
        r: 1,
        t: "sel",
        s: { text: { multiple: true } },
        vt: "list",
      },
    ],
  },
  html5: {
    send_message: [
      { k: "title", r: 1, t: "text" },
      { k: "message", t: "text", ml: 1 },
      { k: "icon", t: "text", it: "url" },
      { k: "badge", t: "text", it: "url" },
      { k: "image", t: "text", it: "url" },
      { k: "tag", t: "text" },
      {
        k: "actions",
        t: "sel",
        s: {
          object: {
            label_field: "action",
            description_field: "title",
            multiple: true,
            translation_key: "actions",
            fields: {
              action: { required: true, selector: { text: null } },
              title: { required: true, selector: { text: null } },
              icon: { selector: { text: { type: "url" } } },
            },
          },
        },
        vt: "object",
      },
      { k: "dir", t: "tiles", o: ["auto", "ltr", "rtl"] },
      { k: "renotify", t: "switch" },
      { k: "silent", t: "switch" },
      { k: "require_interaction", t: "switch" },
      {
        k: "vibrate",
        t: "sel",
        s: { text: { multiple: true, type: "number", suffix: "ms" } },
        vt: "list",
      },
      { k: "lang", t: "sel", s: { language: null }, vt: "language" },
      { k: "timestamp", t: "datetime" },
      {
        k: "ttl",
        t: "sel",
        s: { duration: { enable_day: true } },
        vt: "duration",
      },
      { k: "urgency", t: "tiles", o: ["low", "normal", "high"] },
      { k: "data", t: "sel", s: { object: null }, vt: "object" },
    ],
    dismiss_message: [{ k: "tag", t: "text" }],
  },
  huawei_lte: {
    resume_integration: [{ k: "url", t: "text" }],
    suspend_integration: [{ k: "url", t: "text" }],
  },
  hue: {
    hue_activate_scene: [
      { k: "group_name", t: "text" },
      { k: "scene_name", t: "text" },
      { k: "dynamic", t: "switch" },
    ],
    activate_scene: [
      { k: "transition", t: "dur", f: "seconds" },
      { k: "dynamic", t: "switch" },
      {
        k: "speed",
        g: "scene_customization",
        t: "slider",
        min: 0,
        max: 100,
        step: 1,
      },
      {
        k: "brightness",
        g: "scene_customization",
        t: "slider",
        min: 1,
        max: 255,
        step: 1,
      },
    ],
  },
  husqvarna_automower: {
    override_schedule: [
      {
        k: "duration",
        r: 1,
        t: "sel",
        s: { duration: { enable_day: true, enable_second: false } },
        vt: "duration",
      },
      { k: "override_mode", r: 1, t: "tiles", o: ["mow", "park"] },
    ],
    override_schedule_work_area: [
      {
        k: "duration",
        r: 1,
        t: "sel",
        s: { duration: { enable_day: true, enable_second: false } },
        vt: "duration",
      },
      { k: "work_area_id", r: 1, t: "text", it: "number" },
    ],
  },
  hydrawise: {
    start_watering: [
      { k: "duration", t: "stepper", min: 0, max: 1440, step: 1, u: "min" },
    ],
    suspend: [{ k: "until", r: 1, t: "datetime" }],
    resume: [],
  },
  icloud: {
    update: [{ k: "account", r: 1, t: "text" }],
    play_sound: [
      { k: "account", r: 1, t: "text" },
      { k: "device_name", r: 1, t: "text" },
    ],
    display_message: [
      { k: "account", r: 1, t: "text" },
      { k: "device_name", r: 1, t: "text" },
      { k: "message", r: 1, t: "text", ml: 1 },
      { k: "sound", t: "switch" },
    ],
    lost_device: [
      { k: "account", r: 1, t: "text" },
      { k: "device_name", r: 1, t: "text" },
      { k: "number", r: 1, t: "text" },
      { k: "message", r: 1, t: "text", ml: 1 },
    ],
  },
  ifttt: {
    push_alarm_state: [
      { k: "entity_id", r: 1, t: "ent", d: "alarm_control_panel", m: 0 },
      { k: "state", r: 1, t: "text" },
    ],
    trigger: [
      { k: "event", r: 1, t: "text" },
      { k: "value1", t: "text" },
      { k: "value2", t: "text" },
      { k: "value3", t: "text" },
    ],
  },
  ihc: {
    set_runtime_value_bool: [
      { k: "ihc_id", r: 1, t: "stepper", min: 0, max: 1000000, step: 1 },
      { k: "value", r: 1, t: "switch" },
      { k: "controller_id", t: "slider", min: 0, max: 100, step: 1 },
    ],
    set_runtime_value_int: [
      { k: "ihc_id", r: 1, t: "stepper", min: 0, max: 1000000, step: 1 },
      { k: "value", r: 1, t: "stepper", min: 0, max: 1000000, step: 1 },
      { k: "controller_id", t: "slider", min: 0, max: 100, step: 1 },
    ],
    set_runtime_value_float: [
      { k: "ihc_id", r: 1, t: "stepper", min: 0, max: 1000000, step: 1 },
      { k: "value", r: 1, t: "stepper", min: 0, max: 10000, step: 0.01 },
      { k: "controller_id", t: "slider", min: 0, max: 100, step: 1 },
    ],
    pulse: [
      { k: "ihc_id", r: 1, t: "stepper", min: 0, max: 1000000, step: 1 },
      { k: "controller_id", t: "slider", min: 0, max: 100, step: 1 },
    ],
  },
  imap: {
    seen: [
      {
        k: "entry",
        r: 1,
        t: "sel",
        s: { config_entry: { integration: "imap" } },
        vt: "other",
      },
      { k: "uid", r: 1, t: "text" },
    ],
    move: [
      {
        k: "entry",
        r: 1,
        t: "sel",
        s: { config_entry: { integration: "imap" } },
        vt: "other",
      },
      { k: "uid", r: 1, t: "text" },
      { k: "target_folder", r: 1, t: "text" },
      { k: "seen", t: "switch" },
    ],
    delete: [
      {
        k: "entry",
        r: 1,
        t: "sel",
        s: { config_entry: { integration: "imap" } },
        vt: "other",
      },
      { k: "uid", r: 1, t: "text" },
    ],
    fetch: [
      {
        k: "entry",
        r: 1,
        t: "sel",
        s: { config_entry: { integration: "imap" } },
        vt: "other",
      },
      { k: "uid", r: 1, t: "text" },
    ],
    fetch_part: [
      {
        k: "entry",
        r: 1,
        t: "sel",
        s: { config_entry: { integration: "imap" } },
        vt: "other",
      },
      { k: "uid", r: 1, t: "text" },
      { k: "part", r: 1, t: "text" },
    ],
  },
  immich: {
    upload_file: [
      {
        k: "config_entry_id",
        r: 1,
        t: "sel",
        s: { config_entry: { integration: "immich" } },
        vt: "other",
      },
      { k: "file", r: 1, t: "sel", s: { media: {} }, vt: "media" },
      { k: "album_id", t: "text" },
    ],
  },
  indevolt: {
    charge: [
      {
        k: "device_id",
        r: 1,
        t: "sel",
        s: { device: { multiple: true, integration: "indevolt" } },
        vt: "other",
      },
      { k: "target_soc", r: 1, t: "slider", min: 0, max: 100, step: 1, u: "%" },
      { k: "power", r: 1, t: "stepper", min: 0, max: 10800, step: 1, u: "W" },
    ],
    discharge: [
      {
        k: "device_id",
        r: 1,
        t: "sel",
        s: { device: { multiple: true, integration: "indevolt" } },
        vt: "other",
      },
      { k: "target_soc", r: 1, t: "slider", min: 0, max: 100, step: 1, u: "%" },
      { k: "power", r: 1, t: "stepper", min: 0, max: 10800, step: 1, u: "W" },
    ],
  },
  insteon: {
    add_all_link: [
      { k: "group", r: 1, t: "slider", min: 0, max: 255, step: 1 },
      { k: "mode", r: 1, t: "tiles", o: ["controller", "responder"] },
    ],
    delete_all_link: [
      { k: "group", r: 1, t: "slider", min: 0, max: 255, step: 1 },
    ],
    load_all_link_database: [
      { k: "entity_id", r: 1, t: "text" },
      { k: "reload", t: "switch" },
    ],
    print_all_link_database: [
      {
        k: "entity_id",
        r: 1,
        t: "sel",
        s: { entity: { integration: "insteon" } },
        vt: "entity",
      },
    ],
    print_im_all_link_database: [],
    x10_all_units_off: [
      {
        k: "housecode",
        r: 1,
        t: "tiles",
        o: [
          "a",
          "b",
          "c",
          "d",
          "e",
          "f",
          "g",
          "h",
          "i",
          "j",
          "k",
          "l",
          "m",
          "n",
          "o",
          "p",
        ],
      },
    ],
    x10_all_lights_on: [
      {
        k: "housecode",
        r: 1,
        t: "tiles",
        o: [
          "a",
          "b",
          "c",
          "d",
          "e",
          "f",
          "g",
          "h",
          "i",
          "j",
          "k",
          "l",
          "m",
          "n",
          "o",
          "p",
        ],
      },
    ],
    x10_all_lights_off: [
      {
        k: "housecode",
        r: 1,
        t: "tiles",
        o: [
          "a",
          "b",
          "c",
          "d",
          "e",
          "f",
          "g",
          "h",
          "i",
          "j",
          "k",
          "l",
          "m",
          "n",
          "o",
          "p",
        ],
      },
    ],
    scene_on: [{ k: "group", r: 1, t: "slider", min: 0, max: 255, step: 1 }],
    scene_off: [{ k: "group", r: 1, t: "slider", min: 0, max: 255, step: 1 }],
    add_default_links: [{ k: "entity_id", r: 1, t: "text" }],
  },
  intent_script: { reload: [] },
  iperf3: { speedtest: [{ k: "host", t: "text" }] },
  isy994: {
    send_raw_node_command: [
      { k: "command", r: 1, t: "text" },
      { k: "value", t: "slider", min: 0, max: 255, step: 1 },
      { k: "parameters", t: "sel", s: { object: null }, vt: "object" },
      { k: "unit_of_measurement", t: "slider", min: 0, max: 120, step: 1 },
    ],
    send_node_command: [
      {
        k: "command",
        r: 1,
        t: "tiles",
        o: [
          "beep",
          "brighten",
          "dim",
          "disable",
          "enable",
          "fade_down",
          "fade_stop",
          "fade_up",
          "fast_off",
          "fast_on",
          "query",
        ],
      },
    ],
    get_zwave_parameter: [
      { k: "parameter", t: "slider", min: 1, max: 255, step: 1 },
    ],
    set_zwave_parameter: [
      { k: "parameter", r: 1, t: "slider", min: 1, max: 255, step: 1 },
      { k: "value", r: 1, t: "text" },
      { k: "size", r: 1, t: "tiles", o: ["1", "2", "4"] },
    ],
    set_zwave_lock_user_code: [
      { k: "user_num", r: 1, t: "slider", min: 1, max: 255, step: 1 },
      { k: "code", r: 1, t: "text", pw: 1 },
    ],
    delete_zwave_lock_user_code: [
      { k: "user_num", r: 1, t: "slider", min: 1, max: 255, step: 1 },
    ],
    rename_node: [{ k: "name", r: 1, t: "text" }],
    send_program_command: [
      {
        k: "command",
        r: 1,
        t: "tiles",
        o: [
          "disable",
          "disable_run_at_startup",
          "enable",
          "enable_run_at_startup",
          "run",
          "run_else",
          "run_then",
          "stop",
        ],
      },
      { k: "address", t: "text" },
      { k: "name", t: "text" },
      { k: "isy", t: "text" },
    ],
  },
  izone: {
    airflow_min: [
      { k: "airflow", r: 1, t: "slider", min: 0, max: 100, step: 5, u: "%" },
    ],
    airflow_max: [
      { k: "airflow", r: 1, t: "slider", min: 0, max: 100, step: 5, u: "%" },
    ],
  },
  jellyfin: {
    play_media_shuffle: [
      { k: "media", r: 1, t: "sel", s: { media: {} }, vt: "media" },
    ],
  },
  jewish_calendar: {
    count_omer: [
      {
        k: "nusach",
        r: 1,
        t: "tiles",
        o: ["sfarad", "ashkenaz", "adot_mizrah", "italian"],
      },
      { k: "date", t: "date" },
      { k: "after_sunset", t: "switch" },
      {
        k: "language",
        t: "sel",
        s: { language: { languages: ["en", "he", "fr"] } },
        vt: "language",
      },
    ],
  },
  joaoapps_join: {
    ring: [],
    set_wallpaper: [{ k: "url", t: "text", it: "url", r: 1 }],
    send_sms: [
      { k: "number", t: "text", r: 1, it: "tel" },
      { k: "message", t: "text", ml: 1, r: 1 },
    ],
    send_file: [{ k: "url", t: "text", it: "url", r: 1 }],
    send_url: [{ k: "url", t: "text", it: "url", r: 1 }],
    send_tasker: [{ k: "command", t: "text", r: 1 }],
  },
  keba: {
    request_data: [],
    authorize: [],
    deauthorize: [],
    set_energy: [
      { k: "energy", t: "slider", min: 0, max: 100, step: 0.1, u: "kWh" },
    ],
    set_current: [
      { k: "current", t: "slider", min: 6, max: 63, step: 0.1, u: "A" },
    ],
    enable: [],
    disable: [],
    set_failsafe: [
      { k: "failsafe_timeout", t: "dur", f: "seconds" },
      {
        k: "failsafe_fallback",
        t: "slider",
        min: 6,
        max: 63,
        step: 0.1,
        u: "A",
      },
      { k: "failsafe_persist", t: "stepper", min: 0, max: 1, step: 1 },
    ],
  },
  kef: {
    update_dsp: [],
    set_mode: [
      { k: "desk_mode", t: "switch" },
      { k: "wall_mode", t: "switch" },
      { k: "phase_correction", t: "switch" },
      { k: "high_pass", t: "switch" },
      { k: "sub_polarity", t: "tiles", o: ["-", "+"] },
      { k: "bass_extension", t: "tiles", o: ["Less", "Standard", "Extra"] },
    ],
    set_desk_db: [
      { k: "db_value", t: "slider", min: -6, max: 0, step: 0.5, u: "dB" },
    ],
    set_wall_db: [
      { k: "db_value", t: "slider", min: -6, max: 0, step: 0.5, u: "dB" },
    ],
    set_treble_db: [
      { k: "db_value", t: "slider", min: -2, max: 2, step: 0.5, u: "dB" },
    ],
    set_high_hz: [
      { k: "hz_value", t: "slider", min: 50, max: 120, step: 5, u: "Hz" },
    ],
    set_low_hz: [
      { k: "hz_value", t: "slider", min: 40, max: 250, step: 5, u: "Hz" },
    ],
    set_sub_db: [
      { k: "db_value", t: "slider", min: -10, max: 10, step: 1, u: "dB" },
    ],
  },
  keymitt_ble: {
    calibrate: [
      { k: "depth", r: 1, t: "slider", min: 0, max: 100, step: 1, u: "%" },
      { k: "duration", r: 1, t: "dur", f: "seconds" },
      { k: "mode", r: 1, t: "tiles", o: ["normal", "invert", "toggle"] },
      { k: "entity_id", t: "ent", d: "switch", m: 0 },
    ],
  },
  kiosker: {
    navigate_url: [
      {
        k: "device_id",
        r: 1,
        t: "sel",
        s: { device: { integration: "kiosker" } },
        vt: "other",
      },
      { k: "url", r: 1, t: "text" },
    ],
    set_blackout: [
      {
        k: "device_id",
        r: 1,
        t: "sel",
        s: { device: { integration: "kiosker" } },
        vt: "other",
      },
      { k: "visible", t: "switch" },
      { k: "text", t: "text" },
      { k: "background", t: "color", sp: "rgb" },
      { k: "foreground", t: "color", sp: "rgb" },
      { k: "icon", t: "text" },
      { k: "expire", t: "dur", f: "seconds" },
      { k: "dismissible", t: "switch" },
      { k: "button_background", t: "color", sp: "rgb" },
      { k: "button_foreground", t: "color", sp: "rgb" },
      { k: "button_text", t: "text" },
      { k: "sound", t: "text" },
    ],
  },
  kitchen_sink: {
    test_service_1: [
      { k: "field_1", r: 1, t: "dur", f: "seconds" },
      { k: "field_2", r: 1, t: "tiles", o: ["off", "auto", "cool"] },
      {
        k: "field_3",
        g: "additional_fields",
        t: "slider",
        min: 0,
        max: 24,
        step: 1,
        u: "hours",
      },
      {
        k: "field_4",
        g: "additional_fields",
        t: "tiles",
        o: ["forward", "reverse"],
      },
    ],
    set_tracker_location: [
      { k: "latitude", r: 1, t: "text", it: "number" },
      { k: "longitude", r: 1, t: "text", it: "number" },
      { k: "accuracy", r: 1, t: "slider", min: 0, max: 10000, step: 1, u: "m" },
    ],
    set_scanner_connected: [{ k: "connected", r: 1, t: "switch" }],
  },
  knx: {
    send: [
      { k: "address", r: 1, t: "text", s: { object: null }, vt: "object" },
      { k: "payload", r: 1, t: "text", s: { object: null }, vt: "object" },
      { k: "response", r: 1, t: "switch" },
      { k: "type", t: "text" },
    ],
    read: [
      { k: "address", r: 1, t: "text", s: { object: null }, vt: "object" },
    ],
    event_register: [
      { k: "address", r: 1, t: "text", s: { object: null }, vt: "object" },
      { k: "remove", r: 1, t: "switch" },
      { k: "type", t: "text" },
    ],
    exposure_register: [
      { k: "address", r: 1, t: "text" },
      { k: "type", r: 1, t: "text" },
      { k: "entity_id", r: 1, t: "sel", s: { entity: null }, vt: "entity" },
      { k: "remove", r: 1, t: "switch" },
      { k: "attribute", t: "text" },
      { k: "default", t: "sel", s: { object: null }, vt: "object" },
    ],
    reload: [],
    save_scene: [],
  },
  kodi: {
    add_to_playlist: [
      { k: "media_type", r: 1, t: "tiles", o: ["ALBUM", "SONG"] },
      { k: "media_id", t: "text" },
      { k: "media_name", t: "text" },
      { k: "artist_name", t: "text" },
    ],
    call_method: [{ k: "method", r: 1, t: "text" }],
  },
  lametric: {
    chart: [
      {
        k: "device_id",
        r: 1,
        t: "sel",
        s: { device: { integration: "lametric" } },
        vt: "other",
      },
      { k: "data", r: 1, t: "sel", s: { object: null }, vt: "object" },
      { k: "sound", t: "rt" },
      { k: "sound_url", t: "sel", s: { media: {} }, vt: "media" },
      { k: "cycles", t: "slider", min: 0, max: 10, step: 1 },
      { k: "repeat", t: "stepper", min: 0, max: 10, step: 1 },
      { k: "icon_type", t: "tiles", o: ["none", "info", "alert"] },
      { k: "priority", t: "tiles", o: ["info", "warning", "critical"] },
    ],
    message: [
      {
        k: "device_id",
        r: 1,
        t: "sel",
        s: { device: { integration: "lametric" } },
        vt: "other",
      },
      { k: "message", r: 1, t: "text", ml: 1 },
      { k: "icon", t: "text" },
      { k: "sound", t: "rt" },
      { k: "sound_url", t: "sel", s: { media: {} }, vt: "media" },
      { k: "cycles", t: "slider", min: 0, max: 10, step: 1 },
      { k: "icon_type", t: "tiles", o: ["none", "info", "alert"] },
      { k: "priority", t: "tiles", o: ["info", "warning", "critical"] },
      { k: "repeat", t: "stepper", min: 0, max: 10, step: 1 },
    ],
  },
  lcn: {
    output_abs: [
      {
        k: "device_id",
        r: 1,
        t: "sel",
        s: {
          device: {
            filter: [
              { integration: "lcn", model: "LCN group" },
              { integration: "lcn", model: "UnknownModuleType" },
              { integration: "lcn", model: "LCN-SW1.0" },
              { integration: "lcn", model: "LCN-SW1.1" },
              { integration: "lcn", model: "LCN-UP1.0" },
              { integration: "lcn", model: "LCN-UP2" },
              { integration: "lcn", model: "LCN-SW2" },
              { integration: "lcn", model: "LCN-UP-Profi1-Plus" },
              { integration: "lcn", model: "LCN-DI12" },
              { integration: "lcn", model: "LCN-HU" },
              { integration: "lcn", model: "LCN-SH" },
              { integration: "lcn", model: "LCN-UP2" },
              { integration: "lcn", model: "LCN-UPP" },
              { integration: "lcn", model: "LCN-SK" },
              { integration: "lcn", model: "LCN-LD" },
              { integration: "lcn", model: "LCN-SH-Plus" },
              { integration: "lcn", model: "LCN-UPS" },
              { integration: "lcn", model: "LCN_UPS24V" },
              { integration: "lcn", model: "LCN-GTM" },
              { integration: "lcn", model: "LCN-SHS" },
              { integration: "lcn", model: "LCN-ESD" },
              { integration: "lcn", model: "LCN-EB2" },
              { integration: "lcn", model: "LCN-MRS" },
              { integration: "lcn", model: "LCN-EB11" },
              { integration: "lcn", model: "LCN-UMR" },
              { integration: "lcn", model: "LCN-UPU" },
              { integration: "lcn", model: "LCN-UMR24V" },
              { integration: "lcn", model: "LCN-SHD" },
              { integration: "lcn", model: "LCN-SHU" },
              { integration: "lcn", model: "LCN-SR6" },
              { integration: "lcn", model: "LCN-UMF" },
              { integration: "lcn", model: "LCN-WBH" },
            ],
          },
        },
        vt: "other",
      },
      {
        k: "output",
        r: 1,
        t: "tiles",
        o: ["output1", "output2", "output3", "output4"],
      },
      { k: "brightness", r: 1, t: "slider", min: 0, max: 100, step: 1, u: "%" },
      {
        k: "transition",
        t: "slider",
        min: 0,
        max: 486,
        step: 0.1,
        u: "seconds",
      },
    ],
    output_rel: [
      {
        k: "device_id",
        r: 1,
        t: "sel",
        s: {
          device: {
            filter: [
              { integration: "lcn", model: "LCN group" },
              { integration: "lcn", model: "UnknownModuleType" },
              { integration: "lcn", model: "LCN-SW1.0" },
              { integration: "lcn", model: "LCN-SW1.1" },
              { integration: "lcn", model: "LCN-UP1.0" },
              { integration: "lcn", model: "LCN-UP2" },
              { integration: "lcn", model: "LCN-SW2" },
              { integration: "lcn", model: "LCN-UP-Profi1-Plus" },
              { integration: "lcn", model: "LCN-DI12" },
              { integration: "lcn", model: "LCN-HU" },
              { integration: "lcn", model: "LCN-SH" },
              { integration: "lcn", model: "LCN-UP2" },
              { integration: "lcn", model: "LCN-UPP" },
              { integration: "lcn", model: "LCN-SK" },
              { integration: "lcn", model: "LCN-LD" },
              { integration: "lcn", model: "LCN-SH-Plus" },
              { integration: "lcn", model: "LCN-UPS" },
              { integration: "lcn", model: "LCN_UPS24V" },
              { integration: "lcn", model: "LCN-GTM" },
              { integration: "lcn", model: "LCN-SHS" },
              { integration: "lcn", model: "LCN-ESD" },
              { integration: "lcn", model: "LCN-EB2" },
              { integration: "lcn", model: "LCN-MRS" },
              { integration: "lcn", model: "LCN-EB11" },
              { integration: "lcn", model: "LCN-UMR" },
              { integration: "lcn", model: "LCN-UPU" },
              { integration: "lcn", model: "LCN-UMR24V" },
              { integration: "lcn", model: "LCN-SHD" },
              { integration: "lcn", model: "LCN-SHU" },
              { integration: "lcn", model: "LCN-SR6" },
              { integration: "lcn", model: "LCN-UMF" },
              { integration: "lcn", model: "LCN-WBH" },
            ],
          },
        },
        vt: "other",
      },
      {
        k: "output",
        r: 1,
        t: "tiles",
        o: ["output1", "output2", "output3", "output4"],
      },
      {
        k: "brightness",
        r: 1,
        t: "slider",
        min: -100,
        max: 100,
        step: 1,
        u: "%",
      },
    ],
    output_toggle: [
      {
        k: "device_id",
        r: 1,
        t: "sel",
        s: {
          device: {
            filter: [
              { integration: "lcn", model: "LCN group" },
              { integration: "lcn", model: "UnknownModuleType" },
              { integration: "lcn", model: "LCN-SW1.0" },
              { integration: "lcn", model: "LCN-SW1.1" },
              { integration: "lcn", model: "LCN-UP1.0" },
              { integration: "lcn", model: "LCN-UP2" },
              { integration: "lcn", model: "LCN-SW2" },
              { integration: "lcn", model: "LCN-UP-Profi1-Plus" },
              { integration: "lcn", model: "LCN-DI12" },
              { integration: "lcn", model: "LCN-HU" },
              { integration: "lcn", model: "LCN-SH" },
              { integration: "lcn", model: "LCN-UP2" },
              { integration: "lcn", model: "LCN-UPP" },
              { integration: "lcn", model: "LCN-SK" },
              { integration: "lcn", model: "LCN-LD" },
              { integration: "lcn", model: "LCN-SH-Plus" },
              { integration: "lcn", model: "LCN-UPS" },
              { integration: "lcn", model: "LCN_UPS24V" },
              { integration: "lcn", model: "LCN-GTM" },
              { integration: "lcn", model: "LCN-SHS" },
              { integration: "lcn", model: "LCN-ESD" },
              { integration: "lcn", model: "LCN-EB2" },
              { integration: "lcn", model: "LCN-MRS" },
              { integration: "lcn", model: "LCN-EB11" },
              { integration: "lcn", model: "LCN-UMR" },
              { integration: "lcn", model: "LCN-UPU" },
              { integration: "lcn", model: "LCN-UMR24V" },
              { integration: "lcn", model: "LCN-SHD" },
              { integration: "lcn", model: "LCN-SHU" },
              { integration: "lcn", model: "LCN-SR6" },
              { integration: "lcn", model: "LCN-UMF" },
              { integration: "lcn", model: "LCN-WBH" },
            ],
          },
        },
        vt: "other",
      },
      {
        k: "output",
        r: 1,
        t: "tiles",
        o: ["output1", "output2", "output3", "output4"],
      },
      {
        k: "transition",
        t: "slider",
        min: 0,
        max: 486,
        step: 0.1,
        u: "seconds",
      },
    ],
    relays: [
      {
        k: "device_id",
        r: 1,
        t: "sel",
        s: {
          device: {
            filter: [
              { integration: "lcn", model: "LCN group" },
              { integration: "lcn", model: "UnknownModuleType" },
              { integration: "lcn", model: "LCN-SW1.0" },
              { integration: "lcn", model: "LCN-SW1.1" },
              { integration: "lcn", model: "LCN-UP1.0" },
              { integration: "lcn", model: "LCN-UP2" },
              { integration: "lcn", model: "LCN-SW2" },
              { integration: "lcn", model: "LCN-UP-Profi1-Plus" },
              { integration: "lcn", model: "LCN-DI12" },
              { integration: "lcn", model: "LCN-HU" },
              { integration: "lcn", model: "LCN-SH" },
              { integration: "lcn", model: "LCN-UP2" },
              { integration: "lcn", model: "LCN-UPP" },
              { integration: "lcn", model: "LCN-SK" },
              { integration: "lcn", model: "LCN-LD" },
              { integration: "lcn", model: "LCN-SH-Plus" },
              { integration: "lcn", model: "LCN-UPS" },
              { integration: "lcn", model: "LCN_UPS24V" },
              { integration: "lcn", model: "LCN-GTM" },
              { integration: "lcn", model: "LCN-SHS" },
              { integration: "lcn", model: "LCN-ESD" },
              { integration: "lcn", model: "LCN-EB2" },
              { integration: "lcn", model: "LCN-MRS" },
              { integration: "lcn", model: "LCN-EB11" },
              { integration: "lcn", model: "LCN-UMR" },
              { integration: "lcn", model: "LCN-UPU" },
              { integration: "lcn", model: "LCN-UMR24V" },
              { integration: "lcn", model: "LCN-SHD" },
              { integration: "lcn", model: "LCN-SHU" },
              { integration: "lcn", model: "LCN-SR6" },
              { integration: "lcn", model: "LCN-UMF" },
              { integration: "lcn", model: "LCN-WBH" },
            ],
          },
        },
        vt: "other",
      },
      { k: "state", r: 1, t: "text", max: 8 },
    ],
    led: [
      {
        k: "device_id",
        r: 1,
        t: "sel",
        s: {
          device: {
            filter: [
              { integration: "lcn", model: "LCN group" },
              { integration: "lcn", model: "UnknownModuleType" },
              { integration: "lcn", model: "LCN-SW1.0" },
              { integration: "lcn", model: "LCN-SW1.1" },
              { integration: "lcn", model: "LCN-UP1.0" },
              { integration: "lcn", model: "LCN-UP2" },
              { integration: "lcn", model: "LCN-SW2" },
              { integration: "lcn", model: "LCN-UP-Profi1-Plus" },
              { integration: "lcn", model: "LCN-DI12" },
              { integration: "lcn", model: "LCN-HU" },
              { integration: "lcn", model: "LCN-SH" },
              { integration: "lcn", model: "LCN-UP2" },
              { integration: "lcn", model: "LCN-UPP" },
              { integration: "lcn", model: "LCN-SK" },
              { integration: "lcn", model: "LCN-LD" },
              { integration: "lcn", model: "LCN-SH-Plus" },
              { integration: "lcn", model: "LCN-UPS" },
              { integration: "lcn", model: "LCN_UPS24V" },
              { integration: "lcn", model: "LCN-GTM" },
              { integration: "lcn", model: "LCN-SHS" },
              { integration: "lcn", model: "LCN-ESD" },
              { integration: "lcn", model: "LCN-EB2" },
              { integration: "lcn", model: "LCN-MRS" },
              { integration: "lcn", model: "LCN-EB11" },
              { integration: "lcn", model: "LCN-UMR" },
              { integration: "lcn", model: "LCN-UPU" },
              { integration: "lcn", model: "LCN-UMR24V" },
              { integration: "lcn", model: "LCN-SHD" },
              { integration: "lcn", model: "LCN-SHU" },
              { integration: "lcn", model: "LCN-SR6" },
              { integration: "lcn", model: "LCN-UMF" },
              { integration: "lcn", model: "LCN-WBH" },
            ],
          },
        },
        vt: "other",
      },
      {
        k: "led",
        r: 1,
        t: "tiles",
        o: [
          "led1",
          "led2",
          "led3",
          "led4",
          "led5",
          "led6",
          "led7",
          "led8",
          "led9",
          "led10",
          "led11",
          "led12",
        ],
      },
      { k: "state", r: 1, t: "tiles", o: ["blink", "flicker", "off", "on"] },
    ],
    var_abs: [
      {
        k: "device_id",
        r: 1,
        t: "sel",
        s: {
          device: {
            filter: [
              { integration: "lcn", model: "LCN group" },
              { integration: "lcn", model: "UnknownModuleType" },
              { integration: "lcn", model: "LCN-SW1.0" },
              { integration: "lcn", model: "LCN-SW1.1" },
              { integration: "lcn", model: "LCN-UP1.0" },
              { integration: "lcn", model: "LCN-UP2" },
              { integration: "lcn", model: "LCN-SW2" },
              { integration: "lcn", model: "LCN-UP-Profi1-Plus" },
              { integration: "lcn", model: "LCN-DI12" },
              { integration: "lcn", model: "LCN-HU" },
              { integration: "lcn", model: "LCN-SH" },
              { integration: "lcn", model: "LCN-UP2" },
              { integration: "lcn", model: "LCN-UPP" },
              { integration: "lcn", model: "LCN-SK" },
              { integration: "lcn", model: "LCN-LD" },
              { integration: "lcn", model: "LCN-SH-Plus" },
              { integration: "lcn", model: "LCN-UPS" },
              { integration: "lcn", model: "LCN_UPS24V" },
              { integration: "lcn", model: "LCN-GTM" },
              { integration: "lcn", model: "LCN-SHS" },
              { integration: "lcn", model: "LCN-ESD" },
              { integration: "lcn", model: "LCN-EB2" },
              { integration: "lcn", model: "LCN-MRS" },
              { integration: "lcn", model: "LCN-EB11" },
              { integration: "lcn", model: "LCN-UMR" },
              { integration: "lcn", model: "LCN-UPU" },
              { integration: "lcn", model: "LCN-UMR24V" },
              { integration: "lcn", model: "LCN-SHD" },
              { integration: "lcn", model: "LCN-SHU" },
              { integration: "lcn", model: "LCN-SR6" },
              { integration: "lcn", model: "LCN-UMF" },
              { integration: "lcn", model: "LCN-WBH" },
            ],
          },
        },
        vt: "other",
      },
      {
        k: "variable",
        r: 1,
        t: "tiles",
        o: [
          "r1var",
          "r2var",
          "r1varsetpoint",
          "r2varsetpoint",
          "tvar",
          "var1ortvar",
          "var2orr1var",
          "var3orr2var",
          "var1",
          "var2",
          "var3",
          "var4",
          "var5",
          "var6",
          "var7",
          "var8",
          "var9",
          "var10",
          "var11",
          "var12",
        ],
      },
      { k: "value", t: "stepper", min: 0, max: 100000, step: 1 },
      {
        k: "unit_of_measurement",
        t: "tiles",
        o: [
          "",
          "%",
          "°",
          "°C",
          "°F",
          "ampere",
          "amp",
          "a",
          "degree",
          "native",
          "k",
          "lcn",
          "lux_t",
          "lx_t",
          "lux_i",
          "lux",
          "lx",
          "m/s",
          "meterpersecond",
          "percent",
          "ppm",
          "v",
          "volt",
        ],
      },
    ],
    var_reset: [
      {
        k: "device_id",
        r: 1,
        t: "sel",
        s: {
          device: {
            filter: [
              { integration: "lcn", model: "LCN group" },
              { integration: "lcn", model: "UnknownModuleType" },
              { integration: "lcn", model: "LCN-SW1.0" },
              { integration: "lcn", model: "LCN-SW1.1" },
              { integration: "lcn", model: "LCN-UP1.0" },
              { integration: "lcn", model: "LCN-UP2" },
              { integration: "lcn", model: "LCN-SW2" },
              { integration: "lcn", model: "LCN-UP-Profi1-Plus" },
              { integration: "lcn", model: "LCN-DI12" },
              { integration: "lcn", model: "LCN-HU" },
              { integration: "lcn", model: "LCN-SH" },
              { integration: "lcn", model: "LCN-UP2" },
              { integration: "lcn", model: "LCN-UPP" },
              { integration: "lcn", model: "LCN-SK" },
              { integration: "lcn", model: "LCN-LD" },
              { integration: "lcn", model: "LCN-SH-Plus" },
              { integration: "lcn", model: "LCN-UPS" },
              { integration: "lcn", model: "LCN_UPS24V" },
              { integration: "lcn", model: "LCN-GTM" },
              { integration: "lcn", model: "LCN-SHS" },
              { integration: "lcn", model: "LCN-ESD" },
              { integration: "lcn", model: "LCN-EB2" },
              { integration: "lcn", model: "LCN-MRS" },
              { integration: "lcn", model: "LCN-EB11" },
              { integration: "lcn", model: "LCN-UMR" },
              { integration: "lcn", model: "LCN-UPU" },
              { integration: "lcn", model: "LCN-UMR24V" },
              { integration: "lcn", model: "LCN-SHD" },
              { integration: "lcn", model: "LCN-SHU" },
              { integration: "lcn", model: "LCN-SR6" },
              { integration: "lcn", model: "LCN-UMF" },
              { integration: "lcn", model: "LCN-WBH" },
            ],
          },
        },
        vt: "other",
      },
      {
        k: "variable",
        r: 1,
        t: "tiles",
        o: [
          "r1var",
          "r2var",
          "r1varsetpoint",
          "r2varsetpoint",
          "tvar",
          "var1ortvar",
          "var2orr1var",
          "var3orr2var",
          "var1",
          "var2",
          "var3",
          "var4",
          "var5",
          "var6",
          "var7",
          "var8",
          "var9",
          "var10",
          "var11",
          "var12",
        ],
      },
    ],
    var_rel: [
      {
        k: "device_id",
        r: 1,
        t: "sel",
        s: {
          device: {
            filter: [
              { integration: "lcn", model: "LCN group" },
              { integration: "lcn", model: "UnknownModuleType" },
              { integration: "lcn", model: "LCN-SW1.0" },
              { integration: "lcn", model: "LCN-SW1.1" },
              { integration: "lcn", model: "LCN-UP1.0" },
              { integration: "lcn", model: "LCN-UP2" },
              { integration: "lcn", model: "LCN-SW2" },
              { integration: "lcn", model: "LCN-UP-Profi1-Plus" },
              { integration: "lcn", model: "LCN-DI12" },
              { integration: "lcn", model: "LCN-HU" },
              { integration: "lcn", model: "LCN-SH" },
              { integration: "lcn", model: "LCN-UP2" },
              { integration: "lcn", model: "LCN-UPP" },
              { integration: "lcn", model: "LCN-SK" },
              { integration: "lcn", model: "LCN-LD" },
              { integration: "lcn", model: "LCN-SH-Plus" },
              { integration: "lcn", model: "LCN-UPS" },
              { integration: "lcn", model: "LCN_UPS24V" },
              { integration: "lcn", model: "LCN-GTM" },
              { integration: "lcn", model: "LCN-SHS" },
              { integration: "lcn", model: "LCN-ESD" },
              { integration: "lcn", model: "LCN-EB2" },
              { integration: "lcn", model: "LCN-MRS" },
              { integration: "lcn", model: "LCN-EB11" },
              { integration: "lcn", model: "LCN-UMR" },
              { integration: "lcn", model: "LCN-UPU" },
              { integration: "lcn", model: "LCN-UMR24V" },
              { integration: "lcn", model: "LCN-SHD" },
              { integration: "lcn", model: "LCN-SHU" },
              { integration: "lcn", model: "LCN-SR6" },
              { integration: "lcn", model: "LCN-UMF" },
              { integration: "lcn", model: "LCN-WBH" },
            ],
          },
        },
        vt: "other",
      },
      {
        k: "variable",
        r: 1,
        t: "tiles",
        o: [
          "r1var",
          "r2var",
          "r1varsetpoint",
          "r2varsetpoint",
          "thrs1",
          "thrs2",
          "thrs3",
          "thrs4",
          "thrs5",
          "thrs2_1",
          "thrs2_2",
          "thrs2_3",
          "thrs2_4",
          "thrs3_1",
          "thrs3_2",
          "thrs3_3",
          "thrs3_4",
          "thrs4_1",
          "thrs4_2",
          "thrs4_3",
          "thrs4_4",
          "tvar",
          "var1ortvar",
          "var2orr1var",
          "var3orr2var",
          "var1",
          "var2",
          "var3",
          "var4",
          "var5",
          "var6",
          "var7",
          "var8",
          "var9",
          "var10",
          "var11",
          "var12",
        ],
      },
      { k: "value", t: "stepper", min: 0, max: 100000, step: 1 },
      {
        k: "unit_of_measurement",
        t: "tiles",
        o: [
          "",
          "%",
          "°",
          "°C",
          "°F",
          "ampere",
          "amp",
          "a",
          "degree",
          "native",
          "k",
          "lcn",
          "lux_t",
          "lx_t",
          "lux_i",
          "lux",
          "lx",
          "m/s",
          "meterpersecond",
          "percent",
          "ppm",
          "v",
          "volt",
        ],
      },
      { k: "value_reference", t: "tiles", o: ["current", "prog"] },
    ],
    lock_regulator: [
      {
        k: "device_id",
        r: 1,
        t: "sel",
        s: {
          device: {
            filter: [
              { integration: "lcn", model: "LCN group" },
              { integration: "lcn", model: "UnknownModuleType" },
              { integration: "lcn", model: "LCN-SW1.0" },
              { integration: "lcn", model: "LCN-SW1.1" },
              { integration: "lcn", model: "LCN-UP1.0" },
              { integration: "lcn", model: "LCN-UP2" },
              { integration: "lcn", model: "LCN-SW2" },
              { integration: "lcn", model: "LCN-UP-Profi1-Plus" },
              { integration: "lcn", model: "LCN-DI12" },
              { integration: "lcn", model: "LCN-HU" },
              { integration: "lcn", model: "LCN-SH" },
              { integration: "lcn", model: "LCN-UP2" },
              { integration: "lcn", model: "LCN-UPP" },
              { integration: "lcn", model: "LCN-SK" },
              { integration: "lcn", model: "LCN-LD" },
              { integration: "lcn", model: "LCN-SH-Plus" },
              { integration: "lcn", model: "LCN-UPS" },
              { integration: "lcn", model: "LCN_UPS24V" },
              { integration: "lcn", model: "LCN-GTM" },
              { integration: "lcn", model: "LCN-SHS" },
              { integration: "lcn", model: "LCN-ESD" },
              { integration: "lcn", model: "LCN-EB2" },
              { integration: "lcn", model: "LCN-MRS" },
              { integration: "lcn", model: "LCN-EB11" },
              { integration: "lcn", model: "LCN-UMR" },
              { integration: "lcn", model: "LCN-UPU" },
              { integration: "lcn", model: "LCN-UMR24V" },
              { integration: "lcn", model: "LCN-SHD" },
              { integration: "lcn", model: "LCN-SHU" },
              { integration: "lcn", model: "LCN-SR6" },
              { integration: "lcn", model: "LCN-UMF" },
              { integration: "lcn", model: "LCN-WBH" },
            ],
          },
        },
        vt: "other",
      },
      {
        k: "setpoint",
        r: 1,
        t: "tiles",
        o: [
          "thrs1",
          "thrs2",
          "thrs3",
          "thrs4",
          "thrs5",
          "thrs2_1",
          "thrs2_2",
          "thrs2_3",
          "thrs2_4",
          "thrs3_1",
          "thrs3_2",
          "thrs3_3",
          "thrs3_4",
          "thrs4_1",
          "thrs4_2",
          "thrs4_3",
          "thrs4_4",
        ],
      },
      { k: "state", t: "switch" },
    ],
    send_keys: [
      {
        k: "device_id",
        r: 1,
        t: "sel",
        s: {
          device: {
            filter: [
              { integration: "lcn", model: "LCN group" },
              { integration: "lcn", model: "UnknownModuleType" },
              { integration: "lcn", model: "LCN-SW1.0" },
              { integration: "lcn", model: "LCN-SW1.1" },
              { integration: "lcn", model: "LCN-UP1.0" },
              { integration: "lcn", model: "LCN-UP2" },
              { integration: "lcn", model: "LCN-SW2" },
              { integration: "lcn", model: "LCN-UP-Profi1-Plus" },
              { integration: "lcn", model: "LCN-DI12" },
              { integration: "lcn", model: "LCN-HU" },
              { integration: "lcn", model: "LCN-SH" },
              { integration: "lcn", model: "LCN-UP2" },
              { integration: "lcn", model: "LCN-UPP" },
              { integration: "lcn", model: "LCN-SK" },
              { integration: "lcn", model: "LCN-LD" },
              { integration: "lcn", model: "LCN-SH-Plus" },
              { integration: "lcn", model: "LCN-UPS" },
              { integration: "lcn", model: "LCN_UPS24V" },
              { integration: "lcn", model: "LCN-GTM" },
              { integration: "lcn", model: "LCN-SHS" },
              { integration: "lcn", model: "LCN-ESD" },
              { integration: "lcn", model: "LCN-EB2" },
              { integration: "lcn", model: "LCN-MRS" },
              { integration: "lcn", model: "LCN-EB11" },
              { integration: "lcn", model: "LCN-UMR" },
              { integration: "lcn", model: "LCN-UPU" },
              { integration: "lcn", model: "LCN-UMR24V" },
              { integration: "lcn", model: "LCN-SHD" },
              { integration: "lcn", model: "LCN-SHU" },
              { integration: "lcn", model: "LCN-SR6" },
              { integration: "lcn", model: "LCN-UMF" },
              { integration: "lcn", model: "LCN-WBH" },
            ],
          },
        },
        vt: "other",
      },
      { k: "keys", r: 1, t: "text" },
      { k: "state", t: "tiles", o: ["hit", "make", "break", "dontsend"] },
      { k: "time", t: "slider", min: 0, max: 60, step: 1 },
      {
        k: "time_unit",
        t: "tiles",
        o: [
          "d",
          "day",
          "days",
          "h",
          "hour",
          "hours",
          "m",
          "min",
          "minute",
          "minutes",
          "s",
          "sec",
          "second",
          "seconds",
        ],
      },
    ],
    lock_keys: [
      {
        k: "device_id",
        r: 1,
        t: "sel",
        s: {
          device: {
            filter: [
              { integration: "lcn", model: "LCN group" },
              { integration: "lcn", model: "UnknownModuleType" },
              { integration: "lcn", model: "LCN-SW1.0" },
              { integration: "lcn", model: "LCN-SW1.1" },
              { integration: "lcn", model: "LCN-UP1.0" },
              { integration: "lcn", model: "LCN-UP2" },
              { integration: "lcn", model: "LCN-SW2" },
              { integration: "lcn", model: "LCN-UP-Profi1-Plus" },
              { integration: "lcn", model: "LCN-DI12" },
              { integration: "lcn", model: "LCN-HU" },
              { integration: "lcn", model: "LCN-SH" },
              { integration: "lcn", model: "LCN-UP2" },
              { integration: "lcn", model: "LCN-UPP" },
              { integration: "lcn", model: "LCN-SK" },
              { integration: "lcn", model: "LCN-LD" },
              { integration: "lcn", model: "LCN-SH-Plus" },
              { integration: "lcn", model: "LCN-UPS" },
              { integration: "lcn", model: "LCN_UPS24V" },
              { integration: "lcn", model: "LCN-GTM" },
              { integration: "lcn", model: "LCN-SHS" },
              { integration: "lcn", model: "LCN-ESD" },
              { integration: "lcn", model: "LCN-EB2" },
              { integration: "lcn", model: "LCN-MRS" },
              { integration: "lcn", model: "LCN-EB11" },
              { integration: "lcn", model: "LCN-UMR" },
              { integration: "lcn", model: "LCN-UPU" },
              { integration: "lcn", model: "LCN-UMR24V" },
              { integration: "lcn", model: "LCN-SHD" },
              { integration: "lcn", model: "LCN-SHU" },
              { integration: "lcn", model: "LCN-SR6" },
              { integration: "lcn", model: "LCN-UMF" },
              { integration: "lcn", model: "LCN-WBH" },
            ],
          },
        },
        vt: "other",
      },
      { k: "state", r: 1, t: "text", max: 8 },
      { k: "table", t: "text", max: 1 },
      { k: "time", t: "slider", min: 0, max: 60, step: 1 },
      {
        k: "time_unit",
        t: "tiles",
        o: [
          "d",
          "day",
          "days",
          "h",
          "hour",
          "hours",
          "m",
          "min",
          "minute",
          "minutes",
          "s",
          "sec",
          "second",
          "seconds",
        ],
      },
    ],
    dyn_text: [
      {
        k: "device_id",
        r: 1,
        t: "sel",
        s: {
          device: {
            filter: [
              { integration: "lcn", model: "LCN group" },
              { integration: "lcn", model: "UnknownModuleType" },
              { integration: "lcn", model: "LCN-SW1.0" },
              { integration: "lcn", model: "LCN-SW1.1" },
              { integration: "lcn", model: "LCN-UP1.0" },
              { integration: "lcn", model: "LCN-UP2" },
              { integration: "lcn", model: "LCN-SW2" },
              { integration: "lcn", model: "LCN-UP-Profi1-Plus" },
              { integration: "lcn", model: "LCN-DI12" },
              { integration: "lcn", model: "LCN-HU" },
              { integration: "lcn", model: "LCN-SH" },
              { integration: "lcn", model: "LCN-UP2" },
              { integration: "lcn", model: "LCN-UPP" },
              { integration: "lcn", model: "LCN-SK" },
              { integration: "lcn", model: "LCN-LD" },
              { integration: "lcn", model: "LCN-SH-Plus" },
              { integration: "lcn", model: "LCN-UPS" },
              { integration: "lcn", model: "LCN_UPS24V" },
              { integration: "lcn", model: "LCN-GTM" },
              { integration: "lcn", model: "LCN-SHS" },
              { integration: "lcn", model: "LCN-ESD" },
              { integration: "lcn", model: "LCN-EB2" },
              { integration: "lcn", model: "LCN-MRS" },
              { integration: "lcn", model: "LCN-EB11" },
              { integration: "lcn", model: "LCN-UMR" },
              { integration: "lcn", model: "LCN-UPU" },
              { integration: "lcn", model: "LCN-UMR24V" },
              { integration: "lcn", model: "LCN-SHD" },
              { integration: "lcn", model: "LCN-SHU" },
              { integration: "lcn", model: "LCN-SR6" },
              { integration: "lcn", model: "LCN-UMF" },
              { integration: "lcn", model: "LCN-WBH" },
            ],
          },
        },
        vt: "other",
      },
      { k: "row", r: 1, t: "slider", min: 1, max: 4, step: 1 },
      { k: "text", r: 1, t: "text", max: 60 },
    ],
    pck: [
      {
        k: "device_id",
        r: 1,
        t: "sel",
        s: {
          device: {
            filter: [
              { integration: "lcn", model: "LCN group" },
              { integration: "lcn", model: "UnknownModuleType" },
              { integration: "lcn", model: "LCN-SW1.0" },
              { integration: "lcn", model: "LCN-SW1.1" },
              { integration: "lcn", model: "LCN-UP1.0" },
              { integration: "lcn", model: "LCN-UP2" },
              { integration: "lcn", model: "LCN-SW2" },
              { integration: "lcn", model: "LCN-UP-Profi1-Plus" },
              { integration: "lcn", model: "LCN-DI12" },
              { integration: "lcn", model: "LCN-HU" },
              { integration: "lcn", model: "LCN-SH" },
              { integration: "lcn", model: "LCN-UP2" },
              { integration: "lcn", model: "LCN-UPP" },
              { integration: "lcn", model: "LCN-SK" },
              { integration: "lcn", model: "LCN-LD" },
              { integration: "lcn", model: "LCN-SH-Plus" },
              { integration: "lcn", model: "LCN-UPS" },
              { integration: "lcn", model: "LCN_UPS24V" },
              { integration: "lcn", model: "LCN-GTM" },
              { integration: "lcn", model: "LCN-SHS" },
              { integration: "lcn", model: "LCN-ESD" },
              { integration: "lcn", model: "LCN-EB2" },
              { integration: "lcn", model: "LCN-MRS" },
              { integration: "lcn", model: "LCN-EB11" },
              { integration: "lcn", model: "LCN-UMR" },
              { integration: "lcn", model: "LCN-UPU" },
              { integration: "lcn", model: "LCN-UMR24V" },
              { integration: "lcn", model: "LCN-SHD" },
              { integration: "lcn", model: "LCN-SHU" },
              { integration: "lcn", model: "LCN-SR6" },
              { integration: "lcn", model: "LCN-UMF" },
              { integration: "lcn", model: "LCN-WBH" },
            ],
          },
        },
        vt: "other",
      },
      { k: "pck", r: 1, t: "text" },
    ],
  },
  lifx: {
    set_hev_cycle_state: [
      { k: "power", r: 1, t: "switch" },
      { k: "duration", t: "dur", f: "seconds" },
    ],
    set_state: [
      { k: "infrared", t: "slider", min: 0, max: 255, step: 1 },
      { k: "zones", t: "sel", s: { object: null }, vt: "object" },
      { k: "transition", t: "dur", f: "seconds" },
      { k: "power", t: "switch" },
    ],
    effect_pulse: [
      {
        k: "mode",
        t: "tiles",
        o: ["blink", "breathe", "ping", "strobe", "solid"],
      },
      { k: "brightness", t: "slider", min: 1, max: 255, step: 1 },
      { k: "brightness_pct", t: "slider", min: 1, max: 100, step: 1, u: "%" },
      { k: "color_name", t: "text" },
      {
        k: "rgb_color",
        t: "color",
        s: { object: null },
        vt: "object",
        sp: "rgb",
      },
      {
        k: "period",
        t: "slider",
        min: 0.05,
        max: 60,
        step: 0.05,
        u: "seconds",
      },
      { k: "cycles", t: "slider", min: 1, max: 10000, step: 1 },
      { k: "power_on", t: "switch" },
    ],
    effect_colorloop: [
      { k: "brightness", t: "slider", min: 0, max: 255, step: 1 },
      { k: "brightness_pct", t: "slider", min: 0, max: 100, step: 1, u: "%" },
      { k: "saturation_min", t: "slider", min: 1, max: 100, step: 1, u: "%" },
      { k: "saturation_max", t: "slider", min: 1, max: 100, step: 1, u: "%" },
      { k: "transition", t: "dur", f: "seconds" },
      {
        k: "period",
        t: "slider",
        min: 0.05,
        max: 3600,
        step: 0.05,
        u: "seconds",
      },
      { k: "change", t: "slider", min: 1, max: 179, step: 1, u: "°" },
      { k: "spread", t: "slider", min: 0, max: 360, step: 1, u: "°" },
      { k: "power_on", t: "switch" },
    ],
    effect_move: [
      { k: "speed", t: "slider", min: 0.1, max: 60, step: 0.1, u: "seconds" },
      { k: "direction", t: "tiles", o: ["right", "left"] },
      { k: "theme", t: "rt" },
      { k: "power_on", t: "switch" },
    ],
    effect_colorsweep: [
      { k: "speed", t: "dur", f: "seconds" },
      { k: "duration", t: "dur", f: "seconds" },
      { k: "palette", t: "sel", s: { object: null }, vt: "object" },
      { k: "power_on", t: "switch" },
    ],
    effect_flame: [
      { k: "speed", t: "dur", f: "seconds" },
      { k: "power_on", t: "switch" },
    ],
    effect_morph: [
      { k: "speed", t: "dur", f: "seconds" },
      { k: "palette", t: "sel", s: { object: null }, vt: "object" },
      { k: "theme", t: "rt" },
      { k: "power_on", t: "switch" },
    ],
    effect_sky: [
      { k: "power_on", t: "switch" },
      { k: "speed", t: "dur", f: "seconds" },
      { k: "duration", t: "dur", f: "seconds" },
      { k: "sky_type", t: "tiles", o: ["Clouds", "Sunrise", "Sunset"] },
      { k: "cloud_saturation_min", t: "slider", min: 0, max: 255, step: 1 },
      { k: "cloud_saturation_max", t: "slider", min: 0, max: 255, step: 1 },
      { k: "palette", t: "sel", s: { object: null }, vt: "object" },
    ],
    effect_stop: [],
    paint_theme: [
      { k: "palette", t: "sel", s: { object: null }, vt: "object" },
      { k: "theme", t: "rt" },
      { k: "transition", t: "dur", f: "seconds" },
      { k: "power_on", t: "switch" },
    ],
  },
  linkplay: {
    play_preset: [
      { k: "preset_number", r: 1, t: "stepper", min: 1, max: 10000, step: 1 },
    ],
  },
  litterrobot: {
    set_sleep_mode: [
      { k: "enabled", r: 1, t: "switch" },
      { k: "start_time", t: "time" },
    ],
  },
  local_file: { update_file_path: [{ k: "file_path", r: 1, t: "text" }] },
  logger: {
    set_default_level: [
      {
        k: "level",
        t: "tiles",
        o: ["debug", "info", "warning", "error", "fatal", "critical"],
      },
    ],
    set_level: [],
  },
  lovelace: { reload_resources: [] },
  lyric: { set_hold_time: [{ k: "time_period", r: 1, t: "dur", f: "hms" }] },
  mastodon: {
    get_account: [
      {
        k: "config_entry_id",
        r: 1,
        t: "sel",
        s: { config_entry: { integration: "mastodon" } },
        vt: "other",
      },
      { k: "account_name", r: 1, t: "text" },
    ],
    mute_account: [
      {
        k: "config_entry_id",
        r: 1,
        t: "sel",
        s: { config_entry: { integration: "mastodon" } },
        vt: "other",
      },
      { k: "account_name", r: 1, t: "text" },
      {
        k: "duration",
        t: "sel",
        s: { duration: { enable_day: true } },
        vt: "duration",
      },
      { k: "hide_notifications", t: "switch" },
    ],
    unmute_account: [
      {
        k: "config_entry_id",
        r: 1,
        t: "sel",
        s: { config_entry: { integration: "mastodon" } },
        vt: "other",
      },
      { k: "account_name", r: 1, t: "text" },
    ],
    post: [
      {
        k: "config_entry_id",
        r: 1,
        t: "sel",
        s: { config_entry: { integration: "mastodon" } },
        vt: "other",
      },
      { k: "status", r: 1, t: "text", ml: 1 },
      { k: "media_warning", r: 1, t: "switch" },
      {
        k: "visibility",
        t: "tiles",
        o: ["public", "unlisted", "private", "direct"],
      },
      {
        k: "quote_approval_policy",
        t: "tiles",
        o: ["public", "followers", "nobody"],
      },
      { k: "idempotency_key", t: "text" },
      { k: "content_warning", t: "text" },
      { k: "language", t: "rt" },
      {
        k: "media",
        t: "sel",
        s: {
          object: {
            label_field: "media_source",
            description_field: "media_description",
            multiple: true,
            translation_key: "media",
            fields: {
              media_source: {
                selector: { media: { accept: ["*"] } },
                required: true,
              },
              media_description: { selector: { text: { multiline: true } } },
              focus_x: {
                default: 0,
                selector: {
                  number: { min: -1, max: 1, step: 0.01, mode: "slider" },
                },
              },
              focus_y: {
                default: 0,
                selector: {
                  number: { min: -1, max: 1, step: 0.01, mode: "slider" },
                },
              },
              thumbnail: { selector: { media: { accept: ["*"] } } },
            },
          },
        },
        vt: "object",
      },
      { k: "in_reply_to", t: "text" },
      { k: "quoted_status", t: "text" },
    ],
    update_profile: [
      {
        k: "config_entry_id",
        r: 1,
        t: "sel",
        s: { config_entry: { integration: "mastodon" } },
        vt: "other",
      },
      { k: "display_name", t: "text" },
      { k: "note", t: "text", ml: 1 },
      { k: "avatar", t: "sel", s: { media: {} }, vt: "media" },
      { k: "avatar_description", t: "text", ml: 1 },
      { k: "delete_avatar", t: "switch" },
      { k: "header", t: "sel", s: { media: {} }, vt: "media" },
      { k: "header_description", t: "text", ml: 1 },
      { k: "delete_header", t: "switch" },
      { k: "locked", t: "switch" },
      { k: "bot", t: "switch" },
      { k: "discoverable", t: "switch" },
      {
        k: "fields",
        t: "sel",
        s: {
          object: {
            label_field: "value",
            description_field: "name",
            multiple: true,
            translation_key: "fields",
            fields: {
              name: { required: true, selector: { text: null } },
              value: { required: true, selector: { text: null } },
            },
          },
        },
        vt: "object",
      },
      {
        k: "attribution_domains",
        t: "sel",
        s: { text: { multiple: true, type: "url" } },
        vt: "list",
      },
    ],
  },
  matrix: {
    send_message: [
      { k: "message", r: 1, t: "text", ml: 1 },
      { k: "target", r: 1, t: "text" },
      {
        k: "data",
        t: "sel",
        s: {
          object: {
            translation_key: "send_message_data",
            fields: {
              images: { selector: { text: { multiple: true } } },
              format: {
                selector: {
                  select: {
                    options: ["text", "html"],
                    translation_key: "send_message_data_format",
                  },
                },
              },
              thread_id: { selector: { text: null } },
            },
          },
        },
        vt: "object",
      },
    ],
    react: [
      {
        k: "reaction",
        r: 1,
        t: "text",
        chips: [
          ["thumbs_up", "👍"],
          ["heart", "❤️"],
          ["laugh", "😂"],
          ["party", "🎉"],
        ],
      },
      { k: "room", r: 1, t: "text" },
      { k: "message_id", r: 1, t: "text" },
    ],
  },
  matter: {
    clear_lock_credential: [
      {
        k: "credential_type",
        r: 1,
        t: "tiles",
        o: ["pin", "rfid", "fingerprint", "finger_vein", "face"],
      },
      {
        k: "credential_index",
        r: 1,
        t: "stepper",
        min: 0,
        max: 65534,
        step: 1,
      },
    ],
    clear_lock_user: [
      { k: "user_index", r: 1, t: "stepper", min: 1, max: 65534, step: 1 },
    ],
    get_lock_credential_status: [
      {
        k: "credential_type",
        r: 1,
        t: "tiles",
        o: [
          "programming_pin",
          "pin",
          "rfid",
          "fingerprint",
          "finger_vein",
          "face",
          "aliro_credential_issuer_key",
          "aliro_evictable_endpoint_key",
          "aliro_non_evictable_endpoint_key",
        ],
      },
      {
        k: "credential_index",
        r: 1,
        t: "stepper",
        min: 0,
        max: 65534,
        step: 1,
      },
    ],
    get_lock_info: [],
    get_lock_users: [],
    set_lock_credential: [
      {
        k: "credential_type",
        r: 1,
        t: "tiles",
        o: ["pin", "rfid", "fingerprint", "finger_vein", "face"],
      },
      { k: "credential_data", r: 1, t: "text", pw: 1 },
      { k: "credential_index", t: "stepper", min: 0, max: 65534, step: 1 },
      { k: "user_index", t: "stepper", min: 1, max: 65534, step: 1 },
      {
        k: "user_status",
        t: "tiles",
        o: ["occupied_enabled", "occupied_disabled"],
      },
      {
        k: "user_type",
        t: "tiles",
        o: [
          "unrestricted_user",
          "year_day_schedule_user",
          "week_day_schedule_user",
          "programming_user",
          "non_access_user",
          "forced_user",
          "disposable_user",
          "expiring_user",
          "schedule_restricted_user",
          "remote_only_user",
        ],
      },
    ],
    set_lock_user: [
      { k: "user_index", t: "stepper", min: 1, max: 255, step: 1 },
      { k: "user_name", t: "text" },
      {
        k: "user_type",
        t: "tiles",
        o: [
          "unrestricted_user",
          "year_day_schedule_user",
          "week_day_schedule_user",
          "programming_user",
          "non_access_user",
          "forced_user",
          "disposable_user",
          "expiring_user",
          "schedule_restricted_user",
          "remote_only_user",
        ],
      },
      { k: "credential_rule", t: "tiles", o: ["single", "dual", "tri"] },
    ],
    water_heater_boost: [
      { k: "duration", r: 1, t: "stepper", min: 60, max: 14400, step: 60 },
      { k: "emergency_boost", t: "switch" },
      { k: "temporary_setpoint", t: "slider", min: 30, max: 65, step: 1 },
    ],
  },
  mealie: {
    add_ingredient: [
      { k: "food_id", t: "text" },
      { k: "note", t: "text", ml: 1 },
      { k: "unit_id", t: "text" },
      { k: "quantity", t: "text", it: "number" },
    ],
    delete_mealplan: [
      {
        k: "config_entry_id",
        r: 1,
        t: "sel",
        s: { config_entry: { integration: "mealie" } },
        vt: "other",
      },
      { k: "mealplan_id", r: 1, t: "text" },
    ],
    get_mealplan: [
      {
        k: "config_entry_id",
        r: 1,
        t: "sel",
        s: { config_entry: { integration: "mealie" } },
        vt: "other",
      },
      { k: "start_date", t: "date" },
      { k: "end_date", t: "date" },
    ],
    get_recipe: [
      {
        k: "config_entry_id",
        r: 1,
        t: "sel",
        s: { config_entry: { integration: "mealie" } },
        vt: "other",
      },
      { k: "recipe_id", r: 1, t: "text" },
    ],
    get_recipes: [
      {
        k: "config_entry_id",
        r: 1,
        t: "sel",
        s: { config_entry: { integration: "mealie" } },
        vt: "other",
      },
      { k: "search_terms", t: "text" },
      {
        k: "result_limit",
        t: "stepper",
        min: 1,
        max: 100,
        step: 1,
        u: "recipes",
      },
    ],
    get_shopping_list_items: [],
    import_recipe: [
      {
        k: "config_entry_id",
        r: 1,
        t: "sel",
        s: { config_entry: { integration: "mealie" } },
        vt: "other",
      },
      { k: "url", r: 1, t: "text" },
      { k: "include_tags", t: "switch" },
    ],
    parse_ingredient: [
      {
        k: "config_entry_id",
        r: 1,
        t: "sel",
        s: { config_entry: { integration: "mealie" } },
        vt: "other",
      },
      { k: "ingredient", r: 1, t: "text" },
    ],
    set_random_mealplan: [
      {
        k: "config_entry_id",
        r: 1,
        t: "sel",
        s: { config_entry: { integration: "mealie" } },
        vt: "other",
      },
      { k: "date", t: "date" },
      {
        k: "entry_type",
        t: "tiles",
        o: [
          "breakfast",
          "lunch",
          "dinner",
          "side",
          "dessert",
          "snack",
          "drink",
        ],
      },
    ],
    set_mealplan: [
      {
        k: "config_entry_id",
        r: 1,
        t: "sel",
        s: { config_entry: { integration: "mealie" } },
        vt: "other",
      },
      { k: "date", t: "date" },
      {
        k: "entry_type",
        t: "tiles",
        o: [
          "breakfast",
          "lunch",
          "dinner",
          "side",
          "dessert",
          "snack",
          "drink",
        ],
      },
      { k: "recipe_id", t: "text" },
      { k: "note_title", t: "text" },
      { k: "note_text", t: "text" },
    ],
    update_mealplan: [
      {
        k: "config_entry_id",
        r: 1,
        t: "sel",
        s: { config_entry: { integration: "mealie" } },
        vt: "other",
      },
      { k: "mealplan_id", r: 1, t: "text" },
      { k: "date", t: "date" },
      {
        k: "entry_type",
        t: "tiles",
        o: [
          "breakfast",
          "lunch",
          "dinner",
          "side",
          "dessert",
          "snack",
          "drink",
        ],
      },
      { k: "recipe_id", t: "text" },
      { k: "note_title", t: "text" },
      { k: "note_text", t: "text" },
    ],
  },
  media_extractor: {
    play_media: [
      { k: "media_content_id", r: 1, t: "text", it: "url" },
      {
        k: "media_content_type",
        r: 1,
        t: "tiles",
        o: ["CHANNEL", "EPISODE", "PLAYLIST MUSIC", "MUSIC", "TVSHOW", "VIDEO"],
      },
    ],
    extract_media_url: [
      { k: "url", r: 1, t: "text", it: "url" },
      {
        k: "format_query",
        t: "text",
        chips: [
          ["best", "best"],
          ["best_audio", "bestaudio"],
          ["worst", "worst"],
        ],
      },
    ],
  },
};

const CAUTIONS: Record<string, Record<string, string>> = {
  homekit: {
    unpair: "homekit__caution_unpair",
    reset_accessory: "homekit__caution_reset_accessory",
  },
  homematic: {
    put_paramset: "homematic__caution_put_paramset",
    set_device_value: "homematic__caution_set_device_value",
  },
  icloud: { lost_device: "icloud__caution_lost_device" },
  imap: { delete: "imap__caution_delete" },
  isy994: {
    delete_zwave_lock_user_code: "isy994__caution_delete_zwave_lock_user_code",
    set_zwave_lock_user_code: "isy994__caution_set_zwave_lock_user_code",
    set_zwave_parameter: "isy994__caution_set_zwave_parameter",
  },
  matter: {
    clear_lock_credential: "matter__caution_clear_lock_credential",
    clear_lock_user: "matter__caution_clear_lock_user",
    set_lock_credential: "matter__caution_set_lock_credential",
  },
  mealie: { delete_mealplan: "mealie__caution_delete_mealplan" },
  insteon: { delete_all_link: "insteon__caution_delete_all_link" },
  keba: {
    deauthorize: "keba__caution_deauthorize",
    disable: "keba__caution_disable",
  },
  indevolt: {
    charge: "indevolt__caution_charge",
    discharge: "indevolt__caution_discharge",
  },
  hydrawise: { suspend: "hydrawise__caution_suspend" },
  mastodon: {
    post: "mastodon__caution_post",
    update_profile: "mastodon__caution_update_profile",
  },
  home_connect: {
    start_selected_program: "home_connect__caution_start_selected_program",
    set_program_and_options: "home_connect__caution_set_program_and_options",
  },
  kiosker: { set_blackout: "kiosker__caution_set_blackout" },
  lcn: { lock_keys: "lcn__caution_lock_keys" },
  immich: { upload_file: "immich__caution_upload_file" },
  homematicip_cloud: { pull_latch: "homematicip_cloud__caution_pull_latch" },
  knx: { send: "knx__caution_send" },
};

const NOTES: Record<string, Record<string, string>> = {
  logger: { set_level: "logger__note_set_level" },
  lovelace: { reload_resources: "lovelace__note_reload_resources" },
  intent_script: { reload: "intent_script__note_reload" },
};

/** Option groups of a Home Connect program, by the program-name prefix. */
const HOME_CONNECT_GROUPS: Record<string, string[]> = {
  air_conditioner_options: ["heating_ventilation_air_conditioning_"],
  cleaning_robot_options: ["consumer_products_cleaning_robot_"],
  coffee_maker_options: ["consumer_products_coffee_maker_"],
  dish_washer_options: ["dishcare_dishwasher_"],
  dryer_options: ["laundry_care_dryer_"],
  hood_options: ["cooking_common_program_hood_"],
  oven_options: ["cooking_oven_program_"],
  warming_drawer_options: ["cooking_oven_program_heating_mode_warming_drawer"],
  washer_options: ["laundry_care_washer_", "laundry_care_washer_dryer_"],
};

const labelOf = (domain: string, key: string) => L(`${domain}__${key}`);

const colorControl = (
  ctx: QuickContext,
  key: string,
  label: string,
  space: "rgb" | "hs" | "xy" | "rgbw" | "rgbww"
): QuickControl | undefined => {
  const stored = ctx.data[key];
  if (!claim(ctx, key) || hasTemplate(stored)) return undefined;
  if (stored !== undefined && !Array.isArray(stored)) return undefined;
  const parts =
    Array.isArray(stored) && stored.every((part) => typeof part === "number")
      ? (stored as number[])
      : undefined;
  return {
    kind: "color",
    key,
    labelKey: label,
    space,
    swatches: true,
    value: parts,
  };
};

/**
 * A grouped option shows only for programs of its own appliance family, or
 * when the action already stores a value for it, so nothing saved is hidden.
 */
const visible = (
  domain: string,
  spec: Spec,
  data: Record<string, unknown>
): boolean => {
  if (domain !== "home_connect" || !spec.g) return true;
  if (data[spec.k] !== undefined) return true;
  const program = data.program;
  if (typeof program !== "string") return false;
  const prefixes = HOME_CONNECT_GROUPS[spec.g] ?? [];
  if (spec.g === "oven_options") {
    return (
      program.startsWith("cooking_oven_program_") &&
      !program.startsWith("cooking_oven_program_heating_mode_warming_drawer")
    );
  }
  if (spec.g === "washer_options") {
    return (
      program.startsWith("laundry_care_washer_program_") ||
      program.startsWith("laundry_care_washer_dryer_program_")
    );
  }
  return prefixes.some((prefix) => program.startsWith(prefix));
};

const make = (
  ctx: QuickContext,
  domain: string,
  spec: Spec
): QuickControl | undefined => {
  const label = labelOf(domain, spec.k);
  const key = spec.k;
  switch (spec.t) {
    case "slider":
      return slider(ctx, key, label, spec.min!, spec.max!, spec.step!, {
        unit: spec.u,
      });
    case "stepper":
      return stepper(ctx, key, label, spec.min!, spec.max!, spec.step!, spec.u);
    case "tiles":
      return choice(ctx, key, label, spec.o ?? []);
    case "rt": {
      const runtime = ctx.fields[key]?.selector;
      return runtime
        ? selector(ctx, key, label, runtime, "list")
        : textBox(ctx, key, label);
    }
    case "switch":
      return toggle(ctx, key, label);
    case "text":
      return textBox(ctx, key, label, {
        multiline: spec.ml === 1,
        showCount: spec.ml === 1 || spec.max !== undefined,
        maxLength: spec.t === "text" ? spec.max : undefined,
        inputType: spec.pw ? "password" : spec.it,
        chips: spec.chips?.map(([id, text]) => ({ id, text, replace: true })),
      });
    case "time":
    case "date":
    case "datetime":
      return temporal(ctx, key, label, spec.t);
    case "dur":
      return duration(ctx, key, label, spec.f);
    case "color":
      return colorControl(ctx, key, label, spec.sp ?? "rgb");
    case "ent":
      return entityTiles(ctx, key, label, spec.d ?? "", spec.m === 1);
    case "sel":
      return selector(ctx, key, label, spec.s ?? {}, spec.vt ?? "other");
    default:
      return undefined;
  }
};

/** Specs of one service, as a control builder. */
export const buildFromSpecs =
  (domain: string, service: string, specs: Spec[]) =>
  (ctx: QuickContext): QuickControl[] => {
    // Grouped fields are not in the top-level field list; the service still
    // declares them, so they are claimed here. Join services declare none.
    const declared: Record<string, QuickFieldInfo> = {};
    specs.forEach((spec) => {
      if (spec.g || domain === "joaoapps_join") declared[spec.k] = {};
    });
    const context: QuickContext = {
      ...ctx,
      fields: { ...declared, ...ctx.fields },
    };
    const note = NOTES[domain]?.[service];
    return [
      ...(note ? [notice(`${service}_note`, L(note))] : []),
      ...compact(
        specs
          .filter((spec) => visible(domain, spec, ctx.data))
          .map((spec) => make(context, domain, spec))
      ),
    ];
  };

const JOIN_SERVICES = [
  "ring",
  "set_wallpaper",
  "send_sms",
  "send_file",
  "send_url",
  "send_tasker",
];

const domainEditor = (
  domain: string,
  services: Record<string, Spec[]>
): DomainEditor => {
  const names = Object.keys(services);
  const controls: DomainEditor["controls"] = {};
  names.forEach((service) => {
    controls[service] = buildFromSpecs(domain, service, services[service]);
  });
  if (domain === "joaoapps_join") {
    // Action names carry a configured prefix, such as `living_room_ring`.
    controls["*"] = (ctx) => {
      const action = ctx.action.slice(ctx.action.indexOf(".") + 1);
      const match = JOIN_SERVICES.find((name) => action.endsWith(name));
      return match ? controls[match](ctx) : [];
    };
  }
  return {
    ...(names.length > 1 && names.length <= 8 ? { siblings: names } : {}),
    ...(CAUTIONS[domain]
      ? {
          cautions: Object.fromEntries(
            Object.entries(CAUTIONS[domain]).map(([name, key]) => [
              name,
              L(key),
            ])
          ),
        }
      : {}),
    controls,
  };
};

export const INTEGRATION_EDITORS_C: Record<string, DomainEditor> =
  Object.fromEntries(
    Object.entries(SPECS).map(([domain, services]) => [
      domain,
      domainEditor(domain, services),
    ])
  );
