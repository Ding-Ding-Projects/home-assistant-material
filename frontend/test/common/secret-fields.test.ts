import { describe, expect, it } from "vitest";
import {
  isSecretAutocomplete,
  isSecretFieldLike,
  isSecretName,
  isSecretSelector,
  maskSecretValues,
  maskYamlSecrets,
  stripSecretValues,
} from "../../src/common/secret-fields";

describe("isSecretName", () => {
  it.each([
    "password",
    "passwd",
    "pass",
    "pin",
    "passphrase",
    "key",
    "api_key",
    "apiKey",
    "API-KEY",
    "access_code",
    "psk",
    "wpa_psk",
    "otp",
    "client_secret",
    "private_key",
    "credentials",
    "token",
    "refresh_token",
    "accesstoken",
    "authToken",
  ])("masks %s", (name) => {
    expect(isSecretName(name)).toBe(true);
  });

  it.each([
    "host",
    "port",
    "name",
    "username",
    "keypad_name",
    "keyboard",
    "mapping",
    "pinned",
    "spinner",
    "latitude",
    "",
  ])("leaves %s alone", (name) => {
    expect(isSecretName(name)).toBe(false);
  });

  it("is deliberately wide where a harmless value costs nothing to hide", () => {
    expect(isSecretName("country_code")).toBe(true);
    expect(isSecretName("sort_key")).toBe(true);
  });

  it("ignores values that are not strings", () => {
    expect(isSecretName(undefined)).toBe(false);
    expect(isSecretName(42)).toBe(false);
  });
});

describe("selector and autocomplete hints", () => {
  it("detects password type and secret autocomplete hints", () => {
    expect(isSecretSelector({ text: { type: "password" } })).toBe(true);
    expect(isSecretSelector({ text: { autocomplete: "one-time-code" } })).toBe(
      true
    );
    expect(
      isSecretSelector({ text: { autocomplete: "section-a new-password" } })
    ).toBe(true);
    expect(isSecretSelector({ text: { type: "url" } })).toBe(false);
    expect(isSecretSelector({ text: null })).toBe(false);
    expect(isSecretSelector(undefined)).toBe(false);
    expect(isSecretAutocomplete("username")).toBe(false);
  });

  it("combines name, selector, format and autocomplete", () => {
    expect(isSecretFieldLike({ name: "x", format: "password" })).toBe(true);
    expect(
      isSecretFieldLike({ name: "x", autocomplete: "current-password" })
    ).toBe(true);
    expect(isSecretFieldLike({ name: "host", selector: { text: {} } })).toBe(
      false
    );
  });
});

describe("maskYamlSecrets", () => {
  const mask = "***";

  it("masks a plain secret and keeps the rest", () => {
    expect(maskYamlSecrets("host: a\npassword: hunter2\nport: 1", mask)).toBe(
      "host: a\npassword: ***\nport: 1"
    );
  });

  it("masks a value that contains a colon and space", () => {
    expect(maskYamlSecrets("token: abc: def: ghi\nname: x", mask)).toBe(
      "token: ***\nname: x"
    );
  });

  it("masks a nested object under a secret key as a whole", () => {
    const yaml = "credentials:\n  user: bob\n  pw: x\nhost: h";
    expect(maskYamlSecrets(yaml, mask)).toBe("credentials: ***\nhost: h");
  });

  it("masks a list of secrets under the key, indented or not", () => {
    expect(
      maskYamlSecrets("api_keys:\n  - a\n  - b\nok: 1", mask, ["api_keys"])
    ).toBe("api_keys: ***\nok: 1");
    expect(maskYamlSecrets("keys:\n- a\n- b\nok: 1", mask)).toBe(
      "keys: ***\nok: 1"
    );
  });

  it("masks a block scalar", () => {
    const yaml = "private_key: |\n  -----BEGIN\n  line2\n\n  line3\nname: x";
    expect(maskYamlSecrets(yaml, mask)).toBe("private_key: ***\nname: x");
  });

  it("masks a folded multi-line plain value", () => {
    const yaml = "secret: first part\n  second part\nname: x";
    expect(maskYamlSecrets(yaml, mask)).toBe("secret: ***\nname: x");
  });

  it("masks a secret inside a list item mapping", () => {
    const yaml =
      "accounts:\n  - name: a\n    pin: 1234\n  - name: b\n    pin: 9";
    expect(maskYamlSecrets(yaml, mask)).toBe(
      "accounts:\n  - name: a\n    pin: ***\n  - name: b\n    pin: ***"
    );
  });

  it("masks quoted keys and flow mappings", () => {
    expect(maskYamlSecrets('"api_key": "x y"', mask)).toBe('"api_key": ***');
    expect(maskYamlSecrets("auth: {user: a, password: b}", mask)).toBe(
      "auth: ***"
    );
    expect(maskYamlSecrets("opts: {user: a, password: b, port: 1}", mask)).toBe(
      "opts: {user: a, password: ***, port: 1}"
    );
  });

  it("masks keys named by the caller", () => {
    expect(maskYamlSecrets("room: kitchen", mask, ["room"])).toBe("room: ***");
  });

  it("leaves an empty secret key and comments alone", () => {
    expect(maskYamlSecrets("# password: x\npassword:\nname: n", mask)).toBe(
      "# password: x\npassword:\nname: n"
    );
  });

  it("does not mask unrelated keys that share letters", () => {
    expect(maskYamlSecrets("keypad_name: kitchen", mask)).toBe(
      "keypad_name: kitchen"
    );
  });
});

describe("stripSecretValues and maskSecretValues", () => {
  const data = {
    host: "h",
    nested: { password: "p", keep: 1, list: [{ pin: "1", name: "n" }] },
    token: "t",
    empty_note: "",
    api_key: "",
  };

  it("removes secrets at any depth and reports their paths", () => {
    const result = stripSecretValues(data);
    expect(result.data).toEqual({
      host: "h",
      nested: { keep: 1, list: [{ name: "n" }] },
      empty_note: "",
    });
    expect(result.removed.sort()).toEqual(
      ["nested.list.0.pin", "nested.password", "token"].sort()
    );
  });

  it("does not change its input", () => {
    stripSecretValues(data);
    expect(data.token).toBe("t");
  });

  it("masks secret values at any depth", () => {
    expect(maskSecretValues(data, "***")).toMatchObject({
      host: "h",
      token: "***",
      nested: { password: "***", keep: 1, list: [{ pin: "***", name: "n" }] },
    });
  });
});
