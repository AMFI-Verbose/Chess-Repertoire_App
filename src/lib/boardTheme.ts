/**
 * One palette for every board in the app.
 *
 * Colours are the Lichess defaults (light #f0d9b5 / dark #b58863). Keeping them
 * in one module means Build, Play and Review can never drift apart.
 */

export const LIGHT_SQUARE = { backgroundColor: "#f0d9b5" };
export const DARK_SQUARE = { backgroundColor: "#b58863" };

/** Highlight for the move just played — translucent so the square colour survives. */
export const LAST_MOVE = "rgba(155, 199, 0, 0.41)";

/** Translucent tint you can layer over any square. */
export function tint(color: string): string {
  return `radial-gradient(circle, ${color} 0%, ${color} 100%)`;
}

export function squareTint(color: string, alpha = 0.55): string {
  return `linear-gradient(${hexToRgba(color, alpha)}, ${hexToRgba(color, alpha)})`;
}

/** #rrggbb → rgba(r,g,b,a), so we can mix a palette colour into a highlight. */
export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function squaresOf(uci: string): string[] {
  if (uci.length < 4) return [];
  return [uci.slice(0, 2), uci.slice(2, 4)];
}
