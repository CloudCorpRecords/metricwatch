import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  apiBase,
  getDashboard,
  getMetricMetadata,
  getMonitor,
  listIncidents,
  listMetrics,
  listMonitors,
  queryTimeseries,
  requireCredentials,
  searchLogs,
} from "../src/datadog.js";
import type { FetchFn, HttpResponse } from "../src/types.js";

const CREDS = { apiKey: "api-key", appKey: "app-key" };

function jsonResponse(body: unknown, status = 200, statusText = "OK"): HttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

interface Call {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
}

function fakeFetch(calls: Call[], body: unknown = { ok: true }): FetchFn {
  return async (url: string, init) => {
    calls.push({ url, method: init?.method ?? "GET", headers: init?.headers, body: init?.body });
    return jsonResponse(body);
  };
}

describe("requireCredentials", () => {
  it("names DATADOG_API_KEY when the API key is missing", () => {
    assert.throws(() => requireCredentials({ appKey: "x" }), /DATADOG_API_KEY/);
    assert.throws(() => requireCredentials({ apiKey: "  ", appKey: "x" }), /DATADOG_API_KEY/);
  });
  it("names DATADOG_APP_KEY when only the app key is missing", () => {
    assert.throws(() => requireCredentials({ apiKey: "x" }), /DATADOG_APP_KEY/);
  });
  it("returns trimmed keys when both are present", () => {
    assert.deepEqual(requireCredentials({ apiKey: " a ", appKey: " b " }), {
      apiKey: "a",
      appKey: "b",
    });
  });
});

describe("apiBase", () => {
  it("defaults to datadoghq.com and honours a site override", () => {
    assert.equal(apiBase(undefined), "https://api.datadoghq.com");
    assert.equal(apiBase("datadoghq.eu"), "https://api.datadoghq.eu");
  });
});

describe("missing keys make no request", () => {
  it("listMetrics fails before any fetch when a key is missing", async () => {
    let called = false;
    const spy: FetchFn = async () => {
      called = true;
      return jsonResponse({});
    };
    await assert.rejects(() => listMetrics(spy, { apiKey: "k" }, {}), /DATADOG_APP_KEY/);
    assert.equal(called, false);
  });
});

describe("queryTimeseries", () => {
  it("GETs /api/v1/query with from/to/query and both DD headers", async () => {
    const calls: Call[] = [];
    await queryTimeseries(fakeFetch(calls, { series: [] }), CREDS, {
      from: 1700000000,
      to: 1700003600,
      query: "avg:system.cpu.user{*}",
    });
    const url = new URL(calls[0].url);
    assert.equal(url.origin + url.pathname, "https://api.datadoghq.com/api/v1/query");
    assert.equal(url.searchParams.get("from"), "1700000000");
    assert.equal(url.searchParams.get("to"), "1700003600");
    assert.equal(url.searchParams.get("query"), "avg:system.cpu.user{*}");
    assert.equal(calls[0].headers?.["DD-API-KEY"], "api-key");
    assert.equal(calls[0].headers?.["DD-APPLICATION-KEY"], "app-key");
  });
  it("rejects a non-finite range before any request", async () => {
    const calls: Call[] = [];
    await assert.rejects(
      () => queryTimeseries(fakeFetch(calls), CREDS, { from: NaN, to: 1, query: "x" }),
      /finite/,
    );
    assert.equal(calls.length, 0);
  });
});

describe("metrics", () => {
  it("listMetrics GETs /api/v1/metrics and slices to limit", async () => {
    const calls: Call[] = [];
    const out = (await listMetrics(
      fakeFetch(calls, { metrics: ["a", "b", "c"], from: "1" }),
      CREDS,
      { limit: 2 },
    )) as { metrics: string[] };
    assert.deepEqual(out.metrics, ["a", "b"]);
    assert.equal(new URL(calls[0].url).pathname, "/api/v1/metrics");
  });
  it("getMetricMetadata URL-encodes the metric name", async () => {
    const calls: Call[] = [];
    await getMetricMetadata(fakeFetch(calls), CREDS, { metric_name: "system.cpu.user" });
    assert.equal(new URL(calls[0].url).pathname, "/api/v1/metrics/system.cpu.user");
  });
});

describe("dashboards and monitors", () => {
  it("getDashboard GETs /api/v1/dashboard/{id}", async () => {
    const calls: Call[] = [];
    await getDashboard(fakeFetch(calls), CREDS, { dashboard_id: "abc-123" });
    assert.equal(new URL(calls[0].url).pathname, "/api/v1/dashboard/abc-123");
  });
  it("listMonitors passes name and page_size; getMonitor uses the integer id", async () => {
    const calls: Call[] = [];
    await listMonitors(fakeFetch(calls, []), CREDS, { name: "cpu", limit: 5 });
    const url = new URL(calls[0].url);
    assert.equal(url.pathname, "/api/v1/monitor");
    assert.equal(url.searchParams.get("name"), "cpu");
    assert.equal(url.searchParams.get("page_size"), "5");
    await getMonitor(fakeFetch(calls), CREDS, { monitor_id: 42 });
    assert.equal(new URL(calls[1].url).pathname, "/api/v1/monitor/42");
  });
});

describe("searchLogs", () => {
  it("POSTs a v2 search body with filter, page limit, and sort", async () => {
    const calls: Call[] = [];
    await searchLogs(fakeFetch(calls, { data: [] }), CREDS, {
      query: "service:web status:error",
      from: 1700000000,
      to: 1700003600,
      limit: 25,
    });
    assert.equal(calls[0].method, "POST");
    assert.equal(new URL(calls[0].url).pathname, "/api/v2/logs/events/search");
    assert.deepEqual(JSON.parse(calls[0].body ?? "{}"), {
      filter: { query: "service:web status:error", from: "1700000000", to: "1700003600" },
      page: { limit: 25 },
      sort: "timestamp",
    });
  });
});

describe("incidents", () => {
  it("listIncidents GETs /api/v2/incidents with page[size]", async () => {
    const calls: Call[] = [];
    await listIncidents(fakeFetch(calls, { data: [] }), CREDS, { limit: 3 });
    const url = new URL(calls[0].url);
    assert.equal(url.pathname, "/api/v2/incidents");
    assert.equal(url.searchParams.get("page[size]"), "3");
  });
});

describe("HTTP errors", () => {
  it("surface status and the first Datadog error string", async () => {
    const failing: FetchFn = async () =>
      jsonResponse({ errors: ["Forbidden"] }, 403, "Forbidden");
    await assert.rejects(() => listMetrics(failing, CREDS, {}), /HTTP 403.*Forbidden/);
  });
});
