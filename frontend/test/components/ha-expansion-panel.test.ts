import { describe, expect, it } from "vitest";
import { heightTransitionMs } from "../../src/components/ha-expansion-panel";

describe("heightTransitionMs", () => {
  it("reads the height duration from the lists", () => {
    expect(heightTransitionMs("height, opacity", "0.25s, 0.1s")).toBe(250);
    expect(heightTransitionMs("opacity, height", "100ms, 300ms")).toBe(300);
  });

  it("is 0 when the duration token is zero, none or invalid", () => {
    expect(heightTransitionMs("height, opacity", "0s, 0s")).toBe(0);
    expect(heightTransitionMs("none", "0s")).toBe(0);
    expect(heightTransitionMs("height", "none")).toBe(0);
    expect(heightTransitionMs("height", "")).toBe(0);
  });

  it("is 0 when only other properties transition", () => {
    expect(heightTransitionMs("opacity", "250ms")).toBe(0);
  });

  it("treats all as the height", () => {
    expect(heightTransitionMs("all", "150ms")).toBe(150);
  });
});
