# Getting this repo onto GitHub — with GitHub Desktop

The app is installed at `~/Applications/GitHub Desktop.app` (Homebrew could not copy it
into `/Applications` without your password, so it lives in your own Applications folder —
Spotlight finds it the same way).

Your repo is already committed: 106 files, 30 commits, ~10 MB, everything on `main`. Nothing secret is tracked — only `.env.example`, no real keys or database.

## 1. Sign in

1. Open **GitHub Desktop**.
2. `GitHub Desktop → Settings…` (or the welcome screen) → **Accounts** → **Sign into GitHub.com**.
3. Your browser opens `github.com`; approve the authorization, come back to the app.

## 2. Add your local repository

1. `File → Add Local Repository…`
2. Choose this exact folder:
   `/Users/chujiepeng/Doubao/chats/2026-11-18/new-chat`
3. GitHub Desktop reads the existing history — you should see **30 commits**. The
   repository already exists; you are not creating a new one.

## 3. Publish it (this is the upload)

1. Click **Publish repository** in the top bar.
2. Name: `Chess-Repertoire_App` (or anything you like).
3. Description: `Chess repertoire builder, engine play, puzzles and a 16-lesson curriculum.`
4. **Keep this code private** — leave it checked unless you want the world to read it.
5. Click **Publish repository**.

That creates the repo on your account and pushes all 30 commits. The `main` branch becomes
`origin/main`.

## 4. The daily loop (what you actually do from now on)

1. Open the app. If it says **Fetch origin**, click it — that pulls changes made elsewhere.
2. Make changes with your editor.
3. Back in GitHub Desktop, the **Changes** tab lists every modified file with a real diff.
4. Write a summary in the bottom-left box ("Add endgame drills for K+P"), press
   **Commit to main**.
5. Click **Push origin** — the commit leaves your Mac and lands on GitHub.

Rules that keep history readable:

- One commit = one idea. Do not bundle "fix typo" with "new feature".
- Commit message in the imperative: "Add…", "Fix…", "Rework…".
- Push at the end of each session, not once a week.

## 5. Things in this repo you should know about

- `.githooks/post-commit` regenerates `docs/development-timeline.png` after every commit
  and stages it, so your next commit carries a current diagram.
- `prisma/dev.db` and `.env` are gitignored — the database and secrets stay off GitHub.
  A fresh clone runs `npx prisma migrate dev` to build its own database.
- `public/engine/*.wasm` is gitignored and re-copied by `predev` / `prebuild`, so the
  repository stays small.

## If you would rather not use an app

Same thing from the terminal, once `gh` is signed in:

```bash
gh auth login
gh repo create Chess-Repertoire_App --private --source=. --remote=origin --push
```

Then, every session: `git add -A && git commit -m "…" && git push`.
