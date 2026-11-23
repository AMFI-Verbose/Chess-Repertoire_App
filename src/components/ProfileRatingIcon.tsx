import type { RatingCategory } from "@/lib/player-ratings";

const PATHS: Record<RatingCategory, React.ReactNode> = {
  bullet: <path d="M9.4 1.4 3.3 9.2h4.1l-.7 5.4 6.2-8h-4.2l.7-5.2Z" stroke="currentColor" strokeWidth="1.4" />,
  blitz: (
    <>
      <circle cx="8" cy="8.7" r="5.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 5.8v3.1l2 1.4M6.5 1.5h3" stroke="currentColor" strokeWidth="1.3" />
    </>
  ),
  rapid: (
    <>
      <circle cx="8" cy="8" r="5.8" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 4.3V8l2.6 1.7" stroke="currentColor" strokeWidth="1.3" />
    </>
  ),
  classical: (
    <>
      <path d="m2.7 5 2.6 2L8 2.8l2.7 4.2L13.3 5l-1 7.4H3.7L2.7 5Z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3.7 13.3h8.6" stroke="currentColor" strokeWidth="1.2" />
    </>
  ),
  correspondence: (
    <>
      <rect x="2" y="3.8" width="12" height="8.4" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <path d="m2.6 4.5 5.4 4 5.4-4" stroke="currentColor" strokeWidth="1.2" />
    </>
  ),
  puzzle: (
    <path d="M4 3.5h3v2a1.6 1.6 0 1 0 3.2 0v-2h2.8v3h-2a1.6 1.6 0 1 0 0 3.2h2v2.8H4v-3h2a1.6 1.6 0 1 0 0-3.2H4V3.5Z" stroke="currentColor" strokeWidth="1.1" />
  ),
};

export default function ProfileRatingIcon({
  category,
  color,
}: {
  category: RatingCategory;
  color: string;
}) {
  return (
    <span
      className="flex h-7 w-7 items-center justify-center rounded-md"
      style={{ background: `${color}16`, color }}
      aria-hidden
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        {PATHS[category]}
      </svg>
    </span>
  );
}
