# Session Recording Format (v0.1)

Every scenario run produces a **session recording** artifact on disk. This
is the Phase 1 foundation for the deterministic-replay feature planned in
Phase 2.

## What gets recorded

For each scenario, the sub-agent emits:
- **Screenshots** — before and after each waypoint check, plus any
  extras the agent chooses to take.
- **Tool-call log** — a JSON Lines file with one entry per MCP tool
  invocation: `timestamp`, `tool`, `arguments`, `result`.
- **Result summary** — the structured JSON the sub-agent already returns
  (`result`, `waypoints_hit`, `screenshots`, `notes`, `ended_at_home`).

## On-disk layout

```
docs/roveflow/runs/
  2026-04-17-2010/               ← run id (ISO-ish timestamp)
    report.md                    ← orchestrator's compiled report
    recording.mov                ← full-run simulator video (unless --no-record)
    scenarios/
      cold-setup/
        result.json              ← structured result summary
        calls.jsonl              ← tool-call log
        screenshots/
          0001-before-home.png
          0002-after-home.png
      book-video-consultation/
        result.json
        calls.jsonl
        screenshots/
          0001-before-care.png
          ...
```

`recording.mov` is produced by `xcrun simctl io booted recordVideo` running
for the full orchestrator lifetime. The orchestrator starts it right after
the simulator boots and stops it (via `SIGINT`, so the trailer is written)
after the report is compiled. Missing if the run was invoked with
`--no-record` or if `simctl` failed to start.

## Sub-agent contract

At scenario start, the sub-agent:
1. Creates `scenarios/<scenario-id>/screenshots/`.
2. Opens `scenarios/<scenario-id>/calls.jsonl` for append.
3. After each MCP tool call, writes one JSON line (schema below) and
   flushes.
4. Saves every screenshot under `screenshots/` with a monotonic
   zero-padded prefix.
5. At scenario end, writes `scenarios/<scenario-id>/result.json` with the
   canonical result summary.

### JSONL line schema

```json
{
  "ts": "2026-04-17T19:32:01.451Z",
  "tool": "tap_by_text",
  "args": {"text": "Login"},
  "result": "ok"
}
```

Field types: `ts` is ISO-8601 UTC; `args` is the MCP tool's argument
object; `result` is free-form (string, object, or "error: …").

## Why JSONL, not a single JSON blob

Append-only, survives sub-agent mid-run crashes, trivially parseable with
`jq` or any streaming parser. Phase 2's replay engine will walk
`calls.jsonl` line by line.
