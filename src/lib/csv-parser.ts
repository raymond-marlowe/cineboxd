import Papa from "papaparse";
import { WatchlistFilm } from "./types";

interface LetterboxdRow {
  Name: string;
  Year: string;
  "Letterboxd URI": string;
  Date: string;
}

export function parseWatchlistCsv(csvText: string): WatchlistFilm[] {
  const result = Papa.parse<LetterboxdRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  return result.data
    .filter((row) => row.Name)
    .map((row) => ({
      title: row.Name.trim(),
      year: row.Year ? parseInt(row.Year, 10) : null,
      letterboxdUri: row["Letterboxd URI"]?.trim() ?? "",
    }));
}

export function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/[^\w\s]/g, "");
}
