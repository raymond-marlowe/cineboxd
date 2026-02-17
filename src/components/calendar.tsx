"use client";

import { useState, useMemo, useEffect } from "react";
import { WatchlistFilm, Screening } from "@/lib/types";

interface CalendarProps {
  screenings: { film: WatchlistFilm; screening: Screening }[];
  onDownloadIcs: (screening: Screening, filmTitle: string) => void;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function Calendar({ screenings, onDownloadIcs }: CalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Auto-navigate to earliest screening month if different from current
  useEffect(() => {
    if (screenings.length === 0) return;
    const earliest = screenings.reduce((min, s) =>
      s.screening.date < min.screening.date ? s : min
    );
    const d = new Date(earliest.screening.date + "T00:00:00");
    const now = new Date();
    if (monthKey(d) !== monthKey(now)) {
      setCurrentMonth({ year: d.getFullYear(), month: d.getMonth() });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Index screenings by date
  const screeningsByDate = useMemo(() => {
    const map = new Map<string, { film: WatchlistFilm; screening: Screening }[]>();
    for (const s of screenings) {
      const key = s.screening.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [screenings]);

  const { year, month } = currentMonth;
  const firstDay = new Date(year, month, 1);
  // Monday=0 based offset
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthName = firstDay.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  const prev = () => {
    setCurrentMonth((c) =>
      c.month === 0
        ? { year: c.year - 1, month: 11 }
        : { year: c.year, month: c.month - 1 }
    );
    setSelectedDate(null);
  };

  const next = () => {
    setCurrentMonth((c) =>
      c.month === 11
        ? { year: c.year + 1, month: 0 }
        : { year: c.year, month: c.month + 1 }
    );
    setSelectedDate(null);
  };

  const days: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const selectedScreenings = selectedDate ? screeningsByDate.get(selectedDate) ?? [] : [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={prev}
          className="text-muted hover:text-foreground transition-colors px-3 py-1 rounded-lg hover:bg-card cursor-pointer"
        >
          ← Prev
        </button>
        <h3 className="text-lg font-semibold">{monthName}</h3>
        <button
          onClick={next}
          className="text-muted hover:text-foreground transition-colors px-3 py-1 rounded-lg hover:bg-card cursor-pointer"
        >
          Next →
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1">
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            className="text-center text-xs text-muted font-medium py-2"
          >
            {d}
          </div>
        ))}

        {days.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} />;
          }

          const dk = dateKey(new Date(year, month, day));
          const hasScreenings = screeningsByDate.has(dk);
          const isSelected = selectedDate === dk;

          return (
            <button
              key={dk}
              onClick={() => setSelectedDate(isSelected ? null : dk)}
              className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition-colors cursor-pointer ${
                isSelected
                  ? "bg-accent text-background font-semibold"
                  : hasScreenings
                    ? "bg-accent/10 border border-accent/40 text-foreground hover:bg-accent/20 font-medium"
                    : "text-muted hover:bg-card"
              }`}
            >
              {day}
              {hasScreenings && !isSelected && (
                <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-accent" />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day detail */}
      {selectedDate && (
        <div className="border border-border rounded-xl bg-card p-4 space-y-3">
          <h4 className="font-semibold text-sm text-muted">
            {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </h4>

          {selectedScreenings.length === 0 ? (
            <p className="text-sm text-muted">No screenings on this day.</p>
          ) : (
            <div className="grid gap-2">
              {selectedScreenings
                .sort((a, b) => a.screening.time.localeCompare(b.screening.time))
                .map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 text-sm bg-background/50 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-medium">{s.film.title}</span>
                      <span className="text-muted">{s.screening.venue}</span>
                      <span className="font-mono">{s.screening.time}</span>
                      {s.screening.format && (
                        <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full font-medium">
                          {s.screening.format}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDownloadIcs(s.screening, s.film.title);
                        }}
                        className="text-muted hover:text-accent transition-colors cursor-pointer"
                        title="Download ICS"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                          <line x1="12" y1="14" x2="12" y2="20" />
                          <line x1="9" y1="17" x2="12" y2="20" />
                          <line x1="15" y1="17" x2="12" y2="20" />
                        </svg>
                      </button>
                      {s.screening.bookingUrl ? (
                        <a
                          href={s.screening.bookingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:underline font-medium"
                        >
                          Book
                        </a>
                      ) : (
                        <span className="text-muted text-xs">Sold out</span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
