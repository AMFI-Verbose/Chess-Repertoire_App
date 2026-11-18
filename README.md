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
- Keyboard navigation (`←`/`→`)
- Search positions by FEN prefix
- Multiple users / auth (add a `User` model and scope every query by it)

---

## 5. Cheat sheet

| I want to… | Do this |
|---|---|
| Change the data model | edit `prisma/schema.prisma`, then `npx prisma migrate dev --name your_change` |
| Look at the raw data | `npm run db:studio` |
| Add a backend operation | export an async function from `src/app/actions.ts` |
| Change interaction logic | `src/components/RepertoireBuilder.tsx` |
| Change colours | the `:root` block in `src/app/globals.css` |
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
