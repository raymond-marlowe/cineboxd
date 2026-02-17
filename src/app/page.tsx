"use client";

import { useState, useCallback, useMemo } from "react";
import { MatchedScreening, Screening } from "@/lib/types";
import { generateIcsEvent, generateIcsFile, downloadIcs } from "@/lib/ics";
import Calendar from "@/components/calendar";

interface MatchResponse {
  watchlistCount: number;
  screeningsScraped: number;
  matches: MatchedScreening[];
}

type AppState = "upload" | "loading" | "results";
type ViewMode = "list" | "calendar";

export default function Home() {
  const [state, setState] = useState<AppState>("upload");
  const [data, setData] = useState<MatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [venueFilter, setVenueFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      setError("Please upload a CSV file");
      return;
    }

    setState("loading");
    setError(null);

    const formData = new FormData();
    formData.append("csv", file);

    try {
      const res = await fetch("/api/match", { method: "POST", body: formData });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Something went wrong");
        setState("upload");
        return;
      }

      setData(json);
      setState("results");
    } catch {
      setError("Failed to connect to server");
      setState("upload");
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const reset = () => {
    setState("upload");
    setData(null);
    setError(null);
    setVenueFilter("all");
    setViewMode("list");
  };

  const venues = data
    ? [...new Set(data.matches.flatMap((m) => m.screenings.map((s) => s.venue)))]
    : [];

  const filteredMatches = data?.matches
    .map((m) => ({
      ...m,
      screenings:
        venueFilter === "all"
          ? m.screenings
          : m.screenings.filter((s) => s.venue === venueFilter),
    }))
    .filter((m) => m.screenings.length > 0);

  // Flattened screenings for the calendar view
  const flatScreenings = useMemo(() => {
    if (!filteredMatches) return [];
    return filteredMatches.flatMap((m) =>
      m.screenings.map((s) => ({ film: m.film, screening: s }))
    );
  }, [filteredMatches]);

  const handleDownloadSingleIcs = useCallback(
    (screening: Screening, filmTitle: string) => {
      const event = generateIcsEvent(screening, filmTitle);
      const content = generateIcsFile([event]);
      const safeName = filmTitle.replace(/[^a-z0-9]/gi, "-").toLowerCase();
      downloadIcs(content, `${safeName}.ics`);
    },
    []
  );

  const handleDownloadAllIcs = useCallback(() => {
    if (!filteredMatches) return;
    const events = filteredMatches.flatMap((m) =>
      m.screenings.map((s) => generateIcsEvent(s, m.film.title))
    );
    if (events.length === 0) return;
    const content = generateIcsFile(events);
    downloadIcs(content, "cineboxd-screenings.ics");
  }, [filteredMatches]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-6 flex items-center justify-between">
          <button onClick={reset} className="cursor-pointer">
            <h1 className="text-2xl font-bold tracking-tight">
              <span className="text-accent">cine</span>boxd
            </h1>
          </button>
          {state === "results" && (
            <button
              onClick={reset}
              className="text-sm text-muted hover:text-foreground transition-colors cursor-pointer"
            >
              Upload new file
            </button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        {state === "upload" && (
          <div className="flex flex-col items-center gap-8">
            <div className="text-center space-y-3">
              <h2 className="text-3xl font-semibold tracking-tight">
                Find your watchlist in London cinemas
              </h2>
              <p className="text-muted max-w-md mx-auto">
                Upload your Letterboxd watchlist CSV and see which films are
                currently screening at London&apos;s repertory cinemas.
              </p>
            </div>

            <div
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              className={`w-full max-w-lg border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
                dragOver
                  ? "border-accent bg-accent/5"
                  : "border-border hover:border-muted"
              }`}
              onClick={() => document.getElementById("csv-input")?.click()}
            >
              <div className="space-y-3">
                <div className="text-4xl">🎬</div>
                <p className="text-foreground font-medium">
                  Drop your watchlist CSV here
                </p>
                <p className="text-sm text-muted">or click to browse</p>
              </div>
              <input
                id="csv-input"
                type="file"
                accept=".csv"
                onChange={handleInputChange}
                className="hidden"
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm">{error}</p>
            )}

            <div className="text-sm text-muted space-y-1 text-center">
              <p>
                Export your watchlist from{" "}
                <a
                  href="https://letterboxd.com/settings/data/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  Letterboxd Settings → Import & Export
                </a>
              </p>
              <p>
                Currently checking: Prince Charles, Close-Up, ICA,
                Barbican, Rio
              </p>
            </div>
          </div>
        )}

        {state === "loading" && (
          <div className="flex flex-col items-center gap-4 py-20">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-muted">
              Checking London cinema listings...
            </p>
          </div>
        )}

        {state === "results" && data && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold">
                  {filteredMatches?.length ?? 0} film
                  {filteredMatches?.length !== 1 ? "s" : ""} found
                </h2>
                <p className="text-sm text-muted">
                  Checked {data.watchlistCount} watchlist films against{" "}
                  {data.screeningsScraped} screenings
                </p>
              </div>

              <div className="flex items-center gap-3">
                {venues.length > 1 && (
                  <select
                    value={venueFilter}
                    onChange={(e) => setVenueFilter(e.target.value)}
                    className="bg-card border border-border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="all">All venues</option>
                    {venues.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                )}

                <div className="flex rounded-lg border border-border overflow-hidden">
                  <button
                    onClick={() => setViewMode("list")}
                    className={`px-3 py-2 text-sm transition-colors cursor-pointer ${
                      viewMode === "list"
                        ? "bg-accent text-background font-medium"
                        : "bg-card text-muted hover:text-foreground"
                    }`}
                  >
                    List
                  </button>
                  <button
                    onClick={() => setViewMode("calendar")}
                    className={`px-3 py-2 text-sm transition-colors cursor-pointer ${
                      viewMode === "calendar"
                        ? "bg-accent text-background font-medium"
                        : "bg-card text-muted hover:text-foreground"
                    }`}
                  >
                    Calendar
                  </button>
                </div>

                <button
                  onClick={handleDownloadAllIcs}
                  className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-3 py-2 text-sm text-muted hover:text-foreground transition-colors cursor-pointer"
                  title="Download all screenings as ICS"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Export all
                </button>
              </div>
            </div>

            {viewMode === "calendar" ? (
              <Calendar
                screenings={flatScreenings}
                onDownloadIcs={handleDownloadSingleIcs}
              />
            ) : filteredMatches && filteredMatches.length > 0 ? (
              <div className="grid gap-4">
                {filteredMatches.map((match, i) => (
                  <div
                    key={i}
                    className="bg-card border border-border rounded-xl p-5 hover:bg-card-hover transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <h3 className="text-lg font-semibold">
                          {match.film.title}
                        </h3>
                        {match.film.year && (
                          <span className="text-sm text-muted">
                            {match.film.year}
                          </span>
                        )}
                      </div>
                      {match.film.letterboxdUri && (
                        <a
                          href={match.film.letterboxdUri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-muted hover:text-accent transition-colors shrink-0"
                        >
                          Letterboxd →
                        </a>
                      )}
                    </div>

                    <div className="grid gap-2">
                      {match.screenings.map((s, j) => (
                        <div
                          key={j}
                          className="flex items-center justify-between gap-3 text-sm bg-background/50 rounded-lg px-3 py-2"
                        >
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-muted">{s.venue}</span>
                            <span>
                              {new Date(s.date + "T00:00:00").toLocaleDateString(
                                "en-GB",
                                {
                                  weekday: "short",
                                  day: "numeric",
                                  month: "short",
                                }
                              )}
                            </span>
                            <span className="font-mono">{s.time}</span>
                            {s.format && (
                              <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full font-medium">
                                {s.format}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() =>
                                handleDownloadSingleIcs(s, match.film.title)
                              }
                              className="text-muted hover:text-accent transition-colors cursor-pointer"
                              title="Download ICS"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                <line x1="16" y1="2" x2="16" y2="6" />
                                <line x1="8" y1="2" x2="8" y2="6" />
                                <line x1="3" y1="10" x2="21" y2="10" />
                              </svg>
                            </button>
                            {s.bookingUrl ? (
                              <a
                                href={s.bookingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-accent hover:underline font-medium"
                              >
                                Book
                              </a>
                            ) : (
                              <span className="text-muted text-xs">
                                Sold out
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 text-muted">
                <p className="text-lg">No matches found</p>
                <p className="text-sm mt-2">
                  None of your watchlist films are currently screening.
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
