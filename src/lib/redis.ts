import { Redis } from "@upstash/redis";

export const IS_REDIS_CONFIGURED = Boolean(
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
);

export const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export const SCREENINGS_KEY = "screenings:v1";
export const SCREENINGS_UPDATED_KEY = "screenings:updated_at";
export const SCRAPERS_BREAKDOWN_KEY = "scrapers:breakdown:v1";
export const SCRAPERS_BREAKDOWN_UPDATED_KEY = "scrapers:breakdown:updated_at";
