# cineboxd

Find your Letterboxd watchlist films screening at London's independent cinemas.

Enter your Letterboxd username (or upload a CSV export) and see which films on your watchlist are currently showing at Prince Charles Cinema, Barbican, ICA, Close-Up Film Centre, and Rio Cinema — with posters, ratings, booking links, and calendar export.

<!-- ![Screenshot](screenshot.png) -->

## Quick start

```bash
npm install
echo "TMDB_API_KEY=your_key_here" > .env.local
npm run dev
```

Get a free TMDB API key at [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api). The app works without it, but you won't see posters or ratings.

Open [localhost:3000](http://localhost:3000).

## How it works

1. Fetches your public Letterboxd watchlist (or parses your CSV export)
2. Scrapes upcoming screenings from 5 London cinemas in parallel
3. Matches films using fuzzy title matching with year validation
4. Enriches results with posters, directors, and ratings from TMDB

## Features

- **Username or CSV** — enter your Letterboxd username or upload a watchlist CSV
- **Bookmarkable** — URLs like `/?user=yourname` auto-load results
- **Calendar export** — download screenings as ICS files
- **Two views** — list view with film cards or monthly calendar view
- **Venue filtering** — filter results by cinema

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for full technical documentation: data flow, scraper details, matching logic, caching, deployment, and current status.

## Deploy

Push to GitHub and import in [Vercel](https://vercel.com). Set `TMDB_API_KEY` in environment variables. That's it.

## Built with

Next.js, React, Tailwind CSS, Cheerio, Fuse.js, TMDB API.



