import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Use",
  description:
    "Terms for using Cineboxd, including data accuracy, third-party links, and acceptable use.",
};

export default function TermsPage() {
  return (
    <div className="flex-1">
      <main className="max-w-3xl mx-auto px-4 py-12 space-y-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Terms of Use</h1>
          <p className="text-xs text-muted">Last updated: 2026-02-28</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">A) Overview</h2>
          <div className="space-y-2 text-sm text-muted leading-relaxed">
            <p>
              Cineboxd is an independent, free discovery tool.
            </p>
            <p>
              It cross-references Letterboxd watchlists and CSV uploads against
              London cinema listings so you can find screenings of films you
              already want to watch.
            </p>
            <p>
              Cineboxd is not affiliated with Letterboxd, TMDB, or any cinemas.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">B) Accuracy and booking</h2>
          <div className="space-y-2 text-sm text-muted leading-relaxed">
            <p>
              Screening data can be incomplete, delayed, or incorrect.
            </p>
            <p>
              You should always confirm details on the venue&apos;s official site
              before booking tickets or travelling.
            </p>
            <p>
              Cineboxd is not responsible for losses caused by incorrect
              listings, including travel costs, missed screenings, or similar
              expenses.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">C) Third-party services and links</h2>
          <div className="space-y-2 text-sm text-muted leading-relaxed">
            <p>
              Cineboxd links to third-party services such as cinema websites,
              Letterboxd, IMDb, and TMDB.
            </p>
            <p>
              Those services operate under their own terms and privacy policies.
              Cineboxd does not control their content, uptime, or availability.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">D) Availability and changes</h2>
          <div className="space-y-2 text-sm text-muted leading-relaxed">
            <p>
              Cineboxd may be updated, changed, or taken offline at any time.
            </p>
            <p>
              Supported venues can be added or removed, and scrapers may be
              temporarily disabled when they break.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">E) Acceptable use</h2>
          <div className="space-y-2 text-sm text-muted leading-relaxed">
            <p>Do not abuse the service. In particular:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Do not scrape Cineboxd with automated tools.</li>
              <li>Do not attempt to bypass rate limits or access controls.</li>
              <li>Do not interfere with the site&apos;s normal operation.</li>
              <li>Do not use Cineboxd for unlawful activity.</li>
            </ul>
            <p>
              Access may be blocked if usage harms the service or other users.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">F) Intellectual property</h2>
          <div className="space-y-2 text-sm text-muted leading-relaxed">
            <p>
              Cineboxd code and original content belong to Cineboxd, unless
              stated otherwise, or are used under licence.
            </p>
            <p>
              Third-party trademarks and content belong to their respective
              owners.
            </p>
            <p>
              Posters and film metadata may be sourced from TMDB where
              available, with attribution where appropriate.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">G) Privacy</h2>
          <div className="space-y-2 text-sm text-muted leading-relaxed">
            <p>
              For details on how data is handled, see the{" "}
              <Link href="/privacy" className="underline hover:text-foreground">
                Privacy page
              </Link>
              .
            </p>
            <p>
              At a high level, Cineboxd uses limited browser storage for
              preferences such as postcode settings.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">H) Contact</h2>
          <div className="space-y-2 text-sm text-muted leading-relaxed">
            <p>
              For issues or questions, contact{" "}
              <a
                href="mailto:support@cineboxd.com"
                className="underline hover:text-foreground"
              >
                support@cineboxd.com
              </a>
              .
            </p>
            <p>
              You can also use the{" "}
              <Link href="/contact" className="underline hover:text-foreground">
                Contact page
              </Link>
              .
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">I) Governing law</h2>
          <div className="space-y-2 text-sm text-muted leading-relaxed">
            <p>
              These terms are governed by the laws of England and Wales.
            </p>
            <p>
              Any disputes are subject to the courts of England and Wales.
            </p>
          </div>
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
