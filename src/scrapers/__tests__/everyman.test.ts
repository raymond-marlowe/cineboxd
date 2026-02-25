import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import {
  VENUES,
  extractFormat,
  transformSchedule,
  EwScheduleResponse,
  EwMovieList,
} from "../everyman";

const scheduleFixture = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../__fixtures__/everyman-schedule.json"),
    "utf-8"
  )
) as EwScheduleResponse;

const moviesFixture = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../__fixtures__/everyman-movies.json"),
    "utf-8"
  )
) as EwMovieList;

// ---- extractFormat -------------------------------------------------------

describe("extractFormat", () => {
  it("returns null for standard digital projection", () => {
    expect(
      extractFormat(["Format.Projection.Digital", "Auditorium.Comfort.ReservedSeating"])
    ).toBeNull();
  });

  it("returns '35mm' for 35mm projection", () => {
    expect(extractFormat(["Format.Projection.35mm"])).toBe("35mm");
  });

  it("returns 'Q&A' for Q&A event tag", () => {
    expect(extractFormat(["Showtime.Event.QandAEvent", "Format.Projection.Digital"])).toBe("Q&A");
  });

  it("returns 'Preview' for preview event tag", () => {
    expect(extractFormat(["Showtime.Event.Preview"])).toBe("Preview");
  });

  it("returns 'Dolby Atmos' for Dolby Atmos tag", () => {
    expect(extractFormat(["Auditorium.Experience.DolbyAtmos"])).toBe("Dolby Atmos");
  });

  it("returns 'Silver Screen' for Silver Screen restriction", () => {
    expect(extractFormat(["Showtime.Restriction.SilverScreen"])).toBe("Silver Screen");
  });

  it("returns 'Baby Club' for Baby Club restriction", () => {
    expect(extractFormat(["Showtime.Restriction.BabyClub"])).toBe("Baby Club");
  });

  it("returns 'Subtitled' for subtitled tag", () => {
    expect(extractFormat(["Showtime.Accessibility.Subtitled"])).toBe("Subtitled");
  });

  it("prefers 35mm over Q&A when both present", () => {
    expect(
      extractFormat(["Showtime.Event.QandAEvent", "Format.Projection.35mm"])
    ).toBe("35mm");
  });

  it("returns null for empty tags array", () => {
    expect(extractFormat([])).toBeNull();
  });
});

// ---- transformSchedule ---------------------------------------------------

describe("transformSchedule", () => {
  const venueMap = new Map([["G011I", "Everyman Borough Yards"]]);
  const movieMap = new Map(moviesFixture.map((m) => [m.id, m.title]));

  it("returns correct screenings from fixture", () => {
    const result = transformSchedule(scheduleFixture, venueMap, movieMap);

    // Expired showtime (18:00 on 2026-02-25) must be excluded
    // Standard digital screening (13:30) must be included
    // Q&A screening (20:15) must be included with format = "Q&A"
    // No-booking-url film (888888 at 15:00) must be included with bookingUrl null

    expect(result.length).toBe(3);
  });

  it("maps standard screening correctly", () => {
    const result = transformSchedule(scheduleFixture, venueMap, movieMap);
    const std = result.find((s) => s.time === "13:30");
    expect(std).toBeDefined();
    expect(std!.title).toBe("One Battle After Another");
    expect(std!.date).toBe("2026-02-25");
    expect(std!.venue).toBe("Everyman Borough Yards");
    expect(std!.bookingUrl).toBe(
      "https://purchase.everymancinema.com/launch/ticketing/aaaaaaaa-bbbb-cccc-dddd-000000000001"
    );
    expect(std!.format).toBeNull(); // digital = no format label
    expect(std!.year).toBeNull();
  });

  it("maps Q&A screening correctly and picks default provider URL", () => {
    const result = transformSchedule(scheduleFixture, venueMap, movieMap);
    const qa = result.find((s) => s.time === "20:15");
    expect(qa).toBeDefined();
    expect(qa!.format).toBe("Q&A");
    // Must use the "default" provider URL, not the "relay" one
    expect(qa!.bookingUrl).toBe(
      "https://purchase.everymancinema.com/launch/ticketing/aaaaaaaa-bbbb-cccc-dddd-000000000004"
    );
  });

  it("filters expired showtimes", () => {
    const result = transformSchedule(scheduleFixture, venueMap, movieMap);
    // The 18:00 35mm show is expired — should not appear
    expect(result.find((s) => s.time === "18:00")).toBeUndefined();
  });

  it("handles showtime with no booking URL (empty ticketing array)", () => {
    const result = transformSchedule(scheduleFixture, venueMap, movieMap);
    const noUrl = result.find((s) => s.title === "No Booking Film");
    expect(noUrl).toBeDefined();
    expect(noUrl!.bookingUrl).toBeNull();
    expect(noUrl!.time).toBe("15:00");
  });

  it("skips screenings for unknown theater IDs", () => {
    const unknownResponse: EwScheduleResponse = {
      UNKNOWN_ID: scheduleFixture["G011I"],
    };
    const result = transformSchedule(unknownResponse, venueMap, movieMap);
    expect(result).toHaveLength(0);
  });

  it("skips screenings for unknown movie IDs", () => {
    const emptyMovieMap = new Map<string, string>();
    const result = transformSchedule(scheduleFixture, venueMap, emptyMovieMap);
    expect(result).toHaveLength(0);
  });

  it("deduplicates by booking URL across calls with shared seen set", () => {
    const seen = new Set<string>();
    const first = transformSchedule(scheduleFixture, venueMap, movieMap, seen);
    const second = transformSchedule(scheduleFixture, venueMap, movieMap, seen);
    expect(first.length).toBe(3);
    expect(second.length).toBe(0); // all already in seen
  });

  it("deduplicates by composite key when no booking URL", () => {
    const seen = new Set<string>();
    const r1 = transformSchedule(scheduleFixture, venueMap, movieMap, seen);
    const noUrlEntry = r1.find((s) => s.bookingUrl === null);
    expect(noUrlEntry).toBeDefined();
    // Feeding the same data again should not duplicate the null-URL entry
    const r2 = transformSchedule(scheduleFixture, venueMap, movieMap, seen);
    expect(r2.find((s) => s.bookingUrl === null)).toBeUndefined();
  });
});

// ---- VENUES constant -----------------------------------------------------

describe("VENUES", () => {
  it("contains all 16 London venues", () => {
    expect(VENUES).toHaveLength(16);
  });

  it("has unique theater IDs", () => {
    const ids = VENUES.map((v) => v.theaterId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique venue names", () => {
    const names = VENUES.map((v) => v.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("all venue names start with 'Everyman '", () => {
    for (const v of VENUES) {
      expect(v.name.startsWith("Everyman ")).toBe(true);
    }
  });

  it("includes key London venues by name", () => {
    const names = new Set(VENUES.map((v) => v.name));
    expect(names.has("Everyman Hampstead")).toBe(true);
    expect(names.has("Everyman Borough Yards")).toBe(true);
    expect(names.has("Everyman Screen on the Green")).toBe(true);
    expect(names.has("Everyman King's Cross")).toBe(true);
    expect(names.has("Everyman The Whiteley")).toBe(true);
  });
});
