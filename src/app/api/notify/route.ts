import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { readSubscriptions } from "@/lib/subscriptions";
import { fetchWatchlistByUsername } from "@/lib/letterboxd-rss";
import { matchFilms } from "@/lib/matcher";
import { scrapeAll } from "@/scrapers";
import { fetchFilmMetadata } from "@/lib/tmdb";
import { MatchedScreening, Subscription, Screening } from "@/lib/types";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://cineboxd.vercel.app";

function formatDate(isoDate: string): string {
  return new Date(isoDate + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function buildEmailHtml(
  matches: MatchedScreening[],
  subscription: Subscription
): string {
  const filmRows = matches
    .map((m) => {
      const screeningRows = m.screenings
        .map((s: Screening) => {
          const booking = s.bookingUrl
            ? `<a href="${s.bookingUrl}" style="color:#10b981;text-decoration:none;font-weight:600;">Book &rarr;</a>`
            : `<span style="color:#888;">Sold out</span>`;
          const format = s.format
            ? ` &nbsp;<span style="background:#1a1a1a;color:#aaa;font-size:11px;padding:2px 6px;border-radius:4px;">${s.format}</span>`
            : "";
          return `
        <tr>
          <td style="padding:4px 0;color:#aaa;font-size:13px;">${s.venue}</td>
          <td style="padding:4px 8px;font-size:13px;">${formatDate(s.date)}</td>
          <td style="padding:4px 8px;font-family:monospace;font-size:13px;">${s.time}${format}</td>
          <td style="padding:4px 0;text-align:right;font-size:13px;">${booking}</td>
        </tr>`;
        })
        .join("");

      const year = m.film.year ? ` <span style="color:#888;font-size:13px;">(${m.film.year})</span>` : "";
      return `
    <div style="margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:16px;font-weight:600;">${m.film.title}${year}</p>
      <table style="width:100%;border-collapse:collapse;">
        ${screeningRows}
      </table>
    </div>`;
    })
    .join("");

  const unsubscribeUrl = `${BASE_URL}/api/unsubscribe?id=${subscription.id}`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#0a0a0a;color:#e5e5e5;font-family:system-ui,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <p style="margin:0 0 4px;font-size:22px;font-weight:700;"><span style="color:#10b981;">cine</span>boxd</p>
    <p style="margin:0 0 24px;color:#888;font-size:14px;">Your watchlist is showing in London this week</p>

    <div style="border-top:1px solid #222;padding-top:24px;">
      ${filmRows}
    </div>

    <div style="border-top:1px solid #222;margin-top:24px;padding-top:16px;font-size:12px;color:#555;">
      You&apos;re receiving this because you subscribed at
      <a href="${BASE_URL}" style="color:#10b981;text-decoration:none;">cineboxd</a>.
      &nbsp;<a href="${unsubscribeUrl}" style="color:#555;">Unsubscribe</a>
    </div>
  </div>
</body>
</html>`;
}

function isWithinNextSevenDays(isoDate: string): boolean {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const screeningDate = new Date(isoDate + "T00:00:00");
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return screeningDate >= now && screeningDate <= sevenDaysLater;
}

export async function POST(request: NextRequest) {
  const secret = process.env.NOTIFY_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "NOTIFY_SECRET env var is not configured" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "RESEND_API_KEY not configured" },
      { status: 500 }
    );
  }

  const resend = new Resend(apiKey);
  const fromEmail =
    process.env.RESEND_FROM_EMAIL ?? "cineboxd <onboarding@resend.dev>";

  const subscriptions = readSubscriptions();
  if (subscriptions.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 0, errors: 0 });
  }

  // Scrape all screenings once
  const screenings = await scrapeAll();

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      // Fetch watchlist
      const watchlist = await fetchWatchlistByUsername(sub.username);

      // Match films
      const matches = matchFilms(watchlist, screenings);

      // Enrich with TMDB
      const enriched = process.env.TMDB_API_KEY
        ? await Promise.all(
            matches.map(async (m) => ({
              ...m,
              metadata: await fetchFilmMetadata(m.film.title, m.film.year),
            }))
          )
        : matches;

      // Filter to next 7 days only
      const thisWeek: MatchedScreening[] = enriched
        .map((m) => ({
          ...m,
          screenings: m.screenings.filter((s) => isWithinNextSevenDays(s.date)),
        }))
        .filter((m) => m.screenings.length > 0);

      if (thisWeek.length === 0) {
        return "skipped";
      }

      // Send email
      await resend.emails.send({
        from: fromEmail,
        to: sub.email,
        subject: "Your watchlist is showing in London this week",
        html: buildEmailHtml(thisWeek, sub),
      });

      return "sent";
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      if (result.value === "sent") sent++;
      else skipped++;
    } else {
      errors++;
      console.error("Notify error:", result.reason);
    }
  }

  return NextResponse.json({ sent, skipped, errors });
}
