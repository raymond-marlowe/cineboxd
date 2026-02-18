export interface VenueCoords {
  lat: number;
  lng: number;
}

/**
 * Hardcoded coordinates for each London cinema venue.
 * Keys must exactly match the `venue` string emitted by each scraper.
 */
export const VENUE_COORDS: Record<string, VenueCoords> = {
  "Prince Charles Cinema": { lat: 51.5122, lng: -0.1291 }, // 7 Leicester Place, WC2H 7BY
  "Close-Up Film Centre":  { lat: 51.5252, lng: -0.0741 }, // 97 Sclater Street, E1 6HR
  "ICA Cinema":            { lat: 51.5059, lng: -0.1318 }, // The Mall, SW1Y 5AH
  "Barbican Cinema":       { lat: 51.5204, lng: -0.0962 }, // Barbican Centre, EC2Y 8DS
  "Rio Cinema":            { lat: 51.5452, lng: -0.0749 }, // 107 Kingsland High St, E8 2PB
  "Genesis Cinema":        { lat: 51.5200, lng: -0.0484 }, // 93-95 Mile End Road, E1 4UJ
  "Arthouse Crouch End":   { lat: 51.5767, lng: -0.1197 }, // 159A Tottenham Lane, N8 9BT
  "ActOne Cinema":         { lat: 51.5082, lng: -0.2679 }, // 119-121 High Street, Acton, W3 6NA
};

/** Haversine distance between two lat/lng points, in miles. */
export function distanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Format a mile distance for display, e.g. "1.2 mi" or "< 0.1 mi". */
export function formatDistance(miles: number): string {
  if (miles < 0.1) return "< 0.1 mi";
  return `${miles.toFixed(1)} mi`;
}

/**
 * Returns the shortest distance from the user's coordinates to any venue
 * represented in the given array of screenings.
 * Returns Infinity if no known venues are found.
 */
export function nearestVenueDistance(
  screenings: { venue: string }[],
  userLat: number,
  userLng: number
): number {
  let min = Infinity;
  for (const s of screenings) {
    const vc = VENUE_COORDS[s.venue];
    if (vc) {
      const d = distanceMiles(userLat, userLng, vc.lat, vc.lng);
      if (d < min) min = d;
    }
  }
  return min;
}
