import { Screening } from "@/lib/types";

// TODO: Picturehouse scraper disabled — the API at picturehouses.com/api/scheduled-movies-ajax
// returns data, but the results did not match what was actually listed on the website.
// The constructed booking URLs (movie-details/...) may also be invalid.
//
// To re-enable:
//   1. Verify that API responses match the public website listings
//   2. Fix the booking URL format (current pattern doesn't resolve to valid pages)
//   3. Re-add scrapePicturehouse to scrapers/index.ts
//
// API details (verified working as of Feb 2026):
//   POST https://www.picturehouses.com/api/scheduled-movies-ajax
//   Body: cinema_id=010  (Hackney), 022 (Central), 016 (Gate), etc.
//   Headers: Content-Type: application/x-www-form-urlencoded, X-Requested-With: XMLHttpRequest
//   Returns: { response: "success", movies: [{ Title, ScheduledFilmId, show_times: [...] }] }

export async function scrapePicturehouse(): Promise<Screening[]> {
  return [];
}
