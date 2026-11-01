/**
 * metricwatch types.
 *
 * Datadog identifies resources by string ids, except monitors whose ids
 * are integers. Times are epoch seconds for the v1 metrics query and
 * are passed through as given for the v2 log search. Credentials are a
 * pair: an API key and an application key, plus the Datadog site that
 * selects the API host.
 *
 * HTTP access is described by a minimal response surface so tests can
 * inject a fake fetch and never touch the network.
 */

export interface DatadogCredentials {
  apiKey?: string;
  appKey?: string;
  /** Datadog site, e.g. datadoghq.com (default) or datadoghq.eu. */
  site?: string;
}

export interface QueryTimeseriesOptions {
  from: number;
  to: number;
  query: string;
}

export interface ListMetricsOptions {
  from?: number;
  limit?: number;
}

export interface MetricNameOptions {
  metric_name: string;
}

export interface ListDashboardsOptions {
  limit?: number;
}

export interface DashboardIdOptions {
  dashboard_id: string;
}

export interface SearchLogsOptions {
  query: string;
  from?: number;
  to?: number;
  limit?: number;
}

export interface ListIncidentsOptions {
  limit?: number;
}

export interface IncidentIdOptions {
  incident_id: string;
}

export interface ListMonitorsOptions {
  name?: string;
  limit?: number;
}

export interface MonitorIdOptions {
  monitor_id: number;
}

export interface ListDowntimesOptions {
  current_only?: boolean;
}

/** Minimal HTTP response surface so tests can inject fixtures. */
export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: string;
  },
) => Promise<HttpResponse>;
