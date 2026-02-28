import type { Metadata } from "next";
import Link from "next/link";
import { getScraperStatusSnapshot } from "@/lib/status";
import type { ScrapeBreakdown } from "@/scrapers";

export const metadata: Metadata = {
  title: "Status",
  description: "Scraper health and last refresh status for Cineboxd.",
};

export const dynamic = "force-dynamic";

const SLOW_THRESHOLD_MS = 15_000;

function getHealth(item: ScrapeBreakdown): {
  label: "healthy" | "slow-or-empty" | "error";
  dotClass: string;
} {
  if (item.error) {
    return { label: "error", dotClass: "bg-red-500" };
  }

  if (item.count === 0 || item.durationMs > SLOW_THRESHOLD_MS) {
    return { label: "slow-or-empty", dotClass: "bg-amber-500" };
  }

  return { label: "healthy", dotClass: "bg-green-500" };
}

function formatUpdatedAt(updatedAt: string | null) {
  if (!updatedAt) return "No refresh data yet";

  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return updatedAt;

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

export default async function StatusPage() {
  const { updatedAt, breakdown, note } = await getScraperStatusSnapshot();

  return (
    <div className="flex-1">
      <main className="max-w-3xl mx-auto px-4 py-12 space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Status</h1>
          <p className="text-sm text-muted">
            Last refreshed: <span className="text-foreground">{formatUpdatedAt(updatedAt)}</span>
          </p>
        </div>

        {!breakdown ? (
          <section className="rounded-lg border border-border bg-white/5 px-4 py-4">
            <p className="text-sm text-muted">
              {note ?? "No status data available yet."}
            </p>
          </section>
        ) : (
          <section className="overflow-x-auto rounded-lg border border-border bg-white/5">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">Health</th>
                  <th className="px-4 py-3 font-semibold">Scraper</th>
                  <th className="px-4 py-3 font-semibold">Count</th>
                  <th className="px-4 py-3 font-semibold">Duration</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((item) => {
                  const health = getHealth(item);
                  return (
                    <tr key={item.name} className="border-b border-border last:border-b-0 align-top">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className={`inline-block h-2.5 w-2.5 rounded-full ${health.dotClass}`}
                            aria-hidden="true"
                          />
                          <span className="sr-only">{health.label}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        <div>{item.name}</div>
                        {item.error ? (
                          <p className="mt-1 text-xs text-red-300">{item.error}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-muted">{item.count}</td>
                      <td className="px-4 py-3 text-muted">{item.durationMs}ms</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        <p className="text-sm text-muted leading-relaxed">
          This reflects the most recent scheduled refresh; always confirm times
          on venue sites.
        </p>

        <Link href="/" className="inline-block text-accent hover:underline text-sm">
          &larr; Back to home
        </Link>
      </main>
    </div>
  );
}
