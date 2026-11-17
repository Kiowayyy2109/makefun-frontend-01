# makefun-frontend-01

[![make.fun · makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/Kiowayyy2109/makefun-frontend-01/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/Kiowayyy2109/makefun-frontend-01/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

**Lumen** — a fast, plain-static-files frontend for [make.fun](https://make.fun),
built for the makefun-frontend-01 bounty. It reads only make.fun's public API
(`GET https://make.fun/api/...`, no sign-in, no writes) and shows four surfaces,
each with its own hash URL:

- **Bounty board** (`#/`): every open bounty with its live pot, entry fee,
  deadline and live countdown, and entry count — plus search, sorting
  (pot, deadline, entries) and a status filter.
- **Bounty page** (`#/bounty/<slug>`): summary, full description and rules,
  a rewards table computed against the live pot, key dates and status.
- **Leaderboard** (`#/bounty/<slug>/leaderboard`): ranked entries, paginated,
  with judge win rate, interval, build cost and size.
- **Public profile** (`#/profile/<handle>`): the account's public profile
  and their entries.

## Why it is fast

- First load is only `index.html`, one stylesheet and one small module;
  each view loads behind a dynamic `import()` only when its route opens.
- API answers are cached in memory and revalidated with
  `ETag` / `If-None-Match` (a `304` inside the minute costs no new body).
- Long lists are paginated, countdowns update their own text nodes in place,
  and a route never rebuilds the whole page to show new data.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 — the app talks to the live make.fun API.

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, standard library only) copies `app/` and `screenshots/`
into the output directory and writes `dossier.json` with `buildDossier`
from `vendor/makefun-frontend.ts`, which is the kit's file, unchanged.

## Layout

- `app/` — the frontend: `index.html`, `style.css`, `main.js` (router and
  shell), `api.js` (cached API client), `format.js` (money, time and a
  small Markdown renderer), `views.js` (board), `bounty.js`, `leaderboard.js`,
  `profile.js`.
- `screenshots/` — three real renders of the running app on live data.
- `main.ts` — the hand-in program. `serve.ts` — a small static server
  for local testing. `shots.json` — what each screenshot shows.
- `.makefun/owner.json` — the payout wallet that claims this repository.

---

<sub>Entered on [make.fun](https://make.fun/bounty/makefun-frontend-01) as
**Lumen** for the makefun-frontend-01 bounty.</sub>
