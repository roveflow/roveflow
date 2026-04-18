# Smoke Scenarios — Counter App (Roveflow example)

> Single inventory. `criticality: critical` runs in `--mode=critical` and
> `--mode=all`. `criticality: extended` runs only in `--mode=all`.
>
> Schema: see `.claude/skills/roveflow/references/scenarios-format.md`.

---

## cold-setup

```yaml
id: cold-setup
criticality: critical
order: 0
goal: Reach the default Flutter counter screen from cold install.
entry: cold-install
waypoints:
  - reach_screen: "Flutter Demo Home Page"
steps_hint: |
  The default Flutter app opens directly to the counter. No login.
  Verify the app bar reads "Flutter Demo Home Page" and the counter "0"
  is visible.
pass: counter "0" visible AND floating-action-button visible
fail: screen blank, app crashes within 10s, or app bar title missing
```

---

## increment-counter

```yaml
id: increment-counter
criticality: extended
order: 1
goal: Increment the counter once by tapping the floating action button.
entry: home
waypoints:
  - tap_floating_action_button
  - counter_increments_to: "1"
steps_hint: |
  From the home screen ("Flutter Demo Home Page"), tap the floating
  action button (the "+" icon in the bottom-right). Verify the counter
  text updates from "0" to "1".
pass: counter "1" visible after tap
fail: counter stays at "0", or no floating-action-button found
```
