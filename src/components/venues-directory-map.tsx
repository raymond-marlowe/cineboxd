"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";

export interface VenuePin {
  name: string;
  url?: string;
  lat: number;
  lng: number;
}

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

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 0) return;
    if (positions.length === 1) {
      map.setView(positions[0], 14);
    } else {
      map.fitBounds(L.latLngBounds(positions), { padding: [50, 50] });
    }
    // intentionally runs once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export default function VenuesDirectoryMap({ venues }: { venues: VenuePin[] }) {
  const positions: [number, number][] = venues.map((v) => [v.lat, v.lng]);

  return (
    <div className="w-full h-[50vh] sm:h-[60vh] rounded-lg overflow-hidden border border-white/10">
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

        {venues.map((v) => (
          <Marker key={v.name} position={[v.lat, v.lng]} icon={venueIcon}>
            <Popup minWidth={180}>
              <div style={{ fontFamily: "inherit", color: "#e5e7eb", padding: "2px 0" }}>
                <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "6px", color: "#f5f5f5" }}>
                  {v.name}
                </div>
                {v.url && (
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#F5A623", fontSize: "12px", textDecoration: "none" }}
                  >
                    Website ↗
                  </a>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
