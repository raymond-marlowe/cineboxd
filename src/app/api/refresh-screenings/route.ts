import { NextRequest, NextResponse } from "next/server";
import { scrapeAll } from "@/scrapers";
import { redis, SCREENINGS_KEY, SCREENINGS_UPDATED_KEY } from "@/lib/redis";
import { Screening } from "@/lib/types";

const TTL_24H = 86400; // seconds

/** Health-check: returns cached screening count and last-updated timestamp. */
export async function GET() {
  const [updatedAt, screenings] = await Promise.all([
    redis.get<string>(SCREENINGS_UPDATED_KEY),
    redis.get<Screening[]>(SCREENINGS_KEY),
  ]);

  return NextResponse.json({
    updatedAt: updatedAt ?? null,
    count: Array.isArray(screenings) ? screenings.length : 0,
  });
}

/** Trigger a full scrape and write results to Redis. Requires Bearer auth. */
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const secret = process.env.REFRESH_SECRET;

if (!secret || auth !== `Bearer ${secret}`) {
  return NextResponse.json(
    {
      error: "Unauthorized",
      hasSecret: Boolean(secret),
      authHeaderPresent: Boolean(auth),
      authStartsWithBearer: typeof auth === "string" ? auth.startsWith("Bearer ") : false,
      // optional: length checks (still non-sensitive)
      authLength: typeof auth === "string" ? auth.length : null,
      secretLength: typeof secret === "string" ? secret.length : null,
    },
    { status: 401 }
  );
}

  const screenings = await scrapeAll();
  const updatedAt = new Date().toISOString();

  await Promise.all([
    redis.set(SCREENINGS_KEY, screenings, { ex: TTL_24H }),
    redis.set(SCREENINGS_UPDATED_KEY, updatedAt),
  ]);

  return NextResponse.json({
    success: true,
    count: screenings.length,
    updatedAt,
  });
}
