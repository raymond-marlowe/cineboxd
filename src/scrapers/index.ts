import { Screening } from "@/lib/types";
import { scrapePrinceCharles } from "./prince-charles";
import { scrapeCloseUp } from "./close-up";
import { scrapeICA } from "./ica";
import { scrapeBarbican } from "./barbican";
import { scrapeRio } from "./rio";

// TODO: Picturehouse scraper disabled — API data did not reliably match website listings.
// See picturehouse.ts for details on re-enabling.

// TODO: Everyman Cinema — no scraper implemented. The site (everymancinema.com) uses Gatsby
// with client-side rendering; showtimes are loaded via internal APIs that would need
// reverse-engineering. Not reliably scrapable with simple HTML fetching.

export type Scraper = () => Promise<Screening[]>;

export const scrapers: Scraper[] = [
  scrapePrinceCharles,
  scrapeCloseUp,
  scrapeICA,
  scrapeBarbican,
  scrapeRio,
];

export async function scrapeAll(): Promise<Screening[]> {
  const results = await Promise.allSettled(scrapers.map((s) => s()));
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}
