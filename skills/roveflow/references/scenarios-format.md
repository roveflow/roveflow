# Scenario File Format

Smoke test scenarios live in `docs/roveflow/scenarios.md` in the consuming
project. Each scenario is a YAML-fenced block under a `## <id>` heading.

## Field reference

| Field | Required | Purpose |
|---|---|---|
| `id` | yes | Stable identifier; matches the `## heading` |
| `criticality` | yes | `critical` \| `extended` |
| `order` | no | Force order (only used by `cold-setup`, value `0`) |
| `goal` | yes | One-sentence outcome the user achieves |
| `entry` | yes | `cold-install` \| `home` \| `<other-named-state>` |
| `waypoints` | yes | Mid-flight assertions (screen titles or screen ids) |
| `steps_hint` | no | Free-text hint for the sub-agent |
| `preferred_keys` | no | ValueKeys to prefer over text taps |
| `pass` | yes | Plain-English pass condition |
| `fail` | yes | Plain-English explicit fail signals |

## Skip results (returned by sub-agent, not declared in YAML)

A sub-agent may return `result: skipped` instead of pass/fail when:
- `skipped: no_data` — environmental gap (no slots, no prior data)
- `skipped: setup_failed` — cold-setup never reached home (cascades to all)
- `skipped: setup_lost` — reset-to-home failed mid-run (cascades to remaining)

Skipped scenarios surface in the report but do not fail the run.

## Example block

```markdown
## book-video-consultation
```yaml
id: book-video-consultation
criticality: critical
goal: User can book a video consultation end-to-end.
entry: home
waypoints:
  - reach_screen: "Care"
  - reach_screen: "Neuen Termin buchen"
  - reach_screen: confirmation
steps_hint: |
  Tap care_tab → book_appointment_button → pick first available slot →
  confirm_booking_button.
preferred_keys:
  - care_tab
  - book_appointment_button
  - confirm_booking_button
pass: confirmation screen with appointment id visible
fail: no slots available (mark `skipped: no_data`) OR booking error toast
```
```

## Validation rules (orchestrator enforces)

- A `cold-setup` scenario MUST exist with `criticality: critical`, `order: 0`,
  and `entry: cold-install`.
- All other scenarios MUST have `entry: home` (the warm-chain assumption).
- Each scenario id MUST be unique.
- `criticality` MUST be `critical` or `extended` (no other values).
