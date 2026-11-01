#!/usr/bin/env node
/**
 * metricwatch CLI.
 *
 *   metricwatch <tool-name> [--json '<arguments>']
 *   metricwatch mcp
 *   metricwatch --version
 *
 * Every MCP tool is also a subcommand. Results print as JSON.
 * Reads DATADOG_API_KEY and DATADOG_APP_KEY (both required) and the
 * optional DATADOG_SITE. Exit codes: 0 success, 1 API error, 2 usage.
 */
import {
  getDashboard,
  getIncident,
  getMetricMetadata,
  getMonitor,
  listDashboards,
  listDowntimes,
  listIncidents,
  listMetrics,
  listMonitors,
  queryTimeseries,
  searchLogs,
  VERSION,
} from "./datadog.js";
import type { DatadogCredentials, FetchFn } from "./types.js";

const TOOL_NAMES = [
  "query_timeseries",
  "list_metrics",
  "get_metric_metadata",
  "list_dashboards",
  "get_dashboard",
  "search_logs",
  "list_incidents",
  "get_incident",
  "list_monitors",
  "get_monitor",
  "list_downtimes",
] as const;

type ToolName = (typeof TOOL_NAMES)[number];

function usage(): never {
  console.error(`Usage:
  metricwatch <tool-name> [--json '<arguments>']
  metricwatch mcp
  metricwatch --version

Tools:
  ${TOOL_NAMES.join("\n  ")}`);
  process.exit(2);
}

function parseArgsJson(rest: string[]): Record<string, unknown> {
  const idx = rest.indexOf("--json");
  if (idx < 0) {
    const positional = rest.join(" ").trim();
    if (!positional) return {};
    try {
      return JSON.parse(positional) as Record<string, unknown>;
    } catch {
      usage();
    }
  }
  const raw = rest[idx + 1];
  if (!raw) usage();
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    console.error("error: --json value is not valid JSON");
    process.exit(2);
  }
}

async function runTool(
  name: ToolName,
  fetchFn: FetchFn,
  creds: DatadogCredentials,
  args: Record<string, unknown>,
): Promise<unknown> {
  const a = args as never;
  switch (name) {
    case "query_timeseries":
      return queryTimeseries(fetchFn, creds, a);
    case "list_metrics":
      return listMetrics(fetchFn, creds, a);
    case "get_metric_metadata":
      return getMetricMetadata(fetchFn, creds, a);
    case "list_dashboards":
      return listDashboards(fetchFn, creds, a);
    case "get_dashboard":
      return getDashboard(fetchFn, creds, a);
    case "search_logs":
      return searchLogs(fetchFn, creds, a);
    case "list_incidents":
      return listIncidents(fetchFn, creds, a);
    case "get_incident":
      return getIncident(fetchFn, creds, a);
    case "list_monitors":
      return listMonitors(fetchFn, creds, a);
    case "get_monitor":
      return getMonitor(fetchFn, creds, a);
    case "list_downtimes":
      return listDowntimes(fetchFn, creds, a);
  }
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  if (!cmd || !(TOOL_NAMES as readonly string[]).includes(cmd)) usage();
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const creds: DatadogCredentials = {
    apiKey: process.env.DATADOG_API_KEY,
    appKey: process.env.DATADOG_APP_KEY,
    site: process.env.DATADOG_SITE,
  };
  try {
    const args = parseArgsJson(rest);
    const out = await runTool(cmd as ToolName, fetchFn, creds, args);
    console.log(typeof out === "string" ? out : JSON.stringify(out, null, 2));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
