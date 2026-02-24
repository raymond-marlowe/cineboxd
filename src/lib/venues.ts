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
  "Phoenix Cinema":        { lat: 51.5884, lng: -0.1664 }, // 52 High Road, East Finchley, N2 9PJ
  "The Lexi Cinema":       { lat: 51.5354, lng: -0.2207 }, // 194B Chamberlayne Rd, Kensal Rise, NW10 3JU
  "Garden Cinema":         { lat: 51.5139, lng: -0.1227 }, // 7-12 Shorts Gardens, Covent Garden, WC2H 9AT
  "Regent Street Cinema":  { lat: 51.5081, lng: -0.1349 }, // 49 Regent Street, W1B 4JY
  "Rich Mix":              { lat: 51.5224, lng: -0.0747 }, // 35-47 Bethnal Green Road, E1 6LA
  "JW3":                   { lat: 51.5554, lng: -0.1788 }, // 341-351 Finchley Road, NW3 6ET
  "Curzon Sea Containers": { lat: 51.5068, lng: -0.1090 }, // Sea Containers House, SE1 9PH
  "Curzon Goldsmiths":     { lat: 51.4743, lng: -0.0353 }, // Lewisham Way, SE14 6NW
  // Curzon main-site venues (OCAPI scraper)
  "Curzon Soho":           { lat: 51.5131, lng: -0.1340 }, // 99 Shaftesbury Avenue, W1D 5DY
  "Curzon Camden":         { lat: 51.5389, lng: -0.1427 }, // Dockray Place, NW1 8QD
  "Curzon Mayfair":        { lat: 51.5105, lng: -0.1440 }, // 38 Curzon Street, W1J 7TY
  "Curzon Bloomsbury":     { lat: 51.5226, lng: -0.1231 }, // 1 Brunswick Centre, WC1N 1AF
  "Curzon Victoria":       { lat: 51.4975, lng: -0.1437 }, // 58 Victoria Street, SW1E 6QP
  "Curzon Hoxton":         { lat: 51.5281, lng: -0.0800 }, // 2-6 Hoxton Square, N1 6NU
  "Curzon Richmond":       { lat: 51.4608, lng: -0.3057 }, // Water Lane, TW9 1TJ
  "Curzon Kingston":       { lat: 51.4101, lng: -0.3021 }, // Omni Centre, KT1 1RS
  "Curzon Wimbledon":      { lat: 51.4214, lng: -0.2051 }, // The Broadway, SW19 1QG
  "Curzon Aldgate":        { lat: 51.5141, lng: -0.0771 }, // Aldgate Tower, E1 8FA
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
