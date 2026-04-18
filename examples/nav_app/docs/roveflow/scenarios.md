# Smoke Scenarios — Nav App (Roveflow example)

> Two-screen navigation example. Exercises `navigate_back` and
> multi-screen `tap_by_text` — things the counter_app example can't.
>
> Schema: see `.claude/skills/roveflow/references/scenarios-format.md`.

---

## cold-setup

```yaml
id: cold-setup
criticality: critical
order: 0
goal: Reach the Nav App home screen from cold install.
entry: cold-install
waypoints:
  - reach_screen: "Nav App Home"
steps_hint: |
  The app opens directly to the home screen. No login. Verify the app
  bar reads "Nav App Home" and the "Open Detail" button is visible.
pass: "Open Detail" button visible AND welcome text visible
fail: screen blank, app crashes within 10s, or app bar title missing
```

---

## open-detail

```yaml
id: open-detail
criticality: extended
order: 1
goal: Navigate from home to the detail screen via the "Open Detail" button.
entry: home
waypoints:
  - tap_text: "Open Detail"
  - reach_screen: "Detail"
steps_hint: |
  From "Nav App Home", tap the "Open Detail" button. Verify the new
  screen's app bar reads "Detail" and the body text reads "You are on
  Detail".
pass: detail app-bar title "Detail" visible AND detail body text visible
fail: navigation does not occur, or Detail screen does not render
```

---

## back-to-home

```yaml
id: back-to-home
criticality: extended
order: 2
goal: Return from the detail screen to home via navigate_back.
entry: detail
steps_hint: |
  From the Detail screen, invoke navigate_back (the MCP back tool).
  Verify the app returns to "Nav App Home" and the welcome text is
  visible again.
waypoints:
  - navigate_back
  - reach_screen: "Nav App Home"
pass: "Open Detail" button visible after navigation
fail: app stays on Detail, or the navigator stack empties entirely
```
