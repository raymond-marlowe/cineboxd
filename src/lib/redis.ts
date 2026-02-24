import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export const SCREENINGS_KEY = "screenings:v1";
export const SCREENINGS_UPDATED_KEY = "screenings:updated_at";
