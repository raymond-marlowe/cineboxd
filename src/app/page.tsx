"use client";

import { useState, useCallback, useMemo, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { MatchedScreening, Screening } from "@/lib/types";
import { generateIcsEvent, generateIcsFile, downloadIcs } from "@/lib/ics";
import Calendar from "@/components/calendar";

interface MatchResponse {
  watchlistCount: number;
  screeningsScraped: number;
  matches: MatchedScreening[];
  userErrors?: Record<string, string>;
  totalUsers?: number;
}

type AppState = "upload" | "loading" | "results";
type ViewMode = "list" | "calendar";
type InputMode = "solo" | "together";

const USER_COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#ef4444"];

function HomeInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [state, setState] = useState<AppState>("upload");
  const [data, setData] = useState<MatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [venueFilter, setVenueFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [username, setUsername] = useState("");
  const [loadingUsername, setLoadingUsername] = useState<string | null>(null);

  // Watch together state
  const [mode, setMode] = useState<InputMode>("solo");
  const [groupUsernames, setGroupUsernames] = useState<string[]>(["", ""]);
  const [partialExpanded, setPartialExpanded] = useState(false);

  const handleUsername = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        setError("Please enter a username");
        return;
      }

      setState("loading");
      setError(null);
      setLoadingUsername(trimmed);

      try {
        const res = await fetch("/api/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: trimmed }),
        });
        const json = await res.json();

        if (!res.ok) {
          setError(json.error || "Something went wrong");
          setState("upload");
          setLoadingUsername(null);
          return;
        }

        setData(json);
        setState("results");
        setLoadingUsername(null);
        router.replace(`?user=${encodeURIComponent(trimmed)}`);
      } catch {
        setError("Failed to connect to server");
        setState("upload");
        setLoadingUsername(null);
      }
    },
    [router]
  );

  const handleGroup = useCallback(
    async (names: string[]) => {
      const trimmed = names.map((n) => n.trim()).filter((n) => n.length > 0);
      if (trimmed.length < 2) {
        setError("Please enter at least 2 usernames");
        return;
      }

      setState("loading");
      setError(null);
      setLoadingUsername(trimmed.join(", "));

      try {
        const res = await fetch("/api/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usernames: trimmed }),
        });
        const json = await res.json();

        if (!res.ok) {
          setError(json.error || "Something went wrong");
          if (json.userErrors) {
            setData((prev) => prev ? { ...prev, userErrors: json.userErrors } : null);
          }
          setState("upload");
          setLoadingUsername(null);
          return;
        }

        setData(json);
        setState("results");
        setLoadingUsername(null);
        setPartialExpanded(false);
        router.replace(`?users=${trimmed.map(encodeURIComponent).join(",")}`);
      } catch {
        setError("Failed to connect to server");
        setState("upload");
        setLoadingUsername(null);
      }
    },
    [router]
  );

  // Auto-submit from URL query param on mount
  useEffect(() => {
    const userParam = searchParams.get("user");
    const usersParam = searchParams.get("users");

    if (usersParam && state === "upload" && !data) {
      const names = usersParam.split(",").map(decodeURIComponent).filter((n) => n.length > 0);
      if (names.length >= 2) {
        setMode("together");
        setGroupUsernames(names.length < 2 ? ["", ""] : names);
        handleGroup(names);
        return;
      }
    }

    if (userParam && state === "upload" && !data) {
      setUsername(userParam);
      handleUsername(userParam);
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      setError("Please upload a CSV file");
      return;
    }

    setState("loading");
    setError(null);
    setLoadingUsername(null);

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
    setUsername("");
    setLoadingUsername(null);
    setMode("solo");
    setGroupUsernames(["", ""]);
    setPartialExpanded(false);
    router.replace("/");
  };

  const switchMode = (newMode: InputMode) => {
    setMode(newMode);
    setError(null);
  };

  const updateGroupUsername = (index: number, value: string) => {
    setGroupUsernames((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const removeGroupUsername = (index: number) => {
    setGroupUsernames((prev) => prev.filter((_, i) => i !== index));
  };

  const addGroupUsername = () => {
    if (groupUsernames.length < 5) {
      setGroupUsernames((prev) => [...prev, ""]);
    }
  };

  const venues = data
    ? [...new Set(data.matches.flatMap((m) => m.screenings.map((s) => s.venue)))]
    : [];

  // In together mode, build colour map for successfully fetched users
  const userColorMap = useMemo(() => {
    if (!data?.totalUsers) return new Map<string, string>();
    const allUsers = new Set<string>();
    for (const m of data.matches) {
      if (m.users) m.users.forEach((u) => allUsers.add(u));
    }
    const map = new Map<string, string>();
    let i = 0;
    for (const u of allUsers) {
      map.set(u, USER_COLORS[i % USER_COLORS.length]);
      i++;
    }
    return map;
  }, [data]);

  // Split matches for together mode
  const sharedMatches = useMemo(() => {
    if (!data?.totalUsers) return null;
    return data.matches.filter((m) => m.users?.length === data.totalUsers);
  }, [data]);

  const partialMatches = useMemo(() => {
    if (!data?.totalUsers) return null;
    return data.matches.filter((m) => (m.users?.length ?? 0) < (data.totalUsers ?? 0));
  }, [data]);

  // Auto-expand partial if 0 shared but some partial
  useEffect(() => {
    if (sharedMatches && sharedMatches.length === 0 && partialMatches && partialMatches.length > 0) {
      setPartialExpanded(true);
    }
  }, [sharedMatches, partialMatches]);

  const applyVenueFilter = useCallback(
    (matches: MatchedScreening[]) =>
      matches
        .map((m) => ({
          ...m,
          screenings:
            venueFilter === "all"
              ? m.screenings
              : m.screenings.filter((s) => s.venue === venueFilter),
        }))
        .filter((m) => m.screenings.length > 0),
    [venueFilter]
  );

  const filteredMatches = data ? applyVenueFilter(data.matches) : undefined;
  const filteredShared = sharedMatches ? applyVenueFilter(sharedMatches) : undefined;
  const filteredPartial = partialMatches ? applyVenueFilter(partialMatches) : undefined;

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

  const isTogether = data?.totalUsers != null;

  const renderUserDots = (users?: string[]) => {
    if (!users || !isTogether) return null;
    return (
      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
        {users.map((u) => (
          <span key={u} className="flex items-center gap-1 text-xs text-muted">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: userColorMap.get(u) ?? "#888" }}
            />
            {u}
          </span>
        ))}
      </div>
    );
  };

  const renderFilmCard = (match: MatchedScreening, index: number) => {
    const meta = match.metadata;
    return (
      <div
        key={index}
        className="bg-card border border-border rounded-xl p-5 hover:bg-card-hover transition-colors"
      >
        <div className="flex gap-4 mb-3">
          {meta?.posterPath ? (
            <img
              src={`https://image.tmdb.org/t/p/w185${meta.posterPath}`}
              alt={`${match.film.title} poster`}
              className="w-24 h-36 object-cover rounded-lg shrink-0"
            />
          ) : (
            <div className="w-24 h-36 bg-background/50 rounded-lg shrink-0 flex items-center justify-center text-muted text-2xl">
              🎬
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold">
              {match.film.title}
              {match.film.year && (
                <span className="text-sm text-muted font-normal ml-2">
                  ({match.film.year})
                </span>
              )}
            </h3>

            {renderUserDots(match.users)}

            {meta?.director && (
              <p className="text-sm text-muted mt-0.5">
                Directed by {meta.director}
              </p>
            )}

            {meta?.overview && (
              <p className="text-sm text-muted mt-1.5 line-clamp-2">
                {meta.overview}
              </p>
            )}

            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {meta?.tmdbRating != null && (
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded ${
                    meta.tmdbRating >= 7
                      ? "bg-green-500/20 text-green-400"
                      : meta.tmdbRating >= 5
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-red-500/20 text-red-400"
                  }`}
                >
                  TMDB {meta.tmdbRating.toFixed(1)}
                </span>
              )}
              {meta?.imdbId && (
                <a
                  href={`https://www.imdb.com/title/${meta.imdbId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded hover:bg-yellow-500/30 transition-colors"
                >
                  IMDb
                </a>
              )}
              {match.film.letterboxdUri && (
                <a
                  href={match.film.letterboxdUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded hover:bg-emerald-500/30 transition-colors"
                >
                  Letterboxd
                </a>
              )}
            </div>
          </div>
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
    );
  };

  return (
    <div className="flex-1">
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
              New search
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
                {mode === "solo"
                  ? "Enter your Letterboxd username to see which films on your watchlist are currently screening at London\u2019s repertory cinemas."
                  : "Enter Letterboxd usernames to find films you all want to watch that are currently screening."}
              </p>
            </div>

            {/* Mode toggle */}
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => switchMode("solo")}
                className={`px-4 py-2 text-sm transition-colors cursor-pointer ${
                  mode === "solo"
                    ? "bg-accent text-background font-medium"
                    : "bg-card text-muted hover:text-foreground"
                }`}
              >
                My watchlist
              </button>
              <button
                onClick={() => switchMode("together")}
                className={`px-4 py-2 text-sm transition-colors cursor-pointer ${
                  mode === "together"
                    ? "bg-accent text-background font-medium"
                    : "bg-card text-muted hover:text-foreground"
                }`}
              >
                Watch together
              </button>
            </div>

            {mode === "solo" ? (
              <>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleUsername(username);
                  }}
                  className="w-full max-w-lg flex gap-3"
                >
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your Letterboxd username"
                    className="flex-1 bg-card border border-border rounded-lg px-4 py-3 text-foreground placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
                  />
                  <button
                    type="submit"
                    className="bg-accent text-background font-medium px-6 py-3 rounded-lg hover:bg-accent/90 transition-colors cursor-pointer shrink-0"
                  >
                    Search
                  </button>
                </form>

                <div className="flex items-center gap-3 w-full max-w-lg">
                  <div className="flex-1 border-t border-border" />
                  <span className="text-sm text-muted">or</span>
                  <div className="flex-1 border-t border-border" />
                </div>

                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  className={`w-full max-w-lg border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                    dragOver
                      ? "border-accent bg-accent/5"
                      : "border-border hover:border-muted"
                  }`}
                  onClick={() => document.getElementById("csv-input")?.click()}
                >
                  <div className="space-y-1">
                    <p className="text-muted text-sm font-medium">
                      Upload a CSV export instead
                    </p>
                    <p className="text-xs text-muted/70">
                      Drop your watchlist CSV here or click to browse
                    </p>
                  </div>
                  <input
                    id="csv-input"
                    type="file"
                    accept=".csv"
                    onChange={handleInputChange}
                    className="hidden"
                  />
                </div>
              </>
            ) : (
              /* Watch together inputs */
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleGroup(groupUsernames);
                }}
                className="w-full max-w-lg space-y-3"
              >
                {groupUsernames.map((val, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => updateGroupUsername(i, e.target.value)}
                      placeholder={`Username ${i + 1}`}
                      className="flex-1 bg-card border border-border rounded-lg px-4 py-3 text-foreground placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
                    />
                    {groupUsernames.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeGroupUsername(i)}
                        className="text-muted hover:text-foreground transition-colors cursor-pointer p-2"
                        title="Remove"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}

                {groupUsernames.length < 5 && (
                  <button
                    type="button"
                    onClick={addGroupUsername}
                    className="text-sm text-muted hover:text-foreground transition-colors cursor-pointer"
                  >
                    + Add another
                  </button>
                )}

                <button
                  type="submit"
                  className="w-full bg-accent text-background font-medium px-6 py-3 rounded-lg hover:bg-accent/90 transition-colors cursor-pointer"
                >
                  Find shared films
                </button>
              </form>
            )}

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="text-sm text-muted space-y-1 text-center">
              <p>
                Currently checking: Prince Charles, Close-Up, ICA, Barbican, Rio
              </p>
            </div>
          </div>
        )}

        {state === "loading" && (
          <div className="flex flex-col items-center gap-4 py-20">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-muted">
              {loadingUsername
                ? mode === "together"
                  ? `Fetching watchlists for ${loadingUsername}...`
                  : `Fetching watchlist for ${loadingUsername}...`
                : "Checking London cinema listings..."}
            </p>
          </div>
        )}

        {state === "results" && data && (
          <div className="space-y-6">
            {/* Per-user error banner */}
            {data.userErrors && Object.keys(data.userErrors).length > 0 && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3">
                {Object.entries(data.userErrors).map(([user, msg]) => (
                  <p key={user} className="text-sm text-yellow-400">
                    Could not fetch watchlist for <span className="font-medium">{user}</span>: {msg}
                  </p>
                ))}
              </div>
            )}

            {isTogether ? (
              /* Together mode results */
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-semibold">
                      {filteredShared?.length ?? 0} shared film
                      {filteredShared?.length !== 1 ? "s" : ""} found
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
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                ) : (
                  <>
                    {/* Shared films */}
                    {filteredShared && filteredShared.length > 0 ? (
                      <div className="grid gap-4">
                        {filteredShared.map((match, i) => renderFilmCard(match, i))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted">
                        <p className="text-lg">No shared films found</p>
                        <p className="text-sm mt-2">
                          No films appear on all watchlists and are currently screening.
                        </p>
                      </div>
                    )}

                    {/* Partial matches */}
                    {filteredPartial && filteredPartial.length > 0 && (
                      <div className="border border-border rounded-xl overflow-hidden">
                        <button
                          onClick={() => setPartialExpanded(!partialExpanded)}
                          className="w-full flex items-center justify-between px-5 py-4 bg-card hover:bg-card-hover transition-colors cursor-pointer"
                        >
                          <span className="font-medium">
                            On some watchlists ({filteredPartial.length})
                          </span>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={`transition-transform ${partialExpanded ? "rotate-180" : ""}`}
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                        {partialExpanded && (
                          <div className="grid gap-4 p-4">
                            {filteredPartial.map((match, i) => renderFilmCard(match, i))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              /* Solo mode results — unchanged */
              <>
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
                    {filteredMatches.map((match, i) => renderFilmCard(match, i))}
                  </div>
                ) : (
                  <div className="text-center py-16 text-muted">
                    <p className="text-lg">No matches found</p>
                    <p className="text-sm mt-2">
                      None of your watchlist films are currently screening.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeInner />
    </Suspense>
  );
}
