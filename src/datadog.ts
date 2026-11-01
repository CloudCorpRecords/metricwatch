/**
 * metricwatch core: Datadog metrics, dashboards, logs, incidents,
 * monitors, and downtimes against the Datadog API.
 *
 * Every call goes to https://api.<site> where <site> comes from
 * DATADOG_SITE (default datadoghq.com), with both credential headers:
 *
 *   DD-API-KEY:          <DATADOG_API_KEY>
 *   DD-APPLICATION-KEY:  <DATADOG_APP_KEY>
 *
 * Routes used (documented Datadog API):
 *   query_timeseries   GET  /api/v1/query?from&to&query
 *   list_metrics       GET  /api/v1/metrics
 *   get_metric_metadata GET /api/v1/metrics/{metric_name}
 *   list_dashboards    GET  /api/v1/dashboard
 *   get_dashboard      GET  /api/v1/dashboard/{dashboard_id}
 *   search_logs        POST /api/v2/logs/events/search
 *   list_incidents     GET  /api/v2/incidents
 *   get_incident       GET  /api/v2/incidents/{incident_id}
 *   list_monitors      GET  /api/v1/monitor
 *   get_monitor        GET  /api/v1/monitor/{monitor_id}
 *   list_downtimes     GET  /api/v1/downtime
 *
 * A missing API key or application key is an error before any request
 * is made, and the error names the missing variable. All HTTP goes
 * through an injected FetchFn so everything is testable offline.
 */
import type {
  DashboardIdOptions,
  DatadogCredentials,
  FetchFn,
  IncidentIdOptions,
  ListDashboardsOptions,
  ListDowntimesOptions,
  ListIncidentsOptions,
  ListMetricsOptions,
  ListMonitorsOptions,
  MetricNameOptions,
  MonitorIdOptions,
  QueryTimeseriesOptions,
  SearchLogsOptions,
} from "./types.js";

export const VERSION = "0.1.0";

export const API_KEY_ENV = "DATADOG_API_KEY";
export const APP_KEY_ENV = "DATADOG_APP_KEY";
export const SITE_ENV = "DATADOG_SITE";
export const DEFAULT_SITE = "datadoghq.com";

/** API base for a site value: https://api.<site> */
export function apiBase(site?: string): string {
  const s = typeof site === "string" && site.trim() ? site.trim() : DEFAULT_SITE;
  return `https://api.${s}`;
}

/** Validate both keys; the error names whichever variable is missing. */
export function requireCredentials(creds: DatadogCredentials): { apiKey: string; appKey: string } {
  const apiKey = typeof creds.apiKey === "string" ? creds.apiKey.trim() : "";
  if (!apiKey) {
    throw new Error(
      "DATADOG_API_KEY environment variable is required: set DATADOG_API_KEY to a Datadog API key and retry",
    );
  }
  const appKey = typeof creds.appKey === "string" ? creds.appKey.trim() : "";
  if (!appKey) {
    throw new Error(
      "DATADOG_APP_KEY environment variable is required: set DATADOG_APP_KEY to a Datadog application key and retry",
    );
  }
  return { apiKey, appKey };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNonEmpty(value: unknown, field: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) throw new Error(`${field} must be a non-empty string`);
  return v;
}

function requireFinite(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`);
  }
  return value;
}

/** One Datadog API request; returns the parsed JSON payload. */
export async function apiRequest(
  fetchFn: FetchFn,
  creds: DatadogCredentials,
  method: string,
  path: string,
  options: { query?: Record<string, string>; body?: unknown } = {},
): Promise<unknown> {
  const { apiKey, appKey } = requireCredentials(creds);
  const qs = options.query && Object.keys(options.query).length
    ? `?${new URLSearchParams(options.query).toString()}`
    : "";
  let response;
  try {
    response = await fetchFn(`${apiBase(creds.site)}${path}${qs}`, {
      method,
      headers: {
        Accept: "application/json",
        "DD-API-KEY": apiKey,
        "DD-APPLICATION-KEY": appKey,
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch (err) {
    throw new Error(
      `Datadog API request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!response.ok) {
    let detail = "";
    try {
      const payload: unknown = await response.json();
      if (isRecord(payload) && Array.isArray(payload.errors) && payload.errors.length) {
        detail = `: ${String(payload.errors[0])}`;
      } else if (isRecord(payload) && typeof payload.error === "string") {
        detail = `: ${payload.error}`;
      }
    } catch {
      // keep the status-only error
    }
    throw new Error(
      `Datadog API request failed: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}${detail}`,
    );
  }
  if (response.status === 204) return { ok: true, status: 204 };
  try {
    return await response.json();
  } catch {
    return { ok: true, status: response.status };
  }
}

/** Query a metric timeseries with the v1 query endpoint. */
export async function queryTimeseries(
  fetchFn: FetchFn,
  creds: DatadogCredentials,
  options: QueryTimeseriesOptions,
): Promise<unknown> {
  const from = requireFinite(options.from, "from");
  const to = requireFinite(options.to, "to");
  const query = requireNonEmpty(options.query, "query");
  return apiRequest(fetchFn, creds, "GET", "/api/v1/query", {
    query: { from: String(from), to: String(to), query },
  });
}

/** List metric names available in the account. */
export async function listMetrics(
  fetchFn: FetchFn,
  creds: DatadogCredentials,
  options: ListMetricsOptions,
): Promise<unknown> {
  const query: Record<string, string> = {};
  if (options.from !== undefined) query.from = String(requireFinite(options.from, "from"));
  const payload = await apiRequest(fetchFn, creds, "GET", "/api/v1/metrics", { query });
  if (isRecord(payload) && Array.isArray(payload.metrics) && options.limit !== undefined) {
    const limit = Math.max(1, Math.floor(options.limit));
    return { ...payload, metrics: payload.metrics.slice(0, limit) };
  }
  return payload;
}

/** Get one metric's metadata (type, unit, description). */
export async function getMetricMetadata(
  fetchFn: FetchFn,
  creds: DatadogCredentials,
  options: MetricNameOptions,
): Promise<unknown> {
  const name = requireNonEmpty(options.metric_name, "metric_name");
  return apiRequest(fetchFn, creds, "GET", `/api/v1/metrics/${encodeURIComponent(name)}`);
}

/** List dashboards. */
export async function listDashboards(
  fetchFn: FetchFn,
  creds: DatadogCredentials,
  options: ListDashboardsOptions,
): Promise<unknown> {
  const payload = await apiRequest(fetchFn, creds, "GET", "/api/v1/dashboard");
  if (isRecord(payload) && Array.isArray(payload.dashboards) && options.limit !== undefined) {
    const limit = Math.max(1, Math.floor(options.limit));
    return { ...payload, dashboards: payload.dashboards.slice(0, limit) };
  }
  return payload;
}

/** Get one dashboard by id. */
export async function getDashboard(
  fetchFn: FetchFn,
  creds: DatadogCredentials,
  options: DashboardIdOptions,
): Promise<unknown> {
  const id = requireNonEmpty(options.dashboard_id, "dashboard_id");
  return apiRequest(fetchFn, creds, "GET", `/api/v1/dashboard/${encodeURIComponent(id)}`);
}

/** Search log events with the v2 logs search endpoint. */
export async function searchLogs(
  fetchFn: FetchFn,
  creds: DatadogCredentials,
  options: SearchLogsOptions,
): Promise<unknown> {
  const query = requireNonEmpty(options.query, "query");
  const filter: Record<string, unknown> = { query };
  if (options.from !== undefined) filter.from = String(requireFinite(options.from, "from"));
  if (options.to !== undefined) filter.to = String(requireFinite(options.to, "to"));
  const limit = options.limit !== undefined ? Math.min(1000, Math.max(1, Math.floor(options.limit))) : 10;
  return apiRequest(fetchFn, creds, "POST", "/api/v2/logs/events/search", {
    body: { filter, page: { limit }, sort: "timestamp" },
  });
}

/** List incidents. */
export async function listIncidents(
  fetchFn: FetchFn,
  creds: DatadogCredentials,
  options: ListIncidentsOptions,
): Promise<unknown> {
  const query: Record<string, string> = {};
  if (options.limit !== undefined) query["page[size]"] = String(Math.max(1, Math.floor(options.limit)));
  return apiRequest(fetchFn, creds, "GET", "/api/v2/incidents", { query });
}

/** Get one incident by id. */
export async function getIncident(
  fetchFn: FetchFn,
  creds: DatadogCredentials,
  options: IncidentIdOptions,
): Promise<unknown> {
  const id = requireNonEmpty(options.incident_id, "incident_id");
  return apiRequest(fetchFn, creds, "GET", `/api/v2/incidents/${encodeURIComponent(id)}`);
}

/** List monitors, optionally filtered by name. */
export async function listMonitors(
  fetchFn: FetchFn,
  creds: DatadogCredentials,
  options: ListMonitorsOptions,
): Promise<unknown> {
  const query: Record<string, string> = {};
  if (options.name) query.name = options.name;
  if (options.limit !== undefined) query.page_size = String(Math.max(1, Math.floor(options.limit)));
  return apiRequest(fetchFn, creds, "GET", "/api/v1/monitor", { query });
}

/** Get one monitor by its integer id. */
export async function getMonitor(
  fetchFn: FetchFn,
  creds: DatadogCredentials,
  options: MonitorIdOptions,
): Promise<unknown> {
  const id = requireFinite(options.monitor_id, "monitor_id");
  return apiRequest(fetchFn, creds, "GET", `/api/v1/monitor/${Math.floor(id)}`);
}

/** List downtimes (scheduled monitor silences). */
export async function listDowntimes(
  fetchFn: FetchFn,
  creds: DatadogCredentials,
  options: ListDowntimesOptions,
): Promise<unknown> {
  const query: Record<string, string> = {};
  if (options.current_only !== undefined) query.current_only = String(options.current_only);
  return apiRequest(fetchFn, creds, "GET", "/api/v1/downtime", { query });
}
