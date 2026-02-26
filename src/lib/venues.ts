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
  // Picturehouse venues (ENABLE_PICTUREHOUSE scraper)
  "Clapham Picturehouse":       { lat: 51.4609, lng: -0.1417 }, // 76 Venn St, SW4 0AT
  "Crouch End Picturehouse":    { lat: 51.5762, lng: -0.1202 }, // 5-7 Topsfield Parade, N8 8PR
  "Ealing Picturehouse":        { lat: 51.5130, lng: -0.3048 }, // 197 New Broadway, W5 2XA
  "East Dulwich Picturehouse":  { lat: 51.4563, lng: -0.0640 }, // 66 Grove Vale, SE22 8DT
  "Finsbury Park Picturehouse": { lat: 51.5647, lng: -0.1071 }, // 8-12 Stroud Green Rd, N4 2DF
  "Greenwich Picturehouse":     { lat: 51.4773, lng: -0.0097 }, // 180 Greenwich High Rd, SE10 8NN
  "Hackney Picturehouse":       { lat: 51.5413, lng: -0.0556 }, // 270 Mare Street, E8 1HE
  "Picturehouse Central":       { lat: 51.5118, lng: -0.1337 }, // 9-12 Shaftesbury Avenue, W1D 7EZ
  "Ritzy Picturehouse":         { lat: 51.4630, lng: -0.1142 }, // Coldharbour Lane, Brixton, SW2 1JG
  "The Gate Picturehouse":      { lat: 51.5074, lng: -0.1968 }, // 87 Notting Hill Gate, W11 3JZ
  "West Norwood Picturehouse":  { lat: 51.4269, lng: -0.1068 }, // 95 Knights Hill, SE27 0LR
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
  "BFI Southbank":         { lat: 51.5054, lng: -0.1143 }, // Belvedere Rd, SE1 8XT
  "Ciné Lumière":          { lat: 51.4967, lng: -0.1743 }, // 17 Queensberry Place, South Kensington, SW7 2DT
  "The Arzner":            { lat: 51.5265, lng: -0.1219 }, // 35 Floral Street, Covent Garden, WC2E 9DP
  "The Nickel":            { lat: 51.4613, lng: -0.1173 }, // 23 Coldharbour Lane, Brixton, SW9 8PJ
  // Everyman venues (ENABLE_EVERYMAN scraper)
  "Everyman Baker Street":          { lat: 51.5225, lng: -0.1573 }, // 96-98 Baker St, W1U 6TJ
  "Everyman Barnet":                { lat: 51.6479, lng: -0.2063 }, // The Spires, High St, EN5 5XY
  "Everyman Belsize Park":          { lat: 51.5541, lng: -0.1637 }, // 203 Haverstock Hill, NW3 4QG
  "Everyman Borough Yards":         { lat: 51.5054, lng: -0.0977 }, // Borough Yards, SE1 9PA
  "Everyman Brentford":             { lat: 51.4890, lng: -0.2869 }, // Brentford, TW8
  "Everyman Broadgate":             { lat: 51.5197, lng: -0.0857 }, // 2 Finsbury Ave, EC2M 2PP
  "Everyman Canary Wharf":          { lat: 51.5050, lng: -0.0181 }, // South Colonnade, E14 5AA
  "Everyman Chelsea":               { lat: 51.4850, lng: -0.1691 }, // 279 King's Road, SW3 5EW
  "Everyman Crystal Palace":        { lat: 51.4156, lng: -0.0763 }, // Westow St, SE19 3AF
  "Everyman Hampstead":             { lat: 51.5574, lng: -0.1744 }, // 5 Hollybush Vale, NW3 6TX
  "Everyman King's Cross":          { lat: 51.5376, lng: -0.1244 }, // 10 Stable St, N1C 4DQ
  "Everyman Maida Vale":            { lat: 51.5245, lng: -0.1858 }, // 22 Delaware Rd, W9 2LA
  "Everyman Muswell Hill":          { lat: 51.5893, lng: -0.1445 }, // Muswell Hill Broadway, N10
  "Everyman Screen on the Green":   { lat: 51.5361, lng: -0.1025 }, // 83 Upper St, N1 0NP
  "Everyman Stratford International": { lat: 51.5430, lng: -0.0012 }, // 1 Theatre Square, E15 1BX
  "Everyman The Whiteley":          { lat: 51.5120, lng: -0.1883 }, // 151 Queensway, W2 4SB
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
