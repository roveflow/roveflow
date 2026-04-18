---
name: roveflow
description: Use when running Roveflow smoke or free-roam tests on a Flutter app via flutter-inspector MCP. AI-driven E2E testing that drives the live app, verifies critical user flows, and reports findings. Trigger via the project's slash command.
---

# Roveflow — Flutter AI testing skill

Trigger via the project's smoke (or later: free-roam) slash command.
Drives the live app via flutter-inspector MCP; dispatches sub-agents;
compiles structured reports with recording artifacts.

## Philosophy

- **Familiar-user stance** — navigate like someone who knows the app; don't
  panic on cosmetic drift. Pass = the flow's stated goal completes. Fail =
  crash, blank screen, action has no effect, data not persisted, navigation
  dead-end.
- **Goal + waypoints, not exact scripts** — each scenario states an outcome
  and a small set of mid-flight assertions; the sub-agent improvises the taps.
- **Smoke is broad and shallow.** Don't deep-test any one flow.

## Modes

- `--mode=critical` (default for `/roveflow`): runs only scenarios tagged
  `critical`. Fast pre-release pass.
- `--mode=all`: runs every scenario. Used by scheduled runs to widen coverage.
- `--only=<id1,id2>`: subset (debugging single scenarios while iterating).
- `--no-record`: disable simulator video recording for this run. Recording is
  ON by default — see "Simulator video recording" below.

## Run lifecycle

1. **Preflight** — verify flutter-inspector VM is reachable; bail with a clear
   error if not.
2. **Cold setup** — first scenario, always; reach a known logged-in home
   state.
3. **Scenario loop** — execute each scenario; reset to home between; abort if
   reset fails.
4. **Report** — markdown table; manual mode → chat; scheduled →
   `docs/roveflow/runs/<timestamp>.md`.

## Sub-agent execution model

The orchestrator (the agent owning the `/roveflow` slash command session)
does NOT drive the app directly. For each scenario it dispatches a sub-agent
of type `roveflow-runner` (defined in
`.claude/agents/roveflow-runner.md`, model: Haiku) with a focused brief:

- the scenario YAML block
- a reminder of the navigation strategy (below)
- the reset-to-home routine to run at the end (below)
- the structured-result format the sub-agent must return

The sub-agent returns the JSON described in
`references/roveflow-runner.template.md`. The orchestrator collects
those results and compiles the report.

**Why:** a single smoke run produces hundreds of tool calls and screenshot
blobs. Keeping that volume out of the orchestrator's context preserves room
for report compilation and avoids Opus-class cost for mechanical tap-and-verify
work.

**Compaction:** after every 5 scenarios, OR when the orchestrator estimates
its context exceeds 60% of the model's window, the orchestrator compacts —
drops raw sub-agent transcripts from working memory, keeps only the structured
results.

## Navigation strategy (sub-agent contract)

Roveflow's default stance is minimal code invasion — see
`references/navigation-strategy.md` for the full rationale.

Preference order:
1. `tap_by_text` — for visible labels. Works on any widget, no source changes.
2. Semantics-based navigation — query the widget tree for
   `Semantics(label: ...)` matches.
3. Vision-assisted tap via screenshot reasoning — when text and semantics
   both miss.
4. `tap_by_key` — when the scenario provides `preferred_keys` and the above
   are fragile. Optional upgrade, not required.
5. `scroll_to_text` then tap — when target may be off-screen.
6. `tap_at` (logical coordinates) — last resort; flagged as fragile in notes.

Screenshot before and after each waypoint assertion via
`ReadMcpResourceTool(server: "flutter-inspector", uri: "visual://localhost/view/screenshots")`.

## Recovery between scenarios

The `reset_to_home` routine (run by the sub-agent at the end of every
scenario):
1. `navigate_back` up to 5 times.
2. Verify home tab + bottom navigation visible (screenshot check).
3. If any modal/sheet remains, dismiss it; try once more.
4. Set `ended_at_home: true` if home is verified, `false` otherwise.

If the sub-agent returns `ended_at_home: false`, the orchestrator runs ONE
fallback `navigate_back` loop itself. If that still doesn't reach home, abort
the run and mark all remaining scenarios as `skipped: setup_lost`.

## Reporting protocol

### Manual mode

A markdown table to chat with columns:
`scenario | result | waypoints hit | screenshots | notes`

Followed by a numbered list of failures and the prompt:
> "Which of these failures should I file? (Reply with numbers, or `none`.)"

(Linear/external filing is per-project and currently deferred — for v1, the
user manually copies failure summaries into wherever they track bugs.)

### Scheduled mode

Same table written to `docs/roveflow/runs/YYYY-MM-DD-HHMM.md`. No chat
interaction. Per-failure routing (Linear/Slack/etc.) is per-project hook —
deferred for v1.

## Session recording

Every scenario produces a recording artifact on disk — screenshots,
tool-call log, and the result summary. Artifacts live at
`docs/roveflow/runs/<run-id>/scenarios/<id>/`. See
`references/session-recording.md` for the format.

This is the Phase 1 groundwork for the deterministic-replay feature
planned in Phase 2. In v0.1 the artifacts are informational — inspect
manually on failures.

## Simulator video recording

On top of the per-scenario artifacts, the orchestrator records a single
`.mov` of the entire run straight from the iOS simulator via
`xcrun simctl io booted recordVideo`. Default ON. Pass `--no-record` to
skip (useful when no simulator GUI is available, when running on CI with a
headless sim, or when you just want faster iterations).

The recorder starts right after the simulator boots and stops after the
report is compiled. The finalized file lands at
`docs/roveflow/runs/<run-id>/recording.mov` alongside `report.md`. The same
`SIGINT`-on-exit trap used by the repo-local `make record` target is used
here so the `.mov` is always playable, even on abort.

Encoding flags (hardcoded, same as `make record`):
`--codec=h264 --mask=ignored --force`.

## Orchestration sequence (the algorithm)

```
1. Parse args
   • mode = critical (default) | all
   • optional --only=<id1,id2>
   • record = true (default); set false if --no-record present

2. Preflight
   • Read docs/roveflow/scenarios.md, parse all scenario YAML blocks
   • Filter by mode (and --only if present)
   • Validate: cold-setup present, marked critical, order=0, entry=cold-install
   • Validate: every other scenario has entry: home
   • Validate: scenario ids are unique; criticality ∈ {critical, extended}
   • Resolve run config → $FLUTTER_CMD, $FLAVOR_FLAG, $VM_PORT.
     See references/run-config.md. Summary:
       - $FLUTTER_CMD: config.yaml flutter_command → else "fvm flutter" if
         .fvmrc / .fvm/ present → else "flutter".
       - $FLAVOR_FLAG: config.yaml flavor → else the single subdir of
         ios/config/ if exactly one exists → else "" (omit the flag).
       - $VM_PORT: config.yaml vm_service_port → else parse
         --dart-vm-port=N from .mcp.json args → else 8181.

3. Simulator reset (orchestrator runs this directly via Bash — not delegated)
   a. Kill any running flutter process:
        pkill -f "flutter_tools" || true; sleep 2
   b. Erase the simulator by UDID (wipes app data + keychain). Use UDID, not "booted",
      because erase requires the sim to be shut down first:
        xcrun simctl shutdown <udid> || true
        xcrun simctl erase <udid>
      Discover UDID via: xcrun simctl list devices --json
   b2. Boot the simulator (erase leaves it shut down; flutter run won't auto-boot after erase):
        xcrun simctl boot <udid>
        open -a Simulator
   c. Relaunch the app in debug mode (background, log to /tmp/flutter-smoke-run.log).
      Construct the command from resolved run config:
        cd <project-root>
        $FLUTTER_CMD run -d <udid> $FLAVOR_FLAG --debug \
          --vm-service-port=$VM_PORT --disable-service-auth-codes \
          > /tmp/flutter-smoke-run.log 2>&1 &
        echo $! > /tmp/flutter-smoke.pid
      Where $FLAVOR_FLAG is either "--flavor <name>" or empty (omitted entirely).
      Flags explained:
        --vm-service-port=$VM_PORT       matches the MCP server's --dart-vm-port
                                         arg in .mcp.json
        --disable-service-auth-codes     removes the auth token from the VM URL so
                                         the MCP server can reconnect after a restart
        --flavor <name>                  pass ONLY when a flavor resolves; apps
                                         without flavors must omit this flag
   d. Poll mcp__flutter-inspector__get_vm every 10s until connected (max 20 attempts ≈ ~3 min).
      On each failure, read the last 20 lines of /tmp/flutter-smoke-run.log to check for
      build errors. If still unreachable after 20 attempts → abort: "App failed to start."
   e. Once VM responds → call listClientToolsAndResources to confirm dynamic tools registered.
      If tools missing → hot_reload once, then check again.
   f. If record == true: start simulator video recording in the background.
        RUN_DIR=docs/roveflow/runs/<run-id>
        mkdir -p "$RUN_DIR"
        xcrun simctl io booted recordVideo \
          --codec=h264 --mask=ignored --force \
          "$RUN_DIR/recording.mov" &
        echo $! > /tmp/roveflow-recorder.pid
      Record the PID for the stop step below. If `simctl` exits non-zero
      within 2 seconds, warn once and continue without recording (do NOT
      abort the run — recording is an observability nice-to-have).

4. Cold setup
   • Dispatch roveflow-runner sub-agent with the cold-setup YAML
   • Collect result
   • If result != pass OR ended_at_home != true:
       - Mark all remaining as skipped: setup_failed
       - Skip to step 7

5. Scenario loop (each remaining scenario, in declared order)
   a. Dispatch roveflow-runner with scenario YAML + reset-to-home routine
   b. Collect {result, skip_reason, waypoints_hit, screenshots, notes,
                 ended_at_home}
   c. If ended_at_home == false:
        - Orchestrator runs reset-to-home itself (one fallback)
        - If still not home → abort, mark remaining as skipped: setup_lost
   d. Compaction check: if scenarios_since_last_compact >= 5
        OR estimated_context_pct > 60 → compact

6. (Continue loop until all processed or aborted)

7. Report compilation
   Manual mode → markdown table to chat + numbered failure list +
                 confirmation prompt.
   Scheduled mode → write docs/roveflow/runs/YYYY-MM-DD-HHMM.md.

8. Stop recorder (only if started in step 3f)
   • kill -INT "$(cat /tmp/roveflow-recorder.pid)" 2>/dev/null
   • Wait up to 5s for the process to exit so the .mov trailer is written.
   • rm -f /tmp/roveflow-recorder.pid
   • If recording.mov exists and is >0 bytes, surface its path at the end
     of the report (manual mode: append a "Video: <path>" line; scheduled
     mode: add the same line under the table in report.md).
   • Run this step ALSO on any abort path (steps 3, 4, 5) so the .mov is
     always finalized — use a try/finally-equivalent shell trap or run it
     unconditionally before returning.
```

## Templates and references

**Drop-in templates:**
- `references/scenarios.template.md` — starter scenarios.md
- `references/slash-command.template.md` — slash command template
- `references/roveflow-runner.template.md` — sub-agent template
- `references/mcp_interaction_tools.dart` — Flutter drop-in
- `references/mcp-config.snippet.json` — `.mcp.json` snippet

**Reference docs:**
- `references/scenarios-format.md` — scenario YAML schema
- `references/run-config.md` — flutter command / flavor / port resolution
- `references/navigation-strategy.md` — how the agent navigates (new)
- `references/session-recording.md` — on-disk recording format (new)
- `references/value-keys-cookbook.md` — optional key-tuning guide
- `references/setup.md` — manual install steps
