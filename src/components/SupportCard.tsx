import { SUPPORT_STRIPE_URL, SUPPORT_KOFI_URL } from "@/lib/constants";

export default function SupportCard({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`rounded-lg border border-border bg-white/5 space-y-3 ${
        compact ? "px-4 py-4" : "px-5 py-5"
      }`}
    >
      <div className="space-y-1">
        <h3 className={`font-semibold ${compact ? "text-sm" : "text-base"}`}>
          Support Cineboxd
        </h3>
        <p className={`text-muted ${compact ? "text-xs" : "text-sm"}`}>
          If Cineboxd saved you time (or helped you catch a great film), you can
          support hosting, scraping and API costs.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href={SUPPORT_STRIPE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-black hover:bg-accent/90 transition-colors"
        >
          Support via Stripe →
        </a>
        <a
          href={SUPPORT_KOFI_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white/5 px-4 py-2 text-sm font-medium text-muted hover:text-foreground hover:bg-white/10 transition-colors"
        >
          Ko-fi
        </a>
      </div>
    </div>
  );
}
