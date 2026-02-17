import { Screening } from "./types";

function escapeIcs(text: string): string {
  return text.replace(/[\\;,]/g, (ch) => `\\${ch}`).replace(/\n/g, "\\n");
}

function formatIcsDate(date: string, time: string): string {
  // date: YYYY-MM-DD, time: HH:mm
  const d = date.replace(/-/g, "");
  const t = time.replace(":", "") + "00";
  return `${d}T${t}`;
}

function uid(date: string, time: string, venue: string, title: string): string {
  const raw = `${date}-${time}-${venue}-${title}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return `${Math.abs(hash).toString(36)}@cineboxd`;
}

export function generateIcsEvent(screening: Screening, filmTitle: string): string {
  const dtStart = formatIcsDate(screening.date, screening.time);

  // Add 2 hours for end time
  const [h, m] = screening.time.split(":").map(Number);
  const endH = h + 2;
  const endTime = `${String(endH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const dtEnd = formatIcsDate(screening.date, endTime);

  const lines = [
    "BEGIN:VEVENT",
    `UID:${uid(screening.date, screening.time, screening.venue, filmTitle)}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcs(filmTitle)}`,
    `LOCATION:${escapeIcs(screening.venue)}`,
  ];

  const descParts: string[] = [];
  if (screening.format) descParts.push(`Format: ${screening.format}`);
  if (screening.bookingUrl) descParts.push(`Book: ${screening.bookingUrl}`);
  if (descParts.length > 0) {
    lines.push(`DESCRIPTION:${escapeIcs(descParts.join("\n"))}`);
  }

  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

export function generateIcsFile(events: string[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//cineboxd//EN",
    "CALSCALE:GREGORIAN",
    ...events,
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

export function downloadIcs(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
