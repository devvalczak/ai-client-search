import "server-only";
import { config } from "@/lib/config";
import { fetchJson, tracked } from "@/lib/http";
import type { Candidate, SearchInput, SourceResult } from "./types";

/**
 * CEIDG – Hurtownia Danych, API v3 (jednoosobowe działalności gospodarcze).
 * Token (JWT) bezpłatnie: https://dane.biznes.gov.pl/pl/dane-po-api
 *
 * UWAGA: nazwy parametrów i pól odpowiedzi są oparte na publicznych opisach dokumentacji v3
 * (firmy[], wlasciciel, adresDzialalnosci, dataRozpoczecia; parametry nip, miasto, pkd, dataod, datado, status, page).
 * Z tego środowiska nie było możliwe przetestowanie API na żywo – parser jest celowo defensywny.
 * Surowa odpowiedź trafia do logu serwera przy braku wyników, żeby łatwo było dopasować mapowanie.
 */

type CeidgAddress = {
  ulica?: string;
  budynek?: string;
  lokal?: string;
  miasto?: string;
  kod?: string;
  wojewodztwo?: string;
  kraj?: string;
};

export type CeidgFirma = {
  id?: string;
  nazwa?: string;
  status?: string;
  dataRozpoczecia?: string;
  wlasciciel?: { imie?: string; nazwisko?: string; nip?: string; regon?: string };
  adresDzialalnosci?: CeidgAddress;
  email?: string;
  www?: string;
  telefon?: string;
  link?: string;
};

type CeidgResponse = { firmy?: CeidgFirma[]; firma?: CeidgFirma[]; links?: { next?: string } };

function headers() {
  if (!config.ceidgToken) throw new Error("Brak CEIDG_API_TOKEN – token można uzyskać bezpłatnie na dane.biznes.gov.pl.");
  return { Authorization: `Bearer ${config.ceidgToken}`, Accept: "application/json" };
}

function formatAddress(a?: CeidgAddress): string | null {
  if (!a) return null;
  const street = [a.ulica, [a.budynek, a.lokal].filter(Boolean).join("/")].filter(Boolean).join(" ");
  return [street, [a.kod, a.miasto].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;
}

export function ceidgToCandidate(f: CeidgFirma): Candidate {
  const owner = [f.wlasciciel?.imie, f.wlasciciel?.nazwisko].filter(Boolean).join(" ") || null;
  return {
    source: "ceidg",
    name: f.nazwa ?? owner ?? "(bez nazwy)",
    address: formatAddress(f.adresDzialalnosci),
    city: f.adresDzialalnosci?.miasto ?? null,
    country: "PL",
    email: f.email ?? null,
    phone: f.telefon ?? null,
    website: f.www ?? null,
    websiteCertain: false,
    foundedAt: f.dataRozpoczecia ?? null,
    ceidgId: f.id ?? null,
    nip: f.wlasciciel?.nip ?? null,
    regon: f.wlasciciel?.regon ?? null,
    ownerName: owner,
    businessStatus: f.status ?? null,
  };
}

export async function searchCeidg(input: SearchInput): Promise<SourceResult> {
  const params = new URLSearchParams();
  if (input.location) params.set("miasto", input.location.split(",")[0].trim());
  for (const code of input.pkd ?? []) params.append("pkd", code.replace(/[.\s]/g, "").toUpperCase());
  if (input.registeredWithinDays) {
    const from = new Date(Date.now() - input.registeredWithinDays * 86400000);
    params.set("dataod", from.toISOString().slice(0, 10));
  }
  params.set("status", "AKTYWNY");
  const page = Number(input.pageToken ?? 0) || 0;
  if (page) params.set("page", String(page));

  const data = await tracked("ceidg", "firmy", () =>
    fetchJson<CeidgResponse>(`${config.ceidgBaseUrl}/firmy?${params}`, { headers: headers() }),
  );
  const list = data.firmy ?? data.firma ?? [];
  if (!list.length) console.warn("[ceidg] pusta odpowiedź:", JSON.stringify(data).slice(0, 500));

  const warnings: string[] = [];
  // Zapytanie tekstowe filtrujemy lokalnie po nazwie, jeśli nie podano PKD
  let candidates = list.map(ceidgToCandidate);
  if (!input.pkd?.length && input.query.trim()) {
    const q = input.query.toLowerCase();
    const filtered = candidates.filter((c) => c.name.toLowerCase().includes(q));
    if (filtered.length) candidates = filtered;
    else warnings.push("Żadna nazwa nie zawiera frazy – pokazuję wszystkie firmy z filtra. Użyj kodów PKD.");
  }
  return { candidates, nextPageToken: data.links?.next ? String(page + 1) : null, warnings };
}

export async function ceidgByNip(nip: string): Promise<CeidgFirma | null> {
  const data = await tracked("ceidg", "firma_nip", () =>
    fetchJson<CeidgResponse>(`${config.ceidgBaseUrl}/firma?nip=${encodeURIComponent(nip)}`, { headers: headers() }),
  );
  return (data.firma ?? data.firmy ?? [])[0] ?? null;
}
