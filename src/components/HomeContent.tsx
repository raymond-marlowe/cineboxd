"use client";

import { useState, useCallback, useMemo, useEffect, useRef, Suspense } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { MatchedScreening, Screening } from "@/lib/types";
import { venueNameToSlug } from "@/lib/venue-slug";
import { generateIcsEvent, generateIcsFile, downloadIcs } from "@/lib/ics";
import dynamic from "next/dynamic";
import Calendar from "@/components/calendar";
import FilmGrid from "@/components/FilmGrid";
import SupportedVenues from "@/components/SupportedVenues";
import SupportCard from "@/components/SupportCard";
const VenueMap = dynamic(() => import("@/components/venue-map"), { ssr: false });
import {
  VENUE_COORDS,
  distanceMiles,
  formatDistance,
} from "@/lib/venues";
import {
  isValidLbUsername,
  normaliseLbUsername,
  buildSoloUrl,
  buildTogetherUrl,
} from "@/lib/urls";
import {
  type SortMode,
  isComingSoon,
  applyDiscoveryFilters,
  type DiscoveryOptions,
} from "@/lib/film-sort";

interface MatchResponse {
  watchlistCount: number;
  screeningsScraped: number;
  matches: MatchedScreening[];
  userErrors?: Record<string, string>;
  totalUsers?: number;
  listId?: string;
  expired?: boolean;
}

type AppState = "upload" | "loading" | "results";
type ViewMode = "list" | "grid" | "calendar" | "map";
type InputMode = "solo" | "together";
type UrlMode = "user" | "users" | "list";

const USER_COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#ef4444"];

interface FailedWatchlistPage {
  pageNumber: number;
  url: string;
  reason: string;
}

interface MatchApiErrorObject {
  code?: string;
  message?: string;
  details?: {
    failedWatchlistPages?: FailedWatchlistPage[];
    expired?: boolean;
    userErrors?: Record<string, string>;
  };
}

function getMatchApiErrorObject(json: unknown): MatchApiErrorObject | null {
  if (!json || typeof json !== "object") return null;
  const raw = (json as { error?: unknown }).error;
  if (!raw || typeof raw !== "object") return null;
  return raw as MatchApiErrorObject;
}

function isExpiredMatchError(json: unknown): boolean {
  const errorObj = getMatchApiErrorObject(json);
  if (errorObj?.details?.expired) return true;
  return Boolean((json as { expired?: unknown })?.expired === true);
}

function getUserErrorsFromMatchError(json: unknown): Record<string, string> | undefined {
  const errorObj = getMatchApiErrorObject(json);
  return errorObj?.details?.userErrors;
}

function getMatchErrorMessage(status: number, json: unknown): string {
  const errorObj = getMatchApiErrorObject(json);
  const failedPages = errorObj?.details?.failedWatchlistPages ?? [];

  if (status === 502) {
    const pages = Array.from(new Set(failedPages.map((p) => p.pageNumber))).sort((a, b) => a - b);
    if (pages.length > 0) {
      return `Temporary issue fetching your Letterboxd watchlist. Please retry in a moment. Failed pages: ${pages.join(", ")}.`;
    }
    return "Temporary issue fetching your Letterboxd watchlist. Please retry in a moment.";
  }

  if (errorObj?.message) return errorObj.message;

  const legacy = (json as { error?: unknown })?.error;
  if (typeof legacy === "string" && legacy.trim()) {
    return legacy;
  }

  return "Something went wrong";
}

interface HomeContentProps {
  /** Pre-fill solo mode with this username and auto-submit on mount. */
  initialUsername?: string;
  /** Pre-fill together mode with these usernames and auto-submit on mount. */
  initialUsernames?: string[];
}

function HomeContentInner({ initialUsername, initialUsernames }: HomeContentProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [state, setState] = useState<AppState>("upload");
  const [data, setData] = useState<MatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [venueFilter, setVenueFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [username, setUsername] = useState("");
  const [loadingUsername, setLoadingUsername] = useState<string | null>(null);

  // Location / distance state
  const [postcode, setPostcode] = useState("");
  const [postcodeCoords, setPostcodeCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [postcodeLoading, setPostcodeLoading] = useState(false);
  const [postcodeError, setPostcodeError] = useState<string | null>(null);
  const [sortByDistance, setSortByDistance] = useState(false);
  const [maxDistanceMiles, setMaxDistanceMiles] = useState<number | null>(null);

  // Discovery controls
  const [sortMode, setSortMode] = useState<SortMode>("soonest");
  const [filmSearch, setFilmSearch] = useState("");
  const [hideUnreleased, setHideUnreleased] = useState(true);

  // Prevents double-fetch on React Strict Mode remount and on the navigate-first flow.
  const fetchInitiated = useRef(false);

  // Watch together state — default to "together" when initialUsernames are provided
  const [mode, setMode] = useState<InputMode>(initialUsernames ? "together" : "solo");
  const [groupUsernames, setGroupUsernames] = useState<string[]>(["", ""]);
  const [partialExpanded, setPartialExpanded] = useState(false);
  // Screenings drawer state
  const [drawerMatch, setDrawerMatch] = useState<MatchedScreening | null>(null);
  const [drawerVenueExpanded, setDrawerVenueExpanded] = useState<Record<string, boolean>>({});

  /**
   * Update the browser URL after a successful search or view change.
   *
   * Solo results   → /u/<username>
   * Together results → /t/<u1>+<u2>...
   * List results   → /?list=<id>  (legacy — no canonical path yet)
   * View/venue changes → stay on current path, just update query params
   */
  const updateUrl = useCallback(
    ({
      mode: urlMode,
      user,
      users,
      listId,
      view,
    }: {
      mode?: UrlMode;
      user?: string;
      users?: string[];
      listId?: string;
      view?: ViewMode;
    }) => {
      // Start from existing query params so we preserve UI state (venue, postcode…)
      const params = new URLSearchParams(searchParams.toString());
      let nextPath = pathname;

      if (urlMode) {
        // Remove legacy identity params — they live in the path now
        params.delete("user");
        params.delete("users");
        params.delete("list");

        if (urlMode === "user" && user) {
          nextPath = `/u/${user.toLowerCase()}`;
        } else if (urlMode === "users" && users && users.length > 0) {
          nextPath = `/t/${users.map((u) => u.toLowerCase()).join(",")}`;
        } else if (urlMode === "list" && listId) {
          nextPath = "/";
          params.set("list", listId);
        }
      }

      if (view && view !== "list") {
        params.set("view", view);
      } else if (view === "list") {
        params.delete("view");
      }

      const nextQs = params.toString();
      const currentUrl = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
      const nextUrl = `${nextPath}${nextQs ? `?${nextQs}` : ""}`;
      if (nextUrl === currentUrl) return;

      router.replace(nextUrl, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const handleViewChange = useCallback(
    (nextView: ViewMode) => {
      setViewMode(nextView);
      updateUrl({ view: nextView });
    },
    [updateUrl]
  );

  /**
   * Called when the user submits the solo form.
   * Navigates to the canonical /u/<username> path — the fetch happens there via
   * the mount effect, preventing a double-fetch when the new route remounts.
   */
  const handleUsername = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        setError("Please enter a username");
        return;
      }
      const normalised = normaliseLbUsername(trimmed);
      if (!isValidLbUsername(normalised)) {
        setError("Usernames may only contain letters, numbers and underscores");
        return;
      }
      // Show loading feedback immediately even though the fetch runs on the new route.
      setState("loading");
      setLoadingUsername(normalised);
      router.push(buildSoloUrl(normalised, searchParams));
    },
    [router, searchParams]
  );

  /**
   * Internal fetch for solo mode — called only from the mount effect on /u/<username>.
   * Does NOT call updateUrl (we are already on the canonical path).
   */
  const fetchForUsername = useCallback(async (name: string) => {
    setState("loading");
    setError(null);
    setLoadingUsername(name);
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(getMatchErrorMessage(res.status, json));
        setState("upload");
        setLoadingUsername(null);
        return;
      }
      setData(json);
      setState("results");
      setLoadingUsername(null);
    } catch {
      setError("Failed to connect to server");
      setState("upload");
      setLoadingUsername(null);
    }
  }, []);

  /**
   * Called when the user submits the together form.
   * Navigates to the canonical /t/<u1>+<u2> path — the fetch happens there.
   */
  const handleGroup = useCallback(
    (names: string[]) => {
      const normalised = names
        .map((n) => normaliseLbUsername(n.trim()))
        .filter((n) => n.length > 0);
      if (normalised.length < 2) {
        setError("Please enter at least 2 usernames");
        return;
      }
      if (normalised.some((u) => !isValidLbUsername(u))) {
        setError("Usernames may only contain letters, numbers and underscores");
        return;
      }
      setState("loading");
      setLoadingUsername(normalised.join(", "));
      router.push(buildTogetherUrl(normalised, searchParams));
    },
    [router, searchParams]
  );

  /**
   * Internal fetch for together mode — called only from the mount effect on /t/<users>.
   * Does NOT call updateUrl (we are already on the canonical path).
   */
  const fetchForGroup = useCallback(async (names: string[]) => {
    setState("loading");
    setError(null);
    setLoadingUsername(names.join(", "));
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: names }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(getMatchErrorMessage(res.status, json));
        const userErrors = getUserErrorsFromMatchError(json);
        if (userErrors) {
          setData((prev) => (prev ? { ...prev, userErrors } : null));
        }
        setState("upload");
        setLoadingUsername(null);
        return;
      }
      setData(json);
      setState("results");
      setLoadingUsername(null);
      setPartialExpanded(false);
    } catch {
      setError("Failed to connect to server");
      setState("upload");
      setLoadingUsername(null);
    }
  }, []);

  const handleListId = useCallback(
    async (listId: string) => {
      setState("loading");
      setError(null);
      setLoadingUsername(null);

      try {
        const res = await fetch("/api/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listId }),
        });
        const json = await res.json();

        if (!res.ok) {
          if (isExpiredMatchError(json)) {
            setError(
              "This shared link has expired. Ask the person who shared it to upload the CSV again."
            );
          } else {
            setError(getMatchErrorMessage(res.status, json));
          }
          setState("upload");
          return;
        }

        setData(json);
        setState("results");
        updateUrl({ mode: "list", listId: json.listId ?? listId, view: viewMode });
      } catch {
        setError("Failed to connect to server");
        setState("upload");
      }
    },
    [updateUrl, viewMode]
  );

  // On mount: restore UI state from URL and kick off the initial fetch (once).
  useEffect(() => {
    // Always restore view + venue filter from the URL (idempotent, cheap).
    const viewParam = searchParams.get("view");
    if (viewParam === "grid" || viewParam === "calendar" || viewParam === "map") {
      setViewMode(viewParam as ViewMode);
    }
    const venueParam = searchParams.get("venue");
    if (venueParam) setVenueFilter(venueParam);

    // Guard: run the fetch logic exactly once per component instance.
    // The ref survives React Strict Mode's artificial unmount/remount cycle so
    // the second invocation sees true and exits early.
    if (fetchInitiated.current) return;

    // ── Canonical route props (priority) ──────────────────────────────────────
    // /u/<username>: initialUsername is set by the server component.
    if (initialUsername) {
      fetchInitiated.current = true;
      setUsername(initialUsername);
      fetchForUsername(initialUsername);
      return;
    }

    // /t/<users>: initialUsernames is set by the server component.
    if (initialUsernames && initialUsernames.length >= 2) {
      fetchInitiated.current = true;
      setGroupUsernames(initialUsernames);
      fetchForGroup(initialUsernames);
      return;
    }

    // ── Home page only (no initial props) ─────────────────────────────────────
    // The server already redirects ?user= and ?users= to canonical paths, but
    // guard for the edge case of a client-side navigation to /?user=... .
    if (pathname === "/") {
      const listParam = searchParams.get("list");
      if (listParam) {
        fetchInitiated.current = true;
        handleListId(listParam);
        return;
      }

      const usersParam = searchParams.get("users");
      if (usersParam) {
        const names = usersParam.split(",").map(decodeURIComponent).filter((n) => n.length > 0);
        if (names.length >= 2) {
          fetchInitiated.current = true;
          setMode("together");
          setGroupUsernames(names);
          fetchForGroup(names);
          return;
        }
      }

      const userParam = searchParams.get("user");
      if (userParam) {
        fetchInitiated.current = true;
        setUsername(userParam);
        fetchForUsername(userParam);
      }

      const seedParam = searchParams.get("seed");
      const modeParam = searchParams.get("mode");
      if (seedParam && isValidLbUsername(normaliseLbUsername(seedParam)) && modeParam === "together") {
        setMode("together");
        setGroupUsernames([normaliseLbUsername(seedParam), ""]);
        // No auto-fetch — user fills in the second username
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep venue= query param in sync so shared links include the active venue filter.
  useEffect(() => {
    if (state !== "results") return;
    const params = new URLSearchParams(searchParams.toString());
    if (venueFilter === "all") params.delete("venue");
    else params.set("venue", venueFilter);
    const nextQs = params.toString();
    if (nextQs === searchParams.toString()) return;
    router.replace(`${pathname}${nextQs ? `?${nextQs}` : ""}`, { scroll: false });
  }, [pathname, router, searchParams, state, venueFilter]);

  useEffect(() => {
    if (!drawerMatch) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerMatch(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerMatch]);

  // Sync Together/Solo tab with URL — handles both initial render and TopNav SPA navigation.
  // Skip when the page was initialised from route props (initialUsername / initialUsernames),
  // because the mode is already set correctly.
  useEffect(() => {
    if (state !== "upload") return;
    if (initialUsername || initialUsernames) return;
    const hasDataParam =
      searchParams.get("users") || searchParams.get("user") || searchParams.get("list");
    if (!hasDataParam) {
      setMode(searchParams.get("mode") === "together" ? "together" : "solo");
    }
  }, [searchParams, state, initialUsername, initialUsernames]);

  // Restore saved postcode from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("cineboxd_postcode");
    if (saved) {
      setPostcode(saved);
      geocodePostcode(saved);
    }
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
        setError(getMatchErrorMessage(res.status, json));
        setState("upload");
        return;
      }

      setData(json);
      setState("results");
      updateUrl({ mode: "list", listId: json.listId, view: viewMode });
    } catch {
      setError("Failed to connect to server");
      setState("upload");
    }
  }, [updateUrl, viewMode]);

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

  const switchMode = (newMode: InputMode) => {
    setMode(newMode);
    setError(null);
    if (newMode === "together") {
      router.replace("/?mode=together", { scroll: false });
    } else {
      router.replace("/", { scroll: false });
    }
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

  const isTogether = data?.totalUsers != null;

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const discoveryOpts = useMemo<DiscoveryOptions>(
    () => ({
      sortMode,
      filmSearch,
      hideUnreleased,
      venueFilter,
      postcodeCoords,
      sortByDistance,
      maxDistanceMiles,
      today,
    }),
    [sortMode, filmSearch, hideUnreleased, venueFilter, postcodeCoords, sortByDistance, maxDistanceMiles, today]
  );

  const filteredMatches = useMemo(
    () => (data ? applyDiscoveryFilters(data.matches, discoveryOpts) : undefined),
    [data, discoveryOpts]
  );

  const filteredShared = useMemo(
    () => (sharedMatches ? applyDiscoveryFilters(sharedMatches, discoveryOpts) : undefined),
    [sharedMatches, discoveryOpts]
  );

  const filteredPartial = useMemo(
    () => (partialMatches ? applyDiscoveryFilters(partialMatches, discoveryOpts) : undefined),
    [partialMatches, discoveryOpts]
  );

  // Flattened screenings for the calendar view
  // In together mode use filteredShared (intersection only) to match the list view
  const flatScreenings = useMemo(() => {
    const source = isTogether ? filteredShared : filteredMatches;
    if (!source) return [];
    return source.flatMap((m) =>
      m.screenings.map((s) => ({ film: m.film, screening: s }))
    );
  }, [isTogether, filteredShared, filteredMatches]);

  const handleDownloadSingleIcs = useCallback(
    (screening: Screening, filmTitle: string) => {
      const event = generateIcsEvent(screening, filmTitle);
      const content = generateIcsFile([event]);
      const safeName = filmTitle.replace(/[^a-z0-9]/gi, "-").toLowerCase();
      downloadIcs(content, `${safeName}.ics`);
    },
    []
  );

  const geocodePostcode = useCallback(async (pc: string) => {
    const clean = pc.trim().replace(/\s+/g, "");
    if (!clean) {
      setPostcodeCoords(null);
      setPostcodeError(null);
      localStorage.removeItem("cineboxd_postcode");
      return;
    }
    setPostcodeLoading(true);
    setPostcodeError(null);
    try {
      const res = await fetch(
        `https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`
      );
      const json = await res.json();
      if (json.status === 200 && json.result) {
        setPostcodeCoords({ lat: json.result.latitude, lng: json.result.longitude });
        localStorage.setItem("cineboxd_postcode", pc.trim());
      } else {
        setPostcodeError("Postcode not found");
        setPostcodeCoords(null);
      }
    } catch {
      setPostcodeError("Could not look up postcode");
      setPostcodeCoords(null);
    } finally {
      setPostcodeLoading(false);
    }
  }, []);

  const clearPostcode = useCallback(() => {
    setPostcode("");
    setPostcodeCoords(null);
    setPostcodeError(null);
    setSortByDistance(false);
    setMaxDistanceMiles(null);
    localStorage.removeItem("cineboxd_postcode");
  }, []);

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

  const renderControlBar = () => (
    <div className="bg-background/40 border border-border/30 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
      {/* LEFT: location + venue */}
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => { e.preventDefault(); geocodePostcode(postcode); }}
          className="flex items-center gap-1.5"
        >
          <span className="text-xs text-muted shrink-0">Near</span>
          <input
            type="text"
            value={postcode}
            onChange={(e) => setPostcode(e.target.value.toUpperCase())}
            placeholder="Postcode"
            maxLength={8}
            className="w-20 bg-card border border-border rounded-lg px-2 py-1 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
          />
          <button
            type="submit"
            disabled={postcodeLoading || !postcode.trim()}
            className="bg-card border border-border rounded-lg px-2 py-1 text-sm text-muted hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
          >
            {postcodeLoading ? "…" : "Go"}
          </button>
          {postcodeCoords && (
            <button
              type="button"
              onClick={clearPostcode}
              className="text-xs text-muted hover:text-foreground transition-colors cursor-pointer"
            >
              Clear
            </button>
          )}
        </form>
        <select
          value={maxDistanceMiles ?? ""}
          onChange={(e) => setMaxDistanceMiles(e.target.value ? Number(e.target.value) : null)}
          disabled={!postcodeCoords}
          className="bg-card border border-border rounded-lg px-2 py-1 text-sm disabled:opacity-40 cursor-pointer disabled:cursor-default"
        >
          <option value="">Any distance</option>
          <option value="1">≤ 1 mile</option>
          <option value="2">≤ 2 miles</option>
          <option value="3">≤ 3 miles</option>
          <option value="5">≤ 5 miles</option>
          <option value="10">≤ 10 miles</option>
        </select>
        <label className="flex items-center gap-1 text-xs text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={sortByDistance}
            disabled={!postcodeCoords}
            onChange={(e) => setSortByDistance(e.target.checked)}
            className="disabled:opacity-40"
          />
          By dist.
        </label>
        {venues.length > 1 && (
          <select
            value={venueFilter}
            onChange={(e) => setVenueFilter(e.target.value)}
            className="bg-card border border-border rounded-lg px-2 py-1 text-sm cursor-pointer"
          >
            <option value="all">All venues</option>
            {venues.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        )}
        {postcodeError && (
          <span className="text-xs text-red-400">{postcodeError}</span>
        )}
      </div>

      {/* RIGHT: film controls */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={filmSearch}
          onChange={(e) => setFilmSearch(e.target.value)}
          placeholder="Search films"
          className="bg-card border border-border rounded-lg px-2 py-1 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent transition-colors w-32"
        />
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="bg-card border border-border rounded-lg px-2 py-1 text-sm cursor-pointer"
        >
          <optgroup label="Screening">
            <option value="soonest">Earliest screening</option>
            <option value="latest">Latest screening</option>
          </optgroup>
          <optgroup label="Title">
            <option value="title_asc">Title A–Z</option>
            <option value="title_desc">Title Z–A</option>
          </optgroup>
          <optgroup label="Release">
            <option value="year_desc">Release date (newest)</option>
            <option value="year_asc">Release date (earliest)</option>
          </optgroup>
          <optgroup label="Rating">
            <option value="rating_desc">Rating (highest)</option>
            <option value="rating_asc">Rating (lowest)</option>
          </optgroup>
        </select>
        <label className="flex items-center gap-1 text-xs text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideUnreleased}
            onChange={(e) => setHideUnreleased(e.target.checked)}
          />
          Hide unreleased
        </label>
      </div>
    </div>
  );

  const renderScreeningRow = (s: Screening, filmTitle: string, j: number) => (
    <div
      key={j}
      className="flex items-center justify-between gap-3 text-sm bg-background/50 rounded-lg px-3 py-2"
    >
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href={`/venues/${venueNameToSlug(s.venue)}`}
          className="text-muted hover:text-accent transition-colors"
        >
          {s.venue}
        </Link>
        {postcodeCoords && !!VENUE_COORDS[s.venue] && (
          <span className="text-xs text-muted/60">
            {formatDistance(
              distanceMiles(
                postcodeCoords.lat,
                postcodeCoords.lng,
                VENUE_COORDS[s.venue].lat,
                VENUE_COORDS[s.venue].lng
              )
            )}
          </span>
        )}
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
          onClick={() => handleDownloadSingleIcs(s, filmTitle)}
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
  );

  const getSortedScreenings = (screenings: Screening[]) => {
    if (postcodeCoords && sortByDistance) {
      return [...screenings].sort((a, b) => {
        const vcA = VENUE_COORDS[a.venue];
        const vcB = VENUE_COORDS[b.venue];
        const dA = vcA ? distanceMiles(postcodeCoords.lat, postcodeCoords.lng, vcA.lat, vcA.lng) : Infinity;
        const dB = vcB ? distanceMiles(postcodeCoords.lat, postcodeCoords.lng, vcB.lat, vcB.lng) : Infinity;
        if (dA !== dB) return dA - dB;
        return (a.date + a.time).localeCompare(b.date + b.time);
      });
    }
    return [...screenings].sort((a, b) =>
      (a.date + a.time).localeCompare(b.date + b.time)
    );
  };

  const renderFilmBadges = (match: MatchedScreening) => {
    const meta = match.metadata;
    if (
      !meta?.imdbId &&
      meta?.tmdbRating == null &&
      !match.film.letterboxdUri
    ) {
      return null;
    }
    return (
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
    );
  };

  const renderFilmCard = (match: MatchedScreening, index: number) => {
    const meta = match.metadata;
    const PREVIEW_COUNT = 3;
    const sortedScreenings = getSortedScreenings(match.screenings);
    const previewScreenings = sortedScreenings.slice(0, PREVIEW_COUNT);
    const hasMore = sortedScreenings.length > PREVIEW_COUNT;

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

            {isComingSoon(match, today) && (
              <span className="inline-block text-xs font-medium bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full mt-1">
                Coming soon
              </span>
            )}

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

            {renderFilmBadges(match)}
          </div>
        </div>

        <div className="grid gap-2">
          {previewScreenings.map((s, j) => renderScreeningRow(s, match.film.title, j))}
        </div>

        {hasMore && (
          <button
            onClick={() => {
              setDrawerMatch(match);
              setDrawerVenueExpanded({});
            }}
            className="mt-2 w-full text-sm text-muted hover:text-foreground transition-colors text-left px-1 cursor-pointer"
          >
            Show all screenings ({sortedScreenings.length}) →
          </button>
        )}
      </div>
    );
  };

  const renderDrawer = () => {
    if (!drawerMatch) return null;
    const meta = drawerMatch.metadata;
    const allScreenings = getSortedScreenings(drawerMatch.screenings);
    // Group by venue, within each venue sort by time ascending
    const venueMap = new Map<string, Screening[]>();
    for (const s of allScreenings) {
      if (!venueMap.has(s.venue)) venueMap.set(s.venue, []);
      venueMap.get(s.venue)!.push(s);
    }
    // Sort venues: if sortByDistance + coords, by nearest screening; else alphabetical
    const venueNames = [...venueMap.keys()].sort((a, b) => {
      if (postcodeCoords && sortByDistance) {
        const vcA = VENUE_COORDS[a];
        const vcB = VENUE_COORDS[b];
        const dA = vcA ? distanceMiles(postcodeCoords.lat, postcodeCoords.lng, vcA.lat, vcA.lng) : Infinity;
        const dB = vcB ? distanceMiles(postcodeCoords.lat, postcodeCoords.lng, vcB.lat, vcB.lng) : Infinity;
        return dA - dB;
      }
      return a.localeCompare(b);
    });

    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/60 z-40"
          onClick={() => setDrawerMatch(null)}
        />
        {/* Drawer panel */}
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-card border-l border-border flex flex-col shadow-2xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
            <div>
              <h2 className="font-semibold text-base">
                {drawerMatch.film.title}
                {drawerMatch.film.year && (
                  <span className="text-sm text-muted font-normal ml-2">
                    ({drawerMatch.film.year})
                  </span>
                )}
              </h2>
              <p className="text-sm text-muted">{allScreenings.length} screenings</p>
            </div>
            <button
              onClick={() => setDrawerMatch(null)}
              className="text-muted hover:text-foreground transition-colors cursor-pointer p-1"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3">
            <div className="bg-background/40 border border-border rounded-lg p-3">
              <div className="flex gap-3">
                {meta?.posterPath ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w185${meta.posterPath}`}
                    alt={`${drawerMatch.film.title} poster`}
                    className="w-20 aspect-[2/3] object-cover rounded-lg shrink-0"
                  />
                ) : (
                  <div className="w-20 aspect-[2/3] bg-background/50 rounded-lg shrink-0 flex items-center justify-center text-muted text-xs text-center px-2">
                    No poster
                  </div>
                )}
                <div className="min-w-0">
                  {renderUserDots(drawerMatch.users)}
                  {meta?.director && (
                    <p className="text-sm text-muted mt-0.5">
                      Directed by {meta.director}
                    </p>
                  )}
                  {meta?.overview && (
                    <p className="text-sm text-muted mt-1.5">
                      {meta.overview}
                    </p>
                  )}
                  {renderFilmBadges(drawerMatch)}
                </div>
              </div>
            </div>
            {venueNames.map((venue) => {
              const screenings = venueMap.get(venue)!.sort((a, b) =>
                (a.date + a.time).localeCompare(b.date + b.time)
              );
              const expanded = drawerVenueExpanded[venue] !== false; // default open
              const vc = VENUE_COORDS[venue];
              const dist = postcodeCoords && vc
                ? distanceMiles(postcodeCoords.lat, postcodeCoords.lng, vc.lat, vc.lng)
                : null;
              return (
                <div key={venue} className="border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() =>
                      setDrawerVenueExpanded((prev) => ({
                        ...prev,
                        [venue]: !expanded,
                      }))
                    }
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-background/40 hover:bg-background/70 transition-colors cursor-pointer text-left"
                  >
                    <span className="font-medium text-sm">
                      {venue}
                      {dist !== null && (
                        <span className="text-muted font-normal ml-2 text-xs">{formatDistance(dist)}</span>
                      )}
                    </span>
                    <span className="flex items-center gap-2 text-muted text-xs shrink-0">
                      {screenings.length} showing{screenings.length !== 1 ? "s" : ""}
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
                        className={`transition-transform ${expanded ? "rotate-180" : ""}`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </span>
                  </button>
                  {expanded && (
                    <div className="px-3 pb-2 pt-1 grid gap-1.5">
                      {screenings.map((s, j) => renderScreeningRow(s, drawerMatch.film.title, j))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="flex-1">
      <main className={`max-w-4xl mx-auto px-4 ${state === "results" ? "pt-4 pb-12" : "py-12"}`}>
        {state === "upload" && (
          <div className="flex flex-col items-center gap-8">
            <div className="text-center space-y-3">
              <h2 className="text-3xl font-semibold tracking-tight">
                Find your watchlist in London cinemas
              </h2>
              <p className="text-muted max-w-md mx-auto">
                {mode === "solo"
                  ? <>Enter your Letterboxd username to see which films on your watchlist are currently screening at London&rsquo;s <a href="https://en.wikipedia.org/wiki/Revival_house" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">repertory cinemas</a>.</>
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

            <SupportedVenues />
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
          <div className="space-y-4">
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
                <div className="space-y-2">
                {/* Heading bar: count + view tabs */}
                <div className="flex items-center justify-between gap-4 pb-2 border-b border-border/50">
                  <div className="flex items-center gap-3 flex-wrap min-w-0">
                    <h2 className="text-2xl font-semibold shrink-0">
                      {filteredShared?.length ?? 0} shared film
                      {filteredShared?.length !== 1 ? "s" : ""} found
                    </h2>
                    {groupUsernames.filter(Boolean).length > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium bg-accent/15 text-accent border border-accent/20">
                        {groupUsernames.filter(Boolean).join(" + ")}
                        <button
                          type="button"
                          onClick={() => { setState("upload"); router.push("/"); }}
                          className="hover:text-foreground transition-colors cursor-pointer leading-none ml-0.5"
                          aria-label="Clear search"
                        >×</button>
                      </span>
                    )}
                  </div>
                  <div className="inline-flex flex-none shrink-0 rounded-lg border border-border overflow-hidden">
                    <button
                      onClick={() => handleViewChange("list")}
                      className={`px-3 py-2 text-sm min-w-[60px] whitespace-nowrap transition-colors cursor-pointer ${viewMode === "list" ? "bg-accent text-background font-medium" : "bg-card text-muted hover:text-foreground"}`}
                    >
                      List
                    </button>
                    <button
                      onClick={() => handleViewChange("grid")}
                      className={`px-3 py-2 text-sm min-w-[60px] whitespace-nowrap transition-colors cursor-pointer ${viewMode === "grid" ? "bg-accent text-background font-medium" : "bg-card text-muted hover:text-foreground"}`}
                    >
                      Grid
                    </button>
                    <button
                      onClick={() => handleViewChange("calendar")}
                      className={`px-3 py-2 text-sm min-w-[60px] whitespace-nowrap transition-colors cursor-pointer ${viewMode === "calendar" ? "bg-accent text-background font-medium" : "bg-card text-muted hover:text-foreground"}`}
                    >
                      Calendar
                    </button>
                    <button
                      onClick={() => handleViewChange("map")}
                      className={`px-3 py-2 text-sm min-w-[60px] whitespace-nowrap transition-colors cursor-pointer ${viewMode === "map" ? "bg-accent text-background font-medium" : "bg-card text-muted hover:text-foreground"}`}
                    >
                      Map
                    </button>
                  </div>
                </div>

                {/* Control bar: all filters in one row */}
                {renderControlBar()}
                </div>

                {viewMode === "calendar" ? (
                  <Calendar
                    screenings={flatScreenings}
                    onDownloadIcs={handleDownloadSingleIcs}
                  />
                ) : viewMode === "map" ? (
                  <VenueMap
                    matches={filteredShared ?? []}
                    postcodeCoords={postcodeCoords}
                    maxDistanceMiles={maxDistanceMiles}
                    onVenueSelect={(v) => {
                      setVenueFilter(v);
                      handleViewChange("list");
                    }}
                  />
                ) : viewMode === "grid" ? (
                  <>
                    {filteredShared && filteredShared.length > 0 ? (
                      <FilmGrid
                        matches={filteredShared}
                        onSelectFilm={(match) => {
                          setDrawerMatch(match);
                          setDrawerVenueExpanded({});
                        }}
                      />
                    ) : (
                      <div className="text-center py-8 text-muted">
                        <p className="text-lg">No shared films found</p>
                        <p className="text-sm mt-2">
                          No films appear on all watchlists and are currently screening.
                        </p>
                      </div>
                    )}

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
                          <div className="p-4">
                            <FilmGrid
                              matches={filteredPartial}
                              onSelectFilm={(match) => {
                                setDrawerMatch(match);
                                setDrawerVenueExpanded({});
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </>
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
              /* Solo mode results */
              <>
                <div className="space-y-2">
                {/* Heading bar: count + view tabs */}
                <div className="flex items-center justify-between gap-4 pb-2 border-b border-border/50">
                  <div className="flex items-center gap-3 flex-wrap min-w-0">
                    <h2 className="text-2xl font-semibold shrink-0">
                      {filteredMatches?.length ?? 0} film
                      {filteredMatches?.length !== 1 ? "s" : ""} found
                    </h2>
                    {username && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium bg-accent/15 text-accent border border-accent/20">
                        {username}
                        <button
                          type="button"
                          onClick={() => { setState("upload"); router.push("/"); }}
                          className="hover:text-foreground transition-colors cursor-pointer leading-none ml-0.5"
                          aria-label="Clear search"
                        >×</button>
                      </span>
                    )}
                    {username && (
                      <button
                        type="button"
                        onClick={() => router.push(`/?mode=together&seed=${encodeURIComponent(username)}`)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm border border-border text-muted hover:text-foreground hover:border-accent/50 transition-colors cursor-pointer shrink-0"
                      >
                        + Add username
                      </button>
                    )}
                  </div>
                  <div className="inline-flex flex-none shrink-0 rounded-lg border border-border overflow-hidden">
                    <button
                      onClick={() => handleViewChange("list")}
                      className={`px-3 py-2 text-sm min-w-[60px] whitespace-nowrap transition-colors cursor-pointer ${viewMode === "list" ? "bg-accent text-background font-medium" : "bg-card text-muted hover:text-foreground"}`}
                    >
                      List
                    </button>
                    <button
                      onClick={() => handleViewChange("grid")}
                      className={`px-3 py-2 text-sm min-w-[60px] whitespace-nowrap transition-colors cursor-pointer ${viewMode === "grid" ? "bg-accent text-background font-medium" : "bg-card text-muted hover:text-foreground"}`}
                    >
                      Grid
                    </button>
                    <button
                      onClick={() => handleViewChange("calendar")}
                      className={`px-3 py-2 text-sm min-w-[60px] whitespace-nowrap transition-colors cursor-pointer ${viewMode === "calendar" ? "bg-accent text-background font-medium" : "bg-card text-muted hover:text-foreground"}`}
                    >
                      Calendar
                    </button>
                    <button
                      onClick={() => handleViewChange("map")}
                      className={`px-3 py-2 text-sm min-w-[60px] whitespace-nowrap transition-colors cursor-pointer ${viewMode === "map" ? "bg-accent text-background font-medium" : "bg-card text-muted hover:text-foreground"}`}
                    >
                      Map
                    </button>
                  </div>
                </div>

                {/* Control bar: all filters in one row */}
                {renderControlBar()}
                </div>

                {viewMode === "calendar" ? (
                  <Calendar
                    screenings={flatScreenings}
                    onDownloadIcs={handleDownloadSingleIcs}
                  />
                ) : viewMode === "map" ? (
                  <VenueMap
                    matches={filteredMatches ?? []}
                    postcodeCoords={postcodeCoords}
                    maxDistanceMiles={maxDistanceMiles}
                    onVenueSelect={(v) => {
                      setVenueFilter(v);
                      handleViewChange("list");
                    }}
                  />
                ) : viewMode === "grid" ? (
                  filteredMatches && filteredMatches.length > 0 ? (
                    <FilmGrid
                      matches={filteredMatches}
                      onSelectFilm={(match) => {
                        setDrawerMatch(match);
                        setDrawerVenueExpanded({});
                      }}
                    />
                  ) : (
                    <div className="text-center py-16 text-muted">
                      <p className="text-lg">No matches found</p>
                      <p className="text-sm mt-2">
                        None of your watchlist films are currently screening.
                      </p>
                    </div>
                  )
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

            <p className="text-xs text-muted">
              Search stats: Checked {data.watchlistCount} watchlist films against{" "}
              {data.screeningsScraped} screenings
            </p>

            <SupportCard compact />
          </div>
        )}
      </main>
      {renderDrawer()}
    </div>
  );
}

export default function HomeContent(props: HomeContentProps) {
  return (
    <Suspense>
      <HomeContentInner {...props} />
    </Suspense>
  );
}
