import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Subscription } from "./types";

const DATA_DIR = process.env.VERCEL
  ? "/tmp"
  : path.join(process.cwd(), "data");
const SUBS_FILE = path.join(DATA_DIR, "subscriptions.json");

export function readSubscriptions(): Subscription[] {
  try {
    const raw = fs.readFileSync(SUBS_FILE, "utf-8");
    return JSON.parse(raw) as Subscription[];
  } catch {
    return [];
  }
}

export function writeSubscriptions(subs: Subscription[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2), "utf-8");
}

export function addSubscription(email: string, username: string): string {
  const subs = readSubscriptions();
  const existing = subs.find(
    (s) => s.email === email && s.username === username
  );
  if (existing) return existing.id;

  const id = crypto.randomBytes(4).toString("hex");
  subs.push({ id, email, username, createdAt: Date.now() });
  writeSubscriptions(subs);
  return id;
}

export function removeSubscription(id: string): boolean {
  const subs = readSubscriptions();
  const idx = subs.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  subs.splice(idx, 1);
  writeSubscriptions(subs);
  return true;
}

export function getSubscription(id: string): Subscription | undefined {
  return readSubscriptions().find((s) => s.id === id);
}
