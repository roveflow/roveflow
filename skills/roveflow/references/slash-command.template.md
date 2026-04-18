---
description: Run the project's smoke-test suite via the roveflow skill.
argument-hint: "[--mode=critical|all] [--only=<id1,id2>] [--no-record]"
---

You have been invoked via the `/roveflow` slash command.

Invoke the `roveflow` skill to run the smoke suite for this project.

Pass these arguments through to the skill: `$ARGUMENTS`

Defaults:
- If no `--mode` is given, use `--mode=critical`.
- `--only=<ids>` is optional and only used when iterating on a single scenario.
- Simulator video recording is ON by default. Pass `--no-record` to skip it (e.g. when no simulator GUI is visible, or for faster CI runs).

The skill knows the rest (preflight, sub-agent dispatch, reporting protocol).
