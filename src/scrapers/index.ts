import { Screening } from "@/lib/types";
import { flagState, isEnabled } from "@/lib/feature-flags";
import { scrapePrinceCharles } from "./prince-charles";
import { scrapeCloseUp } from "./close-up";
import { scrapeICA } from "./ica";
import { scrapeBarbican } from "./barbican";
import { scrapeRio } from "./rio";
import { scrapeGenesis } from "./genesis";
import { scrapeArthousCrouchEnd } from "./arthouse-crouch-end";
import { scrapeActOne } from "./act-one";
import { scrapePhoenix } from "./phoenix";
import { scrapeLexi } from "./lexi";
import { scrapeGarden } from "./garden";
import { scrapeRegentStreet } from "./regent-street";
import { scrapeRichMix } from "./rich-mix";
import { scrapeJW3 } from "./jw3";
import { scrapeCurzonVeezi } from "./curzon-veezi";
import { scrapeCurzonOcapi } from "./curzon-ocapi";
import { scrapePicturehouse } from "./picturehouse";
import { scrapeEveryman } from "./everyman";
import { scrapeBFISouthbank } from "./bfi-southbank";
import { scrapeCineLumiere } from "./cine-lumiere";
import { scrapeArzner } from "./arzner";
import { scrapeNickel } from "./nickel";
import { scrapeCastleCinema } from "./castle-cinema";
import { scrapeColdharbourBlue } from "./coldharbour-blue";
import { scrapePeckhamplex } from "./peckhamplex";
import { scrapeOlympicCinema } from "./olympic-cinema";
import { scrapeChiswickCinema } from "./chiswick-cinema";

export type Scraper = () => Promise<Screening[]>;

export interface ScrapeBreakdown {
  name: string;
  count: number;
  durationMs: number;
  error?: string;
  sample?: string;          // first title seen — quick sanity-check in prod responses
  disabled?: boolean;       // true when the scraper was skipped (flag off or required env absent)
  disabledReason?: string;  // human-readable explanation of why disabled
}

// Hard ceiling per scraper: prevents a single hung scraper (e.g. olympic-cinema
// crawling 600 URLs, chiswick fetching 60 movie pages) from keeping the Vercel
// function alive past its platform timeout and blocking the Redis write.
const SCRAPER_TIMEOUT_MS = 25_000;

/**
 * Runs a scraper with a hard timeout.  Never rejects — errors are returned
 * as { screenings: [], error } so Promise.all on the outer loop is safe.
 */
async function runWithTimeout(
  fn: Scraper,
  timeoutMs: number
): Promise<{ screenings: Screening[]; durationMs: number; error?: string }> {
  const start = Date.now();
  try {
    const screenings = await Promise.race<Screening[]>([
      fn(),
      new Promise<Screening[]>((_, reject) =>
        setTimeout(
          () => reject(new Error(`timed out after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);
    return { screenings, durationMs: Date.now() - start };
  } catch (err) {
    return {
      screenings: [],
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// envFlag:     opt-in feature flag — env var must be truthy ("true"/"1"/etc.)
// envRequired: required credential/config — env var must be any non-empty string
// scrapeAllWithBreakdown checks both before calling the scraper so /status can
// show a clear disabled reason instead of an ambiguous count=0.
const namedScrapers: {
  name: string;
  fn: Scraper;
  envFlag?: string;      // e.g. "ENABLE_CURZON_OCAPI"
  envRequired?: string;  // e.g. "BFI_CF_CLEARANCE"
}[] = [
  { name: "prince-charles",      fn: scrapePrinceCharles },
  { name: "close-up",            fn: scrapeCloseUp },
  { name: "ica",                 fn: scrapeICA },
  { name: "barbican",            fn: scrapeBarbican },
  { name: "rio",                 fn: scrapeRio },
  { name: "genesis",             fn: scrapeGenesis },
  { name: "arthouse-crouch-end", fn: scrapeArthousCrouchEnd },
  { name: "act-one",             fn: scrapeActOne },
  { name: "phoenix",             fn: scrapePhoenix },
  { name: "lexi",                fn: scrapeLexi },
  { name: "garden",              fn: scrapeGarden },
  { name: "regent-street",       fn: scrapeRegentStreet },
  { name: "rich-mix",            fn: scrapeRichMix },
  { name: "jw3",                 fn: scrapeJW3 },
  { name: "curzon-veezi",        fn: scrapeCurzonVeezi },
  { name: "curzon-ocapi",        fn: scrapeCurzonOcapi,  envFlag:     "ENABLE_CURZON_OCAPI" },
  { name: "picturehouse",        fn: scrapePicturehouse, envFlag:     "ENABLE_PICTUREHOUSE" },
  { name: "everyman",            fn: scrapeEveryman,     envFlag:     "ENABLE_EVERYMAN" },
  { name: "bfi-southbank",       fn: scrapeBFISouthbank, envRequired: "BFI_CF_CLEARANCE" },
  { name: "cine-lumiere",        fn: scrapeCineLumiere },
  { name: "arzner",              fn: scrapeArzner },
  { name: "nickel",              fn: scrapeNickel },
  { name: "castle-cinema",       fn: scrapeCastleCinema },
  { name: "coldharbour-blue",    fn: scrapeColdharbourBlue },
  { name: "peckhamplex",         fn: scrapePeckhamplex },
  { name: "olympic-cinema",      fn: scrapeOlympicCinema },
  { name: "chiswick-cinema",     fn: scrapeChiswickCinema },
];

// Keep the flat array for any callers that still use it.
export const scrapers: Scraper[] = namedScrapers.map((s) => s.fn);

export async function scrapeAllWithBreakdown(): Promise<{ screenings: Screening[]; breakdown: ScrapeBreakdown[] }> {
  // Partition scrapers: disabled ones are recorded in the breakdown immediately
  // so /status can show a clear disabled reason instead of an ambiguous count=0.
  // Enabled scrapers run concurrently.
  const enabledEntries: typeof namedScrapers = [];
  const breakdown: ScrapeBreakdown[] = new Array(namedScrapers.length) as ScrapeBreakdown[];

  for (let i = 0; i < namedScrapers.length; i++) {
    const { name, fn, envFlag, envRequired } = namedScrapers[i];

    if (envFlag) {
      const state = flagState(envFlag);
      if (state !== "enabled") {
        const disabledReason =
          state === "disabled_unset"
            ? `${envFlag} is not set — add to env as ${envFlag}=true`
            : `${envFlag}="${process.env[envFlag]}" is not truthy — use "true"/"1"/"yes"/"on"`;
        breakdown[i] = { name, count: 0, durationMs: 0, disabled: true, disabledReason };
        continue;
      }
    }

    if (envRequired && !process.env[envRequired]?.trim()) {
      breakdown[i] = {
        name, count: 0, durationMs: 0, disabled: true,
        disabledReason: `${envRequired} is not set (see scraper file for setup instructions)`,
      };
      continue;
    }

    enabledEntries.push({ name, fn, envFlag, envRequired });
  }

  // Run enabled scrapers concurrently; each is individually capped at SCRAPER_TIMEOUT_MS.
  // runWithTimeout never rejects, so Promise.all is safe here.
  const results = await Promise.all(
    enabledEntries.map(({ fn }) => runWithTimeout(fn, SCRAPER_TIMEOUT_MS))
  );

  // Merge enabled results back into the pre-allocated breakdown array.
  let enabledIdx = 0;
  const screenings: Screening[] = [];
  for (let i = 0; i < namedScrapers.length; i++) {
    if (breakdown[i]) continue; // already filled (disabled)
    const { screenings: scraped, durationMs, error } = results[enabledIdx++];
    const { name } = namedScrapers[i];
    breakdown[i] = {
      name,
      count: scraped.length,
      durationMs,
      ...(error ? { error } : {}),
      ...(scraped[0] ? { sample: scraped[0].title } : {}),
    };
    screenings.push(...scraped);
  }

  return { screenings, breakdown };
}

export async function scrapeAll(): Promise<Screening[]> {
  const { screenings } = await scrapeAllWithBreakdown();
  return screenings;
}
