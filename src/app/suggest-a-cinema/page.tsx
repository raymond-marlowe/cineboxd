import type { Metadata } from "next";
import Link from "next/link";
import RequestCinemaCTA from "@/components/RequestCinemaCTA";

export const metadata: Metadata = {
  title: "Suggest a cinema",
  description: "Suggest a London cinema to add to Cineboxd.",
};

export default function SuggestCinemaPage() {
  return (
    <div className="flex-1">
      <main className="max-w-3xl mx-auto px-4 py-12 space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Suggest a cinema</h1>
          <p className="text-sm text-muted leading-relaxed">
            Cineboxd adds venues over time, and suggestions help prioritise
            what gets added next.
          </p>
        </div>

        <RequestCinemaCTA />

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">What to include</h2>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted leading-relaxed">
            <li>Cinema name and location.</li>
            <li>A link to their listings or programme page.</li>
            <li>
              If possible, whether listings are per-venue and publicly
              accessible without login.
            </li>
          </ul>
          <p className="text-sm text-muted leading-relaxed">
            Scrapers can break when sites change, so a stable listings URL is
            especially helpful.
          </p>
        </section>

        <Link
          href="/venues"
          className="inline-block text-accent hover:underline text-sm"
        >
          &larr; Back to supported cinemas
        </Link>
      </main>
    </div>
  );
}
