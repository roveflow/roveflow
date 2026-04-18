# Roveflow changelog

## [0.1.0] — 2026-04-17

First public release. Scope: Phase 1 of the product bible.

### Added
- `roveflow` CLI (`dart pub global activate roveflow`)
- `roveflow init` — zero-source-edit install into any Flutter project
- `roveflow version`
- `roveflow` skill (renamed from `smoke-testing` during Phase 1)
- Minimal-code-invasion navigation: vision + Flutter semantics tree + text
- Session recording: screenshot reel + JSONL tool-call log per scenario
- Product bible at `docs/specs/2026-04-17-roveflow-product-bible.md`

### Deferred to Phase 2
- Deterministic replay from recorded sessions
- CI integration
- Flake budgets and golden-run baselines
