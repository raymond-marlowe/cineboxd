"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Wordmark from "@/components/Wordmark";

const NAV_LINKS = [
  { label: "Watchlist",  href: "/" },
  { label: "Together",   href: "/?mode=together" },
  { label: "What's On",  href: "/whats-on" },
  { label: "Venues",     href: "/venues" },
] as const;

function isActive(href: string, pathname: string, search: string): boolean {
  if (href === "/?mode=together") {
    return pathname === "/" && search.includes("mode=together");
  }
  if (href === "/") return pathname === "/" && !search.includes("mode=together");
  return pathname === href || pathname.startsWith(href + "/");
}

function TopNavInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  return (
    <nav className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center gap-2 sm:gap-6">
        <Link href="/" className="shrink-0 mr-2 leading-none" aria-label="Cineboxd home">
          <Wordmark className="text-2xl sm:text-[32px]" />
        </Link>

        <div className="flex items-center gap-0.5 overflow-x-auto">
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className={[
                "px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors",
                isActive(href, pathname, search)
                  ? "bg-accent/15 text-accent font-medium"
                  : "text-muted hover:text-foreground hover:bg-white/5",
              ].join(" ")}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}

export default function TopNav() {
  return (
    <Suspense
      fallback={
        <nav className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-40">
          <div className="max-w-4xl mx-auto px-4 py-2.5 h-11" />
        </nav>
      }
    >
      <TopNavInner />
    </Suspense>
  );
}
