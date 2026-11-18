# Repertoire — a chess opening trainer

A personal opening repertoire builder. You store the lines you actually play,
branch them where they diverge, and annotate every position. Spaced-repetition
drilling is the next milestone.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Prisma 6 · SQLite · chess.js · react-chessboard

---

## 1. Run it

```bash
cd "/Users/chujiepeng/Doubao/chats/2026-11-18/new-chat"

npm install            # only needed once, or after package.json changes
npm run db:seed        # optional: fills in two example repertoires
npm run dev            # http://localhost:3000
```

Useful extras:

```bash
npm run db:studio      # opens a GUI at localhost:5555 to browse the database
npm run build          # production build — this also type-checks everything
npm run db:reset       # wipe the database, re-run migrations, re-seed
```

> `npm run dev` never type-checks. **`npm run build` is your real error detector** —
> run it before you consider any change finished.

---

## 2. Where everything lives

```
src/
  app/
    layout.tsx              root shell: fonts, <html>, global CSS
    globals.css             design tokens (--bg, --accent, …)
    page.tsx                dashboard: lists repertoires, creates new ones
    actions.ts              ALL server-side logic — the entire backend
    r/[id]/page.tsx         loads one repertoire from the DB, renders the builder
  components/
    RepertoireBuilder.tsx   the interactive board + side panels (client component)
  lib/
    prisma.ts               the single shared database client
    chess.ts                pure chess helpers (legal moves, FEN, move numbers)
    types.ts                shapes that cross the server → client boundary
prisma/
  schema.prisma             database tables — source of truth for the data model
  migrations/               generated SQL history (commit these)
  dev.db                    the actual SQLite file (git-ignored)
scripts/
  seed.mjs                  inserts example repertoires
```

---

## 3. The four ideas this project teaches

### a) The server / client boundary

A file starting with `"use client"` runs **in the browser**. Everything else
(by default in the App Router) runs **on the server**.

- `page.tsx` and `r/[id]/page.tsx` are server components — they query the
  database directly with Prisma. They must never use `useState` or `onClick`.
- `RepertoireBuilder.tsx` is a client component — it holds interaction state
  (which square is selected, which position you're on) and can't touch Prisma.

Data crosses from server to client **as props**. That's why `lib/types.ts`
exists: it defines the flattened `NodeDTO` we hand over.

### b) The tree model

A repertoire is not a list of games — it's a **tree of positions**.

- The **root node** is the starting position (`ply: 0`, empty `san`).
- Every other node stores *the move that leads to it* (`san` + `uci`) **and** the
  FEN of the position *after* that move.
- Children of a node are the alternatives you have saved from that position.
- Walking up `parentId` links rebuilds the whole line; walking down gives variations.

That's why clicking a move that already exists navigates to an existing node,
while playing a new move offers to create one. `uci` (`"g1f3"`) is the stable
key used for matching, because SAN (`"Nf3"`) can be ambiguous across positions.

### c) Server actions = your API

`src/app/actions.ts` exports plain async functions. Next.js turns each one into
a POST endpoint automatically, and the client imports and awaits them like local
functions:

```ts
const created = await addMove({ parentNodeId, san, uci, fen });
```

Rules that matter:
- **Never trust the client.** `addMove` looks up the parent node and derives
  `repertoireId` and `ply` from it — the browser can't spoof its own data.
- Mutations are **idempotent** where it counts (`addMove` returns the existing
  node instead of creating a duplicate).
- Deletes are protected: the root node (`ply === 0`) can never be removed.

### d) Optimistic UI

The builder keeps `nodes` in React state and applies changes locally *first*, then
persists. The UI feels instant; the database catches up a moment later. The trade
off: if a server action fails, local state can drift from the database — reload
fixes it.

---

### e) `normFen` — the position key that powers auto-detection

A FEN string looks like:

```
rnbqkbnr/pppppppp/...  w KQkq -  0 1
└────── board ──────┘  │ │      │ │ └ move number
                       │ │      │ └ halfmove clock
                       │ │      └ en-passant square
                       │ └ castling rights
                       └ side to move
```

The last two fields are bookkeeping, not chess. Drop them (`.slice(0, 4)`) and you
get a key that is identical for the **same position reached by different move
orders** — a transposition. `Node.normFen` stores that key, `@@index([normFen])`
makes "who else has this position?" a single indexed lookup instead of a scan.

Opening detection now uses the same key from the other side. The `Opening` table
is the **whole** Lichess ECO dataset — 3,865 lines, each stored with the
normalized FEN of its final position in an indexed `epd` column. Detection is
therefore an *exact* lookup, not a prefix scan:

1. The client sends every position key along the current line (`normFens[]`).
2. The server finds the deepest one that exists in the table.
3. That row's ECO code + name come back, so an unnamed move still reports the
   opening it belongs to — exactly how Lichess labels a position.

The table stays on the server (3,865 rows would be ~300 KB of JSON on every page
load); the client asks `describePosition` once per navigation, and gets the
transposition list in the same round trip.

### f) How a move gets graded

The engine returns a score in **centipawns** (1/100 of a pawn), always from the
point of view of the side whose turn it is. That one convention drives the whole
grader:

```
position after move 1      →  score = +0.35   (White's turn: White is better)
position after move 1...   →  score = -0.35   (Black's turn: Black is worse)
```

So to judge White's move you need `score_before` (White's view) and
`score_after`, then flip the sign: `played = -score_after`. The difference
`best - played` is the **centipawn loss**, and the tiers are thresholds on it:

| Loss | Label |
|---|---|
| 0 | Best |
| ≤ 20 | Excellent |
| ≤ 60 | Good |
| ≤ 120 | Inaccuracy |
| ≤ 250 | Mistake |
| > 250 | Blunder |

Two labels need more than a loss:

- **Great** — you played the best move *and* the second-best move was much worse
  (≥ 1.5 pawns). That is why the analyser asks for `MultiPV 2`: it wants the
  runner-up score, not just the winner.
- **Brilliant** — you played the best move *and* gave material away. The
  sacrifice test compares the material count on the board before and after
  (`materialFor()`), and requires the position to still be sound.

**Book** is not an engine verdict at all — it means the position exists in the
ECO table, so the server answers it with one indexed query instead of a search.

Each label has a colour, a glyph (`!!`, `?`, `??`, …), a sound and a flash, all
defined in one place: `LABEL_STYLES` and `classifyMove` in `src/lib/classify.ts`.

---

## 4. What's done, what's next

### Done
- [x] Create a repertoire (name + side)
- [x] Interactive board: click-to-move, drag-to-move, legal-move dots
- [x] Navigate the tree: play a stored move → jump to it
- [x] Add a new move that isn't stored yet
- [x] Move list, branch list, main-line flag, board flip
- [x] Per-position notes
- [x] Delete a branch (with confirmation)
- [x] Persistence in SQLite
- [x] PGN import — merges into the tree instead of duplicating
- [x] Auto-detected opening name (ECO) from the full Lichess database
- [x] Transposition detection across repertoires
- [x] Sound effects (Web Audio, no asset files) + last-move / check visuals
- [x] Keyboard navigation: `←` / `→` walk the line
- [x] Play against Stockfish 19 (WASM, no server engine)
- [x] Review mode: every move graded Brilliant / Great / Best / … / Blunder
- [x] Build / Play / Review mode switcher

### Structure of the three modes
| Mode | Route | What it does |
|---|---|---|
| Build | `/r/[id]` | author the tree, auto-detect openings/transpositions |
| Play | `/r/[id]/play` | human vs Stockfish, eval bar, take-back, skill slider |
| Review | `/r/[id]/review` | grade the main line, replay with annotations + effects |

### Milestone 3 — Spaced repetition (the reason this app exists)
The `Review` table is already in the schema, unused. Wire it up:
1. `GET /r/[id]/train` page that picks due cards (`dueAt <= now`).
2. Show the position *before* the move, ask "what do you play here?"
3. Grade the answer: right → `interval *= ease`, wrong → reset to 1 day.
4. Save it back to `Review`; update `dueAt`.
5. Dashboard shows a "due today" count per repertoire.

### Milestone 4 — PGN export & nested variations
- Export your repertoire as PGN: walk the main line, emit side lines in
  parentheses.
- Import nested variations (`1. e4 (1. d4 d5)`) — `loadPgn` only exposes the
  main line through `history()`, so this needs a real PGN tree parser.

### Milestone 5 — Real tree view
- A recursive sidebar component that draws the whole tree, collapsing
  variations, with the current path highlighted.

### Milestone 6 — Polish
- Promotion picker (currently auto-queens)
- Review a game you paste in, not just the stored main line
- Multiple users / auth (add a `User` model and scope every query by it)

---

## 5. Cheat sheet

| I want to… | Do this |
|---|---|
| Change the data model | edit `prisma/schema.prisma`, then `npx prisma migrate dev --name your_change` |
| Look at the raw data | `npm run db:studio` |
| Refresh the ECO opening table | `npm run db:openings` (needs network, ~3,900 rows) |
| Add a backend operation | export an async function from `src/app/actions.ts` |
| Change interaction logic | `src/components/RepertoireBuilder.tsx` |
| Change engine strength / timing | `skillSettings()` in `src/components/PlayVsEngine.tsx` |
| Move a grade up or down a tier | the thresholds in `classifyMove` (`src/lib/classify.ts`) |
| Change colours | the `:root` block in `src/app/globals.css`; board colours in `src/lib/boardTheme.ts` |
| Verify nothing is broken | `npm run build` |

---

## 6. Gotchas already hit (so you don't hit them again)

- **Next 15 route params are async.** `params` is a `Promise` — you must
  `await params` before using `params.id`.
- **Prisma's `latest` tag pointed at an RC.** This project is pinned to the
  stable 6.x line; don't casually `npm i prisma@latest`.
- **TypeScript circular inference.** In `RepertoireBuilder`, `parentId` needed an
  explicit `string | null` annotation or the compiler gave up on the loop.
- **CSS background overlays.** Highlight squares with `backgroundImage`, not
  `background` — the latter resets the square's colour to transparent.
- **react-chessboard v5 puts `squareStyles` on an *inner* div.** The square's own
  DOM node (`[data-square="e4"]`) keeps only its base colour, so inspecting that
  element looks like "the highlight didn't work". Look at its children instead.
- **The Lichess CSV has three columns, not four.** `eco / name / pgn` — there is
  no `uci` or `epd` column, so the seed script replays each PGN with chess.js and
  derives both. 5 of 3,870 rows fail to parse and are skipped.
- **Stockfish must be the `-single` build for browsers.** The multi-threaded
  build needs `SharedArrayBuffer`, which needs COOP/COEP response headers. The
  `lite-single` pair (`28 KB` js + `1.8 MB` wasm) needs neither.
- **Engine calls must be serialized.** One Worker is one state machine; two
  `go` commands in flight interleave their `info` streams. `Engine.search()`
  chains requests through a queue.
- **One search per position, not two.** The score after a move *is* the score
  before the next one, so a 30-move game needs 31 searches, not 60.
