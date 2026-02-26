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
  error?: string;
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
  const results = await Promise.allSettled(namedScrapers.map((s) => s.fn()));
  const breakdown: ScrapeBreakdown[] = [];
  const screenings: Screening[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const { name } = namedScrapers[i];
    if (r.status === "fulfilled") {
      breakdown.push({ name, count: r.value.length });
      screenings.push(...r.value);
    } else {
      const error = r.reason instanceof Error ? r.reason.message : String(r.reason);
      breakdown.push({ name, count: 0, error });
    }
  }
  return { screenings, breakdown };
}

export async function scrapeAll(): Promise<Screening[]> {
  const { screenings } = await scrapeAllWithBreakdown();
  return screenings;
}
