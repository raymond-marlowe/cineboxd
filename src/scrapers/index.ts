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
  scrapeGenesis,
  scrapeArthousCrouchEnd,
  scrapeActOne,
  scrapePhoenix,
  scrapeLexi,
  scrapeGarden,
  scrapeRegentStreet,
  scrapeRichMix,
  scrapeJW3,
];

export async function scrapeAll(): Promise<Screening[]> {
  const results = await Promise.allSettled(scrapers.map((s) => s()));
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}
