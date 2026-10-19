# ADR 0001 — RPG visual identity: "Grimorio", dark by default

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

The SPA shipped with shadcn's default slate look, which read as generic. The product direction is a task app with an RPG tone (tasks as "misiones"), with dark mode as the default and a visible switch to light.

Three directions were explored on a Claude Design canvas (https://claude.ai/artifact/XRnARKoNHrNR1r5zQzt5aX, private to the owner). Each showed a palette, a type pairing and a mockup of the todos screen in dark and light. All three are recorded below so the alternatives survive even if the canvas changes.

## Decision

Adopt **Grimorio** (classic fantasy: ink, parchment and gold).

- **Theme switching:** `next-themes` with `attribute="class"`, `defaultTheme="dark"`, `enableSystem={false}` and `storageKey="monolith-theme"`.
  - The OS preference is ignored on purpose: dark is part of the identity, and the user can still switch.
  - `index.html` ships `class="dark"` so the first paint is never light.
- **Tokens:** the shadcn token names in `src/styles/globals.css` are kept and their values replaced, so the `components/ui/*` primitives need no changes. Every color goes through these tokens; no hard-coded hex in components.
- **Type:** Cinzel for display (`font-display`; `h1`–`h3` use it by default) and Alegreya Sans for body (`font-sans`).
  - Both are self-hosted via `@fontsource/*`, so there are no runtime requests to Google Fonts and no third-party font CDN.
- **Accessibility:**
  - Every text/background pair is at least 4.5:1 in both themes.
  - `--input` (form control borders) is at least 3:1 against cards.
  - `--border` is decorative and intentionally softer.

### Grimorio palette

| Role                                     | Token                                | Dark              | Light             |
| ---------------------------------------- | ------------------------------------ | ----------------- | ----------------- |
| Background                               | `--background`                       | `#14100B`         | `#F2E8D2`         |
| Surface (cards, navbar)                  | `--card`, `--popover`                | `#1F1810`         | `#FBF6EA`         |
| Raised / muted fill                      | `--muted`, `--secondary`, `--accent` | `#2A2016`         | `#EFE3C7`         |
| Text                                     | `--foreground`                       | `#EFE3C8`         | `#2B1F12`         |
| Secondary text                           | `--muted-foreground`                 | `#B9A687`         | `#6B5536`         |
| Gold (primary, focus ring)               | `--primary`, `--ring`                | `#D9A441`         | `#8E5F12`         |
| Text on gold                             | `--primary-foreground`               | `#1A1209`         | `#FFF8E8`         |
| Wine (destructive, "Épica" rarity later) | `--destructive`, `--wine`            | `#D0675C`         | `#9A3A32`         |
| Decorative border                        | `--border`                           | `#4A3A26`         | `#CBB58C`         |
| Control border                           | `--input`                            | `hsl(35 28% 38%)` | `hsl(37 32% 46%)` |

Decorative motif: a gold diamond between two hairlines (`components/Ornament.tsx`) under page titles.

## Alternatives considered

### Abismo — arcane dark fantasy

Modern and mysterious, with violet night, glows and emerald highlights. Uses Marcellus for display and Manrope for body.

| Role                | Dark      | Light     |
| ------------------- | --------- | --------- |
| Background          | `#0D0A14` | `#F4F1FA` |
| Surface             | `#16111F` | `#FFFFFF` |
| Raised              | `#211A2E` | `#EEE9F8` |
| Border              | `#352A4A` | `#D3C9EA` |
| Text                | `#ECE7F7` | `#1B1429` |
| Secondary text      | `#A99BC4` | `#5E5277` |
| Accent (violet)     | `#A78BFA` | `#6D4AE0` |
| Secondary (emerald) | `#34D399` | `#0E8A63` |

### 16-bit — retro pixel art

The most playful option: a 90s console look with hard 3px borders, block offset shadows and saturated colors. Uses Press Start 2P for titles only and IBM Plex Mono for body.

| Role           | Dark      | Light     |
| -------------- | --------- | --------- |
| Background     | `#10141F` | `#F3EEDF` |
| Surface        | `#1A2033` | `#FFFDF6` |
| Raised         | `#232B44` | `#ECE4CF` |
| Border         | `#46527A` | `#262B40` |
| Text           | `#F2F5FF` | `#1A2033` |
| Secondary text | `#A3AED0` | `#4F5672` |
| Accent (coin)  | `#FFC933` | `#F2B705` |
| HP (red)       | `#FF6B86` | `#C2243F` |
| Mana (blue)    | `#4CC2FF` | `#0B6FA8` |

**Why Grimorio:**

- It reads as RPG without hurting legibility in long task lists.
- Gold on ink gives strong contrast for primary actions.
- Its serif display pairs well with the "bitácora de misiones" copy.
- 16-bit's pixel font is hard to read beyond titles. Abismo's glows need more care to stay accessible in light mode.

## Consequences

- **New components** use the tokens and `font-display` / `font-sans`; never hex values.
- **New UI copy** keeps the RPG voice ("misiones", "aventura") in neutral Spanish with tú.
- **Theme switching** is a single `next-themes` call; the toaster (`components/ui/sonner.tsx`) already follows it.
- **Changing direction later** means swapping the token values in `globals.css` and the font imports in `main.tsx`; the palettes above are ready to drop in.
- **Gamification ideas** shown on the canvas (level/XP bar, quest rarity) are not part of this decision. They are tracked in `docs/roadmap.md`.
