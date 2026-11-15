import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeAssistant } from "../../../src/types";
import type { HistoryResult, HistoryStates } from "../../../src/data/history";
import {
  computeHistory,
  convertStatisticsToHistory,
  fetchDateWS,
  subscribeHistoryStatesTimeWindow,
} from "../../../src/data/history";
import { fetchStatistics } from "../../../src/data/recorder";
import "../../../src/panels/history/ha-panel-history";
import "../../../src/panels/lovelace/cards/hui-history-graph-card";

vi.hoisted(() => {
  Object.assign(globalThis, {
    __STATIC_PATH__: "/",
    __HASS_URL__: "",
    __BUILD__: "modern",
    __VERSION__: "test",
    __BACKWARDS_COMPAT__: false,
    __SUPERVISOR__: false,
    __NAMESPACE__: "frontend",
  });
});

vi.mock("../../../src/components/chart/state-history-charts", () => ({}));
vi.mock("../../../src/data/history", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/data/history")>()),
  fetchDateWS: vi.fn(),
  subscribeHistoryStatesTimeWindow: vi.fn(),
  computeHistory: vi.fn(),
  convertStatisticsToHistory: vi.fn(),
}));
vi.mock("../../../src/data/recorder", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/data/recorder")>()),
  fetchStatistics: vi.fn(),
}));

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
const empty: HistoryResult = { line: [], timeline: [] };
const hass = () =>
  ({
    states: {},
    config: { components: ["history"] },
    localize: (key: string) => key,
    callWS: vi.fn(),
  }) as unknown as HomeAssistant;

// These tests exercise request ownership without rendering chart templates.
interface CardInternals {
  _historyGeneration: number;
  _compareHistory?: HistoryResult;
  _statisticsHistory?: HistoryResult;
  _subscribed?: Promise<unknown>;
  _error?: unknown;
  _subscribeHistory(): Promise<void>;
  _fetchComparison(): Promise<void>;
  _fetchStatistics(generation: number): Promise<void>;
}
const makeCard = () => {
  const card = document.createElement("hui-history-graph-card");
  card.setConfig({
    type: "history-graph",
    entities: ["sensor.a"],
    compare_period: "day",
  });
  card.hass = hass();
  Object.defineProperty(card, "isConnected", {
    value: true,
    configurable: true,
  });
  return { card, state: card as unknown as CardInternals };
};

interface PanelInternals {
  _startDate: Date;
  _endDate: Date;
  _comparePeriod: "none" | "previous" | "day" | "week";
  _comparison?: { history: HistoryResult; shift: number };
  _comparisonStatus?: string;
  _getEntityIds(): string[];
  _getComparison(): Promise<void>;
}
const makePanel = () => {
  const panel = document.createElement("ha-panel-history");
  panel.hass = hass();
  Object.defineProperty(panel, "isConnected", {
    value: true,
    configurable: true,
  });
  const state = panel as unknown as PanelInternals;
  state._startDate = new Date("2026-01-01T10:00:00Z");
  state._endDate = new Date("2026-01-01T12:00:00Z");
  state._comparePeriod = "previous";
  vi.spyOn(state, "_getEntityIds").mockReturnValue(["sensor.a"]);
  return { panel, state };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-03-01T00:00:00Z"));
  vi.mocked(fetchDateWS).mockResolvedValue({});
  vi.mocked(fetchStatistics).mockResolvedValue({});
  vi.mocked(computeHistory).mockReturnValue(empty);
  vi.mocked(convertStatisticsToHistory).mockReturnValue(empty);
  vi.mocked(subscribeHistoryStatesTimeWindow).mockResolvedValue(
    async () => undefined
  );
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("history card request lifecycle", () => {
  it("does not resume subscription setup after configuration changes during statistics", async () => {
    const pending = deferred<Awaited<ReturnType<typeof fetchStatistics>>>();
    vi.mocked(fetchStatistics).mockReturnValueOnce(pending.promise);
    const { card, state } = makeCard();
    const timer = vi.spyOn(window, "setInterval");
    const setup = state._subscribeHistory();
    card.setConfig({
      type: "history-graph",
      entities: ["sensor.b"],
      compare_period: "week",
    });
    pending.resolve({});
    await setup;
    expect(convertStatisticsToHistory).not.toHaveBeenCalled();
    expect(fetchDateWS).not.toHaveBeenCalled();
    expect(timer).not.toHaveBeenCalled();
  });

  it.each(["resolve", "reject"] as const)(
    "ignores a stale comparison %s after a newer result",
    async (outcome) => {
      const pending = deferred<HistoryStates>();
      vi.mocked(fetchDateWS).mockReturnValueOnce(pending.promise);
      const { card, state } = makeCard();
      const first = state._fetchComparison();
      card.setConfig({
        type: "history-graph",
        entities: ["sensor.b"],
        compare_period: "week",
      });
      const latest: HistoryResult = { line: [], timeline: [] };
      vi.mocked(computeHistory).mockReturnValue(latest);
      await state._fetchComparison();
      if (outcome === "resolve") pending.resolve({});
      else pending.reject(new Error("old request"));
      await first;
      expect(state._compareHistory).toBe(latest);
      expect(computeHistory).toHaveBeenCalledTimes(1);
    }
  );

  it("keeps the latest refresh when same-generation comparisons resolve out of order", async () => {
    const firstResult = deferred<HistoryStates>();
    vi.mocked(fetchDateWS).mockReturnValueOnce(firstResult.promise);
    const { state } = makeCard();
    const first = state._fetchComparison();
    const latest: HistoryResult = { line: [], timeline: [] };
    vi.mocked(computeHistory).mockReturnValue(latest);
    await state._fetchComparison();
    firstResult.resolve({});
    await first;
    expect(state._compareHistory).toBe(latest);
    expect(computeHistory).toHaveBeenCalledTimes(1);
  });

  it("continues comparison and redraw when supplementary statistics fail", async () => {
    vi.mocked(fetchStatistics).mockRejectedValueOnce(
      new Error("statistics unavailable")
    );
    const { card, state } = makeCard();
    const timer = vi.spyOn(window, "setInterval");
    await state._subscribeHistory();
    expect(fetchDateWS).toHaveBeenCalledTimes(1);
    expect(timer).toHaveBeenCalledTimes(1);
    expect(state._statisticsHistory).toBeUndefined();
    card.disconnectedCallback();
  });

  it("ignores a late subscription rejection and callback after replacement", async () => {
    const pending = deferred<() => Promise<void>>();
    vi.mocked(subscribeHistoryStatesTimeWindow).mockReturnValueOnce(
      pending.promise
    );
    const { card, state } = makeCard();
    const first = state._subscribeHistory();
    const oldCallback = vi.mocked(subscribeHistoryStatesTimeWindow).mock
      .calls[0][1];
    card.setConfig({ type: "history-graph", entities: ["sensor.b"] });
    await state._subscribeHistory();
    const subscription = state._subscribed;
    oldCallback({});
    pending.reject(new Error("old subscription"));
    await first;
    await Promise.resolve();
    expect(state._subscribed).toBe(subscription);
    expect(state._error).toBeUndefined();
    expect(computeHistory).not.toHaveBeenCalled();
    card.disconnectedCallback();
  });

  it("invalidates statistics and comparison on disconnect", async () => {
    const stats = deferred<Awaited<ReturnType<typeof fetchStatistics>>>();
    const comparison = deferred<HistoryStates>();
    vi.mocked(fetchStatistics).mockReturnValueOnce(stats.promise);
    vi.mocked(fetchDateWS).mockReturnValueOnce(comparison.promise);
    const { card, state } = makeCard();
    const a = state._fetchStatistics(state._historyGeneration);
    const b = state._fetchComparison();
    card.disconnectedCallback();
    stats.resolve({});
    comparison.resolve({});
    await Promise.all([a, b]);
    expect(state._statisticsHistory).toBeUndefined();
    expect(state._compareHistory).toBeUndefined();
    expect(computeHistory).not.toHaveBeenCalled();
    expect(convertStatisticsToHistory).not.toHaveBeenCalled();
  });
});

describe("history panel comparison requests", () => {
  it("fetches exactly the preceding equal window and excludes external statistics", async () => {
    const { state } = makePanel();
    vi.mocked(state._getEntityIds).mockReturnValue([
      "sensor.a",
      "external:power",
    ]);
    await state._getComparison();
    expect(fetchDateWS).toHaveBeenCalledWith(
      expect.anything(),
      new Date("2026-01-01T08:00:00Z"),
      new Date("2026-01-01T10:00:00Z"),
      ["sensor.a"]
    );
    // An empty response must not use the selected entities' current states.
    expect(computeHistory).toHaveBeenCalledWith(
      expect.anything(),
      {},
      [],
      expect.anything(),
      true
    );
  });

  it.each(["resolve", "reject"] as const)(
    "keeps comparison off after an older request %s",
    async (outcome) => {
      const pending = deferred<HistoryStates>();
      vi.mocked(fetchDateWS).mockReturnValueOnce(pending.promise);
      const { state } = makePanel();
      const first = state._getComparison();
      state._comparePeriod = "none";
      await state._getComparison();
      if (outcome === "resolve") pending.resolve({});
      else pending.reject(new Error("old period"));
      await first;
      expect(state._comparison).toBeUndefined();
      expect(state._comparisonStatus).toBeUndefined();
    }
  );

  it("does not fetch all entities for an external-only selection or an oversized window", async () => {
    const { state } = makePanel();
    vi.mocked(state._getEntityIds).mockReturnValue(["external:power"]);
    await state._getComparison();
    expect(fetchDateWS).not.toHaveBeenCalled();
    vi.mocked(state._getEntityIds).mockReturnValue(["sensor.a"]);
    state._endDate = new Date("2026-02-03T12:00:00Z");
    await state._getComparison();
    expect(fetchDateWS).not.toHaveBeenCalled();
    expect(state._comparisonStatus).toBe("limit");
  });

  it("drops comparison after disconnect and reports current request failure without stale data", async () => {
    const pending = deferred<HistoryStates>();
    vi.mocked(fetchDateWS).mockReturnValueOnce(pending.promise);
    const { panel, state } = makePanel();
    const first = state._getComparison();
    panel.disconnectedCallback();
    pending.resolve({});
    await first;
    expect(state._comparison).toBeUndefined();
    expect(computeHistory).not.toHaveBeenCalled();
    vi.mocked(fetchDateWS).mockRejectedValueOnce(new Error("offline"));
    await state._getComparison();
    expect(state._comparison).toBeUndefined();
    expect(state._comparisonStatus).toBe("unavailable");
  });
});
