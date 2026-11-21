import { describe, expect, it } from "vitest";
import {
  decodeStatesToolQueryParams,
  statesToolUrl,
} from "../../../src/common/url/states-tool-query-params";

describe("states tool query params", () => {
  it("links to the states tool with the entity chosen", () => {
    expect(statesToolUrl("light.kitchen")).toBe(
      "/config/tools/state?entity_id=light.kitchen"
    );
  });

  it("links to the plain states tool without an entity", () => {
    expect(statesToolUrl()).toBe("/config/tools/state");
    expect(statesToolUrl("")).toBe("/config/tools/state");
  });

  it("reads the entity back from a link", () => {
    expect(
      decodeStatesToolQueryParams(
        new URLSearchParams("entity_id=light.kitchen&other=1")
      )
    ).toEqual({ entity_id: "light.kitchen" });
    expect(decodeStatesToolQueryParams("")).toEqual({});
  });
});
