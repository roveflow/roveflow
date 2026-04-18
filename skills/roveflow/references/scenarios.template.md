# Smoke Scenarios — <Your App Name>

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
goal: From a fresh install reach the home screen logged in as the test user.
entry: cold-install
waypoints:
  - reach_screen: "<first screen title — e.g. country/language picker>"
  - reach_screen: "<login screen title>"
  - reach_screen: home
steps_hint: |
  Describe the cold-launch flow for your app: what to tap on each first-run
  screen (country/lang, onboarding, login, post-login bottom sheets) to reach
  the home screen as a logged-in user.
pass: home tab visible AND bottom navigation visible
fail: any screen blocks for >15s OR login error toast OR home not reached
```

---

## <example-extended-scenario>
```yaml
id: <example-extended-scenario>
criticality: extended
goal: <one-sentence outcome>
entry: home
waypoints:
  - reach_screen: <screen title or id>
  - reach_screen: <next checkpoint>
steps_hint: |
  <free-text hint for the sub-agent on which buttons to tap>
preferred_keys:
  - <ValueKey string from your app>
pass: <plain-English pass condition>
fail: <plain-English fail signal>
```
