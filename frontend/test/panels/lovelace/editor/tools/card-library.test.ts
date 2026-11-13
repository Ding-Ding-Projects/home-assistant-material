import { describe, expect, it } from "vitest";
import {
  applyInputs,
  findInputs,
  latestVersion,
  restoreVersion,
  saveToLibrary,
} from "../../../../../src/panels/lovelace/editor/tools/card-library";

describe("card library", () => {
  it("finds and fills inputs, leaving templates alone", () => {
    const card = {
      type: "tile",
      entity: "[[light]]",
      name: "{{ states('x') }} [[room]]",
      nested: [{ title: "[[room]]" }],
    };
    expect(findInputs(card)).toEqual(["light", "room"]);
    const out = applyInputs(card, { light: "light.kitchen", room: "Kitchen" });
    expect(out.entity).toBe("light.kitchen");
    expect(out.name).toBe("{{ states('x') }} Kitchen");
    expect(applyInputs(card, {}).entity).toBe("[[light]]");
  });

  it("adds a version for the same name and skips identical saves", () => {
    let lib = saveToLibrary([], "Room", { type: "a" }, 1);
    lib = saveToLibrary(lib, "room", { type: "a" }, 2);
    expect(lib).toHaveLength(1);
    expect(lib[0].versions).toHaveLength(1);
    lib = saveToLibrary(lib, "Room", { type: "b" }, 3);
    expect(lib[0].versions).toHaveLength(2);
    expect(latestVersion(lib[0]).card.type).toBe("b");
  });

  it("restores an old version as a new one", () => {
    let lib = saveToLibrary([], "Room", { type: "a" }, 1);
    lib = saveToLibrary(lib, "Room", { type: "b" }, 2);
    lib = restoreVersion(lib, lib[0].id, 1, 3);
    expect(lib[0].versions).toHaveLength(3);
    expect(latestVersion(lib[0]).card.type).toBe("a");
  });
});
