import { Crimson_Pro } from "next/font/google";

const crimsonPro = Crimson_Pro({
  weight: ["700", "900"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
});

/**
 * Cineboxd wordmark — Crimson Pro Black.
 * "cine" roman, "boxd" italic, split-colour.
 * Pass a Tailwind font-size class via `className` to size it at the call site.
 */
export default function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={`${crimsonPro.className} leading-none select-none${className ? ` ${className}` : ""}`}
    >
      <span style={{ color: "#C9772B", fontWeight: 900, fontStyle: "normal" }}>cine</span>
      <span
        style={{
          color: "#F2F0EB",
          fontWeight: 900,
          fontStyle: "italic",
          marginLeft: "-0.06em",
          letterSpacing: "-0.015em",
        }}
      >
        boxd
      </span>
    </span>
  );
}
