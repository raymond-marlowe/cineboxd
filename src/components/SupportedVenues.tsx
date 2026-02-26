import Link from "next/link";

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
  // Picturehouse venues (requires ENABLE_PICTUREHOUSE=true)
  { name: "Clapham Picturehouse",       url: "https://www.picturehouses.com/cinema/clapham-picturehouse" },
  { name: "Crouch End Picturehouse",    url: "https://www.picturehouses.com/cinema/crouch-end-picturehouse" },
  { name: "Ealing Picturehouse",        url: "https://www.picturehouses.com/cinema/ealing-picturehouse" },
  { name: "East Dulwich Picturehouse",  url: "https://www.picturehouses.com/cinema/east-dulwich" },
  { name: "Finsbury Park Picturehouse", url: "https://www.picturehouses.com/cinema/finsbury-park" },
  { name: "Greenwich Picturehouse",     url: "https://www.picturehouses.com/cinema/greenwich-picturehouse" },
  { name: "Hackney Picturehouse",       url: "https://www.picturehouses.com/cinema/hackney-picturehouse" },
  { name: "Picturehouse Central",       url: "https://www.picturehouses.com/cinema/picturehouse-central" },
  { name: "Ritzy Picturehouse",         url: "https://www.picturehouses.com/cinema/the-ritzy" },
  { name: "The Gate Picturehouse",      url: "https://www.picturehouses.com/cinema/the-gate" },
  { name: "West Norwood Picturehouse",  url: "https://www.picturehouses.com/cinema/west-norwood-picturehouse" },
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
  // Everyman venues (requires ENABLE_EVERYMAN=true)
  { name: "Everyman Baker Street",            url: "https://www.everymancinema.com/baker-street" },
  { name: "Everyman Barnet",                  url: "https://www.everymancinema.com/barnet" },
  { name: "Everyman Belsize Park",            url: "https://www.everymancinema.com/belsize-park" },
  { name: "Everyman Borough Yards",           url: "https://www.everymancinema.com/borough-yards" },
  { name: "Everyman Brentford",               url: "https://www.everymancinema.com/brentford" },
  { name: "Everyman Broadgate",               url: "https://www.everymancinema.com/broadgate" },
  { name: "Everyman Canary Wharf",            url: "https://www.everymancinema.com/canary-wharf" },
  { name: "Everyman Chelsea",                 url: "https://www.everymancinema.com/chelsea" },
  { name: "Everyman Crystal Palace",          url: "https://www.everymancinema.com/crystal-palace" },
  { name: "Everyman Hampstead",               url: "https://www.everymancinema.com/hampstead" },
  { name: "Everyman King's Cross",            url: "https://www.everymancinema.com/kings-cross" },
  { name: "Everyman Maida Vale",              url: "https://www.everymancinema.com/maida-vale" },
  { name: "Everyman Muswell Hill",            url: "https://www.everymancinema.com/muswell-hill" },
  { name: "Everyman Screen on the Green",     url: "https://www.everymancinema.com/screen-on-the-green" },
  { name: "Everyman Stratford International", url: "https://www.everymancinema.com/stratford-international" },
  { name: "Everyman The Whiteley",            url: "https://www.everymancinema.com/the-whiteley" },
  { name: "Ciné Lumière",    url: "https://www.institut-francais.org.uk/cine-lumiere/" },
  { name: "The Arzner",      url: "https://thearzner.com" },
  { name: "The Nickel",      url: "https://thenickel.co.uk" },
  { name: "The Castle Cinema",               url: "https://thecastlecinema.com" },
  { name: "Coldharbour Blue / Whirled Cinema", url: "https://www.coldharbourblue.com" },
  { name: "Peckhamplex",                     url: "https://www.peckhamplex.london" },
  { name: "Olympic Cinema (Barnes)",         url: "https://www.olympiccinema.com/whats-on" },
  { name: "The Cinema in the Power Station", url: "https://www.thecinemainthepowerstation.com/whats-on" },
  { name: "The Cinema at Selfridges",        url: "https://www.thecinemaatselfridges.com/whats-on" },
  { name: "Chiswick Cinema",                 url: "https://www.chiswickcinema.co.uk/whats-on" },
];

const CLAMP = 10;

const chipBase =
  "inline-flex items-center text-sm px-2.5 py-0.5 rounded-full border border-white/10 bg-white/5 transition-colors";

export default function SupportedVenues({ venues = SUPPORTED_VENUES }: { venues?: Venue[] }) {
  const teaser = venues.slice(0, CLAMP);
  const hiddenCount = venues.length - CLAMP;

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

      {/* Chip list — teaser only */}
      <div className="flex flex-wrap justify-center gap-2">
        {teaser.map((venue) =>
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
            <span key={venue.name} className={`${chipBase} text-muted`}>
              {venue.name}
            </span>
          )
        )}

        {/* "View full list" link chip */}
        {hiddenCount > 0 && (
          <Link
            href="/venues"
            className={`${chipBase} text-muted hover:bg-white/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-background`}
          >
            +{hiddenCount} more →
          </Link>
        )}
      </div>
    </div>
  );
}
