---
name: rove
description: Map any app on a connected iPhone into a Roveflow Atlas (every screen + user journey). Use when the user wants to clone, map, explore, or "rove" an app's UX into a shareable map for designers.
---

# rove — map any app's UX

You are the autopilot. You drive an app on a real iPhone using the `roveflow`
CLI, decide each next tap by **looking at the screenshots yourself**, and
assemble what you find into an Atlas. The CLI is your hand; you are the brain.

## 1. Get ready (every run)
```
roveflow doctor
```
If anything's red, run `roveflow setup`. Find the app to map with `roveflow devices`
(or ask the user for the app). Output goes to `roveflow-out/` (`screens/` etc.).

## 2. The loop — one call per step (keep it fast)
Each step is a SINGLE command that acts and hands you back the next screen. Fewer
commands = fewer model turns = faster. Repeat until you've covered the journeys.

1. **Start** a screen: `roveflow look home` — writes `screens/home.png` AND prints a numbered element list (`[3] Button "Add item"`). The number is the element's index.
2. **Decide** from the element list. You usually don't need to open the PNG for a routine tap; open it when you want visual context or to judge the UX.
3. **Act and advance in one call** — append `--look <next-name>` so the same command taps, waits for the screen to settle, and returns the next screen + its element list:
   - `roveflow tapindex 3 --look cart`  ← **default.** Taps element #3 at its true center, then returns the cart screen + elements.
   - `roveflow taptext "Add item" --look cart` · `roveflow swipe … --px --look feed` · `roveflow type "hi" --look results` · `roveflow home --look home`
   - `roveflow tap <x> <y> --px --look <name>`  ← true last resort. Unlabeled controls now show up as marks like `[7] Other (unlabeled · top-right)`, so prefer `tapindex` even for icon/close buttons.
4. **Track** what you've seen so you don't loop.

Why this shape: one command per step is one model turn (the slow part); `look`/`--look` fold screenshot + element list + settle into that one call. Tapping by index hits the element's real center from the accessibility tree, so it lands even on **tiny targets** (segmented tabs, close X) — match the on-screen target to a mark by its label/position and tap that index. Indices are valid only for the screen you just listed; every `--look` refreshes them.

Strategy when a tap misses or no-ops: **never repeat a pixel tap at the same spot.** Re-run `roveflow look <name>` (or `elements`) to refresh the marks, then `tapindex` the right one — the target is almost always in the list (including `(unlabeled …)` marks). Only fall back to `--px` if nothing in the list matches what you see, and if that misses once, re-`look` rather than nudging coordinates. If a target still isn't listed, it may be deeper than the snapshot depth — `ROVEFLOW_SNAPSHOT_DEPTH=60 roveflow look <name>` surfaces deeper controls (slower).

Rules: the CLI derives the screenshot-pixel→point scale per device and converts pixels for you with `--px`. Be safe: never log out, delete, send, or buy. If a tap doesn't change the screen after two tries, switch targets or go back — don't re-guess pixels. Cap a journey around 8 screens, then start the next.

## 3. Build the Atlas
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
`setup · doctor · devices · launch · stop · look · screenshot/snap · elements · tapindex [--look] · tap [--px][--look] · swipe [--px][--look] · type [--look] · erase · button · home [--look] · find · taptext [--look] · tree · size · atlas · serve`

## Platforms
Works on a connected **iPhone** or **Android** phone — Roveflow auto-detects which.
Same commands either way. On Android, screenshot pixels map 1:1 to taps (`--px` is
a no-op); on iPhone the CLI converts the 3× scale for you. `roveflow setup` handles
the device-specific bring-up (iPhone needs a one-time passcode; Android a one-time
"Allow USB debugging" tap).
