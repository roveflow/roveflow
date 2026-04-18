# Roveflow example

End-to-end walkthrough of `roveflow` on a new Flutter project. Takes
about 10 minutes after the one-time `flutter_inspector_mcp` build.

## Prerequisites

- Flutter 3.19+ (ships a compatible Dart SDK).
- A locally built `flutter_inspector_mcp` binary. Clone
  [Arenukvern/mcp_flutter](https://github.com/Arenukvern/mcp_flutter)
  and run `make install`, then export the path:
  ```bash
  export ROVEFLOW_FLUTTER_INSPECTOR=/absolute/path/to/flutter_inspector_mcp
  ```

## 1. Install the CLI

```bash
dart pub global activate roveflow
roveflow version
# 0.1.2
```

Both `roveflow` and the shorter alias `rf` are installed.

## 2. Create a Flutter app (or use your own)

```bash
flutter create my_flutter_app
cd my_flutter_app
```

## 3. Initialize Roveflow in the project

```bash
roveflow init
```

This writes:

- `.claude/skills/roveflow/` (the full skill)
- `.claude/commands/roveflow.md` (the `/roveflow` slash command)
- `.claude/agents/roveflow-runner.md` (the sub-agent)
- `.mcp.json` (references `${ROVEFLOW_FLUTTER_INSPECTOR}`)
- `lib/core/mcp/mcp_interaction_tools.dart` (with your package name substituted)
- `docs/roveflow/scenarios.md` (starter scenarios inventory)

## 4. Wire main.dart

```dart
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:mcp_toolkit/mcp_toolkit.dart';
import 'package:my_flutter_app/core/general_helpers/utils/navigation_util.dart';
import 'package:my_flutter_app/core/mcp/mcp_interaction_tools.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (kDebugMode) {
    MCPToolkitBinding.instance
      ..initialize()
      ..initializeFlutterToolkit();
    await registerMcpInteractionTools();
  }

  runApp(const MyApp());
}
```

## 5. Add `mcp_toolkit` and the `navigate.pop()` helper

```bash
flutter pub add mcp_toolkit
```

Create `lib/core/general_helpers/utils/navigation_util.dart`:

```dart
import 'package:flutter/widgets.dart';

final rootNavigatorKey = GlobalKey<NavigatorState>();

class _Navigate {
  void pop() => rootNavigatorKey.currentState?.pop();
}

final navigate = _Navigate();
```

Attach `rootNavigatorKey` to your `MaterialApp`:

```dart
MaterialApp(
  navigatorKey: rootNavigatorKey,
  // ...
)
```

## 6. Fill in the starter scenario

Open `docs/roveflow/scenarios.md` and replace the placeholder with your
app's real cold-launch flow. Use the exact `AppBar` title strings for
`reach_screen` waypoints.

## 7. Run the smoke test

In a Claude Code session rooted at the Flutter project:

```
/roveflow --only=cold-setup
```

The orchestrator restarts the app on your booted iOS simulator, drives
it through the scenario, and writes a session recording at
`docs/roveflow/runs/<timestamp>/`.

## Verify the install

```bash
roveflow doctor
```

Reports on the four load-bearing files and hints remediation if any are
missing.

## Full documentation

- Quickstart: [https://docs.roveflow.dev/getting-started/quickstart](https://docs.roveflow.dev/getting-started/quickstart)
- Concepts + guides: [https://docs.roveflow.dev](https://docs.roveflow.dev)
