import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { INTEGRATION_EDITORS_A } from "../../../src/components/action-editors/domains/integrations/a";
import type {
  QuickContext,
  QuickControl,
} from "../../../src/components/action-editors/quick-types";

/** Written out by hand so a mistake in the editors cannot hide a service. */
const EXPECTED: Record<string, string[]> = {
  abode: ["capture_image", "change_setting", "trigger_automation"],
  adguard: ["add_url", "remove_url", "enable_url", "disable_url", "refresh"],
  ads: ["write_data_by_name"],
  advantage_air: ["set_time_to"],
  aftership: ["add_tracking", "remove_tracking"],
  agent_dvr: [
    "start_recording",
    "stop_recording",
    "enable_alerts",
    "disable_alerts",
    "snapshot",
  ],
  alarmdecoder: ["alarm_keypress", "alarm_toggle_chime"],
  alexa_devices: ["send_text_command", "send_sound", "send_info_skill"],
  amberelectric: ["get_forecasts"],
  amcrest: [
    "enable_recording",
    "disable_recording",
    "enable_audio",
    "disable_audio",
    "enable_motion_recording",
    "disable_motion_recording",
    "goto_preset",
    "set_color_bw",
    "start_tour",
    "stop_tour",
    "ptz_control",
  ],
  androidtv: ["adb_command", "download", "upload", "learn_sendevent"],
  apple_tv: [
    "set_keyboard_text",
    "append_keyboard_text",
    "clear_keyboard_text",
  ],
  bang_olufsen: [
    "beolink_allstandby",
    "beolink_expand",
    "beolink_join",
    "beolink_leave",
    "beolink_unexpand",
  ],
  bayesian: ["reload"],
  besen: ["start_charging"],
  blackbird: ["set_all_zones"],
  blink: ["record", "trigger_camera", "save_video", "save_recent_clips"],
  blue_current: ["start_charge_session"],
  bond: [
    "set_fan_speed_tracked_state",
    "set_switch_power_tracked_state",
    "set_light_power_tracked_state",
    "set_light_brightness_tracked_state",
    "start_increasing_brightness",
    "start_decreasing_brightness",
    "stop",
  ],
  bosch_alarm: ["set_date_time"],
  bring: ["send_message", "send_reaction"],
  browser: ["browse_url"],
  bsblan: ["sync_time", "set_hot_water_schedule", "set_heating_schedule"],
  cast: ["show_lovelace_view"],
  channels: ["seek_forward", "seek_backward", "seek_by"],
  cloud: ["remote_connect", "remote_disconnect"],
  cloudflare: ["update_records"],
  collection_image: [
    "shuffle",
    "select_first",
    "select_last",
    "select_next",
    "select_previous",
    "select_image",
  ],
  color_extractor: ["turn_on", "get_color"],
  command_line: ["reload"],
  configurator: ["configure"],
  daikin: ["set_demand_control"],
  debugpy: ["start"],
  deconz: ["configure", "device_refresh", "remove_orphaned_entries"],
  demo: ["randomize_device_tracker_data"],
  denonavr: ["get_command", "set_dynamic_eq", "update_audyssey"],
  derivative: ["reload"],
  downloader: ["download_file"],
};

/** Keys the action's own target or entity picker renders. */
const PICKER_KEYS = new Set(["entity_id", "area_id", "floor_id", "label_id"]);

const components = resolve(
  __dirname,
  "../../../../core/homeassistant/components"
);

const readDoc = (file: string): unknown => {
  const text = readFileSync(file, "utf8");
  return text.trim() === "" ? {} : load(text);
};

interface YamlField {
  selector?: Record<string, unknown>;
  fields?: Record<string, YamlField>;
  default?: unknown;
  required?: boolean;
}

const flatten = (
  fields: Record<string, YamlField> | undefined
): [string, YamlField][] =>
  Object.entries(fields ?? {}).flatMap(([key, field]) =>
    field?.fields && !field.selector ? flatten(field.fields) : [[key, field]]
  );

const build = (
  domain: string,
  service: string,
  fields: Record<string, YamlField>,
  data: Record<string, unknown> = {}
): QuickControl[] => {
  const ctx: QuickContext = {
    action: `${domain}.${service}`,
    data,
    fields: Object.fromEntries(
      flatten(fields).map(([key, field]) => [
        key,
        {
          selector: (field?.selector ?? null) as Record<string, unknown> | null,
          required: field?.required,
        },
      ])
    ),
    domainServices: EXPECTED[domain],
    entities: [],
  };
  return INTEGRATION_EDITORS_A[domain].controls[service](ctx);
};

const sample = (
  domain: string,
  service: string,
  keys: string[],
  data: Record<string, unknown> = {}
) =>
  build(
    domain,
    service,
    Object.fromEntries(keys.map((key) => [key, { selector: { text: {} } }])),
    data
  );

const kindOf = (controls: QuickControl[], key: string) =>
  controls.find((control) => control.key === key)?.kind;

describe("integration editors, abode to downloader", () => {
  it("has exactly the expected integrations", () => {
    expect(Object.keys(INTEGRATION_EDITORS_A).sort()).toEqual(
      Object.keys(EXPECTED).sort()
    );
  });

  it("has a builder for every listed service and no unlisted one", () => {
    Object.entries(EXPECTED).forEach(([domain, services]) => {
      const built = Object.keys(INTEGRATION_EDITORS_A[domain].controls);
      expect(built.sort(), domain).toEqual([...services].sort());
    });
  });

  it("lists only services that exist in the services.yaml of this Core", () => {
    if (!existsSync(components)) return;
    Object.entries(EXPECTED).forEach(([domain, services]) => {
      const file = resolve(components, domain, "services.yaml");
      const doc = (readDoc(file) ?? {}) as Record<string, unknown>;
      const actual = Object.keys(doc).filter((name) => !name.startsWith("."));
      if (actual.length === 0) {
        // Registered in Python without a services.yaml.
        expect(domain).toBe("configurator");
        return;
      }
      expect(actual.sort(), domain).toEqual([...services].sort());
    });
  });

  it("gives every field of the services.yaml its own control", () => {
    if (!existsSync(components)) return;
    const missing: string[] = [];
    Object.entries(EXPECTED).forEach(([domain, services]) => {
      const file = resolve(components, domain, "services.yaml");
      const doc = (readDoc(file) ?? {}) as Record<
        string,
        { fields?: Record<string, YamlField> }
      >;
      services.forEach((service) => {
        const fields = doc[service]?.fields;
        const controls = build(domain, service, fields ?? {});
        flatten(fields).forEach(([key]) => {
          if (PICKER_KEYS.has(key)) return;
          if (!controls.some((control) => control.key === key)) {
            missing.push(`${domain}.${service}.${key}`);
          }
        });
      });
    });
    expect(missing).toEqual([]);
  });

  it("never shows a bare text box where a proper control exists", () => {
    const plain: string[] = [];
    Object.entries(EXPECTED).forEach(([domain, services]) => {
      const file = resolve(components, domain, "services.yaml");
      if (!existsSync(file)) return;
      const doc = (readDoc(file) ?? {}) as Record<
        string,
        { fields?: Record<string, YamlField> }
      >;
      services.forEach((service) => {
        const fields = doc[service]?.fields;
        const controls = build(domain, service, fields ?? {});
        flatten(fields).forEach(([key, field]) => {
          const type = Object.keys(field?.selector ?? {})[0];
          const kind = kindOf(controls, key);
          if (type && type !== "text" && kind === "text") {
            plain.push(`${domain}.${service}.${key} (${type})`);
          }
        });
      });
    });
    expect(plain).toEqual([]);
  });

  it("uses the right control kind for each kind of value", () => {
    expect(
      kindOf(
        sample("ads", "write_data_by_name", ["adstype", "value"]),
        "adstype"
      )
    ).toBe("tiles");
    expect(
      kindOf(sample("ads", "write_data_by_name", ["value"]), "value")
    ).toBe("slider");
    expect(
      kindOf(sample("amcrest", "ptz_control", ["travel_time"]), "travel_time")
    ).toBe("slider");
    expect(kindOf(sample("amcrest", "goto_preset", ["preset"]), "preset")).toBe(
      "stepper"
    );
    expect(kindOf(sample("besen", "start_charging", ["start"]), "start")).toBe(
      "datetime"
    );
    expect(
      kindOf(sample("besen", "start_charging", ["duration"]), "duration")
    ).toBe("duration");
    expect(
      kindOf(
        sample("bond", "set_light_power_tracked_state", ["power_state"]),
        "power_state"
      )
    ).toBe("switch");
    expect(
      kindOf(sample("alexa_devices", "send_sound", ["sound"]), "sound")
    ).toBe("selector");
    expect(
      kindOf(sample("alexa_devices", "send_sound", ["device_id"]), "device_id")
    ).toBe("selector");
    expect(
      kindOf(
        sample("amberelectric", "get_forecasts", ["channel_type"]),
        "channel_type"
      )
    ).toBe("tiles");
    expect(
      kindOf(sample("collection_image", "select_image", ["image"]), "image")
    ).toBe("selector");
    expect(
      kindOf(
        sample("bsblan", "set_heating_schedule", [
          "monday_slots",
          "sunday_slots",
        ]),
        "sunday_slots"
      )
    ).toBe("selector");
    expect(kindOf(sample("channels", "seek_by", ["seconds"]), "seconds")).toBe(
      "stepper"
    );
    expect(
      kindOf(
        sample("alexa_devices", "send_text_command", ["text_command"]),
        "text_command"
      )
    ).toBe("text");
  });

  it("uses password inputs for codes and the media selector for images", () => {
    const code = sample("alarmdecoder", "alarm_toggle_chime", ["code"]).find(
      (control) => control.key === "code"
    ) as Extract<QuickControl, { kind: "text" }>;
    expect(code.inputType).toBe("password");
    const image = sample("collection_image", "select_image", [
      "image",
    ])[0] as Extract<QuickControl, { kind: "selector" }>;
    expect(image.selector).toEqual({ media: { accept: ["image/*"] } });
    expect(image.valueType).toBe("media");
  });

  it("keeps a stored value visible and leaves templates alone", () => {
    const stored = sample("adguard", "add_url", ["url"], {
      url: "https://example.org/list.txt",
    })[0] as Extract<QuickControl, { kind: "text" }>;
    expect(stored.value).toBe("https://example.org/list.txt");
    expect(
      sample("bond", "set_fan_speed_tracked_state", ["speed"], {
        speed: "{{ 50 }}",
      })
    ).toEqual([]);
  });

  it("puts the weekly schedule slots in a time-field object editor", () => {
    const control = sample("bsblan", "set_hot_water_schedule", [
      "monday_slots",
    ])[0] as Extract<QuickControl, { kind: "selector" }>;
    expect(control.selector).toMatchObject({
      object: {
        multiple: true,
        fields: {
          start_time: { selector: { time: {} } },
          end_time: { selector: { time: {} } },
        },
      },
    });
  });

  it("prefixes every label with its integration", () => {
    const wrong: string[] = [];
    Object.entries(EXPECTED).forEach(([domain, services]) => {
      services.forEach((service) => {
        INTEGRATION_EDITORS_A[domain].controls[service]({
          action: `${domain}.${service}`,
          data: {},
          fields: Object.fromEntries(
            [
              "text",
              "url",
              "value",
              "code",
              "device_id",
              "config_entry_id",
              "start",
              "duration",
              "datetime",
              "image",
              "data",
              "headers",
              "sound",
              "info_skill",
              "monday_slots",
              "beolink_jids",
              "source_id",
              "preset",
            ].map((key) => [key, { selector: { text: {} } }])
          ),
          domainServices: [],
          entities: [],
        }).forEach((control) => {
          const label = control.labelKey;
          const reload = label.endsWith("note_reload");
          if (
            !reload &&
            !label.startsWith(`ui.components.action-editors.fields.${domain}__`)
          ) {
            wrong.push(`${domain}.${service}: ${label}`);
          }
        });
      });
    });
    expect(wrong).toEqual([]);
  });
});
