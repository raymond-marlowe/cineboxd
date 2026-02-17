const DEFAULT_MAX_REQUESTS = 10;
const DEFAULT_WINDOW_MS = 60 * 1000; // 60 seconds

const store = new Map<string, number[]>();

export function checkRateLimit(
  ip: string,
  maxRequests = DEFAULT_MAX_REQUESTS,
  windowMs = DEFAULT_WINDOW_MS
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const timestamps = store.get(ip) ?? [];

  // Prune old entries
  const recent = timestamps.filter((t) => now - t < windowMs);

  if (recent.length >= maxRequests) {
    const oldest = recent[0];
    const retryAfterMs = windowMs - (now - oldest);
    store.set(ip, recent);
    return { allowed: false, retryAfterMs };
  }

  recent.push(now);
  store.set(ip, recent);
  return { allowed: true, retryAfterMs: 0 };
}
