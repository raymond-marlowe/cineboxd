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
  { name: "Regent Street Cinema",   url: "https://www.regentstreetcinema.com" },
  { name: "Rich Mix",               url: "https://richmix.org.uk/whats-on/cinema/" },
  { name: "JW3",                    url: "https://www.jw3.org.uk/cinema" },
  { name: "Curzon Sea Containers",  url: "https://ticketing.eu.veezi.com/sessions/?siteToken=a4xawmcnn5xz11am1ayy6ykfdm" },
  { name: "Curzon Goldsmiths",      url: "https://ticketing.eu.veezi.com/sessions/?siteToken=pvmm3g2bze4sajxy7qyab2x344" },
  // Curzon main-site venues (requires ENABLE_CURZON_OCAPI=true)
  { name: "Curzon Soho",           url: "https://www.curzon.com/venues/soho/" },
  { name: "Curzon Camden",         url: "https://www.curzon.com/venues/camden/" },
  { name: "Curzon Mayfair",        url: "https://www.curzon.com/venues/mayfair/" },
  { name: "Curzon Bloomsbury",     url: "https://www.curzon.com/venues/bloomsbury/" },
  { name: "Curzon Victoria",       url: "https://www.curzon.com/venues/victoria/" },
  { name: "Curzon Hoxton",         url: "https://www.curzon.com/venues/hoxton/" },
  { name: "Curzon Richmond",       url: "https://www.curzon.com/venues/richmond/" },
  { name: "Curzon Kingston",       url: "https://www.curzon.com/venues/kingston/" },
  { name: "Curzon Wimbledon",      url: "https://www.curzon.com/venues/wimbledon/" },
  { name: "Curzon Aldgate",        url: "https://www.curzon.com/venues/aldgate/" },
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
