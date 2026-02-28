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
  label: "healthy" | "disabled" | "slow-or-empty" | "error";
  dotClass: string;
} {
  if (item.disabled) {
    return { label: "disabled", dotClass: "bg-neutral-500" };
  }

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

type EnvVarState = "set_truthy" | "set_falsy" | "missing";

const ENV_LABELS: Record<string, string> = {
  ENABLE_CURZON_OCAPI: "Curzon OCAPI",
  ENABLE_PICTUREHOUSE: "Picturehouse",
  ENABLE_EVERYMAN: "Everyman",
  BFI_CF_CLEARANCE: "BFI CF clearance",
};

function EnvStateChip({ state, label }: { state: EnvVarState; label: string }) {
  const cls =
    state === "set_truthy"
      ? "text-green-400"
      : state === "set_falsy"
      ? "text-amber-400"
      : "text-red-400";
  const text =
    state === "set_truthy" ? "set ✓" : state === "set_falsy" ? "set (wrong value)" : "missing";
  return (
    <span className="flex items-center gap-2 text-xs">
      <span className="text-muted w-36 shrink-0">{label}</span>
      <span className={cls}>{text}</span>
    </span>
  );
}

export default async function StatusPage() {
  const { updatedAt, breakdown, note, flags, rawEnv } = await getScraperStatusSnapshot();

  // Is any flag-gated scraper currently enabled but showing disabled in the breakdown?
  // If so, the breakdown is stale — a fresh refresh will fix it.
  const staleDisabled =
    breakdown?.some(
      (b) =>
        b.disabled &&
        ((b.name === "curzon-ocapi" && flags.curzonOcapi) ||
          (b.name === "picturehouse" && flags.picturehouse) ||
          (b.name === "everyman" && flags.everyman) ||
          (b.name === "bfi-southbank" && flags.bfiClearancePresent))
    ) ?? false;

  return (
    <div className="flex-1">
      <main className="max-w-3xl mx-auto px-4 py-12 space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Status</h1>
          <p className="text-sm text-muted">
            Last refreshed: <span className="text-foreground">{formatUpdatedAt(updatedAt)}</span>
          </p>
        </div>

        {/* Live environment flag state — always shown so operators can see current config */}
        <section className="rounded-lg border border-border bg-white/5 px-4 py-4 space-y-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">
            Current environment
          </p>
          {Object.entries(rawEnv).map(([key, state]) => (
            <EnvStateChip key={key} state={state as EnvVarState} label={ENV_LABELS[key] ?? key} />
          ))}
          {staleDisabled && (
            <p className="mt-2 text-xs text-amber-400">
              Some flags are now set but the breakdown below is from a previous scrape — trigger a
              refresh to update.
            </p>
          )}
        </section>

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
                        <div className={item.disabled ? "text-muted" : undefined}>
                          {item.name}
                          {item.disabled ? (
                            <span className="ml-2 text-xs text-neutral-500">(disabled)</span>
                          ) : null}
                        </div>
                        {item.disabledReason ? (
                          <p className="mt-1 text-xs text-neutral-500">{item.disabledReason}</p>
                        ) : null}
                        {item.error ? (
                          <p className="mt-1 text-xs text-red-300">{item.error}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {item.disabled ? "—" : item.count}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {item.disabled ? "—" : `${item.durationMs}ms`}
                      </td>
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
