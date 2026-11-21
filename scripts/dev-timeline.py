#!/usr/bin/env python3
"""Regenerate docs/development-timeline.png from git history.

Run after every meaningful commit (and daily):
    python3 scripts/dev-timeline.py
"""

from __future__ import annotations

import datetime as dt
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "development-timeline.png"

S = 2  # supersample for crisp text
W = 1600 * S
MARGIN = 64 * S

FONT_DIR = Path("/System/Library/Fonts/Supplemental")
BOLD = FONT_DIR / "Arial Bold.ttf"
REG = FONT_DIR / "Arial.ttf"
NARROW = FONT_DIR / "Arial Narrow.ttf"

COL = {
    "bg": "#0b0d0f",
    "panel": "#14171a",
    "panel2": "#1a1e21",
    "line": "#2a2f33",
    "text": "#e9ecee",
    "muted": "#8b949a",
    "accent": "#9bc700",
    "accent_dim": "#6f8f00",
}

# Phase boundaries in local time. New commits fall into the last (open) phase,
# so the diagram stays correct without editing it.
PHASES = [
    (
        "01",
        "Scaffold the repertoire builder",
        "Board, move tree, PGN import, ECO detection — the spine of the app.",
        dt.datetime(2026, 11, 18, 0, 0),
        dt.datetime(2026, 11, 19, 0, 0),
    ),
    (
        "02",
        "Engine, play, and review",
        "30k offline puzzles with an Elo that moves, eight engine levels with clocks, every game saved and graded.",
        dt.datetime(2026, 11, 19, 0, 0),
        dt.datetime(2026, 11, 21, 0, 0),
    ),
    (
        "03",
        "Lichess parity",
        "PGN import, captured material, theme drills, search that understands ECO and move order.",
        dt.datetime(2026, 11, 21, 0, 0),
        dt.datetime(2026, 11, 21, 19, 0),
    ),
    (
        "04",
        "Learn curriculum",
        "16 lessons in 5 chapters, XP and streak, a Pro shelf behind a real entitlement flag.",
        dt.datetime(2026, 11, 21, 19, 0),
        dt.datetime(2026, 11, 27, 0, 0),
    ),
]


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size * S)


F_TITLE = font(BOLD, 42)
F_SUB = font(REG, 19)
F_PHASE = font(BOLD, 27)
F_GOAL = font(REG, 18)
F_META = font(NARROW, 17)
F_TIME = font(NARROW, 18)
F_SUBJECT = font(REG, 19)
F_HASH = font(NARROW, 15)
F_FOOT = font(REG, 16)
F_PLAN = font(REG, 17)


def commits() -> list[dict]:
    raw = subprocess.check_output(
        [
            "git",
            "log",
            "--date=format:%Y-%m-%d %H:%M",
            "--pretty=format:%h%x1f%ad%x1f%aI%x1f%s",
        ],
        cwd=ROOT,
        text=True,
    )
    out = []
    for line in raw.splitlines():
        h, when, iso, subject = line.split("\x1f")
        out.append(
            {
                "hash": h,
                "when": dt.datetime.strptime(when, "%Y-%m-%d %H:%M"),
                "subject": subject,
            }
        )
    return out


def fit(draw: ImageDraw.ImageDraw, text: str, f, width: int) -> str:
    if draw.textlength(text, font=f) <= width:
        return text
    while text and draw.textlength(text + "…", font=f) > width:
        text = text[:-1]
    return text + "…"


def stats() -> tuple[int, int]:
    files = subprocess.check_output(
        ["git", "ls-files", "*.ts", "*.tsx"], cwd=ROOT, text=True
    ).split()
    lines = 0
    for rel in files:
        try:
            lines += sum(1 for _ in (ROOT / rel).open(encoding="utf-8", errors="ignore"))
        except OSError:
            pass
    return len(files), lines


def wrap(draw: ImageDraw.ImageDraw, text: str, f, width: int) -> list[str]:
    words, lines, line = text.split(), [], ""
    for word in words:
        candidate = f"{line} {word}".strip()
        if draw.textlength(candidate, font=f) <= width or not line:
            line = candidate
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def phase_rows(items: list[dict], start: dt.datetime, end: dt.datetime) -> list[dict]:
    return [c for c in items if start <= c["when"] < end]


def strip_prefix(subject: str) -> str:
    for prefix in ("feat(play): ", "feat(games): ", "feat(puzzles): ", "feat: ", "fix(puzzles): ", "fix: "):
        if subject.startswith(prefix):
            return subject[len(prefix):].capitalize()
    return subject[0].upper() + subject[1:] if subject else subject


def dashed_rect(draw: ImageDraw.ImageDraw, box, radius: int, fill: str, dash: int = 14 * S) -> None:
    x0, y0, x1, y1 = box
    step = dash * 2
    for x in range(x0 + radius, x1 - radius, step):
        draw.line([(x, y0), (min(x + dash, x1 - radius), y0)], fill=fill, width=2 * S)
        draw.line([(x, y1), (min(x + dash, x1 - radius), y1)], fill=fill, width=2 * S)
    for y in range(y0 + radius, y1 - radius, step):
        draw.line([(x0, y), (x0, min(y + dash, y1 - radius))], fill=fill, width=2 * S)
        draw.line([(x1, y), (x1, min(y + dash, y1 - radius))], fill=fill, width=2 * S)
    for cx, cy, a0 in ((x0, y0, 180), (x1 - 2 * radius, y0, 270), (x1 - 2 * radius, y1 - 2 * radius, 0), (x0, y1 - 2 * radius, 90)):
        draw.arc([cx, cy, cx + 2 * radius, cy + 2 * radius], a0, a0 + 90, fill=fill, width=2 * S)


def main() -> None:
    items = commits()
    n_files, n_lines = stats()
    now = dt.datetime.now().strftime("%d %b %Y, %H:%M")

    header_h = 250 * S
    row_h = 46 * S
    phase_head = 96 * S
    gap = 44 * S
    plan_h = 162 * S
    footer_h = 76 * S

    blocks = []
    for code, title, goal, start, end in PHASES:
        rows = phase_rows(items, start, end)
        height = phase_head + len(rows) * row_h + 18 * S
        blocks.append((code, title, goal, start, end, rows, height))

    total = header_h + sum(b[6] for b in blocks) + gap * len(blocks) + plan_h + footer_h + 40 * S

    img = Image.new("RGB", (W, total), COL["bg"])
    d = ImageDraw.Draw(img)

    # ---- header -------------------------------------------------------------
    d.text((MARGIN, 54 * S), "Chess Repertoire — development workflow", font=F_TITLE, fill=COL["text"])
    span = f"{len(items)} commits · {blocks[0][3]:%d %b} → {items[0]['when']:%d %b %Y} · Next.js 15 · Stockfish 19 · Prisma / SQLite"
    d.text((MARGIN, 118 * S), span, font=F_SUB, fill=COL["muted"])

    chips = [
        f"{n_files} TS/TSX files",
        f"{n_lines:,} lines",
        "16 lessons",
        "30,006 puzzles",
        "3,865 openings",
    ]
    x = MARGIN
    for chip in chips:
        w = d.textlength(chip, font=F_META) + 26 * S
        d.rounded_rectangle([x, 158 * S, x + w, 196 * S], radius=8 * S, fill=COL["panel"], outline=COL["line"], width=S)
        d.text((x + 13 * S, 166 * S), chip, font=F_META, fill=COL["muted"])
        x += w + 10 * S

    d.text((W - MARGIN, 160 * S), f"updated {now}", font=F_META, fill=COL["muted"], anchor="ra")

    # ---- phases -------------------------------------------------------------
    y = header_h
    for i, (code, title, goal, start, end, rows, height) in enumerate(blocks):
        d.rounded_rectangle(
            [MARGIN, y, W - MARGIN, y + height],
            radius=16 * S,
            fill=COL["panel"],
            outline=COL["line"],
            width=S,
        )
        # code badge
        d.rounded_rectangle(
            [MARGIN + 24 * S, y + 22 * S, MARGIN + 78 * S, y + 70 * S],
            radius=10 * S,
            fill=COL["accent_dim"] if rows else COL["panel2"],
        )
        d.text((MARGIN + 51 * S, y + 46 * S), code, font=font(BOLD, 20), fill="#0b0d0f", anchor="mm")

        d.text((MARGIN + 96 * S, y + 20 * S), title, font=F_PHASE, fill=COL["text"])
        d.text((MARGIN + 96 * S, y + 58 * S), goal, font=F_GOAL, fill=COL["muted"])

        label = "no commits in this window"
        if rows:
            first, last = rows[-1]["when"], rows[0]["when"]
            label = f"{first:%d %b %H:%M} → {last:%d %b %H:%M}" if first != last else f"{first:%d %b %H:%M}"
            label += f"  ·  {len(rows)} commit{'s' if len(rows) > 1 else ''}"
        d.text((W - MARGIN - 28 * S, y + 30 * S), label, font=F_META, fill=COL["muted"], anchor="ra")

        # commit rows (chronological, oldest first)
        for j, c in enumerate(list(reversed(rows))):
            ry = y + phase_head + j * row_h
            if j > 0:
                d.line([(MARGIN + 96 * S, ry - 6 * S), (W - MARGIN - 28 * S, ry - 6 * S)], fill=COL["line"], width=S)
            d.text((MARGIN + 96 * S, ry + 8 * S), f"{c['when']:%d %b %H:%M}", font=F_TIME, fill=COL["accent"])
            d.text((MARGIN + 232 * S, ry + 6 * S), fit(d, strip_prefix(c["subject"]), F_SUBJECT, (W - 2 * MARGIN - 232 * S - 76 * S)), font=F_SUBJECT, fill=COL["text"])
            d.text((W - MARGIN - 28 * S, ry + 10 * S), c["hash"], font=F_HASH, fill=COL["muted"], anchor="ra")

        y += height

        # connector arrow
        if i <= len(blocks) - 1:
            cx = MARGIN + 51 * S
            d.line([(cx, y + 6 * S), (cx, y + gap - 12 * S)], fill=COL["accent_dim"], width=3 * S)
            d.polygon(
                [(cx - 7 * S, y + gap - 15 * S), (cx + 7 * S, y + gap - 15 * S), (cx, y + gap - 2 * S)],
                fill=COL["accent_dim"],
            )
            y += gap

    # ---- planned ------------------------------------------------------------
    dashed_rect(d, [MARGIN, y, W - MARGIN, y + plan_h], 16 * S, COL["line"])
    d.text((MARGIN + 28 * S, y + 24 * S), "05  Commerce — the shelf people pay for", font=F_PHASE, fill=COL["accent"])
    plan_text = (
        "Accounts and Stripe checkout sitting on the entitlement flag that already gates the Pro chapters (chess.learn.v2.pro). "
        "Everything above this line is free to play; the paywall exists, only the billing is missing."
    )
    for k, line in enumerate(wrap(d, plan_text, F_PLAN, W - 2 * MARGIN - 56 * S)):
        d.text((MARGIN + 28 * S, y + 64 * S + k * 30 * S), line, font=F_PLAN, fill=COL["muted"])

    # ---- footer -------------------------------------------------------------
    fy = y + plan_h + 24 * S
    d.text((MARGIN, fy), "source: git log · regenerated by scripts/dev-timeline.py · run daily and after every milestone commit", font=F_FOOT, fill=COL["muted"])
    d.text((W - MARGIN, fy), f"{len(items)} commits since 18 Nov 2026", font=F_FOOT, fill=COL["muted"], anchor="ra")

    img = img.resize((W // S, total // S), Image.LANCZOS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, optimize=True)
    print(f"wrote {OUT.relative_to(ROOT)}  {img.width}x{img.height}")


if __name__ == "__main__":
    main()
