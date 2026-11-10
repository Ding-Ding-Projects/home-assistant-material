import { describe, expect, it } from "vitest";
import { generateCode } from "../../../src/common/regex/codegen";

// Generated code is pasted into automations and scripts. These tests protect
// the escaping for each target and the warnings for known differences.
describe("generated code", () => {
  it("writes a JavaScript literal, or a constructor when a slash is bare", () => {
    expect(generateCode("javascript", "\\d+", "g").code).toBe(
      "const pattern = /\\d+/g;\nconst matches = [...text.matchAll(pattern)];"
    );
    expect(generateCode("javascript", "a/b", "").code).toContain(
      'new RegExp("a/b", "")'
    );
    expect(generateCode("javascript", "a\\/b", "").code).toContain("/a\\/b/");
  });

  it("converts named groups and references for Python", () => {
    const result = generateCode("python", "(?<y>\\d{4})-\\k<y>", "i");
    expect(result.pattern).toBe("(?P<y>\\d{4})-(?P=y)");
    expect(result.code).toContain(
      'pattern = re.compile(r"(?P<y>\\d{4})-(?P=y)", re.IGNORECASE)'
    );
    expect(result.warnings).toContain("digit_unicode");
    expect(result.warnings).toContain("case_insensitive_unicode");
  });

  it("converts code point escapes", () => {
    expect(generateCode("python", "\\u{1F600}\\u00e9", "u").pattern).toBe(
      "\\U0001F600\\u00E9"
    );
    expect(generateCode("pcre", "\\u{1F600}", "u").pattern).toBe("\\x{1F600}");
  });

  it("warns where behaviour differs and cannot be rewritten", () => {
    expect(generateCode("python", "\\p{L}+$", "u").warnings).toEqual(
      expect.arrayContaining(["unicode_property", "dollar_newline"])
    );
    expect(generateCode("python", "(?<=a+)b", "").warnings).toContain(
      "lookbehind_fixed"
    );
    expect(generateCode("python", "(?<=ab)c", "").warnings).not.toContain(
      "lookbehind_fixed"
    );
    expect(generateCode("pcre", "a", "y").warnings).toContain("sticky");
    expect(generateCode("python", "a++", "").warnings).toContain(
      "unsupported_construct"
    );
  });

  it("escapes for a Home Assistant template", () => {
    const result = generateCode("home_assistant", "it's \\d+", "im");
    expect(result.code).toBe(
      "{{ value | regex_search('(?m)it\\'s \\\\d+', ignorecase=True) }}"
    );
    expect(generateCode("home_assistant", "a", "g").code).toContain(
      "regex_findall"
    );
  });

  it("escapes for a shell command", () => {
    expect(generateCode("pcre", "it's", "gi").code).toBe(
      "grep -oiP 'it'\\''s' file.txt"
    );
  });

  it("falls back from a Python raw string when it cannot hold the text", () => {
    expect(generateCode("python", "a\"b'c", "").code).toContain(
      're.compile("a\\"b\'c")'
    );
  });

  it("writes JSON that reads back", () => {
    const result = generateCode("json", 'a"\\d', "gi");
    expect(JSON.parse(result.code)).toEqual({ pattern: 'a"\\d', flags: "gi" });
  });
});
