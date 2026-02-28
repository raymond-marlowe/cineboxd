import type { ScrapeBreakdown } from "@/scrapers";
import { flagState, isEnabled } from "@/lib/feature-flags";
import {
  IS_REDIS_CONFIGURED,
  SCRAPERS_BREAKDOWN_KEY,
  SCRAPERS_BREAKDOWN_UPDATED_KEY,
  SCREENINGS_UPDATED_KEY,
  redis,
} from "@/lib/redis";

/** "set_truthy" = present and truthy; "set_falsy" = present but wrong value; "missing" = not defined. */
type EnvVarState = "set_truthy" | "set_falsy" | "missing";

function toEnvVarState(key: string): EnvVarState {
  const s = flagState(key);
  if (s === "enabled") return "set_truthy";
  if (s === "disabled_false") return "set_falsy";
  return "missing";
}

function requiredEnvState(key: string): EnvVarState {
  return process.env[key]?.trim() ? "set_truthy" : "missing";
}

function liveFlags() {
  return {
    flags: {
      curzonOcapi: isEnabled("ENABLE_CURZON_OCAPI"),
      picturehouse: isEnabled("ENABLE_PICTUREHOUSE"),
      everyman: isEnabled("ENABLE_EVERYMAN"),
      bfiClearancePresent: !!process.env.BFI_CF_CLEARANCE?.trim(),
    },
    rawEnv: {
      ENABLE_CURZON_OCAPI: toEnvVarState("ENABLE_CURZON_OCAPI"),
      ENABLE_PICTUREHOUSE: toEnvVarState("ENABLE_PICTUREHOUSE"),
      ENABLE_EVERYMAN: toEnvVarState("ENABLE_EVERYMAN"),
      BFI_CF_CLEARANCE: requiredEnvState("BFI_CF_CLEARANCE"),
    },
  };
}

export interface ScraperStatusSnapshot {
  updatedAt: string | null;
  breakdown: ScrapeBreakdown[] | null;
  note?: string;
  /**
   * Current env-var state at request time (not the last-scrape state stored in Redis).
   * Lets operators compare "what was the state during the last scrape" (breakdown entries)
   * against "what is the state right now" (flags / rawEnv).
   */
  flags: {
    curzonOcapi: boolean;
    picturehouse: boolean;
    everyman: boolean;
    bfiClearancePresent: boolean;
  };
  /**
   * Whether each controlled env var is set — no values leaked.
   * "missing"    = env var not defined at all.
   * "set_falsy"  = defined but not a recognised truthy value.
   * "set_truthy" = defined and accepted.
   */
  rawEnv: {
    ENABLE_CURZON_OCAPI: EnvVarState;
    ENABLE_PICTUREHOUSE: EnvVarState;
    ENABLE_EVERYMAN: EnvVarState;
    BFI_CF_CLEARANCE: EnvVarState;
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
  const live = liveFlags();

  if (!IS_REDIS_CONFIGURED) {
    return {
      updatedAt: null,
      breakdown: null,
      note: "Redis is not configured for this environment.",
      ...live,
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
        ...live,
      };
    }

    return { updatedAt, breakdown, ...live };
  } catch {
    return {
      updatedAt: null,
      breakdown: null,
      note: "Status data is currently unavailable.",
      ...live,
    };
  }
}
