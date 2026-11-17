import { describe, expect, it } from "vitest";
import type {
  CloudHostInfo,
  CloudHostState,
} from "../../../../src/data/hassio/cloud-host";
import {
  parseCloudHostInfo,
  parseIPv4,
} from "../../../../src/data/hassio/cloud-host";
import {
  allowedActions,
  buildSteps,
  hostnameProblem,
  isSafeSignInUrl,
  normalizeHostname,
  proxyBlock,
  proxyConfigLines,
  RUNNER_NOT_INSTALLED,
  shouldPoll,
} from "../../../../src/panels/config/cloud-host/cloud-host";

// Protects the cloud host page: an address is accepted by the same rule the
// Supervisor applies, the steps only show what the Supervisor really
// reported, each state offers only the actions the Supervisor accepts, and
// only the sign-in wait makes the page ask again by itself.

const info = (over: Partial<CloudHostInfo> = {}): CloudHostInfo => ({
  state: "not_set_up",
  hostname: null,
  error: null,
  last_check: null,
  trusted_proxy: null,
  ...over,
});

const status = (steps: ReturnType<typeof buildSteps>) =>
  Object.fromEntries(steps.map((step) => [step.id, step.status]));

describe("hostname validation", () => {
  it.each(["ha.example.com", "a-b.example.org", "HA.Example.COM.", " x.io "])(
    "accepts %s",
    (value) => {
      expect(hostnameProblem(value)).toBeUndefined();
    }
  );

  it("lowercases and drops the trailing dot", () => {
    expect(normalizeHostname("HA.Example.COM.")).toBe("ha.example.com");
  });

  it.each([
    "localhost",
    "203.0.113.10",
    "ha.example.com:8123",
    "https://ha.example.com",
    "ha.example.com/path",
    "-ha.example.com",
    "ha-.example.com",
    "ha.example.1",
    "ha..example.com",
    "ha example.com",
  ])("refuses %s", (value) => {
    expect(hostnameProblem(value)).toBe("invalid");
  });

  it("tells an empty field from a wrong one", () => {
    expect(hostnameProblem("   ")).toBe("empty");
  });
});

describe("steps follow the real state", () => {
  it("starts at the service when nothing is set up", () => {
    expect(status(buildSteps(info()))).toEqual({
      service: "current",
      sign_in: "pending",
      address: "pending",
      proxy: "pending",
      outside_check: "pending",
    });
  });

  it("waits at the sign-in", () => {
    const steps = status(
      buildSteps(info({ state: "waiting_for_sign_in", hostname: "a.b.co" }))
    );
    expect(steps.service).toBe("done");
    expect(steps.address).toBe("done");
    expect(steps.sign_in).toBe("current");
    expect(steps.outside_check).toBe("pending");
  });

  it("marks the outside check done only after it succeeded", () => {
    const running = info({ state: "running", hostname: "a.b.co" });
    expect(status(buildSteps(running)).outside_check).toBe("current");
    const checked = {
      ...running,
      last_check: { time: "t", ok: true, status: 200, reason: null },
    };
    expect(status(buildSteps(checked)).outside_check).toBe("done");
    const failed = {
      ...running,
      last_check: { time: "t", ok: false, status: 502, reason: null },
    };
    expect(status(buildSteps(failed)).outside_check).toBe("current");
  });

  it("shows a missing tunnel runner as a problem at the service", () => {
    const steps = status(
      buildSteps(info({ state: "error", error: RUNNER_NOT_INSTALLED }))
    );
    expect(steps.service).toBe("failed");
    expect(steps.sign_in).toBe("pending");
  });

  it("reads a missing info as not set up", () => {
    expect(buildSteps(undefined)[0].status).toBe("current");
  });
});

describe("allowed actions", () => {
  const cases: [CloudHostState, boolean, string[]][] = [
    ["not_set_up", false, ["setup"]],
    ["waiting_for_sign_in", true, ["open_sign_in", "remove"]],
    ["running", true, ["check", "pause", "remove"]],
    ["paused", true, ["resume", "remove"]],
    ["error", true, ["resume", "remove"]],
    ["error", false, ["setup"]],
  ];
  it.each(cases)("%s with hostname %s", (state, has, expected) => {
    expect(allowedActions(state, has)).toEqual(expected);
  });
});

describe("polling", () => {
  it("asks again only while waiting for the sign-in", () => {
    expect(shouldPoll("waiting_for_sign_in")).toBe(true);
    for (const state of ["not_set_up", "running", "paused", "error"] as const) {
      expect(shouldPoll(state)).toBe(false);
    }
    expect(shouldPoll(undefined)).toBe(false);
  });
});

describe("sign-in address", () => {
  it("opens only plain https addresses", () => {
    expect(isSafeSignInUrl("https://login.example.com/x")).toBe(true);
    expect(isSafeSignInUrl("http://login.example.com")).toBe(false);
    expect(isSafeSignInUrl(`java${"script"}:alert(1)`)).toBe(false);
    expect(isSafeSignInUrl("nonsense")).toBe(false);
    expect(isSafeSignInUrl(null)).toBe(false);
  });
});

describe("reading the Supervisor answer", () => {
  it("reads a full answer", () => {
    expect(
      parseCloudHostInfo({
        state: "running",
        hostname: "ha.example.com",
        error: null,
        last_check: {
          time: "2026-11-17T12:00:00+00:00",
          ok: true,
          status: 200,
        },
      })
    ).toEqual({
      state: "running",
      hostname: "ha.example.com",
      error: null,
      last_check: {
        time: "2026-11-17T12:00:00+00:00",
        ok: true,
        status: 200,
        reason: null,
      },
      trusted_proxy: null,
    });
  });

  it("treats an unknown state as an error and keeps the reason", () => {
    expect(parseCloudHostInfo({ state: "weird" }).state).toBe("error");
    expect(
      parseCloudHostInfo({ state: "error", error: RUNNER_NOT_INSTALLED }).error
    ).toBe(RUNNER_NOT_INSTALLED);
  });
});

describe("trusted proxy", () => {
  it("accepts only a dotted IPv4 address", () => {
    expect(parseIPv4("172.30.32.7")).toBe("172.30.32.7");
    for (const bad of [
      "172.30.32",
      "172.30.32.256",
      "172.30.32.7/24",
      "::1",
      "a.b.c.d",
      "01.2.3.4",
      " 1.2.3.4",
      "",
      7,
      null,
      undefined,
    ]) {
      expect(parseIPv4(bad)).toBeNull();
    }
  });

  it("is read only while running", () => {
    const body = { hostname: "a.b.co", trusted_proxy: "172.30.32.7" };
    expect(
      parseCloudHostInfo({ state: "running", ...body }).trusted_proxy
    ).toBe("172.30.32.7");
    expect(parseCloudHostInfo({ state: "paused", ...body }).trusted_proxy).toBe(
      null
    );
    expect(
      parseCloudHostInfo({ state: "running", trusted_proxy: "nope" })
        .trusted_proxy
    ).toBe(null);
    expect(parseCloudHostInfo({ state: "running" }).trusted_proxy).toBe(null);
  });

  it("writes the exact lines to add", () => {
    expect(proxyConfigLines("172.30.32.7")).toBe(
      [
        "http:",
        "  use_x_forwarded_for: true",
        "  trusted_proxies:",
        "    - 172.30.32.7",
      ].join("\n")
    );
  });

  it("shows the lines only while running with an address", () => {
    expect(
      proxyBlock(info({ state: "running", trusted_proxy: "1.2.3.4" }))
    ).toBe("lines");
    expect(proxyBlock(info({ state: "running" }))).toBe("waiting");
    for (const state of [
      "not_set_up",
      "waiting_for_sign_in",
      "paused",
      "error",
    ] as const) {
      expect(proxyBlock(info({ state, trusted_proxy: "1.2.3.4" }))).toBe(
        "none"
      );
    }
    expect(proxyBlock(undefined)).toBe("none");
  });
});
