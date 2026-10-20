# ADR 0003 — Complete and reopen quests

- **Status:** Accepted
- **Date:** 2026-10-20
- **Amends:** locked decision #11 in the README (todos are list + create only)

## Context

The MVP shipped with list + create (decision #11). Every gamified feature on the roadmap (XP, levels, rarity rewards) needs a way to finish a quest first. The user asked to reopen #11 for this after the MVP went live (PR5).

The backend already supports it: `PUT /v1/todos/{id}` takes `is_completed`. Two details of that endpoint shape the frontend:

- It is a **full replace**. `UpdateTodoRequest` requires `title` and `is_completed`, and defaults `description` and `due_date` to null, so a body with only `is_completed` would wipe both.
- It rejects a `due_date` in the past **unless it equals the stored one** (`Todo.set_due_date` treats an unchanged date as a no-op). An overdue quest can be completed only if its date is sent back exactly as the API returned it.

## Decision

- Each quest card gets a seal toggle (`role="checkbox"`) that completes a pending quest or reopens a completed one.
- The frontend sends the whole todo with `is_completed` flipped, and resends `due_date` as the original string, never through a `Date` round-trip.
- The update is optimistic. On success the server's copy replaces the quest; on failure only that quest is rolled back (not a snapshot of the list, so two quick toggles cannot undo each other) and the list is refetched.
- Completing shows a "¡Misión cumplida!" toast; reopening is silent. Failures show the shared Spanish copy from `apiErrorMessage`.
- Editing and deleting stay deferred; the rest of #11 still holds.

## Consequences

- Completion state is now user-visible, so XP and levels (roadmap item 5) can be derived from it.
- Reopening is allowed on purpose: a misclick must be undoable. When XP exists, reopening must take the XP back, or the toggle becomes an XP farm.
- The header count is still the total of quests, not of completed ones: the list is paginated, so the client does not know the completed total. A server-side count belongs with XP v2.
