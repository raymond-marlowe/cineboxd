# cineboxd

Find your Letterboxd watchlist films screening at London's independent cinemas.

Enter your Letterboxd username (or upload a CSV export) and see which films on your watchlist are currently showing at London's independent cinemas — with posters, ratings, booking links, calendar export, and a map view.

<!-- ![Screenshot](screenshot.png) -->

## Quick start

```bash
npm install
echo "TMDB_API_KEY=your_key_here" > .env.local
npm run dev
```

Get a free TMDB API key at [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api). The app works without it, but you won't see posters or ratings.

Open [localhost:3000](http://localhost:3000).

For the screenings cache (optional but recommended in production), set `KV_REST_API_URL` and `KV_REST_API_TOKEN` from an [Upstash Redis](https://upstash.com) database. Without these, the app falls back to a live scrape on every request.

## How it works

1. Fetches your public Letterboxd watchlist (or parses your CSV export)
2. Reads upcoming screenings from Redis cache (populated by `/api/refresh-screenings`; falls back to a live scrape if cache is empty)
3. Matches films using fuzzy title matching with year validation
4. Enriches results with posters, directors, and ratings from TMDB

## Features

- **Username or CSV** — enter your Letterboxd username or upload a watchlist CSV
- **Watch together** — enter 2–5 Letterboxd usernames to find films on all (or some) watchlists that are currently screening
- **Bookmarkable** — URLs like `/?user=yourname` auto-load results
- **Calendar export** — download screenings as ICS files
- **Three views** — list view with film cards, monthly calendar view, or interactive map view
- **Venue filtering** — filter results by cinema
- **Location filtering** — enter a UK postcode to filter and sort by distance
- **Venues directory** — `/venues` lists all 27+ supported cinemas with search, A–Z / by-chain sort, and a Leaflet map view showing all venue pins

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for full technical documentation: data flow, scraper details, matching logic, caching, deployment, and current status.

## Deploy

Push to GitHub and import in [Vercel](https://vercel.com). Set environment variables in Vercel project settings:

| Variable | Required | Description |
|---|---|---|
| `TMDB_API_KEY` | Recommended | Enables posters, ratings, and director info |
| `KV_REST_API_URL` | Recommended | Upstash Redis REST URL |
| `KV_REST_API_TOKEN` | Recommended | Upstash Redis REST token |
| `REFRESH_SECRET` | Yes (for cron) | Bearer token for `POST /api/refresh-screenings` |
| `ENABLE_CURZON_OCAPI` | Optional | Set to `true` to enable Curzon main-site venues (Soho, Camden, Mayfair, etc.) |
| `ENABLE_PICTUREHOUSE` | Optional | Set to `true` to enable Picturehouse venues (Central, Hackney, Ritzy, Gate, etc.) |
| `ENABLE_EVERYMAN` | Optional | Set to `true` to enable Everyman venues (Hampstead, Borough Yards, King's Cross, etc.) |

Set up a daily cron job to call `POST /api/refresh-screenings` with `Authorization: Bearer <REFRESH_SECRET>` to keep screenings fresh.

## Built with

Next.js, React, Tailwind CSS, Cheerio, Fuse.js, TMDB API, Upstash Redis, Leaflet.
