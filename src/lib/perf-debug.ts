import { AsyncLocalStorage } from "node:async_hooks";

interface DomainPerfStats {
  count: number;
  totalMs: number;
  urls: string[];
}

interface PerfDebugStore {
  domains: Record<string, DomainPerfStats>;
}

const store = new AsyncLocalStorage<PerfDebugStore>();

function toUrlString(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function toDomain(urlString: string): string {
  try {
    return new URL(urlString).hostname;
  } catch {
    return "unknown";
  }
}

export function isPerfDebugEnabled(): boolean {
  return process.env.DEBUG_PERF === "1";
}

export async function withPerfDebugScope<T>(
  enabled: boolean,
  fn: () => Promise<T>
): Promise<T> {
  if (!enabled) return fn();
  return store.run({ domains: {} }, fn);
}

export function getPerfDebugSnapshot(): Record<string, DomainPerfStats> {
  return store.getStore()?.domains ?? {};
}

export async function trackedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const perfStore = store.getStore();
  if (!perfStore) {
    return fetch(input, init);
  }

  const url = toUrlString(input);
  const domain = toDomain(url);
  const startedAt = Date.now();

  try {
    return await fetch(input, init);
  } finally {
    const durationMs = Date.now() - startedAt;
    const current =
      perfStore.domains[domain] ??
      {
        count: 0,
        totalMs: 0,
        urls: [],
      };

    current.count += 1;
    current.totalMs += durationMs;
    if (current.urls.length < 10) {
      current.urls.push(url);
    }

    perfStore.domains[domain] = current;
  }
}
