import type { ScrapeBreakdown } from "@/scrapers";
import {
  IS_REDIS_CONFIGURED,
  SCRAPERS_BREAKDOWN_KEY,
  SCRAPERS_BREAKDOWN_UPDATED_KEY,
  SCREENINGS_UPDATED_KEY,
  redis,
} from "@/lib/redis";

export interface ScraperStatusSnapshot {
  updatedAt: string | null;
  breakdown: ScrapeBreakdown[] | null;
  note?: string;
}

function parseBreakdown(raw: unknown): ScrapeBreakdown[] | null {
  if (!raw) return null;

  if (Array.isArray(raw)) {
    return raw as ScrapeBreakdown[];
  }

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ScrapeBreakdown[]) : null;
    } catch {
      return null;
    }
  }

  return null;
}

export async function getScraperStatusSnapshot(): Promise<ScraperStatusSnapshot> {
  if (!IS_REDIS_CONFIGURED) {
    return {
      updatedAt: null,
      breakdown: null,
      note: "Redis is not configured for this environment.",
    };
  }

  try {
    const [statusUpdatedAt, screeningsUpdatedAt, rawBreakdown] = await Promise.all([
      redis.get<string>(SCRAPERS_BREAKDOWN_UPDATED_KEY),
      redis.get<string>(SCREENINGS_UPDATED_KEY),
      redis.get<unknown>(SCRAPERS_BREAKDOWN_KEY),
    ]);

    const breakdown = parseBreakdown(rawBreakdown);
    const updatedAt = statusUpdatedAt ?? screeningsUpdatedAt ?? null;

    if (!breakdown || breakdown.length === 0) {
      return {
        updatedAt,
        breakdown: null,
        note: "No scraper status data yet. Run a refresh first.",
      };
    }

    return { updatedAt, breakdown };
  } catch {
    return {
      updatedAt: null,
      breakdown: null,
      note: "Status data is currently unavailable.",
    };
  }
}
