"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Tournament times were rendered once on the server, so "24 min remaining"
 * would sit frozen while the arena actually kept running. This component keeps
 * the label honest, and flips it to "Finished" when the clock runs out.
 */
let boundaryRefreshAt = 0;

export default function LiveTime({
  start,
  end,
  initialNow,
  mode = "remaining",
}: {
  start: string;
  end: string;
  initialNow: number;
  mode?: "remaining" | "ago";
}) {
  const [now, setNow] = useState(initialNow);
  const router = useRouter();
  const refreshed = useRef(false);
  const wasLive = initialNow >= new Date(start).getTime() && initialNow < new Date(end).getTime();
  const wasUpcoming = initialNow < new Date(start).getTime();
  const startAt = new Date(start).getTime();
  const endAt = new Date(end).getTime();

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // The badge and the Pair button belong to the server-rendered status. When
  // the clock crosses start or finish, refresh once so they agree with the
  // countdown instead of saying "Live" after the arena has closed.
  useEffect(() => {
    if (refreshed.current) return;
    if ((wasLive && now >= endAt) || (wasUpcoming && now >= startAt)) {
      refreshed.current = true;
      if (now - boundaryRefreshAt > 5_000) {
        boundaryRefreshAt = now;
        router.refresh();
      }
    }
  }, [now, wasLive, wasUpcoming, startAt, endAt, router]);

  if (now < startAt) return <>starts in {formatGap(startAt - now)}</>;
  if (now < endAt) return <>{formatGap(endAt - now)} remaining</>;
  if (mode === "ago") return <>{formatAgo(now - endAt)}</>;
  return <>Finished</>;
}

function formatGap(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function formatAgo(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
