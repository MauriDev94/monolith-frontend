# Roadmap

Ordered from most needed to most ambitious. Items 2 onward go beyond the MVP scope in the README's locked decisions. Each one notes what it needs before it can start.

## Now

1. **Visual identity "Grimorio" + dark mode toggle.** Done (ADR 0001).
2. **PR4: list and create quests (todos).** This is the remaining MVP work. Built with the Grimorio look, where tasks are "misiones".

## Next

3. **Complete a quest.** Mark a todo as done.
   - This is the foundation for everything gamified: without completion there is nothing to reward.
   - Needs: reopening locked decision #11 (today the MVP is list + create only).
   - Backend: already supported (`PUT /v1/todos/{id}` with `is_completed`), so this is frontend only.
4. **Level and XP in the navbar.** XP is earned by completing quests.
   - v1, frontend only: XP = completed × N, and the level comes from a threshold table. Derived on the client from the todos query.
   - v2, backend: XP persisted per user plus achievements. Needs new endpoints, worked on in the backend session.
5. **Quest rarity (Común / Rara / Épica).**
   - Backend: a new enum field on the `Todo` entity, with an Alembic migration, request/response schemas and tests. Track it in `../BACKEND_PENDIENTES.md` and implement it from the backend session.
   - Frontend: a rarity selector on create and a badge on each quest. The token `--wine` is reserved for "Épica".

## Later

6. **Mascot, "familiar".** A small companion character, for example a scribe owl.
   - v1, frontend only: the mascot sits in a corner and shows contextual lines from a local list. For example, it greets on login, encourages when the list is empty and congratulates on completing a quest. No cost and no new dependencies.
   - v2, chatbot: a backend endpoint that calls the Claude API.
     - The API key lives only on the server, never in the SPA.
     - Per-user rate limits and a monthly spend cap.
     - Needs its own design and an ADR before any code.
7. **Smaller touches:**
   - A completion animation.
   - Achievements and badges.
   - Optional sound effects, off by default.

## Known follow-ups

- The auth forms show raw axios messages (e.g. "Request failed with status code 401") inline. They should show Spanish copy and leave the 401 case to the toast.
