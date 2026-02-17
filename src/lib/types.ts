export interface WatchlistFilm {
  title: string;
  year: number | null;
  letterboxdUri: string;
}

export interface Screening {
  title: string;
  year: number | null;
  date: string; // ISO date string YYYY-MM-DD
  time: string; // HH:mm
  venue: string;
  bookingUrl: string | null;
  format: string | null; // e.g. "35mm", "4K", "70mm"
}

export interface FilmMetadata {
  posterPath: string | null;
  overview: string | null;
  director: string | null;
  tmdbRating: number | null;
  imdbId: string | null;
}

export interface MatchedScreening {
  film: WatchlistFilm;
  screenings: Screening[];
  metadata?: FilmMetadata;
}
