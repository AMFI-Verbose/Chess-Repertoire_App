/**
 * The shop is deliberately a fixed catalogue: four things, clear prices,
 * real product photography. Orders are stored server-side; no card is charged
 * until a payment provider is wired in.
 */
export type Product = {
  slug: string;
  name: string;
  priceCents: number;
  blurb: string;
  description: string;
  image: string;
  sizes: string[];
  accent: string;
};

export const PRODUCTS: Product[] = [
  {
    slug: "knight-tee",
    name: "Knight tee",
    priceCents: 2800,
    blurb: "Heavy cotton, small knight on the chest.",
    description:
      "A cream 240 gsm cotton tee with a single green knight. Quiet enough for a tournament hall, comfortable enough to lose in.",
    image: "/store/tee.jpg",
    sizes: ["S", "M", "L", "XL", "XXL"],
    accent: "#629924",
  },
  {
    slug: "club-hoodie",
    name: "Club hoodie",
    priceCents: 5400,
    blurb: "Forest green, embroidered knight.",
    description:
      "Brushed-back fleece with an embroidered cream knight, a roomy hood and a front pocket that fits a scorebook.",
    image: "/store/hoodie.jpg",
    sizes: ["S", "M", "L", "XL", "XXL"],
    accent: "#2f5d3a",
  },
  {
    slug: "knight-mug",
    name: "Knight mug",
    priceCents: 1800,
    blurb: "Ceramic, dishwasher safe, 350 ml.",
    description:
      "White ceramic with a green laurel knight. Holds a strong coffee for the last round of a Swiss.",
    image: "/store/mug.jpg",
    sizes: ["350 ml"],
    accent: "#3b5d2c",
  },
  {
    slug: "board-tote",
    name: "Board tote",
    priceCents: 2400,
    blurb: "Canvas tote that carries a folded board.",
    description:
      "Heavy cream canvas with leather handles and a green knight badge. Wide enough for a roll-up board and a clock.",
    image: "/store/tote.jpg",
    sizes: ["One size"],
    accent: "#6b5535",
  },
];

export function productBySlug(slug: string) {
  return PRODUCTS.find((product) => product.slug === slug) ?? null;
}

export function usd(cents: number) {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export type OrderLine = {
  slug: string;
  name: string;
  size: string;
  qty: number;
  priceCents: number;
};
