# metricwatch

metricwatch gives an MCP client or a terminal read access to a Datadog
account: metric timeseries queries and metric metadata, dashboards,
log search, incidents, monitors, and downtimes. It is a clean-room
rebuild of the Datadog MCP tool surface from Datadog's public API
documentation, covering the read core listed below.

Two credentials are required, because the Datadog API requires both on
every call: an API key in `DATADOG_API_KEY` and an application key in
`DATADOG_APP_KEY`. They are sent as the `DD-API-KEY` and
`DD-APPLICATION-KEY` headers and never appear in output. Set
`DATADOG_SITE` (for example `datadoghq.eu`) to target a different
Datadog site; the default is `datadoghq.com` and calls go to
`https://api.<site>`. When either key is missing, every call fails with
an error that names the missing variable.

## Install

```bash
npx @reneturcios/metricwatch list_metrics
```

Or run the container image:

```bash
docker run -i -e DATADOG_API_KEY -e DATADOG_APP_KEY ghcr.io/cloudcorprecords/metricwatch
```

The container defaults to the MCP server (see below). Pass CLI
arguments to use it as a CLI instead.

## CLI

Every MCP tool is also a CLI subcommand. Tool arguments are passed as
one JSON object with `--json`:

```bash
export DATADOG_API_KEY=<redacted>
export DATADOG_APP_KEY=<redacted>

metricwatch query_timeseries --json '{"from": 1700000000, "to": 1700003600, "query": "avg:system.cpu.user{*}"}'
metricwatch list_metrics --json '{"limit": 20}'
metricwatch get_dashboard --json '{"dashboard_id": "abc-123"}'
metricwatch search_logs --json '{"query": "service:web status:error", "limit": 25}'
metricwatch list_monitors
metricwatch get_monitor --json '{"monitor_id": 42}'

metricwatch --version
```

Results print as JSON. Exit codes: `0` on success, `1` when an API call
fails (including a missing key), `2` for usage errors.

## MCP server

One bin serves both faces. The `mcp` subcommand starts a stdio MCP
server:

```bash
npx -y @reneturcios/metricwatch mcp
```

MCP client configuration:

```json
{
  "mcpServers": {
    "metricwatch": {
      "command": "npx",
      "args": ["-y", "@reneturcios/metricwatch", "mcp"],
      "env": {
        "DATADOG_API_KEY": "your Datadog API key",
        "DATADOG_APP_KEY": "your Datadog application key"
      }
    }
  }
}
```

### Tools

| Tool | Input (required in bold) | What it does |
| --- | --- | --- |
| `query_timeseries` | **`from`**, **`to`**, **`query`** | Queries a metric timeseries (v1 query endpoint). |
| `list_metrics` | `from`, `limit` | Lists metric names in the account. |
| `get_metric_metadata` | **`metric_name`** | Returns one metric's type, unit, and description. |
| `list_dashboards` | `limit` | Lists dashboards. |
| `get_dashboard` | **`dashboard_id`** | Returns one dashboard with its widgets. |
| `search_logs` | **`query`**, `from`, `to`, `limit` | Searches log events (v2 logs search). |
| `list_incidents` | `limit` | Lists incidents. |
| `get_incident` | **`incident_id`** | Returns one incident. |
| `list_monitors` | `name`, `limit` | Lists monitors, optionally name-filtered. |
| `get_monitor` | **`monitor_id`** | Returns one monitor by integer id. |
| `list_downtimes` | `current_only` | Lists downtimes (monitor silences). |

Out of scope for this read core: APM trace/span detail, synthetics,
RUM, notebooks, SLO administration, event writes, incident creation or
mutation, and on-call — see BUILD-REPORT.md.

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # node test runner over test/*.test.ts, no network (fake fetch fixtures)
npm run dev     # run the CLI from source via tsx
```

## License

MIT — see `LICENSE`.
