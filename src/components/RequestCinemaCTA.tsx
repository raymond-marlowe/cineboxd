import { SUGGEST_CINEMA_FORM_URL } from "@/lib/constants";

export default function RequestCinemaCTA() {
  return (
    <div className="rounded-lg border border-border bg-white/5 px-5 py-5 space-y-3">
      <div className="space-y-1">
        <h3 className="text-base font-semibold">Request a cinema</h3>
        <p className="text-sm text-muted">
          Missing a venue? Send it to us and we&rsquo;ll take a look.
        </p>
      </div>
      <a
        href={SUGGEST_CINEMA_FORM_URL}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex w-full sm:w-auto justify-center items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-black hover:bg-accent/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        Suggest a cinema →
      </a>
    </div>
  );
}
