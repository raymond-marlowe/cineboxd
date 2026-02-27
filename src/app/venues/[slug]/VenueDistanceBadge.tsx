"use client";

import { useEffect, useState } from "react";
import { VENUE_COORDS, distanceMiles, formatDistance } from "@/lib/venues";

const LS_KEY = "cineboxd_postcode";

export default function VenueDistanceBadge({ venue }: { venue: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (!saved) return;

    const coords = VENUE_COORDS[venue];
    if (!coords) return;

    fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(saved.trim())}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.status === 200 && json.result) {
          const miles = distanceMiles(
            json.result.latitude,
            json.result.longitude,
            coords.lat,
            coords.lng
          );
          setLabel(formatDistance(miles) + " away");
        }
      })
      .catch(() => {});
  }, [venue]);

  if (!label) return null;

  return (
    <span className="shrink-0 text-xs bg-accent/15 text-accent px-2.5 py-1 rounded-full font-medium">
      {label}
    </span>
  );
}
