import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  countFilledFields,
  enrichSelector,
  FORM_FIELD_CONTROLS,
  getFieldHint,
  getNumberFieldProps,
  getSelectPresentation,
  getStringFieldProps,
  SELECTOR_CONTROLS,
} from "../../../src/components/ha-form/field-kinds";

// Field kinds that setup, options, reauthentication, reconfigure and sub-entry
// flows send, from a scan of core/homeassistant/components/*/config_flow.py.
// Written by hand so a kind missing from the mapping is noticed.
const PLAIN_KINDS_SENT_BY_FLOWS = [
  "string",
  "integer",
  "float",
  "boolean",
  "select",
  "multi_select",
  "positive_time_period_dict",
  "constant",
  "expandable",
];

// Python selector class used by flows -> selector key sent to the frontend.
const SELECTOR_CLASSES_USED_BY_FLOWS: Record<string, string> = {
  TextSelector: "text",
  SelectSelector: "select",
  NumberSelector: "number",
  BooleanSelector: "boolean",
  TemplateSelector: "template",
  EntitySelector: "entity",
  ActionSelector: "action",
  LocationSelector: "location",
  SerialPortSelector: "serial_port",
  DeviceClassSelector: "device_class",
  DurationSelector: "duration",
  FileSelector: "file",
  CountrySelector: "country",
  TimeSelector: "time",
  LanguageSelector: "language",
  UnitOfMeasurementSelector: "unit_of_measurement",
  StateClassSelector: "state_class",
  QrCodeSelector: "qr_code",
  ObjectSelector: "object",
  StateSelector: "state",
  MediaSelector: "media",
  DeviceSelector: "device",
  AttributeSelector: "attribute",
};

const SRC = path.resolve(__dirname, "../../../src/components");

const loadKeys = (file: string): string[] => {
  const source = readFileSync(path.join(SRC, file), "utf8");
  const block = source.match(/const LOAD_ELEMENTS = \{([\s\S]*?)\n\}/)![1];
  return [...block.matchAll(/^\s{2}(\w+):/gm)].map((match) => match[1]);
};

describe("every field kind has a rich control", () => {
  it("maps each plain kind a flow can send", () => {
    for (const kind of PLAIN_KINDS_SENT_BY_FLOWS) {
      expect(FORM_FIELD_CONTROLS, kind).toHaveProperty(kind);
    }
  });

  it("maps each selector the flows use", () => {
    for (const [pythonClass, key] of Object.entries(
      SELECTOR_CLASSES_USED_BY_FLOWS
    )) {
      expect(SELECTOR_CONTROLS, pythonClass).toHaveProperty(key);
    }
  });

  it("lists exactly the elements the form can load", () => {
    expect(Object.keys(FORM_FIELD_CONTROLS).sort()).toEqual(
      loadKeys("ha-form/ha-form.ts").sort()
    );
  });

  it("lists exactly the selectors that can be drawn", () => {
    expect(Object.keys(SELECTOR_CONTROLS).sort()).toEqual(
      loadKeys("ha-selector/ha-selector.ts").sort()
    );
  });
});

describe("getFieldHint", () => {
  it.each([
    ["host", "host"],
    ["hostname", "host"],
    ["ip_address", "host"],
    ["port", "port"],
    ["url", "url"],
    ["base_url", "url"],
    ["username", "username"],
    ["password", "password"],
    ["new_password", "password"],
    ["api_key", "secret"],
    ["apiKey", "secret"],
    ["access_token", "secret"],
    ["client_secret", "secret"],
    ["email", "email"],
    ["latitude", "latitude"],
    ["longitude", "longitude"],
    ["scan_interval", "scan_interval"],
    ["timeout", "timeout"],
    ["mac", "mac"],
    ["mac_address", "mac"],
    ["pin", "pin"],
    ["code", "code"],
  ])("recognises %s", (name, kind) => {
    expect(getFieldHint(name)?.kind).toBe(kind);
  });

  it.each(["name", "country_code", "serial_port", "model", ""])(
    "leaves %s alone",
    (name) => {
      expect(getFieldHint(name)).toBeUndefined();
    }
  );

  it("masks credentials and sets autocomplete", () => {
    expect(getFieldHint("password")).toMatchObject({
      sensitive: true,
      autocomplete: "current-password",
    });
    expect(getFieldHint("new_password")?.autocomplete).toBe("new-password");
    expect(getFieldHint("api_key")?.sensitive).toBe(true);
    expect(getFieldHint("username")?.autocomplete).toBe("username");
  });

  it("gives coordinates their range", () => {
    expect(getFieldHint("latitude")).toMatchObject({ min: -90, max: 90 });
    expect(getFieldHint("longitude")).toMatchObject({ min: -180, max: 180 });
  });
});

describe("getStringFieldProps", () => {
  it("masks a password with a toggle", () => {
    expect(getStringFieldProps({ name: "password" })).toMatchObject({
      type: "password",
      passwordToggle: true,
    });
  });

  it("lets the schema format and autocomplete win", () => {
    expect(
      getStringFieldProps({
        name: "host",
        format: "url",
        autocomplete: "section-x",
      })
    ).toMatchObject({ type: "url", autocomplete: "section-x" });
  });

  it("prefers the suffix the integration sent", () => {
    expect(
      getStringFieldProps({ name: "timeout", description: { suffix: "min" } })
        .suffix
    ).toBe("min");
  });

  it("is a plain text field for an unknown name", () => {
    expect(getStringFieldProps({ name: "name" })).toEqual({
      type: "text",
      passwordToggle: false,
      inputMode: undefined,
      autocomplete: undefined,
      suffix: undefined,
    });
  });
});

describe("getNumberFieldProps", () => {
  it("draws a slider for a small known range", () => {
    expect(
      getNumberFieldProps("integer", {
        type: "integer",
        name: "level",
        valueMin: 0,
        valueMax: 100,
      }).presentation
    ).toBe("slider");
  });

  it("draws a stepper without a range or with a wide one", () => {
    expect(
      getNumberFieldProps("integer", { type: "integer", name: "count" })
        .presentation
    ).toBe("stepper");
    expect(
      getNumberFieldProps("integer", {
        type: "integer",
        name: "count",
        valueMin: 0,
        valueMax: 100000,
      }).presentation
    ).toBe("stepper");
  });

  it("adds the range and unit a name calls for", () => {
    expect(
      getNumberFieldProps("integer", { type: "integer", name: "port" })
    ).toMatchObject({ min: 0, max: 65535 });
    expect(
      getNumberFieldProps("integer", { type: "integer", name: "scan_interval" })
        .suffix
    ).toBe("s");
    expect(
      getNumberFieldProps("float", { type: "float", name: "latitude" })
    ).toMatchObject({ min: -90, max: 90, inputMode: "decimal" });
  });
});

describe("getSelectPresentation", () => {
  it("uses tiles up to five options and a searchable list above", () => {
    expect(getSelectPresentation(2)).toBe("tiles");
    expect(getSelectPresentation(5)).toBe("tiles");
    expect(getSelectPresentation(6)).toBe("searchable");
  });
});

describe("enrichSelector", () => {
  it("fills in the text type, autocomplete and unit the name calls for", () => {
    expect(
      enrichSelector({ name: "password", selector: { text: {} } })
    ).toEqual({ text: { type: "password", autocomplete: "current-password" } });
    expect(enrichSelector({ name: "email", selector: { text: {} } })).toEqual({
      text: { type: "email", autocomplete: "email" },
    });
  });

  it("never overrides what the backend sent", () => {
    expect(
      enrichSelector({
        name: "password",
        selector: { text: { type: "text", autocomplete: "off" } },
      })
    ).toEqual({ text: { type: "text", autocomplete: "off" } });
  });

  it("leaves multiline and multiple text alone", () => {
    const multiline = { text: { multiline: true } };
    expect(enrichSelector({ name: "password", selector: multiline })).toBe(
      multiline
    );
  });

  it("uses a slider for a small number range and leaves wide ones", () => {
    expect(
      enrichSelector({
        name: "level",
        selector: { number: { min: 0, max: 10 } },
      })
    ).toEqual({ number: { min: 0, max: 10, mode: "slider" } });
    expect(
      enrichSelector({
        name: "level",
        selector: { number: { min: 0, max: 5000 } },
      })
    ).toEqual({ number: { min: 0, max: 5000 } });
    expect(
      enrichSelector({
        name: "level",
        selector: { number: { min: 0, max: 10, mode: "box" } },
      })
    ).toEqual({ number: { min: 0, max: 10, mode: "box" } });
  });

  it("does not touch other selectors", () => {
    const selector = { entity: {} };
    expect(enrichSelector({ name: "entity", selector })).toBe(selector);
  });
});

describe("countFilledFields", () => {
  it("counts only fields the person fills in", () => {
    expect(
      countFilledFields(
        [
          { name: "a", type: "string" },
          { name: "b", type: "string" },
          { name: "c", type: "boolean" },
          { name: "d", type: "constant" },
          { name: "e", type: "multi_select", options: ["x"] },
        ],
        { a: "x", b: "", c: false, e: [] }
      )
    ).toEqual({ filled: 2, total: 4 });
  });
});
