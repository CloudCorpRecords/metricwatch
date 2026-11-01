# metricwatch — Build Report

MCP Rebuild 100, Tier B. Clean-room rebuild of the Datadog MCP server,
built from Datadog's public API documentation only, captured in
`harness/fixtures/datadog-tools-original.json`. The fixture is
docs-derived and explicitly labelled a **core-subset**: the full
Datadog surface is very large; metricwatch implements the 11-tool
read core below, and parity is scored against that 11-tool subset
only. No live server was probed and no live network call was made.

Identity: repo `metricwatch`, npm `@reneturcios/metricwatch`,
MCP name `io.github.CloudCorpRecords/metricwatch`, version `0.1.0`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json` — bin `metricwatch: dist/cli.js`, `mcpName` set,
  scripts build=`tsc` / dev=`tsx src/cli.ts` / test=`tsx --test test/*.test.ts`
- `server.json` — description "Datadog metrics, dashboards, logs,
  incidents, and monitors from your MCP client." = **80 chars** (≤100 ✓);
  npm entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/metricwatch:0.1.0` carries **no** `version` field
- `Dockerfile` — node:20-alpine two-stage, ENTRYPOINT
  `node /app/dist/cli.js`, CMD `mcp`, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/metricwatch"`
- `tsconfig.json` (fleet template), `.gitignore`, `LICENSE` (MIT,
  Copyright (c) 2026 Rene Turcios), `README.md` (fresh text),
  `CHANGELOG.md` (single 0.1.0 entry, 2026-10-26)
- `src/index.ts`, `src/cli.ts` (every tool as a subcommand taking
  `--json '<arguments>'`, plus `mcp` and `--version`; exit 2 usage /
  1 API error), `src/mcp.ts`, `src/types.ts`, `src/datadog.ts`
  (core logic, `VERSION = "0.1.0"`)
- `test/datadog.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (fleet template; image name and smoke-test server name changed to
  metricwatch)

## Tools (11)

`query_timeseries` (GET /api/v1/query with from/to/query — the
documented v1 endpoint, chosen over v2 timeseries), `list_metrics`
(GET /api/v1/metrics), `get_metric_metadata`
(GET /api/v1/metrics/{metric_name}), `list_dashboards`
(GET /api/v1/dashboard), `get_dashboard`
(GET /api/v1/dashboard/{dashboard_id}), `search_logs`
(POST /api/v2/logs/events/search with filter/page/sort body),
`list_incidents` (GET /api/v2/incidents, page[size]),
`get_incident` (GET /api/v2/incidents/{incident_id}), `list_monitors`
(GET /api/v1/monitor), `get_monitor` (GET /api/v1/monitor/{monitor_id}),
`list_downtimes` (GET /api/v1/downtime).

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with explicit
  inputSchema literals, per the fleet standing rule; zod still
  validates every `tools/call`.
- Base URL is `https://api.<site>`; site from `DATADOG_SITE`, default
  `datadoghq.com`. Both headers are sent on every call:
  `DD-API-KEY: <DATADOG_API_KEY>` and
  `DD-APPLICATION-KEY: <DATADOG_APP_KEY>`.
- Missing-key behaviour: a missing API key errors naming
  `DATADOG_API_KEY`; a present API key with a missing application key
  errors naming `DATADOG_APP_KEY` — in both cases before any request.
  Over MCP this surfaces as `isError` (verified over stdio, below).
- All HTTP flows through an injectable `FetchFn` (types.ts). Tests use
  a fake fetch with hand-written Datadog-shaped fixtures — **no live
  call was performed during this build**.
- Env vars: `DATADOG_API_KEY` (required), `DATADOG_APP_KEY`
  (required), `DATADOG_SITE` (optional).

## Verification (exact outputs, foreground)

### 1. Build
```
$ ./node_modules/.bin/tsc ; echo tsc_exit=$?
tsc_exit=0
```
`dist/` produced, including `dist/cli.js`; `--version` → `0.1.0`.

### 2. Tests
```
$ ./node_modules/.bin/tsx --test test/*.test.ts
ℹ tests 14
ℹ pass 14
ℹ fail 0
```
Covers: requireCredentials naming DATADOG_API_KEY / DATADOG_APP_KEY,
apiBase default + EU site, missing-key makes no request,
query_timeseries URL/params/both DD headers, non-finite range
rejection, list_metrics path + limit slicing, metric-name encoding,
dashboard path, monitors name/page_size + integer id, search_logs
POST body shaping (filter/page/sort), incidents page[size], and
HTTP 403 surfacing the API's first error string.

### 3. CLI / MCP smoke
`--version` → `0.1.0`. MCP `initialize` over stdio →
`serverInfo: {"name":"metricwatch","version":"0.1.0"}`. A
`tools/call` for `list_metrics` with both keys unset returned
`isError: true` with text "DATADOG_API_KEY environment variable is
required: set DATADOG_API_KEY to a Datadog API key and retry".
Live Datadog calls were **not** run (no keys, offline build rule).

### 4. Parity (harness, from ~/workspace/mcp-rebuild-100/harness/)
```
$ python3 parity.py --original fixtures/datadog-tools-original.json \
    --rebuild "stdio:node .../builds/metricwatch/dist/cli.js mcp" \
    --out .../builds/metricwatch/parity-out
verdict=PASS parity_pct=100.0 original_tools=11 rebuild_tools=11 missing=[] extra=[] schema_diffs=[]
(exit 0)
```
Parity is against the labelled 11-tool core-subset fixture (see
Gaps), not the full Datadog surface.

## Lockfile status

`package-lock.json` was copied from pgcloud's and identity-edited
(top-level `name`, root package `name`, and root `bin` key changed
pgcloud -> metricwatch; dependency ranges identical). **Clean
lockfile regen required before publish** (regenerate with no
`node_modules` present); do not publish from this lockfile as-is.
`node_modules` is a copy of pgcloud's; `.bin/tsc` / `.bin/tsx`
verified working.

## Gaps / honest notes

- **Core-subset.** Omitted documented groups, recorded verbatim in
  the fixture `_source`: APM traces/spans detail, synthetics, RUM,
  notebooks, SLO admin, events write, incident creation/mutation,
  on-call. Parity above is against the subset only.
- No live Datadog API call was made (no keys in this environment;
  egress blocked). Request construction is written against the
  documented API paths/payloads and proven against fake fetches only;
  live payload drift is unverified until the publish wave.
- `list_metrics`' `limit` and `list_dashboards`' `limit` are applied
  client-side over the returned list (the v1 list endpoints have no
  documented page-size parameter used here); `list_metrics`' optional
  `from` is passed through when given.
- Container build not exercised locally; the publish-container
  workflow smoke-tests the image at publish time.
