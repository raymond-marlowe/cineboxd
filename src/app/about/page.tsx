import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About — Cineboxd",
};

export default function AboutPage() {
  return (
    <div className="flex-1">
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-6 flex items-center justify-between">
          <Link href="/">
            <h1 className="text-2xl font-bold tracking-tight">
              <span className="text-accent">cine</span>boxd
            </h1>
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-12 space-y-6">
        <h2 className="text-3xl font-semibold tracking-tight">About</h2>

        <div className="space-y-4 text-muted leading-relaxed">
          <p>
            Cineboxd is a personal project that matches your Letterboxd
            watchlist against what&apos;s currently showing at London&apos;s
            independent and repertory cinemas.
          </p>
          <p>
            It was built with Next.js and Claude Code.
          </p>
          <p>
            Uploaded watchlist files are processed in memory and not stored.
          </p>
        </div>

        <Link
          href="/"
          className="inline-block text-accent hover:underline text-sm"
        >
          &larr; Back to home
        </Link>
      </main>
    </div>
  );
}
