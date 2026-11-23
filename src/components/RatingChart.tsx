"use client";

import { useMemo, useState } from "react";

export type RatingSeries = {
  category: string;
  label: string;
  color: string;
  points: { t: number; rating: number }[];
};

const W = 760;
const H = 276;
const PAD = { left: 50, right: 18, top: 18, bottom: 30 };
const RANGES = [
  { months: 1, label: "1M" },
  { months: 3, label: "3M" },
  { months: 12, label: "1Y" },
] as const;

function dayKey(date: Date) {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
}

function monthDay(ms: number) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(ms));
}

function valueLabel(category: string) {
  return category === "puzzle" ? "Puzzles" : category[0].toUpperCase() + category.slice(1);
}

export default function RatingChart({ series }: { series: RatingSeries[] }) {
  const [months, setMonths] = useState<1 | 3 | 12>(1);
  const [hidden, setHidden] = useState<string[]>([]);
  const [hover, setHover] = useState<{ t: number; x: number } | null>(null);

  const now = Date.now();
  const start = now - months * 30.44 * 86400000;
  const visible = series.filter((entry) => !hidden.includes(entry.category));

  const prepared = useMemo(() => {
    return visible
      .map((entry) => {
        // Daily last value keeps a 100-attempt session from becoming a scribble.
        const daily = new Map<string, number>();
        let carry: { t: number; rating: number } | null = null;
        for (const point of entry.points) {
          if (point.t < start) {
            carry = point;
            continue;
          }
          daily.set(dayKey(new Date(point.t)), point.rating);
          carry = point;
        }
        let points = Array.from(daily, ([date, rating]) => ({
          t: new Date(`${date}T23:59:00+08:00`).getTime(),
          rating,
        })).sort((a, b) => a.t - b.t);
        if (points.length === 0 && carry) points = [{ ...carry, t: start }];
        if (points.length > 0 && points[points.length - 1].t < now - 86400000) {
          points.push({ t: now, rating: points[points.length - 1].rating });
        }
        return { ...entry, points };
      })
      .filter((entry) => entry.points.length > 0);
  }, [visible, start, now]);

  const bounds = useMemo(() => {
    const values = prepared.flatMap((entry) => entry.points.map((point) => point.rating));
    const min = values.length ? Math.min(...values) : 1400;
    const max = values.length ? Math.max(...values) : 1600;
    const lower = Math.floor((min - 35) / 50) * 50;
    const upper = Math.ceil((max + 35) / 50) * 50;
    return { min: Math.max(400, lower), max: Math.max(lower + 100, upper) };
  }, [prepared]);

  const x = (t: number) =>
    PAD.left + ((t - start) / Math.max(1, now - start)) * (W - PAD.left - PAD.right);
  const y = (rating: number) =>
    PAD.top +
    ((bounds.max - rating) / Math.max(1, bounds.max - bounds.min)) *
      (H - PAD.top - PAD.bottom);

  const yTicks = Array.from({ length: 4 }, (_, index) => {
    const value = bounds.min + ((bounds.max - bounds.min) * index) / 3;
    return Math.round(value);
  }).reverse();

  const xTicks = Array.from({ length: 4 }, (_, index) => start + ((now - start) * index) / 3);

  const hoverValues = hover
    ? prepared
        .map((entry) => {
          let point: { t: number; rating: number } | null = null;
          for (const candidate of entry.points) {
            if (candidate.t <= hover.t) point = candidate;
            else break;
          }
          return point ? { ...entry, point } : null;
        })
        .filter((entry): entry is RatingSeries & { point: { t: number; rating: number } } => entry !== null)
    : [];

  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = ((event.clientX - rect.left) / rect.width) * W;
    const clamped = Math.min(W - PAD.right, Math.max(PAD.left, localX));
    const t = start + ((clamped - PAD.left) / (W - PAD.left - PAD.right)) * (now - start);
    setHover({ t, x: clamped });
  }

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">Rating history</h2>
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">
            One line per time control. Click a label to hide it.
          </p>
        </div>
        <div className="inline-flex overflow-hidden rounded-lg border border-[var(--line)]">
          {RANGES.map((range) => (
            <button
              key={range.months}
              aria-pressed={months === range.months}
              onClick={() => setMonths(range.months)}
              className={`px-2.5 py-1 text-[11px] ${
                months === range.months
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative px-2 pb-2 pt-3 sm:px-4">
        {prepared.length === 0 ? (
          <div className="flex h-[240px] items-center justify-center text-sm text-[var(--muted)]">
            Play a rated game or solve a rated puzzle to start the graph.
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full touch-none"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            role="img"
            aria-label="Rating history chart"
          >
            {yTicks.map((tick) => (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke="var(--line)"
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 8}
                  y={y(tick) + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="var(--muted)"
                >
                  {tick}
                </text>
              </g>
            ))}

            {xTicks.map((tick, index) => (
              <text
                key={`${tick}-${index}`}
                x={x(tick)}
                y={H - 9}
                textAnchor={index === 0 ? "start" : index === 3 ? "end" : "middle"}
                fontSize="10"
                fill="var(--muted)"
              >
                {monthDay(tick)}
              </text>
            ))}

            {prepared.map((entry) => {
              const path = entry.points
                .map((point, index) => `${index === 0 ? "M" : "L"} ${x(point.t).toFixed(1)} ${y(point.rating).toFixed(1)}`)
                .join(" ");
              return (
                <g key={entry.category}>
                  <path
                    d={path}
                    fill="none"
                    stroke={entry.color}
                    strokeWidth={2.1}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {entry.points.length === 1 && (
                    <circle cx={x(entry.points[0].t)} cy={y(entry.points[0].rating)} r={3.5} fill={entry.color} />
                  )}
                </g>
              );
            })}

            {hover && (
              <>
                <line
                  x1={hover.x}
                  x2={hover.x}
                  y1={PAD.top}
                  y2={H - PAD.bottom}
                  stroke="var(--muted)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.55}
                />
                {hoverValues.map((entry) => (
                  <circle
                    key={entry.category}
                    cx={x(entry.point.t)}
                    cy={y(entry.point.rating)}
                    r={3.5}
                    fill={entry.color}
                    stroke="var(--panel)"
                    strokeWidth={1.5}
                  />
                ))}
              </>
            )}
          </svg>
        )}

        {hover && hoverValues.length > 0 && (
          <div
            className="pointer-events-none absolute top-3 z-10 min-w-[130px] rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 shadow-lg"
            style={{
              left: `${Math.min(75, Math.max(2, (hover.x / W) * 100))}%`,
            }}
          >
            <p className="mb-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">
              {monthDay(hover.t)}
            </p>
            {hoverValues
              .slice()
              .sort((a, b) => b.point.rating - a.point.rating)
              .map((entry) => (
                <p key={entry.category} className="flex items-center gap-2 text-[11px]">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: entry.color }} />
                  <span className="flex-1 text-[var(--muted)]">{valueLabel(entry.category)}</span>
                  <span className="font-medium tabular-nums">{entry.point.rating}</span>
                </p>
              ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-[var(--line)] px-4 py-3">
        {series.map((entry) => {
          const active = !hidden.includes(entry.category);
          return (
            <button
              key={entry.category}
              onClick={() =>
                setHidden((current) =>
                  current.includes(entry.category)
                    ? current.filter((category) => category !== entry.category)
                    : [...current, entry.category],
                )
              }
              className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition"
              style={{
                borderColor: active ? entry.color : "var(--line)",
                color: active ? "var(--text)" : "var(--muted)",
                opacity: active ? 1 : 0.6,
              }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
              {entry.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
