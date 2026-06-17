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

## 2. The loop
Repeat until you've covered the journeys the user asked for:

1. **Look** — `roveflow screenshot <name>`, then open `roveflow-out/screens/<name>.png` and read it like a real screen. (`roveflow tree` lists on-screen labels if helpful.)
2. **Decide** the next action from what you see.
3. **Act** — prefer tapping by label:
   - `roveflow taptext "Add item"`  ← most reliable
   - `roveflow tap <x> <y> --px`  ← x/y are pixel coords read from the screenshot
   - `roveflow swipe … --px` · `roveflow type "hello"` · `roveflow home`
4. **Capture** meaningful screens with clear names: `roveflow snap "cart"`.
5. **Track** what you've seen so you don't loop.

Rules: screenshots are 3× the tap-point space — the CLI converts pixels for you with `--px`. Be safe: never log out, delete, send, or buy. If a tap doesn't change the screen after two tries, try another target or go back. Cap a journey around 8 screens, then start the next.

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
`setup · doctor · devices · launch · stop · screenshot/snap · tap [--px] · swipe [--px] · type · erase · button · home · find · taptext · tree · size · atlas · serve`

## Platforms
Works on a connected **iPhone** or **Android** phone — Roveflow auto-detects which.
Same commands either way. On Android, screenshot pixels map 1:1 to taps (`--px` is
a no-op); on iPhone the CLI converts the 3× scale for you. `roveflow setup` handles
the device-specific bring-up (iPhone needs a one-time passcode; Android a one-time
"Allow USB debugging" tap).
