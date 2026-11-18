import type { HassEntity } from "home-assistant-js-websocket";
import { describe, expect, it } from "vitest";
import {
  cameraEventEntities,
  cameraEventKind,
  clipForEvent,
  playTimeForClip,
  historyToEvents,
  recordedRanges,
  segmentAfter,
  segmentAt,
  type CameraEvent,
  type CameraEventRecord,
  type RecordedSegment,
} from "../../src/data/camera_recording";
import type { HomeAssistant } from "../../src/types";

const entity = (entityId: string, deviceClass?: string, name = "") =>
  ({
    entity_id: entityId,
    state: "off",
    attributes: { device_class: deviceClass, friendly_name: name },
  }) as unknown as HassEntity;

const segment = (start: number, end: number): RecordedSegment => ({
  entry_id: "e",
  name: `${start}.mp4`,
  start,
  end,
  size: 1,
  here: true,
});

describe("cameraEventKind", () => {
  it("reads the device class first", () => {
    expect(
      cameraEventKind(entity("binary_sensor.a", "motion"), "binary_sensor.a")
    ).toBe("motion");
    expect(
      cameraEventKind(entity("binary_sensor.a", "occupancy"), "binary_sensor.a")
    ).toBe("person");
    expect(
      cameraEventKind(entity("binary_sensor.a", "sound"), "binary_sensor.a")
    ).toBe("sound");
    expect(cameraEventKind(entity("event.a", "doorbell"), "event.a")).toBe(
      "doorbell"
    );
  });

  it("uses words for detections a camera names", () => {
    expect(
      cameraEventKind(
        entity("binary_sensor.front_person", "motion", "Front person"),
        "binary_sensor.front_person"
      )
    ).toBe("person");
    expect(
      cameraEventKind(
        entity("binary_sensor.drive_vehicle"),
        "binary_sensor.drive_vehicle"
      )
    ).toBe("vehicle");
  });

  it("ignores other domains and unrelated sensors", () => {
    expect(
      cameraEventKind(entity("sensor.a", "motion"), "sensor.a")
    ).toBeUndefined();
    expect(
      cameraEventKind(
        entity("binary_sensor.door", "door", "Door"),
        "binary_sensor.door"
      )
    ).toBeUndefined();
  });
});

describe("cameraEventEntities", () => {
  it("finds event entities on the camera's device only", () => {
    const entities = {
      "camera.front": { entity_id: "camera.front", device_id: "d1" },
      "binary_sensor.front_motion": {
        entity_id: "binary_sensor.front_motion",
        device_id: "d1",
      },
      "binary_sensor.other_motion": {
        entity_id: "binary_sensor.other_motion",
        device_id: "d2",
      },
    } as unknown as HomeAssistant["entities"];
    const states = {
      "binary_sensor.front_motion": entity(
        "binary_sensor.front_motion",
        "motion"
      ),
      "binary_sensor.other_motion": entity(
        "binary_sensor.other_motion",
        "motion"
      ),
    };
    expect([...cameraEventEntities("camera.front", entities, states)]).toEqual([
      ["binary_sensor.front_motion", "motion"],
    ]);
  });
});

describe("historyToEvents", () => {
  const kinds = new Map([
    ["binary_sensor.motion", "motion" as const],
    ["event.bell", "doorbell" as const],
  ]);

  it("turns on periods and event times into events, oldest first", () => {
    const events = historyToEvents(
      {
        "binary_sensor.motion": [
          { s: "off", lu: 0 },
          { s: "on", lu: 100 },
          { s: "off", lu: 130 },
          { s: "on", lu: 500 },
        ],
        "event.bell": [{ s: new Date(200_000).toISOString(), lu: 200 }],
      },
      kinds,
      0,
      600_000
    );
    expect(events).toEqual([
      {
        kind: "motion",
        entityId: "binary_sensor.motion",
        start: 100_000,
        end: 130_000,
      },
      {
        kind: "doorbell",
        entityId: "event.bell",
        start: 200_000,
        end: 200_000,
      },
      {
        kind: "motion",
        entityId: "binary_sensor.motion",
        start: 500_000,
        end: 600_000,
      },
    ]);
  });
});

describe("recorded segments", () => {
  const segments = [segment(0, 300), segment(300, 600), segment(900, 1200)];

  it("joins touching segments and keeps gaps", () => {
    expect(recordedRanges(segments)).toEqual([
      [0, 600_000],
      [900_000, 1_200_000],
    ]);
  });

  it("finds the segment at a moment and the next one after a gap", () => {
    expect(segmentAt(segments, 310_000)?.start).toBe(300);
    expect(segmentAt(segments, 700_000)).toBeUndefined();
    expect(segmentAfter(segments, 700_000)?.start).toBe(900);
  });
});

describe("clipForEvent", () => {
  const event: CameraEvent = {
    kind: "doorbell",
    entityId: "event.door",
    start: 1_000_000,
    end: 1_000_000,
  };
  const record = (
    patch: Partial<CameraEventRecord> = {}
  ): CameraEventRecord => ({
    start: 1000,
    state: "saved",
    reason: null,
    name: "clip.mp4",
    kind: "clip",
    duration: 10,
    size: 5,
    progress: null,
    entry_id: "e",
    ...patch,
  });
  const clipSegment: RecordedSegment = {
    entry_id: "e",
    name: "clip.mp4",
    start: 1000,
    end: 1010,
    size: 5,
    here: true,
    kind: "event_clip",
  };

  it("offers a clip only when its file is indexed", () => {
    expect(clipForEvent(event, [record()], [clipSegment], null)).toMatchObject({
      state: "saved",
      segment: clipSegment,
    });
    expect(clipForEvent(event, [record()], [], null)).toEqual({
      state: "none",
      reason: "removed",
    });
  });

  it("reports a picture and a clip being saved", () => {
    const picture = { ...clipSegment, kind: "event_image" as const };
    expect(
      clipForEvent(event, [record({ kind: "image" })], [picture], null).picture
    ).toBe(true);
    expect(
      clipForEvent(event, [record({ state: "saving", progress: 18 })], [], null)
    ).toEqual({ state: "saving", progress: 18 });
  });

  it("says why a clip is missing", () => {
    expect(
      clipForEvent(
        event,
        [record({ state: "none", reason: "rate_limited" })],
        [],
        null
      )
    ).toEqual({ state: "none", reason: "rate_limited" });
    expect(clipForEvent(event, [], [], null).reason).toBe("not_recorded");
  });

  it("uses a recording that covers an event, and explains an off camera", () => {
    const recording = {
      ...clipSegment,
      start: 990,
      end: 1300,
      kind: "recording" as const,
    };
    expect(clipForEvent(event, [], [recording], null).state).toBe("saved");
    expect(
      clipForEvent(event, [], [], {
        effective_mode: "off",
      } as Parameters<typeof clipForEvent>[3]).reason
    ).toBe("recording_off");
  });

  it("ignores records of other moments and starts clips on their file", () => {
    expect(clipForEvent(event, [record({ start: 5000 })], [], null).state).toBe(
      "none"
    );
    expect(
      playTimeForClip(event, { state: "saved", segment: clipSegment })
    ).toBe(1_000_001);
    expect(
      playTimeForClip(event, {
        state: "saved",
        segment: { ...clipSegment, kind: "recording" },
      })
    ).toBe(995_000);
  });
});
