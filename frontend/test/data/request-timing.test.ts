import { beforeEach, describe, expect, it } from "vitest";
import {
  clearTimedRequests,
  getTimedRequests,
  spanInHours,
  timeRequest,
} from "../../src/data/request-timing";

describe("request timing", () => {
  beforeEach(() => clearTimedRequests());

  it("works out the hours a request covers", () => {
    expect(spanInHours(new Date(0), new Date(3 * 3_600_000))).toBe(3);
    expect(spanInHours(undefined)).toBeUndefined();
    expect(spanInHours(new Date(10), new Date(5))).toBe(0);
  });

  it("records a request and passes the answer on unchanged", async () => {
    const start = new Date(Date.now() - 48 * 3_600_000);
    const result = await timeRequest(
      { kind: "history", entityIds: ["sensor.a"], startTime: start },
      () => Promise.resolve("answer")
    );
    expect(result).toBe("answer");
    const [request] = getTimedRequests();
    expect(request.kind).toBe("history");
    expect(request.entityCount).toBe(1);
    expect(request.spanHours).toBeGreaterThanOrEqual(47.9);
    expect(request.failed).toBeUndefined();
  });

  it("records a failure and still fails the same way", async () => {
    await expect(
      timeRequest(
        { kind: "statistics", entityIds: undefined, startTime: undefined },
        () => Promise.reject(new Error("nope"))
      )
    ).rejects.toThrow("nope");
    await Promise.resolve();
    expect(getTimedRequests()[0].failed).toBe(true);
  });
});
