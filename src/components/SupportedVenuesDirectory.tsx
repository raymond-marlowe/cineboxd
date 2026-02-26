"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { SUPPORTED_VENUES, Venue } from "./SupportedVenues";
import { VENUE_COORDS } from "@/lib/venues";
import type { VenuePin } from "./venues-directory-map";

const VenuesDirectoryMap = dynamic(
  () => import("./venues-directory-map"),
  { ssr: false }
);

type SortMode = "alpha" | "chain";
type ViewMode = "list" | "map";

function chainOf(name: string): string {
  if (name.startsWith("Curzon ")) return "Curzon";
  if (name.startsWith("Everyman ")) return "Everyman";
  if (name.includes("Picturehouse")) return "Picturehouse";
  return "Independent";
}

interface EnrichedVenue extends Venue {
  lat: number | null;
  lng: number | null;
}

const enriched: EnrichedVenue[] = SUPPORTED_VENUES.map((v) => {
  const coords = VENUE_COORDS[v.name] ?? null;
  return { ...v, lat: coords?.lat ?? null, lng: coords?.lng ?? null };
});

const mappedCount = enriched.filter((v) => v.lat !== null).length;
const unmapped = enriched.filter((v) => v.lat === null);
const mapVenues: VenuePin[] = enriched
  .filter((v): v is EnrichedVenue & { lat: number; lng: number } => v.lat !== null)
  .map((v) => ({ name: v.name, url: v.url, lat: v.lat, lng: v.lng }));

// ── Sub-component: flat venue list ───────────────────────────────────────────

function VenueList({ venues }: { venues: EnrichedVenue[] }) {
  return (
    <ul className="divide-y divide-border">
      {venues.map((venue) => (
        <li key={venue.name} className="flex items-center justify-between gap-4 py-3">
          <span className="text-sm font-medium">{venue.name}</span>
          {venue.url ? (
            <a
              href={venue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-xs text-accent hover:underline"
            >
              Website ↗
            </a>
          ) : (
            <span className="shrink-0 text-xs text-muted">No link</span>
          )}
        </li>
      ))}
    </ul>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SupportedVenuesDirectory() {
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("alpha");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [showMissing, setShowMissing] = useState(false);

  const filtered = useMemo<EnrichedVenue[]>(() => {
    const q = query.trim().toLowerCase();
    const base = q ? enriched.filter((v) => v.name.toLowerCase().includes(q)) : enriched;

    if (sortMode === "alpha") {
      return [...base].sort((a, b) => a.name.localeCompare(b.name));
    }
    return [...base].sort((a, b) => {
      const ca = chainOf(a.name);
      const cb = chainOf(b.name);
      // Independent always last
      if (ca === "Independent" && cb !== "Independent") return 1;
      if (cb === "Independent" && ca !== "Independent") return -1;
      if (ca !== cb) return ca.localeCompare(cb);
      return a.name.localeCompare(b.name);
    });
  }, [query, sortMode]);

  // Groups only used in "chain" sort mode
  const groups = useMemo<[string, EnrichedVenue[]][] | null>(() => {
    if (sortMode !== "chain") return null;
    const map = new Map<string, EnrichedVenue[]>();
    for (const v of filtered) {
      const chain = chainOf(v.name);
      if (!map.has(chain)) map.set(chain, []);
      map.get(chain)!.push(v);
    }
    // Preserve the sort order already applied to `filtered`
    return [...map.entries()];
  }, [filtered, sortMode]);

  const segmentBtn = (active: boolean, border = false) =>
    [
      "px-3 py-1.5 text-sm transition-colors",
      border ? "border-l border-border" : "",
      active
        ? "bg-accent text-black font-semibold"
        : "bg-white/5 text-muted hover:bg-white/10 hover:text-foreground",
    ].join(" ");

  return (
    <div className="space-y-4">
      {/* ── Controls row ── */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search venues…"
          className="flex-1 min-w-[160px] rounded-md border border-border bg-white/5 px-3 py-1.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
        />

        {/* Sort toggle — hidden in map mode (map always shows all venues) */}
        {viewMode === "list" && (
          <div className="flex rounded-md border border-border overflow-hidden">
            <button onClick={() => setSortMode("alpha")} className={segmentBtn(sortMode === "alpha")}>
              A–Z
            </button>
            <button onClick={() => setSortMode("chain")} className={segmentBtn(sortMode === "chain", true)}>
              By chain
            </button>
          </div>
        )}

        {/* List / Map toggle */}
        <div className="flex rounded-md border border-border overflow-hidden">
          <button onClick={() => setViewMode("list")} className={segmentBtn(viewMode === "list")}>
            List
          </button>
          <button onClick={() => setViewMode("map")} className={segmentBtn(viewMode === "map", true)}>
            Map
          </button>
        </div>
      </div>

      {/* ── Map view ── */}
      {viewMode === "map" && <VenuesDirectoryMap venues={mapVenues} />}

      {/* ── List view ── */}
      {viewMode === "list" && (
        <>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted py-4 text-center">
              No venues match &ldquo;{query}&rdquo;.
            </p>
          ) : groups ? (
            <div className="space-y-6">
              {groups.map(([chain, venues]) => (
                <div key={chain}>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-1 pb-1 border-b border-border">
                    {chain}
                  </h3>
                  <VenueList venues={venues} />
                </div>
              ))}
            </div>
          ) : (
            <VenueList venues={filtered} />
          )}
        </>
      )}

      {/* ── Footer: count + coverage indicator ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
        <div className="flex gap-3 text-xs text-muted">
          {viewMode === "list" && (
            <span>Showing {filtered.length} of {SUPPORTED_VENUES.length} venues.</span>
          )}
          <span>Mapped: {mappedCount} / {SUPPORTED_VENUES.length} venues.</span>
        </div>

        {unmapped.length > 0 && (
          <button
            onClick={() => setShowMissing((s) => !s)}
            className="text-xs text-muted hover:text-foreground transition-colors"
          >
            {showMissing ? "Hide" : "Missing coords"} ({unmapped.length})
          </button>
        )}
      </div>

      {/* ── Collapsible missing-coords list ── */}
      {showMissing && unmapped.length > 0 && (
        <div className="rounded-md border border-border bg-white/5 px-3 py-2 space-y-1">
          <p className="text-xs font-semibold text-foreground mb-1">
            Missing coordinates ({unmapped.length})
          </p>
          {unmapped.map((v) => (
            <p key={v.name} className="text-xs text-muted">{v.name}</p>
          ))}
        </div>
      )}
    </div>
  );
}
