import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  transformPhResponse,
  buildBookingUrl,
  PhResponse,
  VENUES,
} from "../picturehouse";

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../__fixtures__/picturehouse-central.json"), "utf-8")
) as PhResponse;

// ---------------------------------------------------------------------------
// buildBookingUrl
// ---------------------------------------------------------------------------
describe("buildBookingUrl", () => {
  it("constructs the correct URL from cinemaId and sessionId", () => {
    expect(buildBookingUrl("022", "115556")).toBe(
      "https://web.picturehouses.com/order/showtimes/022-115556/seats"
    );
  });

  it("uses CinemaId verbatim (no zero-padding modification)", () => {
    expect(buildBookingUrl("004", "99999")).toBe(
      "https://web.picturehouses.com/order/showtimes/004-99999/seats"
    );
  });
});

// ---------------------------------------------------------------------------
// transformPhResponse — fixture-based
// ---------------------------------------------------------------------------
describe("transformPhResponse with fixture", () => {
  it("returns 2 valid screenings (duplicate showtime + whitespace title + bad date + missing SessionId all skipped)", () => {
    const screenings = transformPhResponse(fixture, "Picturehouse Central");
    expect(screenings).toHaveLength(2);
  });

  it("extracts ALL YOU NEED IS KILL correctly (deduplicates the repeated showtime)", () => {
    const screenings = transformPhResponse(fixture, "Picturehouse Central");
    const film = screenings.find((s) => s.title === "ALL YOU NEED IS KILL");
    expect(film).toBeDefined();
    expect(film?.venue).toBe("Picturehouse Central");
    expect(film?.date).toBe("2026-02-27");
    expect(film?.time).toBe("20:30");
    expect(film?.year).toBeNull();
    expect(film?.format).toBeNull();
    expect(film?.bookingUrl).toBe(
      "https://web.picturehouses.com/order/showtimes/022-115556/seats"
    );
  });

  it("extracts Aurora correctly", () => {
    const screenings = transformPhResponse(fixture, "Picturehouse Central");
    const film = screenings.find((s) => s.title.includes("Aurora"));
    expect(film).toBeDefined();
    expect(film?.date).toBe("2026-03-04");
    expect(film?.time).toBe("20:10");
    expect(film?.bookingUrl).toBe(
      "https://web.picturehouses.com/order/showtimes/022-114646/seats"
    );
  });

  it("skips the whitespace-only title entry", () => {
    const screenings = transformPhResponse(fixture, "Picturehouse Central");
    expect(screenings.find((s) => s.title.trim() === "")).toBeUndefined();
  });

  it("skips entries with an invalid date_f", () => {
    const screenings = transformPhResponse(fixture, "Picturehouse Central");
    expect(screenings.find((s) => s.title === "Bad Date Film")).toBeUndefined();
  });

  it("skips entries with empty SessionId", () => {
    const screenings = transformPhResponse(fixture, "Picturehouse Central");
    expect(screenings.find((s) => s.title === "No Session Film")).toBeUndefined();
  });

  it("all booking URLs match the expected pattern", () => {
    const screenings = transformPhResponse(fixture, "Picturehouse Central");
    for (const s of screenings) {
      expect(s.bookingUrl).toMatch(
        /^https:\/\/web\.picturehouses\.com\/order\/showtimes\/\d{3}-\d+\/seats$/
      );
    }
  });
});

// ---------------------------------------------------------------------------
// transformPhResponse — deduplication across calls (shared seen set)
// ---------------------------------------------------------------------------
describe("transformPhResponse deduplication", () => {
  it("shared seen set prevents duplicates across two calls", () => {
    const seen = new Set<string>();
    const first = transformPhResponse(fixture, "Picturehouse Central", seen);
    const second = transformPhResponse(fixture, "Picturehouse Central", seen);
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(0);
  });

  it("fresh seen set gives independent results each call", () => {
    const a = transformPhResponse(fixture, "Picturehouse Central", new Set());
    const b = transformPhResponse(fixture, "Picturehouse Central", new Set());
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// transformPhResponse — edge cases
// ---------------------------------------------------------------------------
describe("transformPhResponse edge cases", () => {
  it("returns [] for a non-success response", () => {
    const data: PhResponse = { response: "error" };
    expect(transformPhResponse(data, "X")).toHaveLength(0);
  });

  it("returns [] for an empty movies array", () => {
    const data: PhResponse = { response: "success", movies: [] };
    expect(transformPhResponse(data, "X")).toHaveLength(0);
  });

  it("returns [] when movies is missing", () => {
    const data: PhResponse = { response: "success" };
    expect(transformPhResponse(data, "X")).toHaveLength(0);
  });

  it("handles a movie with no show_times gracefully", () => {
    const data: PhResponse = {
      response: "success",
      movies: [{ Title: "Ghost Film" }],
    };
    expect(transformPhResponse(data, "X")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// VENUES constant
// ---------------------------------------------------------------------------
describe("VENUES constant", () => {
  it("contains exactly 11 London venues", () => {
    expect(VENUES).toHaveLength(11);
  });

  it("all expected London venues are present", () => {
    const names = VENUES.map((v) => v.name);
    expect(names).toContain("Picturehouse Central");
    expect(names).toContain("Hackney Picturehouse");
    expect(names).toContain("The Gate Picturehouse");
    expect(names).toContain("Ritzy Picturehouse");
    expect(names).toContain("Clapham Picturehouse");
    expect(names).toContain("Crouch End Picturehouse");
    expect(names).toContain("Ealing Picturehouse");
    expect(names).toContain("East Dulwich Picturehouse");
    expect(names).toContain("Finsbury Park Picturehouse");
    expect(names).toContain("Greenwich Picturehouse");
    expect(names).toContain("West Norwood Picturehouse");
  });

  it("all cinemaIds are 3-digit numeric strings", () => {
    for (const v of VENUES) {
      expect(v.cinemaId).toMatch(/^\d{3}$/);
    }
  });

  it("cinemaIds map to correct venues", () => {
    const map = new Map(VENUES.map((v) => [v.cinemaId, v.name]));
    expect(map.get("022")).toBe("Picturehouse Central");
    expect(map.get("010")).toBe("Hackney Picturehouse");
    expect(map.get("016")).toBe("The Gate Picturehouse");
    expect(map.get("004")).toBe("Ritzy Picturehouse");
    expect(map.get("020")).toBe("Clapham Picturehouse");
    expect(map.get("024")).toBe("Crouch End Picturehouse");
    expect(map.get("031")).toBe("Ealing Picturehouse");
    expect(map.get("009")).toBe("East Dulwich Picturehouse");
    expect(map.get("029")).toBe("Finsbury Park Picturehouse");
    expect(map.get("021")).toBe("Greenwich Picturehouse");
    expect(map.get("023")).toBe("West Norwood Picturehouse");
  });
});
