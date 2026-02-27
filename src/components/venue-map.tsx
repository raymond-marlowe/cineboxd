"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  useMap,
} from "react-leaflet";
import { VENUE_COORDS } from "@/lib/venues";
import { DARK_POPUP_CSS } from "@/lib/leaflet-popup-css";
import { MatchedScreening } from "@/lib/types";

// ── Types ────────────────────────────────────────────────────────────────────

interface VenueMapProps {
  /** Already-filtered matches (filteredShared or filteredMatches from page.tsx) */
  matches: MatchedScreening[];
  postcodeCoords: { lat: number; lng: number } | null;
  maxDistanceMiles: number | null;
  /** Called when user clicks "View screenings" in a popup */
  onVenueSelect: (venue: string) => void;
}

interface TopFilm {
  title: string;
  /** ISO-ish "YYYY-MM-DDTHH:MM" — used for sorting and display */
  nextDateTime: string;
  bookingUrl: string | null;
}

interface VenueSummary {
  venue: string;
  lat: number;
  lng: number;
  screeningsCount: number;
  filmsCount: number;
  topFilms: TopFilm[];
}

// ── Leaflet icon helpers (use divIcon to avoid webpack image path issues) ────

const venueIcon = L.divIcon({
  className: "",
  html: `<div style="
    width:14px;height:14px;background:#F5A623;
    border-radius:50%;border:2px solid #fff;
    box-shadow:0 1px 4px rgba(0,0,0,.6);
  "></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const homeIcon = L.divIcon({
  className: "",
  html: `<div style="
    width:16px;height:16px;background:#fff;
    border-radius:50%;border:3px solid #3b82f6;
    box-shadow:0 1px 4px rgba(0,0,0,.6);
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

// ── FitBounds — fits map to all visible pins on first render ─────────────────

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 0) return;
    if (positions.length === 1) {
      map.setView(positions[0], 14);
    } else {
      map.fitBounds(L.latLngBounds(positions), { padding: [50, 50] });
    }
    // intentionally runs once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

// ── Date/time formatting for popup display ───────────────────────────────────

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDateTime(iso: string): string {
  // iso is "YYYY-MM-DDTHH:MM"
  const [datePart, timePart] = iso.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DAYS[dt.getDay()]} ${d} ${MONS[m - 1]}${timePart ? " · " + timePart : ""}`;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function VenueMap({
  matches,
  postcodeCoords,
  maxDistanceMiles,
  onVenueSelect,
}: VenueMapProps) {
  // Inject dark popup CSS
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = DARK_POPUP_CSS;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Build per-venue summary from the currently-filtered matches
  const venueSummaries = useMemo<VenueSummary[]>(() => {
    const venueMap = new Map<string, { films: Map<string, TopFilm>; screeningsCount: number }>();

    for (const match of matches) {
      for (const s of match.screenings) {
        if (!VENUE_COORDS[s.venue]) continue; // skip venues with no known coords

        if (!venueMap.has(s.venue)) {
          venueMap.set(s.venue, { films: new Map(), screeningsCount: 0 });
        }
        const entry = venueMap.get(s.venue)!;
        entry.screeningsCount++;

        const isoKey = `${s.date}T${s.time}`;
        const existing = entry.films.get(match.film.title);
        if (!existing || isoKey < existing.nextDateTime) {
          entry.films.set(match.film.title, {
            title: match.film.title,
            nextDateTime: isoKey,
            bookingUrl: s.bookingUrl,
          });
        }
      }
    }

    const summaries: VenueSummary[] = [];
    for (const [venue, { films, screeningsCount }] of venueMap) {
      const coords = VENUE_COORDS[venue]!;
      const topFilms = [...films.values()]
        .sort((a, b) => a.nextDateTime.localeCompare(b.nextDateTime))
        .slice(0, 5);
      summaries.push({
        venue,
        lat: coords.lat,
        lng: coords.lng,
        screeningsCount,
        filmsCount: films.size,
        topFilms,
      });
    }
    return summaries;
  }, [matches]);

  // All positions for FitBounds (venue pins + optional home marker)
  const allPositions = useMemo<[number, number][]>(() => {
    const pts: [number, number][] = venueSummaries.map((s) => [s.lat, s.lng]);
    if (postcodeCoords) pts.push([postcodeCoords.lat, postcodeCoords.lng]);
    return pts;
  }, [venueSummaries, postcodeCoords]);

  return (
    <div className="w-full h-[50vh] sm:h-[60vh] rounded-lg overflow-hidden border border-white/10">
      <MapContainer
        center={[51.51, -0.12]}
        zoom={12}
        style={{ height: "100%", width: "100%", background: "#1a1a2e" }}
      >
        {/* Dark CartoDB tile layer — matches dark UI */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          maxZoom={19}
        />

        {/* Fit map to all pins on first render */}
        {allPositions.length > 0 && <FitBounds positions={allPositions} />}

        {/* Venue pins */}
        {venueSummaries.map((s) => (
          <Marker key={s.venue} position={[s.lat, s.lng]} icon={venueIcon}>
            <Popup minWidth={220}>
              <div style={{ fontFamily: "inherit", color: "#e5e7eb", padding: "2px 0" }}>
                <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "4px", color: "#f5f5f5" }}>
                  {s.venue}
                </div>
                <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "8px" }}>
                  {s.filmsCount} {s.filmsCount === 1 ? "film" : "films"} &bull; {s.screeningsCount}{" "}
                  {s.screeningsCount === 1 ? "screening" : "screenings"}
                </div>
                <div style={{ marginBottom: "10px" }}>
                  {s.topFilms.map((f) => (
                    <div
                      key={f.title}
                      style={{ fontSize: "12px", marginBottom: "3px", color: "#d1d5db" }}
                    >
                      <span style={{ fontWeight: 500 }}>{f.title}</span>
                      <span style={{ color: "#6b7280", marginLeft: "4px" }}>
                        {formatDateTime(f.nextDateTime)}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => onVenueSelect(s.venue)}
                  style={{
                    background: "#F5A623",
                    color: "#111",
                    border: "none",
                    borderRadius: "6px",
                    padding: "5px 10px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    width: "100%",
                  }}
                >
                  View screenings →
                </button>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Home marker for postcode */}
        {postcodeCoords && (
          <Marker
            position={[postcodeCoords.lat, postcodeCoords.lng]}
            icon={homeIcon}
          >
            <Popup>
              <div style={{ color: "#e5e7eb", fontSize: "13px" }}>Your location</div>
            </Popup>
          </Marker>
        )}

        {/* Distance radius circle */}
        {postcodeCoords && maxDistanceMiles !== null && (
          <Circle
            center={[postcodeCoords.lat, postcodeCoords.lng]}
            radius={maxDistanceMiles * 1609.34}
            pathOptions={{ color: "#F5A623", fillColor: "#F5A623", fillOpacity: 0.05, weight: 1.5, opacity: 0.4 }}
          />
        )}
      </MapContainer>
    </div>
  );
}
