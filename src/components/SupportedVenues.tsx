"use client";

import { useState } from "react";

export interface Venue {
  name: string;
  url?: string;
}

/**
 * Full list of supported venues.
 * To add a new venue: append { name, url } to this array.
 * The name must match the `venue` string emitted by the corresponding scraper.
 */
export const SUPPORTED_VENUES: Venue[] = [
  { name: "Prince Charles Cinema",  url: "https://princecharlescinema.com" },
  { name: "Close-Up Film Centre",   url: "https://closeupfilmcentre.com" },
  { name: "ICA Cinema",             url: "https://www.ica.art/cinema" },
  { name: "Barbican Cinema",        url: "https://www.barbican.org.uk/whats-on/cinema" },
  { name: "Rio Cinema",             url: "https://riocinema.org.uk" },
  { name: "Genesis Cinema",         url: "https://genesiscinema.co.uk" },
  { name: "Arthouse Crouch End",    url: "https://www.arthousecrouchend.co.uk" },
  { name: "ActOne Cinema",          url: "https://www.actonecinema.co.uk" },
  { name: "Phoenix Cinema",         url: "https://phoenixcinema.co.uk" },
  { name: "The Lexi Cinema",        url: "https://thelexicinema.co.uk" },
  { name: "Garden Cinema",          url: "https://thegardencinema.co.uk" },
];

const CLAMP = 10;

const chipBase =
  "inline-flex items-center text-sm px-2.5 py-0.5 rounded-full border border-white/10 bg-white/5 transition-colors";

export default function SupportedVenues({ venues = SUPPORTED_VENUES }: { venues?: Venue[] }) {
  const [expanded, setExpanded] = useState(false);

  const hidden = venues.length - CLAMP;
  const visible = expanded || hidden <= 0 ? venues : venues.slice(0, CLAMP);
  const listId = "supported-venues-list";

  return (
    <div className="w-full max-w-2xl mx-auto px-4 text-center space-y-2">
      {/* Heading row */}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <span className="text-sm text-muted">
          Supported venues ({venues.length}):
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-muted/80">
          Limited coverage
        </span>
      </div>

      {/* Chip list */}
      <div
        id={listId}
        className="flex flex-wrap justify-center gap-2"
      >
        {visible.map((venue) =>
          venue.url ? (
            <a
              key={venue.name}
              href={venue.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`${chipBase} text-muted hover:bg-white/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-background`}
            >
              {venue.name}
            </a>
          ) : (
            <span
              key={venue.name}
              className={`${chipBase} text-muted`}
            >
              {venue.name}
            </span>
          )
        )}

        {/* Expand / collapse toggle */}
        {hidden > 0 && (
          <button
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            aria-controls={listId}
            className={`${chipBase} text-muted hover:bg-white/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-background cursor-pointer`}
          >
            {expanded ? "Show less" : `+${hidden} more`}
          </button>
        )}
      </div>
    </div>
  );
}
