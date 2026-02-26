"use client";

import { MatchedScreening } from "@/lib/types";

interface FilmGridProps {
  matches: MatchedScreening[];
  onSelectFilm: (match: MatchedScreening) => void;
}

export default function FilmGrid({ matches, onSelectFilm }: FilmGridProps) {
  return (
    <div className="mx-auto w-full">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 sm:gap-4">
        {matches.map((match, index) => {
          const hasPoster = !!match.metadata?.posterPath;
          return (
            <button
              key={`${match.film.title}-${match.film.year ?? "na"}-${index}`}
              type="button"
              onClick={() => onSelectFilm(match)}
              className="group relative aspect-[2/3] overflow-hidden rounded-xl border border-border bg-card text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label={`Open details for ${match.film.title}${match.film.year ? ` (${match.film.year})` : ""}`}
            >
              {hasPoster ? (
                <>
                  <img
                    src={`https://image.tmdb.org/t/p/w500${match.metadata!.posterPath}`}
                    srcSet={`https://image.tmdb.org/t/p/w342${match.metadata!.posterPath} 342w, https://image.tmdb.org/t/p/w500${match.metadata!.posterPath} 500w, https://image.tmdb.org/t/p/w780${match.metadata!.posterPath} 780w`}
                    sizes="(min-width: 1536px) 13vw, (min-width: 1280px) 15vw, (min-width: 1024px) 18vw, (min-width: 768px) 22vw, (min-width: 640px) 30vw, 46vw"
                    alt={`${match.film.title} poster`}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-black/0 transition-colors duration-200 md:group-hover:bg-black/40" />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden md:block p-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <p className="text-xs font-medium leading-tight text-white line-clamp-2">
                      {match.film.title}
                    </p>
                    {match.film.year && (
                      <p className="mt-0.5 text-[11px] text-white/80">{match.film.year}</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center bg-background/50">
                  <span className="text-sm font-medium text-muted line-clamp-3">
                    {match.film.title || "No poster"}
                  </span>
                  {match.film.year && (
                    <span className="mt-1 text-xs text-muted/80">{match.film.year}</span>
                  )}
                  {!match.film.title && (
                    <span className="mt-1 text-xs text-muted/70">No poster</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
