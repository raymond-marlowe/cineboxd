import { Screening } from "@/lib/types";
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
  sample?: string; // first title seen — quick sanity-check in prod responses
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

const namedScrapers: { name: string; fn: Scraper }[] = [
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
  { name: "curzon-ocapi",        fn: scrapeCurzonOcapi },
  { name: "picturehouse",        fn: scrapePicturehouse },
  { name: "everyman",            fn: scrapeEveryman },
  { name: "bfi-southbank",       fn: scrapeBFISouthbank },
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
  // All scrapers run concurrently; each is individually capped at SCRAPER_TIMEOUT_MS
  // so the overall wall time ≤ SCRAPER_TIMEOUT_MS regardless of scraper count.
  // runWithTimeout never rejects, so Promise.all is safe here.
  const results = await Promise.all(
    namedScrapers.map(({ fn }) => runWithTimeout(fn, SCRAPER_TIMEOUT_MS))
  );

  const breakdown: ScrapeBreakdown[] = [];
  const screenings: Screening[] = [];

  for (let i = 0; i < results.length; i++) {
    const { screenings: scraped, durationMs, error } = results[i];
    const { name } = namedScrapers[i];
    breakdown.push({
      name,
      count: scraped.length,
      durationMs,
      ...(error ? { error } : {}),
      ...(scraped[0] ? { sample: scraped[0].title } : {}),
    });
    screenings.push(...scraped);
  }

  return { screenings, breakdown };
}

export async function scrapeAll(): Promise<Screening[]> {
  const { screenings } = await scrapeAllWithBreakdown();
  return screenings;
}
