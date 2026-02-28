import { NextResponse } from "next/server";
import { getScraperStatusSnapshot } from "@/lib/status";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getScraperStatusSnapshot();
  return NextResponse.json(snapshot);
}
