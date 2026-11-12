import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLogMessage,
  fetchSameOriginText,
  STACK_TRACE_OPTIONS,
} from "../../src/resources/log-message";

const fromError = vi.hoisted(() => vi.fn());

vi.mock("stacktrace-js", () => ({ fromError }));

describe("createLogMessage", () => {
  beforeEach(() => {
    fromError.mockReset();
  });

  it("includes the error message and parsed stack frames", async () => {
    fromError.mockResolvedValue([
      { fileName: "https://example.com/foo.js", toString: () => "at foo.js" },
    ]);
    const error = new Error("boom");

    const message = await createLogMessage(error);

    expect(message).toContain("Error: boom");
    expect(message).toContain("at foo.js");
  });

  it("does not throw when stacktrace-js cannot parse the stack", async () => {
    fromError.mockRejectedValue(new Error("Cannot parse given Error object"));
    const error = new Error("boom");
    error.stack = "Error: boom\n    at <anonymous>";

    const message = await createLogMessage(error);

    expect(message).toContain("Error: boom");
    // Falls back to the raw stack instead of crashing the logger.
    expect(message).toContain("at <anonymous>");
  });

  it("falls back to the provided stack fallback when no stack is available", async () => {
    fromError.mockRejectedValue(new Error("Cannot parse given Error object"));
    const error = new Error("boom");
    error.stack = undefined;

    const message = await createLogMessage(
      error,
      undefined,
      undefined,
      "@unknown:0:0"
    );

    expect(message).toContain("@unknown:0:0");
  });

  it("resolves stack traces only through the same-origin request function", async () => {
    fromError.mockResolvedValue([]);

    await createLogMessage(new Error("boom"));

    expect(fromError).toHaveBeenCalledWith(
      expect.any(Error),
      STACK_TRACE_OPTIONS
    );
  });
});

describe("fetchSameOriginText", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, text: async () => "body" });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches files from this instance", async () => {
    await expect(
      fetchSameOriginText(
        "/frontend_latest/app.js.map",
        "http://ha.local:8123/"
      )
    ).resolves.toBe("body");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never requests an outside host", async () => {
    await expect(
      fetchSameOriginText(
        "https://raw.githubusercontent.com/home-assistant/frontend/1.0/src/panels/my/ha-panel-my.ts",
        "http://ha.local:8123/"
      )
    ).rejects.toThrow();
    await expect(
      fetchSameOriginText("//example.com/a.js.map", "http://ha.local:8123/")
    ).rejects.toThrow();
    await expect(
      fetchSameOriginText("http://ha.local:9999/a.js", "http://ha.local:8123/")
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
