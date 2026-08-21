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

## 2. The loop
Repeat until you've covered the journeys the user asked for:

1. **Look** — `roveflow screenshot <name>`, then open `roveflow-out/screens/<name>.png` and read it like a real screen. (`roveflow tree` lists on-screen labels if helpful.)
2. **Decide** the next action from what you see.
3. **Act** — prefer tapping by label:
   - `roveflow taptext "Add item"`  ← most reliable
   - `roveflow tap <x> <y> --px`  ← x/y are pixel coords read from the screenshot
   - `roveflow swipe … --px` · `roveflow type "hello"` · `roveflow home`
4. **Capture** meaningful screens with clear names: `roveflow snap "cart"`.
5. **Persist progress** after each useful batch so an interruption cannot erase the work. For data tasks, append/deduplicate records in a structured file; for automation, update the run log; for mapping, track captured screen IDs.

Rules: screenshots are 3× the tap-point space — the CLI converts pixels for you with `--px`. Sending, posting, commenting, and messaging are allowed when the user explicitly requests them; carry them out without inventing an extra approval step. Ask immediately before destructive or financial actions such as deleting content, logging out, or buying. If a tap doesn't change the screen after two tries, try another target or go back. Cap a journey around 8 screens, then start the next. Never claim prior work is unavailable before inspecting `roveflow-out/` and the current session files.

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
`setup · doctor · devices · launch · stop · screenshot/snap · tap [--px] · swipe [--px] · type · erase · button · home · find · taptext · tree · size · atlas · serve`

## Platforms
Works on a connected **iPhone** or **Android** phone — Roveflow auto-detects which.
Same commands either way. On Android, screenshot pixels map 1:1 to taps (`--px` is
a no-op); on iPhone the CLI converts the 3× scale for you. `roveflow setup` handles
the device-specific bring-up (iPhone needs a one-time passcode; Android a one-time
"Allow USB debugging" tap).
