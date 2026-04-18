# roveflow (CLI + framework)

AI-first E2E test orchestration for Flutter — CLI installer and framework
core. See the [project README](https://github.com/) for positioning.

## Install

```bash
dart pub global activate roveflow
```

## Commands

### `roveflow init`

Installs Roveflow into a Flutter project. Creates
`.claude/skills/roveflow/`, `.claude/commands/roveflow.md`,
`.claude/agents/roveflow-runner.md`,
`lib/core/mcp/mcp_interaction_tools.dart`, and
`docs/roveflow/scenarios.md`. Writes or warns about `.mcp.json`.

Flags:
- `--path`, `-p` — target project path (default: current directory).

Exits non-zero if the target isn't a Flutter project.

### `roveflow version`

Prints the installed version and exits.

## Using Roveflow after install

1. Add `await registerMcpInteractionTools();` inside your `main.dart`
   `kDebugMode` block (one line).
2. Add `mcp_toolkit` to `pubspec.yaml` dependencies.
3. Edit `docs/roveflow/scenarios.md` — fill in the `cold-setup` flow.
4. Boot your app in debug mode.
5. In Claude Code, run `/roveflow --only=cold-setup`.

Full guide: `.claude/skills/roveflow/references/setup.md`.

## License

MIT.
