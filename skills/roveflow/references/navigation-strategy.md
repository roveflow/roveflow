# Navigation Strategy

The sub-agent navigates the live app via a preference order designed to
minimize code invasion. `ValueKey` is an **optional stability upgrade**,
never a prerequisite for adoption.

## Preference order (most preferred first)

1. **Visible text** — `tap_by_text("Login")`. Works on any widget that
   renders a localized label. Preferred for CTAs and nav items.

2. **Flutter semantics tree** — inspect the widget tree for widgets with a
   `Semantics(label: ...)` wrapper. Flutter's `MaterialApp` and most
   built-in widgets already emit reasonable semantics.

3. **Vision-assisted tap** — the sub-agent captures a screenshot and
   reasons about the visible layout ("tap the blue button below the
   header"), then falls back to `tap_at` with the resolved coordinates.
   Slower and costlier; used when text and semantics both miss.

4. **`tap_by_key`** — when the scenario provides `preferred_keys` and the
   above are fragile. Optional upgrade, not required.

5. **`scroll_to_text` then tap** — when target may be off-screen.

6. **`tap_at`** (raw logical coordinates) — last resort. Always flagged as
   fragile in the session notes.

## Fragility reporting

If the agent falls back to (4) or below AND options (1)–(3) failed, the
sub-agent adds a `"fragile": true` marker in its session notes. The final
report surfaces these so the user can decide whether to add a `ValueKey`.

## Relation to the `ValueKey` cookbook

See `value-keys-cookbook.md`. Teams wanting maximum speed + stability on
their hottest scenarios can add keys. The default install requires zero
key additions.
