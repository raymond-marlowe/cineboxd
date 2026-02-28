import type { ScrapeBreakdown } from "@/scrapers";
import { isEnabled } from "@/lib/feature-flags";
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
  /** Server-side flag state at time of request — never bundled into client JS. */
  flags?: {
    curzonOcapi: boolean;
    picturehouse: boolean;
    everyman: boolean;
  };
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

    const flags = {
      curzonOcapi: isEnabled("ENABLE_CURZON_OCAPI"),
      picturehouse: isEnabled("ENABLE_PICTUREHOUSE"),
      everyman: isEnabled("ENABLE_EVERYMAN"),
    };

    return { updatedAt, breakdown, flags };
  } catch {
    return {
      updatedAt: null,
      breakdown: null,
      note: "Status data is currently unavailable.",
    };
  }
}
