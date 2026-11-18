import { describe, expect, it } from "vitest";
import { formatLastSeen } from "../../src/data/camera-live-session";
import { isEventSourceCandidate } from "../../src/panels/config/camera-recording/ha-config-camera-recording";

describe("formatLastSeen", () => {
  it("shows a 24-hour clock time", () => {
    const iso = new Date(2026, 10, 18, 23, 14, 5).toISOString();
    expect(formatLastSeen(iso)).toBe("23:14");
    expect(formatLastSeen(new Date(2026, 10, 18, 7, 5).toISOString())).toBe(
      "07:05"
    );
  });

  it("shows nothing for a missing or unreadable time", () => {
    expect(formatLastSeen(undefined)).toBeUndefined();
    expect(formatLastSeen("not a time")).toBeUndefined();
  });
});

describe("isEventSourceCandidate", () => {
  const entity = (entity_id: string, device_class?: string) => ({
    entity_id,
    attributes: { device_class },
  });

  it("offers event entities and sensors that can tell something was seen", () => {
    expect(isEventSourceCandidate(entity("event.doorbell"))).toBe(true);
    expect(isEventSourceCandidate(entity("binary_sensor.a", "motion"))).toBe(
      true
    );
    expect(isEventSourceCandidate(entity("binary_sensor.b", "door"))).toBe(
      true
    );
  });

  it("leaves out everything else", () => {
    expect(isEventSourceCandidate(entity("binary_sensor.c", "battery"))).toBe(
      false
    );
    expect(isEventSourceCandidate(entity("binary_sensor.d"))).toBe(false);
    expect(isEventSourceCandidate(entity("light.e"))).toBe(false);
  });
});
