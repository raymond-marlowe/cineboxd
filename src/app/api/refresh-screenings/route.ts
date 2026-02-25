import { NextRequest, NextResponse } from "next/server";
import { scrapeAllWithBreakdown } from "@/scrapers";
import { redis, SCREENINGS_KEY, SCREENINGS_UPDATED_KEY } from "@/lib/redis";
import { Screening } from "@/lib/types";
import { clearCache } from "@/lib/cache";

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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Cooldown: skip if last scrape was less than 30 minutes ago.
  // Bypass with ?force=1 (e.g. after deploying a new scraper).
  const force = new URL(request.url).searchParams.get("force") === "1";
  const lastUpdated = await redis.get<string>(SCREENINGS_UPDATED_KEY);
  if (!force && lastUpdated) {
    const ageMs = Date.now() - new Date(lastUpdated).getTime();
    if (ageMs < 30 * 60 * 1000) {
      return NextResponse.json({ skipped: true, reason: "cooldown", updatedAt: lastUpdated });
    }
  }

  // Bust in-process scraper caches so force=1 always re-fetches live data.
  if (force) clearCache();

  try {
    const { screenings, breakdown } = await scrapeAllWithBreakdown();
    const updatedAt = new Date().toISOString();

    // Log per-scraper counts to server console.
    for (const b of breakdown) {
      if (b.error) {
        console.error(`[refresh-screenings] ${b.name}: ERROR — ${b.error}`);
      } else {
        console.log(`[refresh-screenings] ${b.name}: ${b.count}`);
      }
    }
    console.log(`[refresh-screenings] total: ${screenings.length}`);

    await Promise.all([
      redis.set(SCREENINGS_KEY, screenings, { ex: TTL_24H }),
      redis.set(SCREENINGS_UPDATED_KEY, updatedAt),
    ]);

    const isDev = process.env.NODE_ENV === "development";
    return NextResponse.json({
      success: true,
      count: screenings.length,
      updatedAt,
      ...(isDev ? { breakdown } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("refresh-screenings error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
