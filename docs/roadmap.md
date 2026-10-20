# Roadmap

Ordered from most needed to most ambitious. Items 4 onward go beyond the MVP scope in the README's locked decisions. Each one notes what it needs before it can start.

## Now

1. **Visual identity "Grimorio" + dark mode toggle.** Done (ADR 0001).
2. **PR4: list and create quests (todos).** Done. `/todos` lists quests (paginated, "Cargar más misiones") and creates them with title, optional description and optional due date.
3. **PR5: deploy to Vercel.** The last MVP item: the Vercel project and `VITE_API_URL`, plus `CORS_ALLOWED_ORIGINS` on Render (steps in the README). The SPA calls the API cross-site; the trade-off is recorded in ADR 0002.

## Next

4. **Complete a quest.** Mark a todo as done.
   - This is the foundation for everything gamified: without completion there is nothing to reward.
   - Needs: reopening locked decision #11 (today the MVP is list + create only).
   - Backend: already supported (`PUT /v1/todos/{id}` with `is_completed`), so this is frontend only.
5. **Level and XP in the navbar.** XP is earned by completing quests.
   - v1, frontend only: XP = completed × N, and the level comes from a threshold table. Derived on the client from the todos query.
   - v2, backend: XP persisted per user plus achievements. Needs new endpoints, worked on in the backend session.
6. **Quest rarity (Común / Rara / Épica).**
   - Backend: a new enum field on the `Todo` entity, with an Alembic migration, request/response schemas and tests. Track it in `../BACKEND_PENDIENTES.md` and implement it from the backend session.
   - Frontend: a rarity selector on create and a badge on each quest. The token `--wine` is reserved for "Épica".

## Later

7. **Mascot, "familiar".** A small companion character, for example a scribe owl.
   - v1, frontend only: the mascot sits in a corner and shows contextual lines from a local list. For example, it greets on login, encourages when the list is empty and congratulates on completing a quest. No cost and no new dependencies.
   - v2, chatbot: a backend endpoint that calls the Claude API.
     - The API key lives only on the server, never in the SPA.
     - Per-user rate limits and a monthly spend cap.
     - Needs its own design and an ADR before any code.
8. **Smaller touches:**
   - A completion animation.
   - Achievements and badges.
   - Optional sound effects, off by default.

## Known follow-ups

- **React Router v7 future-flag warnings** in the dev console (`v7_startTransition`, …). Opt in to the flags in `routes.tsx` (chore).
- **Session on Safari, iOS and Brave.** They block the cross-site refresh cookie, so the session ends on reload (ADR 0002). Fix: a custom domain for both apps, or test the `Partitioned` cookie attribute in the backend first.
- **Cold-start feedback.** The API sleeps on Render's free plan and the first request can take about 50 s. A "despertando el servidor…" hint after a few seconds of waiting would explain the delay (frontend only).
- **Quest order.** `GET /v1/todos` returns oldest first, so new quests land at the end of the list. A newest-first sort would need a backend `order` parameter (optional backend improvement).
