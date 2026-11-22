import { NextResponse } from "next/server";

import { getDuelState } from "@/lib/duels";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const state = await getDuelState(code);
  if (!state) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ state }, { headers: { "cache-control": "no-store" } });
}
