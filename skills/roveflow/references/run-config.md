# Run configuration

How the orchestrator resolves **flutter command**, **flavor**, and **VM service port** before every smoke run.

## Resolution order (first hit wins)

For each value:

1. `docs/roveflow/config.yaml` (if present): explicit override.
2. Auto-detection (described below).
3. Default: fallback when nothing else is found.

## Values

### `flutter_command`

The executable used to run the app. Default: `flutter`.

- **Config**: `flutter_command: fvm flutter` (or `flutter`, or a custom wrapper).
- **Auto-detect**: if `.fvmrc`, `.fvm/`, or `fvm_config.json` exists at project root, use `fvm flutter`; else `flutter`.

### `flavor`

The `--flavor` value to pass to `flutter run`. Default: none (flag omitted).

- **Config**: `flavor: production` passes `--flavor production`. Set to `""` to force-omit.
- **Auto-detect**: if `ios/config/` exists and has exactly one subdirectory, use that subdirectory name as the flavor; else omit.
- **Omit** the `--flavor` flag entirely when the resolved value is empty. Do NOT pass `--flavor ""`.

### `vm_service_port`

The port passed to `flutter run --vm-service-port=N`. Must match the MCP server's `--dart-vm-port` arg in `.mcp.json`. Default: `8181`.

- **Config**: `vm_service_port: 8181`.
- **Auto-detect**: parse `.mcp.json` at project root. For the `flutter-inspector` server, scan `args` for the pattern `--dart-vm-port=N`. If found, use `N`.

## Config file schema

`docs/roveflow/config.yaml` is optional. Example with every field set:

```yaml
# All fields are optional. Omit any field to fall back to auto-detection.
flutter_command: fvm flutter
flavor: production
vm_service_port: 8181
```

## When to use the config file

Most users should not need one. Add it when:

- Your project uses `fvm` but doesn't have `.fvmrc` / `.fvm/` at the project root (e.g., a nested workspace).
- Your project has multiple iOS flavors and auto-detect picks the wrong one.
- You have a port collision with another running Flutter app and need a non-default port (also update `.mcp.json` `--dart-vm-port` to match).
- You use a custom wrapper script around `flutter`.

## Worked example

Project has `.fvmrc` and `ios/config/production/` and `ios/config/staging/`. No `config.yaml`.

Auto-detection resolves:

- `flutter_command` → `fvm flutter` (`.fvmrc` present)
- `flavor` → omitted (two subdirectories, ambiguous)
- `vm_service_port` → parsed from `.mcp.json`, or `8181` if not set

To pin the flavor, write:

```yaml
flavor: production
```

to `docs/roveflow/config.yaml`.
