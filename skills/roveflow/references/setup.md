# Setup — Adopting the roveflow skill in a new project

These are the manual steps to wire the skill into a Flutter project. A future
CLI will automate them; until then, this is the source of truth.

## Prerequisites

- Flutter project with debug build runnable on a simulator
- `mcp_toolkit` package (used by the drop-in interaction tools)
- The flutter-inspector MCP binary built locally; note its absolute path

## Steps

### 1. Copy the skill into the project

```bash
mkdir -p .claude/skills
cp -r <path-to-skill-source>/roveflow .claude/skills/roveflow
```

### 2. Add the flutter-inspector entry to `.mcp.json`

Merge the snippet from `.claude/skills/roveflow/references/mcp-config.snippet.json`
into your project's `.mcp.json`. Export `ROVEFLOW_FLUTTER_INSPECTOR` in
your shell (or in Claude Code's env settings) pointing at the absolute
path of your `flutter_inspector_mcp` binary. Claude Code substitutes
`${ROVEFLOW_FLUTTER_INSPECTOR}` at MCP server startup. Build the binary
from the upstream `mcp_flutter` project; Roveflow does not ship one.

### 3. Add the MCP interaction tools to your Flutter source

```bash
mkdir -p lib/core/mcp
cp .claude/skills/roveflow/references/mcp_interaction_tools.dart \
   lib/core/mcp/mcp_interaction_tools.dart
```

Edit the new file's import:
```dart
import 'package:<your_app>/core/general_helpers/utils/navigation_util.dart';
```

If your project doesn't already expose a `navigate.pop()` helper, create one
or replace the `navigate.pop()` call with your own routing teardown.

### 4. Wire the tools into `main.dart` (debug mode only)

```dart
if (kDebugMode) {
  MCPToolkitBinding.instance
    ..initialize()
    ..initializeFlutterToolkit();
  await registerMcpInteractionTools();
}
```

Import:
```dart
import 'package:<your_app>/core/mcp/mcp_interaction_tools.dart';
```

### 5. Define the sub-agent

```bash
mkdir -p .claude/agents
cp .claude/skills/roveflow/references/roveflow-runner.template.md \
   .claude/agents/roveflow-runner.md
```

No edits needed — the template is project-agnostic.

### 6. Define the slash command

```bash
mkdir -p .claude/commands
cp .claude/skills/roveflow/references/slash-command.template.md \
   .claude/commands/roveflow.md
```

### 7. Create the scenarios inventory

```bash
mkdir -p docs/roveflow/runs
touch docs/roveflow/runs/.gitkeep
cp .claude/skills/roveflow/references/scenarios.template.md \
   docs/roveflow/scenarios.md
```

Edit `docs/roveflow/scenarios.md`:
- Fill in the `cold-setup` scenario with your app's actual first-run flow
  (use real screen titles for waypoints).
- Replace the example `<example-extended-scenario>` block with one or more
  real scenarios.

### 8. Add ValueKeys to interactive widgets

See `.claude/skills/roveflow/references/value-keys-cookbook.md`. At
minimum, key every widget your `cold-setup` scenario lists in
`preferred_keys`.

### 9. Verify

Boot the app in debug mode on a simulator, then in Claude Code:

```
/roveflow --only=cold-setup
```

If cold-setup passes, the wiring is good. If it fails, fix the scenario
(usually waypoint titles or missing keys) before adding more scenarios.
