/**
 * Integration smoke-test for the Barbican Spektrix scraper.
 * Makes real network requests — run once to verify wiring is correct.
 *
 *   npx vitest run barbican
 */
import { describe, it, expect } from "vitest";
import { scrapeBarbican } from "./barbican";

describe("scrapeBarbican (live)", () => {
  it("returns screenings with expected shape", { timeout: 60_000 }, async () => {
    const screenings = await scrapeBarbican();

    console.log(`\n[barbican test] total screenings: ${screenings.length}`);
    console.log("[barbican test] first 10:");
    screenings.slice(0, 10).forEach((s, i) => {
      console.log(
        `  ${i + 1}. "${s.title}" (${s.year ?? "?"}) — ${s.date} ${s.time} | ${s.venue} | ${s.bookingUrl}`
      );
    });

    expect(screenings.length).toBeGreaterThan(0);

    for (const s of screenings) {
      expect(s.title, "title must be non-empty").toBeTruthy();
      expect(s.date, "date must be YYYY-MM-DD").toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.time, "time must be HH:MM").toMatch(/^\d{2}:\d{2}$/);
      expect(s.venue, "venue must be Barbican Cinema").toBe("Barbican Cinema");
      expect(s.bookingUrl, "bookingUrl must be non-null").not.toBeNull();
    }
  });
});
