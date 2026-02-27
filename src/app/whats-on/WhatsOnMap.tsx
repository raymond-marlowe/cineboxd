"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { VENUE_COORDS, formatDistance } from "@/lib/venues";
import { DARK_POPUP_CSS } from "@/lib/leaflet-popup-css";
import type { VenueGroup } from "./WhatsOnClient";

// ── Marker icon ───────────────────────────────────────────────────────────────

const venueIcon = L.divIcon({
  className: "",
  html: `<div style="
    width:12px;height:12px;background:#f59e0b;
    border-radius:50%;border:2px solid #fff;
    box-shadow:0 1px 4px rgba(0,0,0,.6);
  "></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

// ── Fit bounds helper ─────────────────────────────────────────────────────────

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 0) return;
    if (positions.length === 1) {
      map.setView(positions[0], 14);
    } else {
      map.fitBounds(L.latLngBounds(positions), { padding: [50, 50] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WhatsOnMap({
  groups,
  postcodeCoords,
}: {
  groups: VenueGroup[];
  postcodeCoords: { lat: number; lng: number } | null;
}) {
  // Inject dark popup CSS
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = DARK_POPUP_CSS;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const pins = groups
    .map((g) => ({ ...g, coords: VENUE_COORDS[g.venue] }))
    .filter((g) => g.coords != null);

  const positions: [number, number][] = pins.map((p) => [p.coords.lat, p.coords.lng]);

  return (
    <div className="w-full h-[520px] md:h-[640px] rounded-lg overflow-hidden border border-white/10">
      <MapContainer
        center={[51.51, -0.12]}
        zoom={11}
        style={{ height: "100%", width: "100%", background: "#1a1a2e" }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          maxZoom={19}
        />

        {positions.length > 0 && <FitBounds positions={positions} />}

        {pins.map((p) => (
          <Marker key={p.venue} position={[p.coords.lat, p.coords.lng]} icon={venueIcon}>
            <Popup minWidth={170} maxWidth={220}>
              <div>
                <a
                  href={`/venues/${p.slug}`}
                  style={{
                    fontWeight: 700,
                    fontSize: "13px",
                    color: "#f5f5f5",
                    display: "block",
                    marginBottom: "4px",
                    textDecoration: "none",
                  }}
                >
                  {p.venue}
                </a>

                {p.distance !== null && (
                  <div style={{ fontSize: "11px", color: "#f59e0b", marginBottom: "6px" }}>
                    {formatDistance(p.distance)} away
                  </div>
                )}

                <div style={{ fontSize: "11px", color: "#a1a1aa", marginBottom: "10px" }}>
                  {p.total} screening{p.total !== 1 ? "s" : ""}
                </div>

                <a
                  href={`/venues/${p.slug}`}
                  style={{
                    color: "#f59e0b",
                    fontSize: "11px",
                    textDecoration: "none",
                    fontWeight: 500,
                  }}
                >
                  View listings →
                </a>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
