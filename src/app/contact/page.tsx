import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "How to contact Cineboxd for support, bug reports, and venue corrections.",
};

const supportEmail = "support@cineboxd.com";

const mailtoHref =
  "mailto:support@cineboxd.com?subject=Cineboxd%20support&body=Hi%20Cineboxd%2C%0A%0APlease%20share%3A%0A-%20Venue%0A-%20Film%20title%0A-%20Date%2Ftime%0A-%20What%20you%20expected%20vs%20what%20you%20saw%0A-%20Venue%20URL%0A%0AThanks.";

export default function ContactPage() {
  return (
    <div className="flex-1">
      <main className="max-w-3xl mx-auto px-4 py-12 space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Contact</h1>
          <p className="text-sm text-muted leading-relaxed">
            This is the best place to report bugs, missing screenings,
            incorrect times, wrong matches, and venue suggestions.
          </p>
        </div>

        <section className="rounded-lg border border-border bg-white/5 px-5 py-5 space-y-3">
          <p className="text-sm text-muted">Email</p>
          <p className="text-xl font-semibold tracking-tight text-foreground break-all">
            {supportEmail}
          </p>
          <a
            href={mailtoHref}
            className="inline-flex items-center rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            Email support
          </a>
        </section>

        <p className="text-sm text-muted leading-relaxed">
          Cineboxd is a hobby project. Messages are read and acted on, but
          replies can take a little while.
        </p>

        <Link
          href="/"
          className="inline-block text-accent hover:underline text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded-sm"
        >
          &larr; Back to home
        </Link>
      </main>
    </div>
  );
}
