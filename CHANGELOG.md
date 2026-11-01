# Changelog

## 0.1.0 (2026-10-26)

- Initial release.
- CLI: `metricwatch <tool-name> [--json '<arguments>']` exposes every
  MCP tool as a subcommand, plus `metricwatch mcp` and `--version`;
  credentials are read from `DATADOG_API_KEY` and `DATADOG_APP_KEY`,
  with `DATADOG_SITE` selecting the API host (default datadoghq.com).
- MCP server (`metricwatch mcp`, stdio) with 11 read tools:
  `query_timeseries`, `list_metrics`, `get_metric_metadata`,
  `list_dashboards`, `get_dashboard`, `search_logs`, `list_incidents`,
  `get_incident`, `list_monitors`, `get_monitor`, and `list_downtimes`.
- Calls go to `https://api.<site>` with the `DD-API-KEY` and
  `DD-APPLICATION-KEY` headers; timeseries uses the documented v1
  query endpoint and log search the v2 logs search endpoint.
- A missing API key or application key fails honestly with an error
  naming the missing variable, before any request is made.
- All HTTP goes through an injectable fetch function, so the test
  suite runs entirely on hand-written fixtures with no network access.
