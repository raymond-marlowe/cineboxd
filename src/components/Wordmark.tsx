import { Crimson_Pro } from "next/font/google";

// Two separate instances so each span's variant is unambiguous.
const crimsonItalic = Crimson_Pro({
  weight: ["900"],
  style: ["italic"],
  subsets: ["latin"],
  display: "swap",
});

const crimsonRoman = Crimson_Pro({
  weight: ["900"],
  style: ["normal"],
  subsets: ["latin"],
  display: "swap",
});

/**
 * Cineboxd wordmark — Crimson Pro Black.
 * "cine" italic #C9772B  |  "boxd" roman #F2F0EB
 * Pass a Tailwind font-size class via `className` to size it at the call site.
 */
export default function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`leading-none select-none${className ? ` ${className}` : ""}`}>
      <span className={crimsonItalic.className} style={{ color: "#C9772B" }}>cine</span>
      <span
        className={`${crimsonRoman.className} -ml-[0.06em] tracking-[-0.015em]`}
        style={{ color: "#F2F0EB" }}
      >
        boxd
      </span>
    </span>
  );
}
