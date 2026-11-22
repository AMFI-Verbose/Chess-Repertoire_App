"use server";

import { redirect } from "next/navigation";

import { productBySlug, type OrderLine } from "@/lib/products";
import { prisma } from "@/lib/prisma";

export async function buyProductAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const product = productBySlug(slug);
  if (!product) redirect("/store?error=product");

  const size = String(formData.get("size") ?? "");
  if (!product.sizes.includes(size)) redirect(`/store/${slug}?error=size`);

  const qty = Math.max(1, Math.min(5, Math.round(Number(formData.get("qty") ?? 1))));
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const email = String(formData.get("email") ?? "").trim().slice(0, 120);
  if (name.length < 2) redirect(`/store/${slug}?error=name`);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect(`/store/${slug}?error=email`);

  const line: OrderLine = {
    slug: product.slug,
    name: product.name,
    size,
    qty,
    priceCents: product.priceCents,
  };

  const order = await prisma.swagOrder.create({
    data: {
      name,
      email,
      items: [line],
      totalCents: product.priceCents * qty,
    },
    select: { id: true },
  });

  redirect(`/store/order/${order.id}`);
}
