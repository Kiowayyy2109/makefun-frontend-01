# makefun-frontend-01

[![make.fun · makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/Kiowayyy2109/makefun-frontend-01/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/Kiowayyy2109/makefun-frontend-01/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

**Lumen v2** — a fast, plain-static-files frontend for [make.fun](https://make.fun),
built for the makefun-frontend-01 bounty. It reads only make.fun's public API
(`GET https://make.fun/api/...`, no sign-in, no writes) and shows four surfaces,
each with its own hash URL:

- **Bounty board** (`#/`): master-detail — the bounty list on the left, the
  selected bounty's full page beside it (stacked on mobile). Search, sorting
  (pot, deadline, entries, reward, title) and a status filter run in memory.
- **Bounty page** (`#/bounty/<slug>`): summary, full description and rules, a
  rewards table computed against the live pot, key dates and status.
- **Leaderboard** (`#/bounty/<slug>/leaderboard`): virtualised — only the rows
  in view are in the DOM, so a 300-row board scrolls like a 30-row one.
  Search by handle or title, sortable columns, page jumps.
- **Public profile** (`#/profile/<handle>`): the account's public profile,
  record and entries, newest first.

## Why it is fast

- **First load is `index.html` alone.** The shell is inlined in the page
  (critical CSS + a one-line module that dynamically imports the rest);
  the stylesheet, the API client and each view load after it, behind
  dynamic `import()`. No framework, no build step, system fonts, zero
  images in the shell.
- **API answers are cached in memory and revalidated with `ETag` /
  `If-None-Match`** (a `304` inside the minute costs no new body), and
  identical in-flight requests share one fetch. Board rows prefetch
  their bounty's detail on hover/focus, and the first few details are
  prefetched while the browser idles.
- **Long lists are virtualised, not paginated away**: the leaderboard
  renders only visible rows inside a full-height spacer.
- Countdowns update their own text nodes in place; picking a bounty
  swaps only the detail pane, never the list.

“Open” is judged by the deadline, not the status text alone: a bounty
past its deadline takes no more entries, even if it still reads open.

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

- `app/` — the frontend: `index.html` (the shell), `boot.js` (router and
  shell), `api.js` (cached API client), `format.js` (money, time and a
  small Markdown renderer), `style.css`, `views/board.js` (master-detail
  board), `views/bounty.js`, `views/leaderboard.js` (virtualised),
  `views/profile.js`.
- `screenshots/` — three real renders of the running app on live data.
- `main.ts` — the hand-in program. `serve.ts` — a small static server
  for local testing (with gzip, so first-load bytes can be measured).
- `shots.json` — what each screenshot shows.
- `.makefun/owner.json` — the payout wallet that claims this repository.

---

<sub>Entered on [make.fun](https://make.fun/bounty/makefun-frontend-01) as
**Lumen** for the makefun-frontend-01 bounty.</sub>
