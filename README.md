# Roveflow

> *Your suite checks the flows you already know work. Ours finds the ones
> you didn't.*

Roveflow is an open-source E2E test orchestration framework for Flutter.
You describe **what** should happen in a short YAML scenario; an AI
sub-agent figures out **how** to make it happen in the live app.
Scenarios stay resilient when copy, layout, or structure changes.

**v0.1** ships smoke mode and the CLI installer. Concepts, full docs, and
the roadmap live at [docs.roveflow.dev](https://docs.roveflow.dev).

## Prerequisites

- **Dart 3.3.0+** (Flutter 3.19+ bundles a compatible Dart).
- A **Flutter project** you can run in debug mode on a simulator.
- The **`flutter_inspector_mcp`** binary built locally — the runtime
  bridge the agent uses to drive the live app. See the
  [installation guide](https://docs.roveflow.dev/getting-started/installation).

## Install

```bash
dart pub global activate roveflow
roveflow version
```

If `roveflow` isn't on `PATH`, add Dart's pub-cache `bin/` to your shell:

```bash
export PATH="$PATH:$HOME/.pub-cache/bin"
```

## Quickstart

```bash
cd my_flutter_app
roveflow init
# Follow the printed next-steps:
#  - add the one-line registration to main.dart
#  - point .mcp.json at your flutter-inspector binary
#  - fill in docs/roveflow/scenarios.md
flutter run -d <simulator-id>
# Then, in Claude Code:
/smoke-test --only=cold-setup
```

Full walkthrough:
[docs.roveflow.dev/getting-started/quickstart](https://docs.roveflow.dev/getting-started/quickstart).

## Examples

- [`examples/counter_app`](examples/counter_app/) — default Flutter
  counter, dogfooded with `roveflow init`.
- [`examples/nav_app`](examples/nav_app/) — two-screen navigation demo.

Run either against a local simulator and try `/smoke-test` in Claude Code.

## Docs & references

- [**Docs site**](https://docs.roveflow.dev) — full user docs, concepts,
  guides, reference.
- [**Skill reference**](skills/roveflow/SKILL.md) — how the orchestration
  engine works under Claude Code.
- [**CLI reference**](packages/roveflow/README.md) — every command and
  flag.

## License

MIT. See [LICENSE](LICENSE).
