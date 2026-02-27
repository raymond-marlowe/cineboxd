import type { Metadata } from "next";
import { redis, SCREENINGS_KEY } from "@/lib/redis";
import { Screening } from "@/lib/types";
import WhatsOnClient from "./WhatsOnClient";

export const metadata: Metadata = {
  title: "What's On — Cineboxd",
  description: "Browse all upcoming screenings at London's independent cinemas, sorted by venue.",
};

export default async function WhatsOnPage() {
  const screenings = (await redis.get<Screening[]>(SCREENINGS_KEY)) ?? [];
  return <WhatsOnClient screenings={screenings} />;
}
