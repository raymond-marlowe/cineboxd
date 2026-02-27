import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { redis, SCREENINGS_KEY } from "@/lib/redis";
import { Screening } from "@/lib/types";
import { slugToVenueName } from "@/lib/venue-slug";
import { fetchFilmMetadata } from "@/lib/tmdb";
import VenueDistanceBadge from "./VenueDistanceBadge";

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const venue = slugToVenueName(slug);
  return {
    title: venue ? `${venue} — Cineboxd` : "Venue — Cineboxd",
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDateLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function VenuePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const venue = slugToVenueName(slug);
  if (!venue) notFound();

  // Fetch and filter screenings server-side
  const allScreenings = (await redis.get<Screening[]>(SCREENINGS_KEY)) ?? [];
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD

  const screenings = allScreenings
    .filter((s) => s.venue === venue && s.date >= today)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  // Group by date
  const byDate = new Map<string, Screening[]>();
  for (const s of screenings) {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date)!.push(s);
  }
  const dates = [...byDate.keys()];

  // Fetch TMDB posters for the first 30 unique titles
  const seen = new Set<string>();
  const uniqueTitles: { title: string; year: number | null }[] = [];
  for (const s of screenings) {
    if (!seen.has(s.title) && uniqueTitles.length < 30) {
      seen.add(s.title);
      uniqueTitles.push({ title: s.title, year: s.year });
    }
  }
  const metadataList = await Promise.all(
    uniqueTitles.map(({ title, year }) => fetchFilmMetadata(title, year))
  );
  const posterMap: Record<string, string> = {};
  for (let i = 0; i < uniqueTitles.length; i++) {
    const path = metadataList[i].posterPath;
    if (path) posterMap[uniqueTitles[i].title] = path;
  }

  return (
    <div className="flex-1">
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{venue}</h1>
            <p className="text-sm text-muted mt-0.5">
              {screenings.length === 0
                ? "No upcoming screenings found"
                : `${screenings.length} upcoming screening${screenings.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <VenueDistanceBadge venue={venue} />
        </div>

        {/* ── Screenings by date ── */}
        {dates.length === 0 ? (
          <p className="text-muted text-sm py-4">
            No screenings found. Check back after the next daily refresh.
          </p>
        ) : (
          <div className="space-y-7">
            {dates.map((date) => (
              <section key={date}>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted pb-2 mb-1 border-b border-border">
                  {fmtDateLong(date)}
                </h2>
                <ul className="space-y-2.5">
                  {byDate.get(date)!.map((s, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-3 text-sm py-0.5"
                    >
                      <span className="w-11 shrink-0 tabular-nums text-muted text-xs">
                        {s.time}
                      </span>
                      <span className="shrink-0 w-5 flex items-center">
                        {posterMap[s.title] ? (
                          <Image
                            src={`https://image.tmdb.org/t/p/w92${posterMap[s.title]}`}
                            alt=""
                            width={20}
                            height={30}
                            className="rounded-sm object-cover"
                          />
                        ) : (
                          <span className="inline-block w-5 h-[30px] rounded-sm bg-white/5" />
                        )}
                      </span>
                      <span className="flex-1 text-foreground leading-snug">
                        {s.title}
                        {s.year ? (
                          <span className="text-muted/60 text-xs ml-1.5">
                            ({s.year})
                          </span>
                        ) : null}
                      </span>
                      {s.format && (
                        <span className="shrink-0 text-xs text-muted/70 hidden sm:inline">
                          {s.format}
                        </span>
                      )}
                      {s.bookingUrl ? (
                        <a
                          href={s.bookingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-xs text-accent hover:underline"
                        >
                          Book →
                        </a>
                      ) : (
                        <span className="shrink-0 text-xs text-muted/50">—</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {/* ── Back link ── */}
        <Link
          href="/whats-on"
          className="inline-block text-accent hover:underline text-sm"
        >
          &larr; All venues
        </Link>
      </main>
    </div>
  );
}
