# Adding ValueKeys for Smoke Tests (optional stability upgrade)

Roveflow navigates your app using visible text, the Flutter semantics
tree, and vision models by default — see `navigation-strategy.md`. You
never need to add a single `ValueKey` to adopt Roveflow.

This cookbook exists for the case where a scenario becomes fragile —
multiple similar labels on the same screen, tightly dynamic copy, heavy
i18n churn — and the report flags it. Adding a `ValueKey` on the
offending widget makes future runs faster and more reliable, but it's a
tuning step, not a prerequisite.

## Where to add keys

Add a `ValueKey('<scenario-friendly-name>')` to:
- Every primary call-to-action button referenced in a scenario
- Every bottom navigation tab the agent navigates between
- Every list item the agent selects (one key per item is overkill — key the
  *list* and use index-based finders, OR key the per-item action button)
- Modal/sheet primary buttons used in cold-setup or recovery

Skip:
- Read-only labels (the agent uses `tap_by_text` or screenshots to verify)
- Decorative icons that aren't tap targets

## Naming convention

`<lowercase_snake_case>` describing the action or target:
- `login_button`, `email_field`, `password_field`
- `care_tab`, `home_tab`, `food_tab`
- `book_appointment_button`, `confirm_booking_button`
- `dismiss_face_id_sheet`, `dismiss_notifications_sheet`

When the same widget appears multiple times (e.g. one "Buchen" button per
appointment slot), include the disambiguating id:
```dart
ElevatedButton(
  key: ValueKey('book_slot_${slot.id}'),
  onPressed: () => book(slot),
  child: Text(context.l10n.bookButton),
)
```

## Example: keying a tab

Before:
```dart
BottomNavigationBarItem(
  icon: SvgPicture.asset('assets/icons/care.svg'),
  label: context.l10n.careTab,
)
```

After:
```dart
BottomNavigationBarItem(
  key: const ValueKey('care_tab'),
  icon: SvgPicture.asset('assets/icons/care.svg'),
  label: context.l10n.careTab,
)
```

## Example: keying a primary button

Before:
```dart
ElevatedButton(
  onPressed: () => login(),
  child: Text(context.l10n.loginButton),
)
```

After:
```dart
ElevatedButton(
  key: const ValueKey('login_button'),
  onPressed: () => login(),
  child: Text(context.l10n.loginButton),
)
```

## Verifying a key is reachable from the runtime tools

Boot the app in debug mode, then in your Claude Code session:

```
mcp__flutter-inspector__tap_by_key(key: "login_button")
```

If it returns "Tapped key ..." you're done. If it returns
`Error: widget with key "..." not found`, the key isn't yet in the widget
tree (wrong screen, or not yet wired). Hot-reload after editing.
