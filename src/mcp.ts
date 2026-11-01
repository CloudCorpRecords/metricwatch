/**
 * metricwatch MCP server: 11 read tools covering Datadog metric
 * timeseries, metric metadata, dashboards, log search, incidents,
 * monitors, and downtimes.
 *
 * Why the low-level Server instead of McpServer: the high-level helper
 * converts zod schemas to JSON Schema and injects keys that are not in
 * this tool's public spec ("$schema" and "additionalProperties"), which
 * breaks exact tool-list/schema parity with the spec. This file serves
 * tools/list with the spec's exact input schemas as explicit literals,
 * while zod still validates every tools/call argument set.
 *
 * Credentials are read at call time: DATADOG_API_KEY and
 * DATADOG_APP_KEY (both required), DATADOG_SITE optional. A missing
 * key returns an honest isError result naming the variable instead of
 * failing the handshake.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
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

const QueryTimeseriesArgs = z.object({
  from: z.number(),
  to: z.number(),
  query: z.string(),
});
const ListMetricsArgs = z.object({
  from: z.number().optional(),
  limit: z.number().optional(),
});
const MetricNameArgs = z.object({ metric_name: z.string() });
const ListDashboardsArgs = z.object({ limit: z.number().optional() });
const DashboardIdArgs = z.object({ dashboard_id: z.string() });
const SearchLogsArgs = z.object({
  query: z.string(),
  from: z.number().optional(),
  to: z.number().optional(),
  limit: z.number().optional(),
});
const ListIncidentsArgs = z.object({ limit: z.number().optional() });
const IncidentIdArgs = z.object({ incident_id: z.string() });
const ListMonitorsArgs = z.object({
  name: z.string().optional(),
  limit: z.number().optional(),
});
const MonitorIdArgs = z.object({ monitor_id: z.number() });
const ListDowntimesArgs = z.object({ current_only: z.boolean().optional() });

const TOOLS = [
  {
    name: "query_timeseries",
    description: "Query a Datadog metric timeseries over a time range using the metrics query language.",
    inputSchema: {
      type: "object" as const,
      properties: {
        from: { type: "number", description: "Start of the time range as a Unix epoch timestamp in seconds." },
        to: { type: "number", description: "End of the time range as a Unix epoch timestamp in seconds." },
        query: { type: "string", description: "Datadog metrics query expression, such as an aggregation over a metric with optional tag filters." },
      },
      required: ["from", "to", "query"],
    },
  },
  {
    name: "list_metrics",
    description: "List metric names available in the Datadog account.",
    inputSchema: {
      type: "object" as const,
      properties: {
        from: { type: "number", description: "Only return metrics that have been active since this Unix epoch timestamp in seconds." },
        limit: { type: "number", description: "Maximum number of metric names to return." },
      },
      required: [],
    },
  },
  {
    name: "get_metric_metadata",
    description: "Get metadata for one metric: its type, unit, and description.",
    inputSchema: {
      type: "object" as const,
      properties: {
        metric_name: { type: "string", description: "Name of the metric to retrieve metadata for." },
      },
      required: ["metric_name"],
    },
  },
  {
    name: "list_dashboards",
    description: "List dashboards in the Datadog account.",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Maximum number of dashboards to return." },
      },
      required: [],
    },
  },
  {
    name: "get_dashboard",
    description: "Get one dashboard by id, including its widgets and layout.",
    inputSchema: {
      type: "object" as const,
      properties: {
        dashboard_id: { type: "string", description: "ID of the dashboard to retrieve." },
      },
      required: ["dashboard_id"],
    },
  },
  {
    name: "search_logs",
    description: "Search Datadog log events with a log query over an optional time range.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Datadog log search query using log search syntax, such as service and status filters." },
        from: { type: "number", description: "Start of the search time range as a Unix epoch timestamp in seconds." },
        to: { type: "number", description: "End of the search time range as a Unix epoch timestamp in seconds." },
        limit: { type: "number", description: "Maximum number of log events to return." },
      },
      required: ["query"],
    },
  },
  {
    name: "list_incidents",
    description: "List Datadog incidents.",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Maximum number of incidents to return per page." },
      },
      required: [],
    },
  },
  {
    name: "get_incident",
    description: "Get one incident by id.",
    inputSchema: {
      type: "object" as const,
      properties: {
        incident_id: { type: "string", description: "ID of the incident to retrieve." },
      },
      required: ["incident_id"],
    },
  },
  {
    name: "list_monitors",
    description: "List monitors, optionally filtered by name.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Filter monitors by name." },
        limit: { type: "number", description: "Maximum number of monitors to return per page." },
      },
      required: [],
    },
  },
  {
    name: "get_monitor",
    description: "Get one monitor by its integer id.",
    inputSchema: {
      type: "object" as const,
      properties: {
        monitor_id: { type: "number", description: "Integer ID of the monitor to retrieve." },
      },
      required: ["monitor_id"],
    },
  },
  {
    name: "list_downtimes",
    description: "List downtimes (scheduled monitor silences).",
    inputSchema: {
      type: "object" as const,
      properties: {
        current_only: { type: "boolean", description: "When true, return only downtimes that are currently active." },
      },
      required: [],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "metricwatch", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const creds: DatadogCredentials = {
    apiKey: process.env.DATADOG_API_KEY,
    appKey: process.env.DATADOG_APP_KEY,
    site: process.env.DATADOG_SITE,
  };
  try {
    let out: unknown;
    switch (name) {
      case "query_timeseries":
        out = await queryTimeseries(fetchFn, creds, QueryTimeseriesArgs.parse(args ?? {}));
        break;
      case "list_metrics":
        out = await listMetrics(fetchFn, creds, ListMetricsArgs.parse(args ?? {}));
        break;
      case "get_metric_metadata":
        out = await getMetricMetadata(fetchFn, creds, MetricNameArgs.parse(args ?? {}));
        break;
      case "list_dashboards":
        out = await listDashboards(fetchFn, creds, ListDashboardsArgs.parse(args ?? {}));
        break;
      case "get_dashboard":
        out = await getDashboard(fetchFn, creds, DashboardIdArgs.parse(args ?? {}));
        break;
      case "search_logs":
        out = await searchLogs(fetchFn, creds, SearchLogsArgs.parse(args ?? {}));
        break;
      case "list_incidents":
        out = await listIncidents(fetchFn, creds, ListIncidentsArgs.parse(args ?? {}));
        break;
      case "get_incident":
        out = await getIncident(fetchFn, creds, IncidentIdArgs.parse(args ?? {}));
        break;
      case "list_monitors":
        out = await listMonitors(fetchFn, creds, ListMonitorsArgs.parse(args ?? {}));
        break;
      case "get_monitor":
        out = await getMonitor(fetchFn, creds, MonitorIdArgs.parse(args ?? {}));
        break;
      case "list_downtimes":
        out = await listDowntimes(fetchFn, creds, ListDowntimesArgs.parse(args ?? {}));
        break;
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(out);
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
