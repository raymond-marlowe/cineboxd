import type { Metadata } from "next";
import Link from "next/link";
import SupportedVenuesDirectory from "@/components/SupportedVenuesDirectory";
import { SUPPORTED_VENUES } from "@/components/SupportedVenues";
import RequestCinemaCTA from "@/components/RequestCinemaCTA";

export const metadata: Metadata = {
  title: "Supported cinemas — Cineboxd",
  description: `Cineboxd aggregates screenings from ${SUPPORTED_VENUES.length} London independent and repertory cinemas.`,
};

export default function VenuesPage() {
  return (
    <div className="flex-1">
      <main className="max-w-4xl mx-auto px-4 py-12 space-y-6">
        <div className="space-y-1">
          <h2 className="text-3xl font-semibold tracking-tight">Supported cinemas</h2>
          <p className="text-muted text-sm">
            {SUPPORTED_VENUES.length} London independent and repertory cinemas, updated daily.
          </p>
        </div>

        <SupportedVenuesDirectory />

        <RequestCinemaCTA />

        <Link href="/" className="inline-block text-accent hover:underline text-sm">
          &larr; Back to home
        </Link>
      </main>
    </div>
  );
}
