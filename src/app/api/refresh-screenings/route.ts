import { NextRequest, NextResponse } from "next/server";
import { scrapeAllWithBreakdown } from "@/scrapers";
import {
  IS_REDIS_CONFIGURED,
  SCRAPERS_BREAKDOWN_KEY,
  SCRAPERS_BREAKDOWN_UPDATED_KEY,
  SCREENINGS_KEY,
  SCREENINGS_UPDATED_KEY,
  redis,
} from "@/lib/redis";
import { Screening } from "@/lib/types";
import { clearCache } from "@/lib/cache";

const TTL_24H = 86400; // seconds

// If a new scrape returns fewer than this fraction of the previously cached
// count, assume something went badly wrong (e.g. Vercel IP-blocked by several
// scrapers) and preserve the existing cache rather than overwriting it.
// Only applies when the existing cache has >500 screenings (i.e. is known-good).
const SAFE_WRITE_THRESHOLD = 0.6;

async function writeBreakdownStatus(updatedAt: string, breakdown: unknown) {
  if (!IS_REDIS_CONFIGURED) return;

  await Promise.all([
    redis.set(SCRAPERS_BREAKDOWN_KEY, JSON.stringify(breakdown)),
    redis.set(SCRAPERS_BREAKDOWN_UPDATED_KEY, updatedAt),
  ]);
}

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

  const totalStart = Date.now();

  try {
    // Read existing cache size BEFORE scraping so we can guard against
    // accidentally overwriting a good cache with a degraded partial result.
    const existingScreenings = await redis.get<Screening[]>(SCREENINGS_KEY);
    const existingCount = Array.isArray(existingScreenings) ? existingScreenings.length : 0;

    const { screenings, breakdown } = await scrapeAllWithBreakdown();
    const totalDurationMs = Date.now() - totalStart;
    const updatedAt = new Date().toISOString();

    // Log per-scraper results (always — visible in Vercel function logs).
    for (const b of breakdown) {
      if (b.error) {
        console.error(
          `[refresh] ${b.name}: ERROR (${b.durationMs}ms) — ${b.error}`
        );
      } else {
        console.log(
          `[refresh] ${b.name}: ${b.count} (${b.durationMs}ms)${b.sample ? ` e.g. "${b.sample}"` : ""}`
        );
      }
    }
    console.log(
      `[refresh] total: ${screenings.length} in ${totalDurationMs}ms (existing cache: ${existingCount})`
    );

    const buildId =
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ??
      process.env.VERCEL_DEPLOYMENT_ID ??
      "local";

    // Safe-write guard: if the new result is dramatically smaller than the
    // existing good cache, preserve the cache and return a warning.
    // Skipped when existing cache is empty/tiny (cold start or first deploy).
    const isDegraded =
      existingCount > 500 &&
      screenings.length < existingCount * SAFE_WRITE_THRESHOLD;

    if (isDegraded) {
      console.error(
        `[refresh] DEGRADED — new=${screenings.length} existing=${existingCount}: preserving existing cache`
      );
      await writeBreakdownStatus(updatedAt, breakdown);
      return NextResponse.json({
        success: false,
        reason: "degraded — existing cache preserved",
        newCount: screenings.length,
        existingCount,
        totalDurationMs,
        buildId,
        updatedAt,
        breakdown,
      });
    }

    await Promise.all([
      redis.set(SCREENINGS_KEY, screenings, { ex: TTL_24H }),
      redis.set(SCREENINGS_UPDATED_KEY, updatedAt),
      writeBreakdownStatus(updatedAt, breakdown),
    ]);

    return NextResponse.json({
      success: true,
      count: screenings.length,
      updatedAt,
      totalDurationMs,
      buildId,
      breakdown,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[refresh] uncaught error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
