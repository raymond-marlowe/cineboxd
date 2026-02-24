# Cineboxd Architecture

## 1. Project Overview

Cineboxd is a web app that checks whether any films on your Letterboxd watchlist are currently showing at independent cinemas in London. You either enter your Letterboxd username or upload your watchlist as a CSV file. The app reads upcoming screenings from a Redis cache (refreshed daily by a cron job), matches them against your watchlist using fuzzy title matching, and shows you the results with posters, ratings, and booking links. You can also export screenings to your calendar or view them on an interactive map.

## 2. Tech Stack

| Technology | Version | What it does |
|---|---|---|
| [Next.js](https://nextjs.org) | 16.1.6 | The web framework — handles both the website (frontend) and the server-side API that processes requests. |
| [React](https://react.dev) | 19.2.3 | The UI library that renders the interactive interface in the browser. |
| [TypeScript](https://www.typescriptlang.org) | ^5 | A stricter version of JavaScript that catches bugs by requiring you to declare data types. |
| [Tailwind CSS](https://tailwindcss.com) | ^4 | A styling system where you write design instructions directly in the HTML (e.g. `text-sm text-muted`). |
| [Cheerio](https://cheerio.js.org) | ^1.2.0 | Reads and extracts data from HTML pages (used to scrape cinema websites and Letterboxd watchlists). |
| [Fuse.js](https://www.fusejs.io) | ^7.1.0 | A fuzzy search library — finds approximate matches between film titles even when spelling differs slightly. |
| [PapaParse](https://www.papaparse.com) | ^5.5.3 | Parses CSV (spreadsheet) files — used to read the Letterboxd watchlist export. |
| [TMDB API](https://developer.themoviedb.org) | v3 | A free movie database API — provides poster images, plot summaries, directors, and ratings. |
| [Upstash Redis](https://upstash.com) | 1.36.2 | Serverless Redis — stores the scraped screenings so every user request reads from cache instead of triggering a live scrape. |
| [Leaflet](https://leafletjs.com) / [react-leaflet](https://react-leaflet.js.org) | ^4 | Interactive map library — powers the Map view showing screening venues as pins. |
| [Vercel](https://vercel.com) | — | The hosting platform where the app runs in production. |
| [Geist](https://vercel.com/font) | — | The font used throughout the interface (loaded via `next/font`). |

## 3. Project Structure

```
cineboxd/
├── src/
│   ├── app/                          # Next.js app router (pages + API)
│   │   ├── api/
│   │   │   ├── match/
│   │   │   │   └── route.ts          # POST /api/match — main API endpoint
│   │   │   └── refresh-screenings/
│   │   │       └── route.ts          # GET/POST /api/refresh-screenings — cache health + scrape trigger
│   │   ├── about/
│   │   │   └── page.tsx              # /about — static about page
│   │   ├── globals.css               # CSS custom properties (colors, fonts, Leaflet overrides)
│   │   ├── layout.tsx                # Root HTML layout, metadata, footer
│   │   └── page.tsx                  # / — main page (input, results, calendar, map)
│   │
│   ├── components/
│   │   ├── calendar.tsx              # Monthly calendar view for screenings
│   │   ├── venue-map.tsx             # Interactive Leaflet map view (react-leaflet)
│   │   └── SupportedVenues.tsx       # Chip strip listing all supported cinemas
│   │
│   ├── lib/                          # Shared utilities
│   │   ├── types.ts                  # TypeScript interfaces (WatchlistFilm, Screening, Subscription, etc.)
│   │   ├── cache.ts                  # In-memory cache with TTL (TMDB + shared CSV lists)
│   │   ├── redis.ts                  # Upstash Redis client singleton + key constants
│   │   ├── csv-parser.ts             # Parses Letterboxd CSV exports into WatchlistFilm[]
│   │   ├── letterboxd-rss.ts         # Fetches watchlist from Letterboxd by username (HTML scraping)
│   │   ├── matcher.ts                # Fuzzy film title matching (exact → Fuse.js → token overlap)
│   │   ├── tmdb.ts                   # TMDB API client (posters, ratings, director, IMDb ID)
│   │   ├── rate-limit.ts             # In-memory sliding-window rate limiter (10 req/60s per IP)
│   │   ├── ics.ts                    # Generates ICS calendar files for screenings
│   │   ├── subscriptions.ts          # JSON-file subscription store (read/write/add/remove)
│   │   └── venues.ts                 # Hardcoded venue coordinates + Haversine distance utilities
│   │
│   └── scrapers/                     # Cinema listing scrapers (14 active)
│       ├── index.ts                  # Runs all scrapers in parallel, collects results
│       ├── prince-charles.ts         # Prince Charles Cinema (HTML)
│       ├── close-up.ts               # Close-Up Film Centre (HTML)
│       ├── ica.ts                    # ICA Cinema (HTML)
│       ├── barbican.ts               # Barbican Cinema (HTML)
│       ├── rio.ts                    # Rio Cinema (embedded JSON)
│       ├── genesis.ts                # Genesis Cinema (HTML — Admit-One CMS)
│       ├── arthouse-crouch-end.ts    # Arthouse Crouch End (HTML — Savoy Systems)
│       ├── act-one.ts                # ActOne Cinema (pre-rendered HTML — Indy Systems SPA)
│       ├── phoenix.ts                # Phoenix Cinema (two-stage HTML — Savoy Systems)
│       ├── lexi.ts                   # The Lexi Cinema (embedded JSON — Savoy Systems)
│       ├── garden.ts                 # Garden Cinema (HTML)
│       ├── regent-street.ts          # Regent Street Cinema (GraphQL — Indy Systems)
│       ├── rich-mix.ts               # Rich Mix (two-pass HTML — Spektrix)
│       ├── jw3.ts                    # JW3 (Spektrix REST API)
│       └── picturehouse.ts           # Picturehouse Cinemas (DISABLED — API unreliable)
│
├── .env.local                        # Environment variables (TMDB_API_KEY, KV_*, REFRESH_SECRET)
├── next.config.ts                    # Next.js configuration
├── tsconfig.json                     # TypeScript compiler configuration
├── postcss.config.mjs                # PostCSS config (Tailwind plugin)
├── package.json                      # Dependencies and scripts
└── ARCHITECTURE.md                   # This file
```

## 4. Data Flow

### Username flow

```
Browser                          Server (/api/match)                    External
───────                          ───────────────────                    ────────
User types username
and clicks Search
        │
        ▼
POST /api/match
Content-Type: application/json
{ "username": "alice" }
        │
        ├──────── Rate limit check (rate-limit.ts) ──── 429 if exceeded
        │
        ▼
        ├──────── Fetch watchlist (letterboxd-rss.ts) ──── GET letterboxd.com/alice/watchlist/
        │         Parse HTML with Cheerio                  GET .../page/2/, /page/3/, etc.
        │         Extract data-item-name, data-target-link
        │         → WatchlistFilm[]
        │
        ▼
        ├──────── Read screenings (redis.ts) ──────────── Redis GET screenings:v1
        │         If cache hit → use cached Screening[]    (populated by /api/refresh-screenings)
        │         If cache miss → live scrape (fallback):
        │           All 14 scrapers run in parallel
        │           Failed scrapers are silently skipped
        │           Results written to Redis (24h TTL)
        │         → Screening[]
        │
        ▼
        ├──────── Match films (matcher.ts)
        │         1. Exact normalized title match
        │         2. Fuse.js fuzzy match (threshold 0.15)
        │         3. Token overlap check (≥60%)
        │         4. Year validation
        │         → MatchedScreening[]
        │
        ▼
        ├──────── Enrich with TMDB (tmdb.ts) ──────────── GET api.themoviedb.org/3/search/movie
        │         Fetch poster, director, rating             GET api.themoviedb.org/3/movie/{id}
        │         Cached for 6 hours
        │         → MatchedScreening[] with metadata
        │
        ▼
JSON response ─────────────────────────────────────────── Browser renders results
{ watchlistCount, screeningsScraped, matches }             URL updates to /?user=alice
```

### CSV flow

Same as above, except:
- The request is `multipart/form-data` with a `csv` field
- The CSV is parsed by `csv-parser.ts` using PapaParse instead of fetching from Letterboxd
- After parsing, the watchlist is cached with a random 8-char hex ID (`list-<id>`) and a 24-hour TTL
- The API returns `listId` in the response; the frontend updates the URL to `/?list=<id>`

### Shared CSV link flow

```
Browser                          Server (/api/match)
───────                          ───────────────────
User opens /?list=abc123
        │
        ▼
POST /api/match
Content-Type: application/json
{ "listId": "abc123" }
        │
        ├──────── Look up getCached("list-abc123")
        │         If expired → 410 { error, expired: true }
        │
        ▼
        ├──────── Match + enrich (same as other flows)
        │
        ▼
JSON response ──────────────────── Browser renders results
{ watchlistCount, screeningsScraped, matches, listId }
```

### Multi-user ("Watch together") flow

```
Browser                          Server (/api/match)                    External
───────                          ───────────────────                    ────────
User enters 2-5 usernames
and clicks "Find shared films"
        │
        ▼
POST /api/match
Content-Type: application/json
{ "usernames": ["alice", "bob"] }
        │
        ├──────── Rate limit check ──── 429 if exceeded
        │
        ▼
        ├──────── Fetch all watchlists in parallel ──── Promise.allSettled
        │         Per-user errors collected in userErrors   (letterboxd-rss.ts)
        │         If ALL fail → 400
        │
        ▼
        ├──────── Deduplicate films across users
        │         Map<filmKey, Set<username>>
        │         filmKey = normalizeTitle(title) + "|" + (year ?? "")
        │         Build union WatchlistFilm[]
        │
        ▼
        ├──────── Match + enrich (same as single-user)
        │
        ▼
        ├──────── Annotate each match with users[] array
        │
        ▼
JSON response ─────────────────────────────────────────── Browser splits results
{ watchlistCount, screeningsScraped, matches,              shared = users.length === totalUsers
  userErrors?, totalUsers }                                partial = users.length < totalUsers
                                                           URL updates to /?users=alice,bob
```

**API response fields (multi-user only):**
- `totalUsers` (number) — count of successfully fetched users
- `userErrors` (Record<string, string>) — per-username error messages (omitted if none)
- `users` on each match (string[]) — which usernames have this film on their watchlist

### Files involved at each step

| Step | Files |
|---|---|
| Browser input + submit | `page.tsx` |
| API entry point + rate limiting | `api/match/route.ts`, `rate-limit.ts` |
| Watchlist from username | `letterboxd-rss.ts` |
| Watchlist from CSV | `csv-parser.ts` |
| Screenings cache read | `redis.ts`, `api/match/route.ts` |
| Cinema scraping (fallback / cron) | `scrapers/index.ts`, `prince-charles.ts`, `close-up.ts`, `ica.ts`, `barbican.ts`, `rio.ts`, `genesis.ts`, `arthouse-crouch-end.ts`, `act-one.ts`, `phoenix.ts`, `lexi.ts`, `garden.ts`, `regent-street.ts`, `rich-mix.ts`, `jw3.ts` |
| Film matching | `matcher.ts`, `csv-parser.ts` (for `normalizeTitle`) |
| TMDB enrichment | `tmdb.ts`, `cache.ts` |
| Results display | `page.tsx`, `calendar.tsx` |
| ICS export | `ics.ts` (called from `page.tsx`) |

## 5. Scrapers

### Prince Charles Cinema — ENABLED

- **URL:** `https://www.princecharlescinema.com/next-7-days/`
- **Method:** HTML scraping with Cheerio
- **Selectors:**
  - `.day` — day container
  - `.day h4` — date header (e.g. "Wednesday 18 Feb 2026" or "Today")
  - `.performance-dayslist` — individual screening
  - `.leftsideperf a` — film title
  - `.time` — showtime (12h format, e.g. "2:45 pm")
  - `.movietag .tag` — format tags (e.g. "35mm")
  - `a.film_book_button` — booking link
- **Year extraction:** From title suffix like "(1973)"
- **Returns:** Title, year, date, time, venue, booking URL, format
- **Limitations:** Relies on "next 7 days" page structure; format tags may not always be present.
- **Reliability:** High — stable HTML structure.

### Close-Up Film Centre — ENABLED

- **URL:** `https://www.closeupfilmcentre.com/film_programmes/`
- **Method:** HTML scraping with Cheerio
- **Selectors:**
  - `.inner_block_2_r_block div` — calendar entries containing date+time text and a link
- **Date/time parsing:** Regex on text like "Tue 17 Feb 8:15pm" (handles both `.` and `:` separators)
- **Returns:** Title, date, time, venue, booking URL (prefixed with base URL)
- **Limitations:** No year or format data. Year is inferred from current date. The selector is fragile — depends on specific div nesting.
- **Reliability:** Medium — small venue with infrequent site changes, but the selectors are not very specific.

### ICA Cinema — ENABLED

- **URL:** `https://www.ica.art/next-7-days`
- **Method:** HTML scraping with Cheerio
- **Selectors:**
  - `.item.films` — film items
  - `.docket-date` — date headers (found by walking backwards through siblings, up to 30 elements)
  - `.title` — film title text
  - `a[href^='/films/']` — booking link
  - `.time-slot` — showtime(s) per film
- **Title cleaning:** Strips "UK PREMIERE", "WORLD PREMIERE", "PREVIEW" prefixes
- **Returns:** Title, date, time, venue, booking URL (prefixed with `https://www.ica.art`)
- **Limitations:** No year or format data. The backwards-sibling walk for dates is fragile — if ICA restructures their HTML, dates may default to today. Multiple time slots per film each become separate Screening entries.
- **Reliability:** Medium — the date-finding heuristic is the weakest part.

### Barbican Cinema — ENABLED

- **URL:** `https://www.barbican.org.uk/whats-on/cinema`
- **Method:** HTML scraping with Cheerio
- **Selectors:**
  - `.cinema-listing-card` — film cards
  - `.cinema-listing-card__title` — title (may have smart quotes)
  - `.cinema-instance-list` — date section within a card
  - `.cinema-instance-list__title` — date header
  - `.cinema-instance-list__instance a` — booking link (text is the time)
- **Title cleaning:** Strips surrounding quotes (regular and smart quotes)
- **Year extraction:** From title suffix like "(1973)"
- **Time parsing:** Handles both `.` and `:` separators (e.g. "19.30" or "19:30")
- **Returns:** Title, year, date, time, venue, booking URL
- **Limitations:** No format data. BEM class names are specific and stable but could change in a redesign.
- **Reliability:** High — well-structured BEM markup.

### Rio Cinema — ENABLED

- **URL:** `https://riocinema.org.uk/Rio.dll/WhatsOn`
- **Method:** Embedded JSON extraction (not traditional HTML scraping)
- **Data source:** The page contains `var Events = \n{JSON}` — the scraper finds this line and parses the next line as JSON
- **JSON structure:**
  ```
  { Events: [{ Title, Year, Tags: [{ Format }], Performances: [{ StartDate, StartTimeAndNotes, IsSoldOut, URL }] }] }
  ```
- **Title transformation:** Titles are UPPERCASE in the data — converted to Title Case
- **Returns:** Title, year, date, time, venue, booking URL (prefixed with `https://riocinema.org.uk/Rio.dll/`), format
- **Sold out handling:** Sets `bookingUrl` to `null` when `IsSoldOut === "Y"`
- **Limitations:** Depends on the `var Events =` pattern existing in the HTML. If Rio changes their frontend framework, this breaks entirely.
- **Reliability:** High — structured data is more reliable than CSS selectors, but the extraction method is fragile.

### Genesis Cinema — ENABLED

- **URL:** `https://genesiscinema.co.uk/GenesisCinema.dll/WhatsOn`
- **Platform:** Admit-One cinema management system
- **Method:** HTML scraping with Cheerio
- **Selectors:**
  - `div.whatson_panel[id^="panel_"]` — one per date; id encodes date as `panel_YYYYMMDD`
  - `div.grid-container-border` — one card per film within each panel
  - `h2.text-black > a` — film title and detail link (relative, e.g. `event/106837`)
  - `.perfButton` — booking buttons; text is the time (24h, e.g. "20:45"); `href` is the absolute Admit-One booking URL
- **Date parsing:** Extracted directly from panel id: `panel_20260218` → `2026-02-18`
- **Deduplication:** Each showing is listed twice in the HTML (desktop and mobile responsive copies); deduplicated by booking URL using a `Set`
- **Returns:** Title, year (from trailing `(YYYY)` in title), date, time, venue, booking URL, format (null)
- **Limitations:** Format tags (Subtitled, Audio Described, etc.) are present as `<img alt="...">` elements but not yet extracted.
- **Reliability:** High — panel IDs are stable structural identifiers.

### Arthouse Crouch End — ENABLED

- **URL:** `https://www.arthousecrouchend.co.uk/` (homepage)
- **Platform:** Savoy Systems; site built with Elementor/WordPress
- **Method:** HTML scraping with Cheerio
- **Selectors:**
  - `div.tabs > label` — date tab labels (e.g. "Today", "Thu 19 Feb")
  - `div.tab` — tab content panels; each immediately follows its label in the DOM
  - `.programmeinfo` — one per film per tab
  - `.show-title > a` — film title link; contains a `<span class="prog-cert">` with BBFC rating image that is stripped via `.clone().children().remove().end().text()`
  - `.OpenForSale > a` — available booking links; text begins with 24h time (e.g. "20:30...")
  - `.SoldOut > a` — sold-out booking links (included in results)
- **Booking URLs:** Absolute `http://arthousecrouchend.savoysystems.co.uk/ArthouseCrouchEnd.dll/...` URLs with unique `TcsPerformance_XXXXXXX` identifiers
- **Date parsing:** "Today" → current date; "Thu 19 Feb" → parsed day + month + inferred year
- **Returns:** Title, year (if present in title), date, time, venue, booking URL, format (null)
- **Reliability:** Medium — CSS class names are meaningful but could change in a WordPress theme update.

### ActOne Cinema — ENABLED (today only)

- **URL:** `https://www.actonecinema.co.uk/whats-on/`
- **Platform:** Indy Systems (Quasar/Vue SPA)
- **Method:** HTML scraping of pre-rendered SEO content with Cheerio
- **Note:** ActOne is a Vue SPA; film data is loaded via XHR after JS execution. However, the server pre-renders today's schedule in a visually-hidden `<div>` (z-index: -1000) inside `#q-app` for accessibility/SEO.
- **Selectors:**
  - `#q-app > div:first-child` — the hidden pre-rendered div
  - `p` elements containing `a[href*="/movie/"]` anchors — today's schedule as formatted text
  - `a[href*="/movie/"]` — film title links
  - `a[href*="/checkout/showing/"]` — booking links; text is the time in 12-hour format (e.g. "12:30PM")
- **Date:** Always today's date (full weekly schedule not available without JS execution)
- **Time parsing:** Converts 12-hour AM/PM to 24-hour format
- **Booking URLs:** Absolute `https://www.actonecinema.co.uk/checkout/showing/{slug}/{id}` URLs
- **Returns:** Title, date (today), time, venue, booking URL, year (null — not in title text), format (null)
- **Limitations:** Only today's screenings are available; the pre-rendered div structure may change if Indy Systems updates their platform.
- **Reliability:** Medium — depends on the hidden pre-rendered content remaining in the HTML.

### Phoenix Cinema — ENABLED

- **CMS page:** `https://phoenixcinema.co.uk/whats-on/`
- **DLL base:** `https://www.phoenixcinema.co.uk/PhoenixCinemaLondon.dll/`
- **Platform:** Savoy Systems (same DLL backend as Arthouse Crouch End)
- **Method:** Two-stage HTML scraping with Cheerio
  1. Fetch the CMS page and collect all unique film IDs from `a[href*="?f="]` links
  2. Fetch each film detail page (`DLL/WhatsOn?f=<id>`) in parallel via `Promise.allSettled`
- **Selectors on each film detail page:**
  - `title` tag → film name (strip "Phoenix Cinema | " prefix)
  - `ul.performances > li.performance` — one per screening slot
  - `span.date.column` — date text ("Thu 19 Feb")
  - `span.perf-time` — time in 24-hour format ("19:40")
  - `a.button.booking[href]` — relative booking URL (prepend DLL base)
  - `span.tag` inside `li.performance` — format tags ("CC", "AD", "B", "R"); "SO" = sold out
- **Date parsing:** "Thu 19 Feb" → parsed day + 3-letter month + inferred year (same helper as Arthouse)
- **Deduplication:** Pages render performances twice (desktop/mobile); deduplicated by booking URL using a `Set`
- **Returns:** Title, year (from trailing `(YYYY)` in title), date, time, venue, booking URL, format
- **Reliability:** Medium — depends on CMS page structure for film IDs + DLL film page structure for times.

### The Lexi Cinema — ENABLED

- **URL:** `https://thelexicinema.co.uk/TheLexiCinema.dll/WhatsOn`
- **Platform:** Savoy Systems (same JSON-in-HTML pattern as Rio Cinema)
- **Method:** Embedded JSON extraction (not HTML scraping)
- **Data source:** The page embeds all events as a JavaScript variable:
  ```
  var Events =
  {"Events":[...]}
  ```
- **JSON structure:**
  ```
  { Events: [{ Title, Year, Tags: [{ Format }], Performances: [{ StartDate, StartTimeAndNotes, IsSoldOut, URL, AD, HOH, SL, QA, FF }] }] }
  ```
- **Booking URL:** `StartDate` is "YYYY-MM-DD", `StartTimeAndNotes` is "HH:MM" (24h). `URL` is a relative path; prepend `https://thelexicinema.co.uk/TheLexiCinema.dll/`
- **Format:** Derived from per-performance boolean flags — `AD` (Audio Described), `HOH` (Subtitled), `SL` (Signed), `QA` (Q&A) — combined with `Tags[0].Format`
- **Returns:** Title, year (from `Year` field), date, time, venue, booking URL (null if sold out), format
- **Reliability:** High — structured JSON data is more stable than CSS selectors.

### Garden Cinema — ENABLED

- **URL:** `https://thegardencinema.co.uk/` (homepage is the full what's-on schedule)
- **Platform:** WordPress with custom Savoy Systems integration (bookings at `bookings.thegardencinema.co.uk`)
- **Method:** HTML scraping with Cheerio
- **Selectors:**
  - `.date-block[data-date]` — one per date; `data-date` is "YYYY-MM-DD" (no parsing needed)
  - `.films-list__by-date__film` — one per film within a date block
  - `h1.films-list__by-date__film__title` — film title, with child `<span>` (BBFC rating) stripped
  - `.screening-panel` — one per individual screening slot
  - `span.screening-time > a.screening` — booking link; text is the time ("13:00"), href is the absolute booking URL
  - `[class*="screening-tag"]` — format/attribute tags; class includes "ext-audio_description", "ext-intro", "ext-q_and_a" etc.
- **Booking URLs:** Absolute `https://bookings.thegardencinema.co.uk/TheGardenCinema.dll/...` URLs
- **Returns:** Title, year (from trailing `(YYYY)` in title), date, time, venue, booking URL, format
- **Reliability:** High — semantic CSS classes and data attributes are stable.

### Picturehouse Cinemas — DISABLED

- **Planned API:** `POST https://www.picturehouses.com/api/scheduled-movies-ajax`
- **Body:** `cinema_id=010` (Hackney), `022` (Central), `016` (Gate), etc.
- **Headers:** `Content-Type: application/x-www-form-urlencoded`, `X-Requested-With: XMLHttpRequest`
- **Status:** Disabled because API data did not match actual website listings, and booking URLs were invalid.
- **To re-enable:** Verify API matches website, fix booking URL format, add back to `scrapers/index.ts`.

### Regent Street Cinema — ENABLED

- **URL:** `https://www.regentstreetcinema.com/sitemap.xml` (slug discovery) + `https://api-uk.indy.systems/graphql` (data)
- **Platform:** Indy Systems SPA (same as ActOne Cinema). No server-rendered HTML — data comes from a public GraphQL API.
- **Method:** Three-stage GraphQL approach with chunked concurrency (20 slugs / 10 showings per batch):
  1. Fetch `sitemap.xml` → extract `/movie/{slug}/` URLs (typically ~114 slugs, mostly historical archive)
  2. `findMovieBySlug(urlSlug, siteIds:[85])` → resolve slug to `{ id, name }`
  3. `movie(id) { showings { id, time, published, showingBadges } }` → filter `published=true` AND `time > now` (UTC)
- **Date/time:** Showings are returned as UTC ISO timestamps; converted to London local time via `Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London" })`.
- **Format:** `showingBadges[].displayName` joined — e.g. "Reserved Seating, 130th Anniversary Celebrations"
- **Booking URL:** `https://www.regentstreetcinema.com/checkout/showing/{showingId}`
- **Returns:** Title (year stripped from parenthetical if present), year, date, time, venue, booking URL, format
- **Reliability:** Medium-high — GraphQL API is stable but requires two round-trips per film and the sitemap includes many archived films.

### Rich Mix — ENABLED

- **URL (listing):** `https://richmix.org.uk/whats-on/cinema/`
- **URL (per film):** `https://richmix.org.uk/cinema/{slug}/`
- **Platform:** WordPress with Spektrix ticketing (booking IDs are Spektrix instance IDs)
- **Method:** Two-pass HTML scraping with Cheerio:
  - Pass 1 (listing): `div.tease.tease-cinema` → `header h3 a` for title + film page URL
  - Pass 2 (per film, parallel): `div#dates-and-times div.day` → `div.weekday` (date text) + `div.times a.time` (time + booking href)
- **Date parsing:** Human-readable text — "today" / "tomorrow" resolved relative to current date; "Fri 20 Feb" parsed with month-rollover logic.
- **Time parsing:** Dot-separated 12h format, e.g. "5.40pm" → "17:40".
- **Format:** `null` (no per-screening format tags on Rich Mix pages)
- **Booking URL:** `https://richmix.org.uk` + `a.time[href]`, e.g. `https://richmix.org.uk/book-online/1818209`
- **Returns:** Title, year (if parenthetical in listing), date, time, venue, booking URL, format
- **Reliability:** High — standard HTML, no JavaScript required; static HTML includes both visible and collapsed date sections.

### JW3 — ENABLED

- **URL:** `https://system.spektrix.com/jw3/api/v3/events` (event list) + `.../events/{id}/instances` (per-event showtime list)
- **Platform:** Drupal CMS frontend; ticketing via Spektrix REST API (public, no auth required)
- **Method:** Two-call Spektrix API approach (no HTML scraping needed):
  1. `GET /events` → filter `attribute_Genre === "Cinema"` (typically ~32 of ~253 total events)
  2. `GET /events/{id}/instances` → per-screening slots; filter `cancelled !== true` and `dateStr >= today`
- **Series handling:** If `attribute_SeriesOrFestival` is set (e.g. "Babykino"), the prefix is stripped from the event name to give the underlying film title (e.g. "Babykino: Marty Supreme" → title "Marty Supreme", format "Babykino").
- **Date/time:** `instance.start` is a local London ISO datetime (no timezone suffix), e.g. `"2026-02-16T16:10:00"`.
- **Format:** Series name + `attribute_SLCaptioned` (signed language captioning) + non-English `attribute_Language` joined with ", "
- **Booking URL:** `https://www.jw3.org.uk/whats-on/{slugified-event-name}` (best-effort; constructed by lowercasing + hyphenating the event name)
- **Returns:** Title, year, date, time, venue, booking URL, format
- **Reliability:** High — structured JSON API is stable; slug-based booking URLs are best-effort but accurate for most events.

### Everyman Cinema — NOT IMPLEMENTED

- **Reason:** The site uses Gatsby with client-side rendering. Showtimes are loaded via internal APIs that would need reverse-engineering. Not scrapable with simple `fetch` + Cheerio.

## 6. Matching Logic

Film matching happens in `src/lib/matcher.ts` and uses a three-stage pipeline:

### Stage 1: Exact normalized match
- Both the watchlist title and screening title are normalized: lowercased, trimmed, non-word characters removed (via `normalizeTitle` in `csv-parser.ts`)
- A `Map<normalizedTitle, Screening[]>` is built from all screenings
- Direct lookup — instant, no false positives

### Stage 2: Fuzzy match with Fuse.js
- Only runs if Stage 1 found nothing
- **Fuse.js threshold: 0.15** (strict — 0 is exact, 1 matches anything; was originally 0.3)
- Searches the normalized title against all screening titles
- Each fuzzy result is then validated with the token overlap check (Stage 3)

### Stage 3: Token overlap validation
- Prevents false positives like "White Nights" matching "Boogie Nights"
- **Stop words removed:** the, a, an, of, and, in, at, to, for, is, on
- Both titles are tokenized into significant words
- The shorter token list is compared against the longer one
- **Threshold: ≥60%** of the shorter list's tokens must appear in the longer list
- If overlap is below 60%, the fuzzy match is rejected

### Year filtering
- After matching, if both the watchlist film and the screening have a year and they differ, the match is discarded
- If either side has no year, the match is kept (year is not required)

### Known edge cases
- Films with very short or very common titles (e.g. "Her", "IT") may match incorrectly or miss matches
- Remakes with the same title but different year rely on year filtering, which only works if the scraper extracts the year (Close-Up and ICA don't)
- Foreign-language films may have different English titles on Letterboxd vs. the cinema listing
- Sequels with similar names (e.g. "Alien" vs "Aliens") are generally handled by the token overlap check but edge cases exist

## 7. Caching

### Screenings cache (`src/lib/redis.ts` — Upstash Redis)
- **Storage:** Upstash Redis (persistent, shared across all serverless instances)
- **TTL:** 24 hours (`ex: 86400`)
- **Keys:** `screenings:v1` (the `Screening[]` array), `screenings:updated_at` (ISO timestamp)
- **What's cached:** The full merged `Screening[]` result from all 14 scrapers
- **Populated by:** `POST /api/refresh-screenings` (intended to be called by a daily cron job)
- **Read by:** `GET /api/match` — if the key exists, the live scrape is skipped entirely
- **Fallback:** If `screenings:v1` is missing (first deploy, cache expired), `/api/match` falls back to a live scrape and writes the result back to Redis
- **Cooldown:** `POST /api/refresh-screenings` returns `{ skipped: true }` if `screenings:updated_at` is less than 30 minutes old, preventing redundant scrapes from rapid cron retries

### TMDB cache (`src/lib/cache.ts` — in-memory)
- **Keys:** `tmdb-{normalized-title}-{year-or-unknown}` (e.g. `tmdb-cure-1997`)
- **What's cached:** `FilmMetadata` objects (poster path, overview, director, rating, IMDb ID)
- **TTL:** Same 6 hours

### Shared list cache (same `cache.ts`)
- **Keys:** `list-{8-char-hex-id}` (e.g. `list-a1b2c3d4`)
- **What's cached:** `WatchlistFilm[]` from a CSV upload
- **TTL:** 24 hours (via `setCacheWithTTL`)
- **Created:** When a CSV is uploaded; the ID is returned to the frontend for shareable URLs

### Rate limit store (`src/lib/rate-limit.ts`)
- **Storage:** Separate in-memory `Map<string, number[]>` (IP → timestamps)
- **Window:** 60 seconds (timestamps older than this are pruned)
- **Not technically a cache** — tracks request history rather than caching responses

### Important notes
- The screenings cache is in Redis and persists across deploys and cold starts
- TMDB, rate limit, and shared list caches are in-memory and reset on every cold start
- On Vercel, in-memory caches are per-instance — not shared across concurrent function invocations
- There is no cache invalidation mechanism other than TTL expiry and the 30-minute cooldown on the refresh endpoint

## 8. Environment Variables

| Variable | Required | Description | Where to get it |
|---|---|---|---|
| `TMDB_API_KEY` | Recommended | API key for The Movie Database. Without it, films display without posters, ratings, or director info. The app still works but results are less rich. | Sign up at [themoviedb.org](https://www.themoviedb.org/settings/api) and request an API key (free for non-commercial use). |
| `KV_REST_API_URL` | Recommended | Upstash Redis REST endpoint URL. Without it, every `/api/match` request triggers a live scrape (~10s). | Create a free database at [upstash.com](https://upstash.com), then copy the REST URL from the database dashboard. |
| `KV_REST_API_TOKEN` | Recommended | Upstash Redis REST token (paired with `KV_REST_API_URL`). | Same Upstash dashboard as above. |
| `REFRESH_SECRET` | Yes (for cron) | Bearer token required to call `POST /api/refresh-screenings`. Prevents unauthorized cache refreshes. | Generate any random string (e.g. `openssl rand -hex 32`). |

All scraper URLs are hardcoded. The `RESEND_*` and `NOTIFY_SECRET` variables for the email subscription feature are documented separately in the Weekly Email Subscription section.

## 9. How to Run Locally

```bash
# 1. Clone the repository
git clone <repo-url>
cd cineboxd

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.local.example .env.local
# Or create .env.local manually:
# TMDB_API_KEY=your_tmdb_api_key_here
# KV_REST_API_URL=https://your-db.upstash.io      (optional locally — app falls back to live scrape)
# KV_REST_API_TOKEN=your_token_here
# REFRESH_SECRET=any_random_secret

# 4. Start development server
npm run dev

# 5. Open in browser
# http://localhost:3000
```

### Available scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production (also runs TypeScript check) |
| `npm run start` | Start the production build locally |
| `npm run lint` | Run ESLint |

## 10. How to Deploy

### Vercel (recommended)

1. Push the repo to GitHub
2. Import the project in [Vercel](https://vercel.com/new)
3. Set environment variables in Vercel's project settings → Environment Variables:
   - `TMDB_API_KEY` — movie metadata
   - `KV_REST_API_URL` + `KV_REST_API_TOKEN` — Upstash Redis (create a free database at upstash.com)
   - `REFRESH_SECRET` — bearer token for the scrape cron job
4. Deploy — Vercel auto-detects Next.js and configures the build
5. Set up a daily cron job to keep screenings fresh:
   ```bash
   curl -X POST https://your-domain.com/api/refresh-screenings \
     -H "Authorization: Bearer <REFRESH_SECRET>"
   ```
   Use a service like [cron-job.org](https://cron-job.org), GitHub Actions, or Vercel Cron.

### DNS (if using a custom domain)

1. In Vercel → Project Settings → Domains, add your domain
2. At your DNS provider, add the records Vercel provides (typically a CNAME to `cname.vercel-dns.com`)

### Environment variables in production

| Variable | Where to set |
|---|---|
| `TMDB_API_KEY` | Vercel → Project Settings → Environment Variables |
| `KV_REST_API_URL` | Vercel → Project Settings → Environment Variables |
| `KV_REST_API_TOKEN` | Vercel → Project Settings → Environment Variables |
| `REFRESH_SECRET` | Vercel → Project Settings → Environment Variables |

## 11. Current Status

### Working

- **Username input:** Enter a Letterboxd username → fetches public watchlist → matches against cinema listings
- **CSV upload:** Drag-and-drop or click to upload a Letterboxd CSV export
- **URL bookmarking:** `/?user=username` auto-loads results on page visit
- **Film matching:** Three-stage matching pipeline (exact, fuzzy, token overlap) with year validation
- **TMDB enrichment:** Posters, directors, ratings, plot summaries, IMDb/Letterboxd links
- **Calendar view:** Monthly calendar with screening indicators and day expansion
- **Map view:** Interactive Leaflet map showing venue pins with screening counts; click a pin to see upcoming screenings for that venue
- **ICS export:** Download individual or all screenings as calendar events
- **Venue filtering:** Filter results by cinema
- **Rate limiting:** 10 requests per minute per IP
- **Watch together:** Enter 2-5 Letterboxd usernames to find films on all/some watchlists that are currently screening, with shared/partial split and per-user colour indicators
- **Shareable result URLs:** All results pages have a Share button that copies the current URL. Solo (`?user=`), together (`?users=`), and CSV (`?list=`) results all auto-load from URL on page visit. CSV shared links expire after 24 hours.
- **Redis screenings cache:** Scraped screenings are stored in Upstash Redis and refreshed daily via `POST /api/refresh-screenings`. User requests read from cache instead of triggering a live scrape.

### Scrapers

| Cinema | Status | Reliability | Notes |
|---|---|---|---|
| Prince Charles Cinema | Active | High | Stable HTML structure, good data quality |
| Barbican Cinema | Active | High | Well-structured BEM markup |
| Rio Cinema | Active | High | Embedded JSON, stable but fragile extraction |
| The Lexi Cinema | Active | High | Embedded JSON (Savoy Systems) |
| Garden Cinema | Active | High | Semantic HTML with data attributes |
| Rich Mix | Active | High | Standard two-pass HTML (Spektrix) |
| JW3 | Active | High | Public Spektrix REST API |
| Genesis Cinema | Active | High | Stable panel IDs (Admit-One CMS) |
| Close-Up Film Centre | Active | Medium | Fragile CSS selectors, no year data |
| ICA Cinema | Active | Medium | Date-finding heuristic walks siblings backwards |
| Arthouse Crouch End | Active | Medium | WordPress/Elementor — class names may change |
| Phoenix Cinema | Active | Medium | Two-stage Savoy Systems scrape |
| Regent Street Cinema | Active | Medium-high | GraphQL (Indy Systems) — two round-trips per film |
| ActOne Cinema | Active | Medium | Pre-rendered HTML only (Indy Systems SPA) — today only |
| Picturehouse Cinemas | Disabled | — | API data didn't match website |
| Everyman Cinema | Not built | — | Client-side rendered, not scrapable |

### Known limitations

- **Cloudflare:** Letterboxd's RSS feed is blocked by Cloudflare challenges from server-side requests. The app scrapes the HTML watchlist page instead, which works but returns 28 films per page (requiring pagination for large watchlists).
- **Private watchlists:** If a user's Letterboxd watchlist is set to private, the app cannot access it and shows an error.
- **Scraper fragility:** All scrapers depend on specific HTML structures. Any cinema website redesign will break its scraper until updated.
- **In-memory caches:** TMDB and rate-limit caches reset on every deploy/cold start and are not shared across serverless function instances on Vercel. The screenings cache is in Redis and is unaffected.
- **Rate limiting:** In-memory and per-instance — not globally enforced across Vercel's distributed infrastructure.
- **No year data from some scrapers:** Close-Up and ICA don't provide release years, which can cause incorrect matches for remakes or films with similar titles.
- **Fixed 2-hour ICS duration:** All calendar events assume a 2-hour runtime regardless of actual film length.

---

## Weekly Email Subscription Feature

### Overview

Users can subscribe to receive a weekly email digest listing which films from their Letterboxd watchlist are showing in London that week. Emails are sent via [Resend](https://resend.com).

### New API Routes

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/subscribe` | POST | None | Subscribe `{ email, username }` → `{ success, id }` |
| `/api/subscribe` | DELETE | None | Remove by `{ id }` → `{ success }` |
| `/api/unsubscribe` | GET | None | `?id=<id>` — one-click unsubscribe from email link; renders HTML confirmation |
| `/api/notify` | POST | Bearer token | Fetch all subscribers, match watchlists, send emails; returns `{ sent, skipped, errors }` |

### New Source Files

| File | Purpose |
|---|---|
| `src/lib/subscriptions.ts` | Read/write subscriptions to a local JSON file |
| `src/app/api/subscribe/route.ts` | Subscribe / unsubscribe by ID |
| `src/app/api/unsubscribe/route.ts` | One-click HTML unsubscribe page |
| `src/app/api/notify/route.ts` | Trigger email send to all subscribers |

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `RESEND_API_KEY` | Yes (for `/api/notify`) | API key from resend.com |
| `RESEND_FROM_EMAIL` | No | From address (e.g. `cineboxd <hello@yourdomain.com>`). Defaults to `onboarding@resend.dev` (Resend test sender — only delivers to verified addresses). |
| `NOTIFY_SECRET` | Yes (for `/api/notify`) | Bearer token required to call the notify route. Set via `Authorization: Bearer <secret>`. |
| `NEXT_PUBLIC_BASE_URL` | No | Production base URL for unsubscribe links. Defaults to `https://cineboxd.vercel.app`. |

### Data Storage

Subscriptions are stored as a JSON array in a flat file:

- **Local dev:** `<project-root>/data/subscriptions.json`
- **Vercel production:** `/tmp/subscriptions.json`

Detection: `process.env.VERCEL ? '/tmp' : path.join(process.cwd(), 'data')`

`data/subscriptions.json` is listed in `.gitignore` and should not be committed.

> **Important:** On Vercel, the filesystem outside `/tmp` is read-only, and `/tmp` is ephemeral — it is cleared between cold starts and deployments. This means **subscriptions do not persist across Vercel deployments or cold starts**. For a production-ready solution, migrate the JSON file store to a persistent database (e.g. Vercel Postgres, PlanetScale, Turso, Upstash Redis).

### Notify Data Flow

```
POST /api/notify (Authorization: Bearer <NOTIFY_SECRET>)
  │
  ├─ readSubscriptions()          → load all subscribers from JSON file
  ├─ scrapeAll()                  → fetch current London cinema listings (live scrape; does not read Redis)
  │
  └─ for each subscriber (parallel):
       ├─ fetchWatchlistByUsername(username)
       ├─ matchFilms(watchlist, screenings)
       ├─ fetchFilmMetadata() per match  (TMDB enrichment, if key set)
       ├─ filter to screenings within next 7 days
       ├─ if no matches → skip (no email sent)
       └─ resend.emails.send(...)  → deliver HTML digest
  │
  └─ return { sent, skipped, errors }
```

### Triggering Notifications

The `/api/notify` route is designed to be called by an external cron job (e.g. Vercel Cron, GitHub Actions, cron-job.org) once per week:

```bash
curl -X POST https://cineboxd.vercel.app/api/notify \
  -H "Authorization: Bearer <NOTIFY_SECRET>"
```

Example Vercel cron configuration (`vercel.json`):
```json
{
  "crons": [
    {
      "path": "/api/notify",
      "schedule": "0 9 * * 1"
    }
  ]
}
```
Note: Vercel Cron does not support custom headers, so for production use a third-party cron service that supports bearer auth headers, or an intermediate serverless function.

---

## Location-Based Venue Filtering

### Overview

Users can enter a UK postcode to filter and sort results by proximity to each cinema. No browser geolocation is requested — the feature is entirely opt-in via a text input. The postcode is saved to `localStorage` so it persists across sessions.

### Source File

`src/lib/venues.ts` — hardcoded lat/lng coordinates for each venue, Haversine distance function, distance formatter, and a helper to find the nearest venue in a set of screenings.

### Venue Coordinates

Coordinates are hardcoded. Keys must exactly match the `venue` string emitted by each scraper:

| Venue string | Address |
|---|---|
| `"Prince Charles Cinema"` | 7 Leicester Place, WC2H 7BY |
| `"Close-Up Film Centre"` | 97 Sclater Street, E1 6HR |
| `"ICA Cinema"` | The Mall, SW1Y 5AH |
| `"Barbican Cinema"` | Barbican Centre, Silk St, EC2Y 8DS |
| `"Rio Cinema"` | 107 Kingsland High St, E8 2PB |
| `"Genesis Cinema"` | 93-95 Mile End Rd, E1 4UJ |
| `"Arthouse Crouch End"` | 159A Tottenham Lane, N8 9BT |
| `"ActOne Cinema"` | 3 Medieval Street, SE1 2BY |
| `"Phoenix Cinema"` | 52 High Rd, N2 9PJ |
| `"The Lexi Cinema"` | 194B Chamberlayne Rd, NW10 3JU |
| `"Garden Cinema"` | 22-23 Great Newport St, WC2H 7JS |
| `"Regent Street Cinema"` | 309 Regent St, W1B 2UW |
| `"Rich Mix"` | 35-47 Bethnal Green Rd, E1 6LA |
| `"JW3"` | 341-351 Finchley Rd, NW3 6ET |

To add a new venue: add its scraper's `venue` constant as a key in `VENUE_COORDS` in `venues.ts`.

### Geocoding

Postcodes are resolved to lat/lng client-side via [postcodes.io](https://postcodes.io) — a free, no-auth UK postcode API:

```
GET https://api.postcodes.io/postcodes/<postcode>
→ { status: 200, result: { latitude, longitude } }
```

No API key required. UK postcodes only.

### Client-Side Logic (page.tsx)

1. On mount: load saved postcode from `localStorage` and immediately geocode it.
2. On postcode form submit: geocode the entered postcode; on success, save to `localStorage`.
3. **Max distance filter:** applied to `filteredMatches` — each match's screenings are filtered to venues within the chosen mile radius; matches with no remaining screenings are dropped.
4. **Sort by distance:** matches are re-sorted by the distance to their nearest venue.
5. **Distance badge:** each screening row shows the distance from the user's postcode to that venue (e.g. `"1.2 mi"`).
6. "Clear" button removes the postcode from state and `localStorage` and resets sort/filter.

### No New Environment Variables or API Routes

Everything runs client-side. No server changes were needed.
