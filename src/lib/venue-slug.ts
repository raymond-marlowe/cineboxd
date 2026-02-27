import { SUPPORTED_VENUES } from "@/components/SupportedVenues";

function rawSlug(name: string): string {
  return name
    .normalize("NFD")                      // decompose accented chars: "é" → "e" + combining mark
    .replace(/[\u0300-\u036f]/g, "")       // strip combining marks
    .replace(/'/g, "")                     // strip apostrophes before splitting
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")          // non-alphanumeric runs → single hyphen
    .replace(/^-+|-+$/g, "");             // trim leading/trailing hyphens
}

// Build stable bidirectional maps at module-load time from the canonical
// SUPPORTED_VENUES list. Any venue name not in that list falls back to rawSlug.
const _slugToName = new Map<string, string>();
const _nameToSlug = new Map<string, string>();

for (const { name } of SUPPORTED_VENUES) {
  let slug = rawSlug(name);
  // Disambiguate collisions deterministically (append -2, -3, …)
  if (_slugToName.has(slug)) {
    let i = 2;
    while (_slugToName.has(`${slug}-${i}`)) i++;
    slug = `${slug}-${i}`;
  }
  _slugToName.set(slug, name);
  _nameToSlug.set(name, slug);
}

export function venueNameToSlug(name: string): string {
  return _nameToSlug.get(name) ?? rawSlug(name);
}

export function slugToVenueName(slug: string): string | null {
  return _slugToName.get(slug) ?? null;
}

/** For generateStaticParams — returns all known slugs. */
export function getAllVenueSlugs(): Array<{ slug: string }> {
  return [..._slugToName.keys()].map((slug) => ({ slug }));
}
