---
name: rove
description: Drive an app on a connected phone to map UX, gather structured data, automate workflows, audit experiences, or produce reports. Use when the user wants to explore, scrape, test, operate, or "rove" a mobile app.
---

# rove — operate, research, and map any app

You are the autopilot. You drive an app on a real iPhone using the `roveflow`
CLI and decide each next action from the visible screen and accessibility tree.
The CLI is your hand; you are the brain. An Atlas is one possible output—not
the default for scraping, automation, audits, or reporting tasks.

## 1. Get ready (every run)
```
roveflow doctor
```
If anything's red, run `roveflow setup`. Find the target app with `roveflow devices`
(or ask the user). Output goes to `roveflow-out/` (`screens/`, data, reports, etc.).

Classify the request before acting:
- **Map/explore:** capture representative screens and journeys; build an Atlas.
- **Gather/research:** use the `schema-collect` skill when available and extract requested fields into `roveflow-out/data.json` as you go.
- **Automate/test:** perform the requested workflow and maintain `roveflow-out/run-log.md` with checkpoints and outcomes.
- **Audit/report:** collect evidence first, then generate the requested report format from the saved evidence.

The newest user message always steers the current task. Stop the present loop promptly
and switch to the requested deliverable; never continue bulk scrolling after the user
says the evidence is sufficient or asks for a report.

## 2. The loop — one call per step (keep it fast)
Each step is a SINGLE command that acts and hands you back the next screen. Fewer
commands = fewer model turns = faster. Repeat until you've covered the journeys.

1. **Start** a screen: `roveflow look home` — writes `screens/home.png` AND prints a numbered element list (`[3] Button "Add item"`). The number is the element's index.
2. **Decide** from the element list. You usually don't need to open the PNG for a routine tap; open it when you want visual context or to judge the UX.
3. **Act and advance in one call** — append `--look <next-name>` so the same command taps, waits for the screen to settle, and returns the next screen + its element list:
   - `roveflow tapindex 3 --look cart`  ← **default.** Taps element #3 at its true center, then returns the cart screen + elements.
   - `roveflow taptext "Add item" --look cart` · `roveflow scroll down --look feed` · `roveflow type "hi" --look results` · `roveflow home --look home`
   - `roveflow tap <x> <y> --px --look <name>`  ← true last resort. Unlabeled controls now show up as marks like `[7] Other (unlabeled · top-right)`, so prefer `tapindex` even for icon/close buttons.
4. **Persist progress** after each useful batch so an interruption cannot erase the work. For data tasks, append/deduplicate records in a structured file; for automation, update the run log; for mapping, track captured screen IDs.

Why this shape: one command per step is one model turn (the slow part); `look`/`--look` fold screenshot + element list + settle into that one call. Tapping by index hits the element's real center from the accessibility tree, so it lands even on **tiny targets** (segmented tabs, close X) — match the on-screen target to a mark by its label/position and tap that index. Indices are valid only for the screen you just listed; every `--look` refreshes them.

Strategy when a tap misses or no-ops: **never repeat a pixel tap at the same spot.** Re-run `roveflow look <name>` (or `elements`) to refresh the marks, then `tapindex` the right one — the target is almost always in the list (including `(unlabeled …)` marks). Only fall back to `--px` if nothing in the list matches what you see, and if that misses once, re-`look` rather than nudging coordinates. If a target still isn't listed, it may be deeper than the snapshot depth — `ROVEFLOW_SNAPSHOT_DEPTH=60 roveflow look <name>` surfaces deeper controls (slower).

For ordinary scrolling and snap feeds such as Reels, Shorts, and TikTok, always use `roveflow scroll down --look <name>` (or `scroll next`). It calculates a long gesture from the live device size. Do not invent `swipe ... --px` coordinates for scrolling: screenshot pixels and iPhone touch points are different coordinate spaces. Use raw `swipe` only for a deliberate drag that is not page/feed scrolling.

If a canonical `scroll` command fails, retry that same device-relative command once. If it still fails, report the driver/connection error and preserve the current phone screen. Do **not** run `setup`, go Home, kill/relaunch the user's app, probe WDA ports, invert the swipe direction, or start guessing raw coordinates during an active task. Those actions destroy context and turn one recoverable gesture failure into a long debugging spiral.

**“Doom scroll” is a direct automation request, not an exploration task.** On Instagram Reels, TikTok, Shorts, or another one-item-per-screen feed, immediately use `roveflow scroll next --look <name>`. `next` is a fast 100ms, device-height flick designed for snap feeds. Keep using that same command pattern for subsequent items; do not test slower swipes, edge coordinates, or alternate durations unless `scroll next` actually returns a no-op warning. On a normal continuous feed, use `scroll down` instead.

**Continuous means one live foreground runner, never finite batches.** When the user says “keep going,” “continuously,” or “until I stop,” run `roveflow scroll next --repeat --every 20` (use `down` for a normal feed and adjust the interval they requested). Leave that command running in the foreground until the user steers or presses Stop. Do not use fixed-size `for` loop batches. Never say another batch is queued, running in the background, or will start automatically unless a still-running `--repeat` command actually exists. Do not return a completion message while an until-stopped task is meant to remain active.

Rules: the CLI derives the screenshot-pixel→point scale per device and converts pixels for you with `--px`. Sending, posting, commenting, and messaging are allowed when the user explicitly requests them; carry them out without inventing an extra approval step. Ask immediately before destructive or financial actions such as deleting content, logging out, or buying. If a tap doesn't change the screen after two tries, switch targets or go back — don't re-guess pixels. Cap a journey around 8 screens, then start the next. Never claim prior work is unavailable before inspecting `roveflow-out/` and the current session files.

## 3. Finish the requested deliverable

For gathering, automation, audit, and reporting tasks, use the durable data and
run-log files as the source of truth. Generate exactly what the user requested
(CSV, JSON, Markdown, PDF, test result, or completed workflow) and report the
saved path plus record/evidence count. Do not build an Atlas unless it helps.

For mapping tasks, build the Atlas:
Write `roveflow-out/journeys.json`:
```json
{ "app": "Acme", "platform": "ios", "subtitle": "...",
  "screens": { "home": { "title": "Home", "caption": "..." } },
  "journeys": [ { "category": "Onboarding", "title": "Sign up", "description": "...", "flow": ["home","signup"] } ] }
```
Every id in a `flow` must be a `screens` key and a captured `screens/<id>.png`.
Categories: Onboarding, Tracking, Discover, Profile, Settings, Messaging, AI, Scenario.
Then:
```
roveflow atlas      # builds atlas.html + a video per journey
roveflow serve      # open it in the browser
```

## Commands
`setup · doctor · devices · launch · stop · look · screenshot/snap · elements · tapindex [--look] · tap [--px][--look] · scroll [down|up|next|previous] [--look] [--repeat --every <seconds>] · swipe [--px][--look] · type [--look] · erase · button · home [--look] · find · taptext [--look] · tree · size · atlas · serve`

## Platforms
Works on a connected **iPhone** or **Android** phone — Roveflow auto-detects which.
Same commands either way. On Android, screenshot pixels map 1:1 to taps (`--px` is
a no-op); on iPhone the CLI converts the 3× scale for you. `roveflow setup` handles
the device-specific bring-up (iPhone needs a one-time passcode; Android a one-time
"Allow USB debugging" tap).
