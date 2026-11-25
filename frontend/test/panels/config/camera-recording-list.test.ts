import { describe, expect, it } from "vitest";
import {
  cameraKey,
  filterCameras,
  readExpanded,
  setExpanded,
  toggleExpanded,
  type CameraSearchFields,
} from "../../../src/panels/config/camera-recording/camera-recording-list";

const cameras: CameraSearchFields[] = [
  {
    name: "Front Door DOORBELL",
    entityId: "camera.front_door_doorbell",
    state: "Recording",
    amount: "Light",
    place: "/config/recordings",
  },
  {
    name: "Driveway",
    entityId: "camera.driveway",
    state: "Recording",
    amount: "All day",
    place: "/config/recordings",
  },
  {
    name: "Garage",
    entityId: "camera.garage",
    state: "Paused",
    amount: "Light",
    place: "NAS recordings",
  },
];

const names = (query: string) =>
  filterCameras(cameras, query, (cam) => cam).map((cam) => cam.name);

describe("filterCameras", () => {
  it("keeps every camera for empty text", () => {
    expect(names("  ")).toHaveLength(3);
  });

  it("matches name, entity id, state, amount and place ignoring case", () => {
    expect(names("drive")).toEqual(["Driveway"]);
    expect(names("camera.garage")).toEqual(["Garage"]);
    expect(names("paused")).toEqual(["Garage"]);
    expect(names("all day")).toEqual(["Driveway"]);
    expect(names("nas")).toEqual(["Garage"]);
  });

  it("tests a pattern as written", () => {
    expect(names("/^(front|garage)/i")).toEqual([
      "Front Door DOORBELL",
      "Garage",
    ]);
    expect(names("/^front/")).toEqual([]);
  });

  it("matches nothing for a broken pattern", () => {
    expect(names("/(front/")).toEqual([]);
  });
});

describe("expanded rows", () => {
  const a = cameraKey("e1", "camera.a");
  const b = cameraKey("e1", "camera.b");
  const c = cameraKey("e2", "camera.a");

  it("tells the same camera of two places apart", () => {
    expect(a).not.toBe(c);
  });

  it("toggles one row", () => {
    expect(toggleExpanded([], a)).toEqual([a]);
    expect(toggleExpanded([a, b], a)).toEqual([b]);
  });

  it("opens or folds only the listed rows", () => {
    expect(setExpanded([c], [a, b], true)).toEqual([c, a, b]);
    expect(setExpanded([a, b, c], [a, b], false)).toEqual([c]);
    expect(setExpanded([a], [a, b], true)).toEqual([a, b]);
  });

  it("reads only a list of strings from storage", () => {
    expect(readExpanded([a, a, 3, null, b])).toEqual([a, b]);
    expect(readExpanded("x")).toEqual([]);
    expect(readExpanded(undefined)).toEqual([]);
  });
});
