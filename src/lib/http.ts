import "server-only";
import { db, schema } from "@/lib/db";

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: string,
  ) {
    super(message);
  }
}

export async function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 15000, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const res = await fetchWithTimeout(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new HttpError(`${res.status} ${res.statusText}: ${body.slice(0, 300)}`, res.status, body);
  }
  return (await res.json()) as T;
}

/** Zapisuje wywołanie płatnego/limitowanego API, żeby pilnować kosztów. */
export function trackUsage(provider: string, operation: string, ok: boolean) {
  try {
    db.insert(schema.apiUsage).values({ provider, operation, ok }).run();
  } catch {
    // statystyka nie może psuć głównego przepływu
  }
}

export async function tracked<T>(provider: string, operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    const r = await fn();
    trackUsage(provider, operation, true);
    return r;
  } catch (e) {
    trackUsage(provider, operation, false);
    throw e;
  }
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
