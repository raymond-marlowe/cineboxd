"use client";

import { useMemo, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Screening } from "@/lib/types";
import { VENUE_COORDS, distanceMiles, formatDistance } from "@/lib/venues";
import { venueNameToSlug } from "@/lib/venue-slug";

const WhatsOnMap = dynamic(() => import("./WhatsOnMap"), { ssr: false });

const LS_KEY = "cineboxd_postcode";

type SortMode = "distance" | "alpha" | "chain";
type DateScope = "today" | "tomorrow" | "weekend" | "7days" | "custom";
type ViewMode = "list" | "calendar" | "map";

// ── Helpers ───────────────────────────────────────────────────────────────────

function chainOf(name: string): string {
  if (name.startsWith("Curzon ")) return "Curzon";
  if (name.startsWith("Everyman ")) return "Everyman";
  if (name.includes("Picturehouse")) return "Picturehouse";
  return "Independent";
}

function toDateStr(d: Date): string {
  return d.toLocaleDateString("en-CA"); // YYYY-MM-DD
}

function localDate(offsetDays = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d;
}

function fmtDateShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function fmtDateLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function getScopeDates(scope: DateScope, customDate: string): { start: string; end: string } {
  const today = new Date();
  const todayStr = toDateStr(today);

  if (scope === "today") return { start: todayStr, end: todayStr };

  if (scope === "tomorrow") {
    const s = toDateStr(localDate(1));
    return { start: s, end: s };
  }

  if (scope === "weekend") {
    // dow: 0=Sun,1=Mon,...,5=Fri,6=Sat
    const dow = today.getDay();
    const offsets: [number, number][] = [[-2, 0], [4, 6], [3, 5], [2, 4], [1, 3], [0, 2], [-1, 1]];
    const [friOff, sunOff] = offsets[dow];
    const friStr = toDateStr(localDate(friOff));
    const sunStr = toDateStr(localDate(sunOff));
    // Never show past dates
    return { start: friStr < todayStr ? todayStr : friStr, end: sunStr };
  }

  if (scope === "7days") {
    return { start: todayStr, end: toDateStr(localDate(6)) };
  }

  // custom
  return { start: customDate || todayStr, end: customDate || todayStr };
}

function moreLabel(scope: DateScope, customDate: string): string {
  if (scope === "today") return "today";
  if (scope === "tomorrow") return "tomorrow";
  if (scope === "weekend") return "this weekend";
  if (scope === "7days") return "this week";
  if (scope === "custom" && customDate) return `on ${fmtDateShort(customDate)}`;
  return "";
}

function scopeDescription(scope: DateScope, customDate: string): string {
  if (scope === "today") return "today";
  if (scope === "tomorrow") return "tomorrow";
  if (scope === "weekend") return "this weekend";
  if (scope === "7days") return "in the next 7 days";
  if (scope === "custom" && customDate) return `on ${fmtDateShort(customDate)}`;
  return "";
}

function cardsForScope(scope: DateScope): number {
  if (scope === "today" || scope === "tomorrow" || scope === "custom") return 20;
  return 12;
}

async function geocodePostcode(postcode: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.trim())}`
    );
    const json = await res.json();
    if (json.status === 200 && json.result) {
      return { lat: json.result.latitude, lng: json.result.longitude };
    }
    return null;
  } catch {
    return null;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VenueGroup {
  venue: string;
  slug: string;
  upcoming: Screening[];
  total: number;
  distance: number | null;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WhatsOnClient({ screenings }: { screenings: Screening[] }) {
  const [postcodeInput, setPostcodeInput] = useState("");
  const [postcodeCoords, setPostcodeCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("alpha");
  const [dateScope, setDateScope] = useState<DateScope>("7days");
  const [customDate, setCustomDate] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // Calendar accordion expansion state: Set of "date__venue" keys
  const [expandedVenues, setExpandedVenues] = useState<Set<string>>(new Set());

  function toggleVenue(date: string, venue: string) {
    const key = `${date}__${venue}`;
    setExpandedVenues((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function expandDay(date: string, venueNames: string[]) {
    setExpandedVenues((prev) => {
      const next = new Set(prev);
      venueNames.forEach((v) => next.add(`${date}__${v}`));
      return next;
    });
  }

  function collapseDay(date: string, venueNames: string[]) {
    setExpandedVenues((prev) => {
      const next = new Set(prev);
      venueNames.forEach((v) => next.delete(`${date}__${v}`));
      return next;
    });
  }

  // Load saved postcode on mount
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (!saved) return;
    setPostcodeInput(saved);
    geocodePostcode(saved).then((coords) => {
      if (coords) {
        setPostcodeCoords(coords);
        setSortMode("distance");
      }
    });
  }, []);

  async function handlePostcodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pc = postcodeInput.trim();
    if (!pc) {
      clearPostcode();
      return;
    }
    setGeocoding(true);
    setGeocodeError("");
    const coords = await geocodePostcode(pc);
    setGeocoding(false);
    if (coords) {
      setPostcodeCoords(coords);
      localStorage.setItem(LS_KEY, pc);
      setSortMode("distance");
      setGeocodeError("");
    } else {
      setGeocodeError("Postcode not found — try again");
    }
  }

  function clearPostcode() {
    setPostcodeInput("");
    setPostcodeCoords(null);
    localStorage.removeItem(LS_KEY);
    if (sortMode === "distance") setSortMode("alpha");
  }

  // Auto-expand calendar accordion when scope changes.
  // Single-day scopes + postcode: expand nearest 5 venues.
  // Range scopes: all collapsed.
  // Uses calendarData from current render (after scope/date recalculation).
  useEffect(() => {
    const isSingleDay =
      dateScope === "today" || dateScope === "tomorrow" || dateScope === "custom";
    const newExpanded = new Set<string>();

    if (isSingleDay && postcodeCoords) {
      // calendarData is recalculated before this effect runs — safe to use
      for (const { date, venues } of calendarData) {
        venues.slice(0, 5).forEach(([venue]) => newExpanded.add(`${date}__${venue}`));
      }
    }

    setExpandedVenues(newExpanded);
    // Intentionally excludes calendarData from deps: we only want to reset
    // on scope change, not on sortMode change (which also updates calendarData).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateScope, customDate, postcodeCoords]);

  const { start: scopeStart, end: scopeEnd } = getScopeDates(dateScope, customDate);
  const maxCards = cardsForScope(dateScope);
  const more = moreLabel(dateScope, customDate);

  // All screenings in window, sorted by date+time
  const scopeScreenings = useMemo(
    () =>
      screenings
        .filter((s) => s.date >= scopeStart && s.date <= scopeEnd)
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
    [screenings, scopeStart, scopeEnd]
  );

  // Venue groups (List + Map views)
  const groups = useMemo<VenueGroup[]>(() => {
    const byVenue = new Map<string, Screening[]>();
    for (const s of scopeScreenings) {
      if (!byVenue.has(s.venue)) byVenue.set(s.venue, []);
      byVenue.get(s.venue)!.push(s);
    }

    const result: VenueGroup[] = [];
    for (const [venue, vs] of byVenue) {
      const coords = VENUE_COORDS[venue];
      const distance =
        coords && postcodeCoords
          ? distanceMiles(postcodeCoords.lat, postcodeCoords.lng, coords.lat, coords.lng)
          : null;
      result.push({
        venue,
        slug: venueNameToSlug(venue),
        upcoming: vs.slice(0, maxCards),
        total: vs.length,
        distance,
      });
    }

    if (sortMode === "distance") {
      result.sort((a, b) => {
        if (a.distance === null && b.distance === null) return a.venue.localeCompare(b.venue);
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
      });
    } else if (sortMode === "alpha") {
      result.sort((a, b) => a.venue.localeCompare(b.venue));
    } else {
      result.sort((a, b) => {
        const ca = chainOf(a.venue);
        const cb = chainOf(b.venue);
        if (ca === "Independent" && cb !== "Independent") return 1;
        if (cb === "Independent" && ca !== "Independent") return -1;
        if (ca !== cb) return ca.localeCompare(cb);
        return a.venue.localeCompare(b.venue);
      });
    }

    return result;
  }, [scopeScreenings, postcodeCoords, sortMode, maxCards]);

  // Calendar grouping: date → [{venue, screenings}]
  const calendarData = useMemo(() => {
    const dates = [...new Set(scopeScreenings.map((s) => s.date))].sort();
    return dates.map((date) => {
      const dayScreenings = scopeScreenings.filter((s) => s.date === date);
      const byVenue = new Map<string, Screening[]>();
      for (const s of dayScreenings) {
        if (!byVenue.has(s.venue)) byVenue.set(s.venue, []);
        byVenue.get(s.venue)!.push(s);
      }
      const venues = [...byVenue.entries()].sort(([va], [vb]) => {
        if (sortMode === "distance" && postcodeCoords) {
          const ca = VENUE_COORDS[va];
          const cb = VENUE_COORDS[vb];
          if (ca && cb) {
            const da = distanceMiles(postcodeCoords.lat, postcodeCoords.lng, ca.lat, ca.lng);
            const db = distanceMiles(postcodeCoords.lat, postcodeCoords.lng, cb.lat, cb.lng);
            return da - db;
          }
        }
        return va.localeCompare(vb);
      });
      return { date, venues };
    });
  }, [scopeScreenings, sortMode, postcodeCoords]);

  const desc = scopeDescription(dateScope, customDate);

  const selectCls =
    "bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent transition-colors";

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* ── Title ── */}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">What&rsquo;s On</h1>
        <p className="text-sm text-muted mt-1">
          All upcoming screenings across London&rsquo;s independent cinemas.
        </p>
      </div>

      {/* ── Controls ── */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Postcode */}
        <form onSubmit={handlePostcodeSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={postcodeInput}
            onChange={(e) => setPostcodeInput(e.target.value)}
            placeholder="Postcode (e.g. SE1)"
            className="w-36 bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
          />
          <button
            type="submit"
            disabled={geocoding}
            className="px-3 py-1.5 bg-card border border-border rounded-lg text-sm text-muted hover:text-foreground transition-colors disabled:opacity-50"
          >
            {geocoding ? "…" : "Go"}
          </button>
          {postcodeCoords && (
            <button
              type="button"
              onClick={clearPostcode}
              aria-label="Clear postcode"
              className="text-xs text-muted hover:text-foreground transition-colors"
            >
              ✕
            </button>
          )}
        </form>

        {geocodeError && <p className="text-xs text-red-400">{geocodeError}</p>}

        {/* Showing dropdown */}
        <select
          value={dateScope}
          onChange={(e) => {
            const v = e.target.value as DateScope;
            setDateScope(v);
            if (v !== "custom") setCustomDate("");
          }}
          className={selectCls}
          aria-label="Showing"
        >
          <option value="today">Today</option>
          <option value="tomorrow">Tomorrow</option>
          <option value="weekend">This weekend</option>
          <option value="7days">Next 7 days</option>
          <option value="custom">Pick a date…</option>
        </select>

        {dateScope === "custom" && (
          <input
            type="date"
            value={customDate}
            min={toDateStr(new Date())}
            onChange={(e) => setCustomDate(e.target.value)}
            className={selectCls}
          />
        )}

        {/* Sort dropdown */}
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className={selectCls}
          aria-label="Sort by"
        >
          {postcodeCoords && <option value="distance">Distance</option>}
          <option value="alpha">A–Z</option>
          <option value="chain">By chain</option>
        </select>
      </div>

      {/* ── View tabs ── */}
      <div className="flex rounded-md border border-border overflow-hidden w-fit">
        {(["list", "calendar", "map"] as ViewMode[]).map((v, i) => (
          <button
            key={v}
            onClick={() => setViewMode(v)}
            className={[
              "px-3 py-1.5 text-sm transition-colors",
              i > 0 ? "border-l border-border" : "",
              viewMode === v
                ? "bg-accent text-black font-semibold"
                : "bg-white/5 text-muted hover:bg-white/10 hover:text-foreground",
            ].join(" ")}
          >
            {v === "list" ? "List" : v === "calendar" ? "Calendar" : "Map"}
          </button>
        ))}
      </div>

      {/* ── List view ── */}
      {viewMode === "list" && (
        <>
          {groups.length === 0 ? (
            <p className="text-muted text-sm py-12 text-center">
              No screenings found for the selected period.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {groups.map((g) => (
                <VenueCard key={g.venue} group={g} more={more} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Calendar view ── */}
      {viewMode === "calendar" && (
        <>
          {calendarData.length === 0 ? (
            <p className="text-muted text-sm py-12 text-center">
              No screenings found for the selected period.
            </p>
          ) : (
            <div className="space-y-6">
              {calendarData.map(({ date, venues }) => {
                const venueNames = venues.map(([v]) => v);
                const totalScreenings = venues.reduce((acc, [, vs]) => acc + vs.length, 0);

                return (
                  <section key={date}>
                    {/* Date header row */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-baseline gap-2">
                        <h2 className="text-sm font-semibold text-foreground">
                          {fmtDateLong(date)}
                        </h2>
                        <span className="text-xs text-muted">
                          — {venues.length} venue{venues.length !== 1 ? "s" : ""} ·{" "}
                          {totalScreenings} screening{totalScreenings !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="flex gap-3 text-xs text-muted shrink-0">
                        <button
                          onClick={() => expandDay(date, venueNames)}
                          className="hover:text-foreground transition-colors"
                        >
                          Expand all
                        </button>
                        <button
                          onClick={() => collapseDay(date, venueNames)}
                          className="hover:text-foreground transition-colors"
                        >
                          Collapse all
                        </button>
                      </div>
                    </div>

                    {/* Venue accordion */}
                    <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                      {venues.map(([venue, vs]) => {
                        const key = `${date}__${venue}`;
                        const isExpanded = expandedVenues.has(key);
                        const vc = VENUE_COORDS[venue];
                        const distance =
                          postcodeCoords && vc
                            ? distanceMiles(
                                postcodeCoords.lat,
                                postcodeCoords.lng,
                                vc.lat,
                                vc.lng
                              )
                            : null;

                        return (
                          <div key={venue}>
                            <button
                              onClick={() => toggleVenue(date, venue)}
                              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 bg-card hover:bg-white/5 transition-colors text-sm text-left"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {/* Chevron */}
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className={`shrink-0 transition-transform text-muted ${isExpanded ? "rotate-90" : ""}`}
                                >
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                                <Link
                                  href={`/venues/${venueNameToSlug(venue)}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="font-medium text-foreground hover:text-accent transition-colors truncate"
                                >
                                  {venue}
                                </Link>
                                {distance !== null && (
                                  <span className="text-xs text-muted/60 shrink-0">
                                    {formatDistance(distance)}
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-muted shrink-0">
                                {vs.length} screening{vs.length !== 1 ? "s" : ""}
                              </span>
                            </button>

                            {isExpanded && (
                              <ul className="px-4 py-2 space-y-1.5 bg-background/50">
                                {vs.map((s, i) => (
                                  <li key={i} className="flex items-baseline gap-2 min-w-0">
                                    <span className="shrink-0 tabular-nums text-xs text-muted w-9">
                                      {s.time}
                                    </span>
                                    {s.bookingUrl ? (
                                      <a
                                        href={s.bookingUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="truncate text-foreground/85 hover:text-accent hover:underline text-xs"
                                      >
                                        {s.title}
                                      </a>
                                    ) : (
                                      <span className="truncate text-foreground/85 text-xs">
                                        {s.title}
                                      </span>
                                    )}
                                    {s.format && (
                                      <span className="shrink-0 text-xs text-muted/70 hidden sm:inline">
                                        {s.format}
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Map view ── */}
      {viewMode === "map" && (
        <WhatsOnMap groups={groups} postcodeCoords={postcodeCoords} />
      )}

      <p className="text-xs text-muted">
        {groups.length} venue{groups.length !== 1 ? "s" : ""} with screenings{" "}
        {desc}.
      </p>
    </main>
  );
}

// ── Venue card ────────────────────────────────────────────────────────────────

function VenueCard({ group, more }: { group: VenueGroup; more: string }) {
  const remaining = group.total - group.upcoming.length;

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/venues/${group.slug}`}
          className="font-semibold text-foreground hover:text-accent transition-colors leading-snug"
        >
          {group.venue}
        </Link>
        {group.distance !== null ? (
          <span className="shrink-0 text-xs bg-accent/15 text-accent px-2 py-0.5 rounded-full font-medium">
            {formatDistance(group.distance)}
          </span>
        ) : null}
      </div>

      {/* Screenings */}
      <ul className="space-y-1.5">
        {group.upcoming.map((s, i) => (
          <li key={i} className="flex items-baseline gap-2 text-sm min-w-0">
            <span className="shrink-0 tabular-nums text-xs text-muted w-9">{s.time}</span>
            <span className="shrink-0 text-xs text-muted/60 w-[4.5rem]">
              {fmtDateShort(s.date)}
            </span>
            {s.bookingUrl ? (
              <a
                href={s.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-foreground/85 hover:text-accent hover:underline transition-colors text-xs"
              >
                {s.title}
              </a>
            ) : (
              <span className="truncate text-foreground/85 text-xs">{s.title}</span>
            )}
          </li>
        ))}
      </ul>

      {/* Footer */}
      <div className="mt-auto pt-2 border-t border-border/40 flex items-center justify-between">
        <Link href={`/venues/${group.slug}`} className="text-xs text-accent hover:underline">
          View all screenings →
        </Link>
        {remaining > 0 && (
          <span className="text-xs text-muted">
            +{remaining} more{more ? ` ${more}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
