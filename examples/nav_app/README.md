# nav_app — Roveflow two-screen example

A 2-screen Flutter app exercising navigation between a home and a detail
page. Ships as the multi-screen dogfood for the `roveflow init` flow and
the `navigate_back` MCP tool that counter_app can't reach.

## Run it locally

```bash
# From the repo root:
dart pub global activate --source path packages/roveflow
cd examples/nav_app
roveflow init            # materialises .claude/ + .mcp.json (all gitignored)
flutter pub get
flutter run -d <simulator-id>
```

See `../counter_app/README.md` for the full list of what's committed vs
regenerated. Same split applies here.

## What this example adds over counter_app

- Two routes, `Navigator.push` + back button interaction.
- Exercises `navigate_back` MCP tool.
- Three scenarios (`cold-setup`, `open-detail`, `back-to-home`) instead
  of one.

## Scenarios

- `cold-setup` (critical) — reach "Nav App Home" from install.
- `open-detail` (extended) — tap "Open Detail", land on the Detail screen.
- `back-to-home` (extended) — invoke `navigate_back` from Detail,
  confirm home is visible again.

## Run the smoke test

```
/roveflow --only=cold-setup          # just the critical path
/roveflow --mode=all                 # all three scenarios
```

in Claude Code (simulator must be booted with the app running).
