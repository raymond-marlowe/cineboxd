import type { Metadata } from "next";
import Link from "next/link";
import { SUGGEST_CINEMA_FORM_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "FAQ | Cineboxd",
  description:
    "Answers to common Cineboxd questions about matching, scraper limitations, watchlists, CSV uploads, and venue coverage.",
};

const faqs = [
  {
    question: "What does Cineboxd do?",
    answer: (
      <p>
        Cineboxd cross-references your Letterboxd watchlist (or a CSV export)
        against upcoming London cinema screenings, so you can see what you
        already want to watch that&apos;s playing soon.
      </p>
    ),
  },
  {
    question: "Where does the screening data come from?",
    answer: (
      <p>
        Listings are collected from cinema websites (mostly via web scraping).
        That means the data can occasionally be incomplete, delayed, or wrong
        if a venue changes their site or a listing is updated.
      </p>
    ),
  },
  {
    question: "Should I trust the screening times here?",
    answer: (
      <p>
        Treat Cineboxd as a discovery tool, not the final authority. Always
        click through and confirm on the venue&apos;s site before booking,
        especially for one-off events and late programme updates.
      </p>
    ),
  },
  {
    question: "Why is a film I know is showing not appearing?",
    answer: (
      <>
        <p>Common reasons:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>The venue&apos;s site changed and the scraper is temporarily broken.</li>
          <li>
            The film title on the venue site differs (punctuation, subtitles,
            alternate titles).
          </li>
          <li>Your watchlist entry and the listing don&apos;t match closely enough.</li>
          <li>
            The listing is very new and hasn&apos;t been picked up by the latest
            refresh yet.
          </li>
        </ul>
        <p className="mt-2">
          If it still looks wrong, send the details to{" "}
          <a
            href="mailto:support@cineboxd.com"
            className="underline hover:text-foreground"
          >
            support@cineboxd.com
          </a>
          .
        </p>
      </>
    ),
  },
  {
    question: "Why are there duplicates or slightly odd title matches?",
    answer: (
      <p>
        Matching is fuzzy by design. Cinemas don&apos;t share a universal title ID,
        so Cineboxd uses approximate title matching and (when available) TMDB
        metadata. Sometimes that produces near-duplicates or false
        positives, especially for films with common titles, re-releases, or
        alternate spellings.
      </p>
    ),
  },
  {
    question: "Does my Letterboxd watchlist need to be public?",
    answer: (
      <p>
        Yes. Cineboxd reads the watchlist via Letterboxd&apos;s RSS feed. If your
        profile or watchlist is private, Cineboxd can&apos;t fetch it.
      </p>
    ),
  },
  {
    question: "How does \"Watch together\" work?",
    answer: (
      <p>
        You can enter 2-5 Letterboxd usernames and Cineboxd computes the
        intersection (and/or overlap) of watchlists, then shows screenings of
        films you all (or most of you) want to watch.
      </p>
    ),
  },
  {
    question: "What&apos;s the CSV upload mode for?",
    answer: (
      <p>
        If you don&apos;t want to use a username lookup (or your watchlist is
        private), you can upload a Letterboxd CSV export. Cineboxd will use
        that file to match screenings instead.
      </p>
    ),
  },
  {
    question: "Why do CSV share links expire?",
    answer: (
      <p>
        For privacy and practicality: uploaded data is stored temporarily and
        share links are time-limited. If you need a longer-lived link, prefer
        username-based mode.
      </p>
    ),
  },
  {
    question: "How does \"Near me\" work, and what data do you store?",
    answer: (
      <p>
        If you enter a UK postcode, Cineboxd converts it into a
        latitude/longitude (via a postcode lookup) and sorts venues by distance
        (haversine). Store only what&apos;s necessary to provide the feature
        (for example postcode and distance settings in local storage) and keep
        it clear in the <Link href="/privacy" className="underline hover:text-foreground">Privacy</Link> page.
      </p>
    ),
  },
  {
    question: "Which venues are supported?",
    answer: (
      <p>
        See the <Link href="/venues" className="underline hover:text-foreground">Supported venues</Link> page for the
        current list. Coverage changes over time as scrapers are added,
        improved, or temporarily disabled when broken.
      </p>
    ),
  },
  {
    question: "Can you add a cinema?",
    answer: (
      <p>
        Yes. Use the <a href={SUGGEST_CINEMA_FORM_URL} target="_blank" rel="noreferrer noopener" className="underline hover:text-foreground">Suggest a cinema</a>{" "}
        form and include the cinema name plus a link to their listings page. If
        you prefer email, contact{" "}
        <a
          href="mailto:support@cineboxd.com"
          className="underline hover:text-foreground"
        >
          support@cineboxd.com
        </a>
        .
      </p>
    ),
  },
  {
    question: "Why are some posters/metadata missing or incorrect?",
    answer: (
      <p>
        Metadata comes from TMDB where possible. If TMDB doesn&apos;t have a clean
        match (or a title and year is ambiguous), Cineboxd may fall back to
        minimal data.
      </p>
    ),
  },
  {
    question: "Is Cineboxd affiliated with Letterboxd, TMDB, or any cinemas?",
    answer: (
      <p>
        No. Cineboxd is an independent project and not officially affiliated
        with those services or venues.
      </p>
    ),
  },
  {
    question: "I found something wrong — what should I do?",
    answer: (
      <>
        <p>
          If a screening is incorrect or missing, email{" "}
          <a
            href="mailto:support@cineboxd.com"
            className="underline hover:text-foreground"
          >
            support@cineboxd.com
          </a>{" "}
          with:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>the venue</li>
          <li>the film title</li>
          <li>the date/time</li>
          <li>a link to the venue&apos;s listing page</li>
          <li>what you expected Cineboxd to show</li>
        </ul>
      </>
    ),
  },
] as const;

export default function FaqPage() {
  return (
    <div className="flex-1">
      <main className="max-w-3xl mx-auto px-4 py-12 space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">FAQ</h1>
          <p className="text-sm text-muted leading-relaxed">
            Straight answers to common questions about coverage, matching, and
            why cinema data can be a bit messy in the real world.
          </p>
        </div>

        <section className="space-y-3">
          {faqs.map((item) => (
            <details
              key={item.question}
              className="group rounded-lg border border-border bg-white/5 px-4 py-3"
            >
              <summary className="cursor-pointer list-none pr-6 text-base font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded-sm">
                <span>{item.question}</span>
                <span
                  aria-hidden="true"
                  className="ml-2 inline-block text-muted transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <div className="pt-3 text-sm text-muted leading-relaxed">
                {item.answer}
              </div>
            </details>
          ))}
        </section>

        <Link
          href="/"
          className="inline-block text-accent hover:underline text-sm"
        >
          &larr; Back to home
        </Link>
      </main>
    </div>
  );
}
