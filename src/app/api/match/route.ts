import { NextRequest, NextResponse } from "next/server";
import { parseWatchlistCsv } from "@/lib/csv-parser";
import { matchFilms } from "@/lib/matcher";
import { scrapeAll } from "@/scrapers";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("csv") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No CSV file provided" }, { status: 400 });
    }

    const csvText = await file.text();
    const watchlist = parseWatchlistCsv(csvText);

    if (watchlist.length === 0) {
      return NextResponse.json(
        { error: "No films found in CSV. Make sure it's a Letterboxd watchlist export." },
        { status: 400 }
      );
    }

    const screenings = await scrapeAll();
    const matches = matchFilms(watchlist, screenings);

    return NextResponse.json({
      watchlistCount: watchlist.length,
      screeningsScraped: screenings.length,
      matches,
    });
  } catch (err) {
    console.error("Match API error:", err);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
