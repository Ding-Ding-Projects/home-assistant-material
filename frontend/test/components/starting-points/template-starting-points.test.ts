import { describe, expect, it } from "vitest";
import {
  TEMPLATE_STARTING_POINTS,
  templateForStartingPoint,
} from "../../../src/components/starting-points/template-starting-points";

// Protects the template tool's starting points: they must work on any
// installation, so none may name a particular entity of a domain that may be
// missing, and each must have balanced template delimiters.

describe("template starting points", () => {
  it("has unique ids and a template for each", () => {
    const ids = TEMPLATE_STARTING_POINTS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of TEMPLATE_STARTING_POINTS) {
      expect(item.template.trim().length).toBeGreaterThan(0);
      expect(templateForStartingPoint(item.id)).toBe(item.template);
    }
  });

  it("names no particular entity from a domain that may be missing", () => {
    for (const item of TEMPLATE_STARTING_POINTS) {
      expect(item.template).not.toMatch(
        /\b(light|switch|sensor|binary_sensor|climate|cover)\.[a-z0-9_]+/
      );
    }
  });

  it("closes every template delimiter it opens", () => {
    for (const item of TEMPLATE_STARTING_POINTS) {
      const count = (text: string) => item.template.split(text).length - 1;
      expect(count("{{")).toBe(count("}}"));
      expect(count("{%")).toBe(count("%}"));
    }
  });

  it("gives nothing for an unknown id", () => {
    expect(templateForStartingPoint("nope")).toBeUndefined();
  });
});
