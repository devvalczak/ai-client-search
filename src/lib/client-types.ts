import type { Contact, Lead, Note } from "@/lib/db/schema";

/** Kształt obiektu po przejściu przez JSON (daty jako stringi). */
export type Jsonify<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K] };

export type LeadJson = Jsonify<Lead>;
export type ContactJson = Jsonify<Contact>;
export type NoteJson = Jsonify<Note>;

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Błąd ${res.status}`);
  return data as T;
}
