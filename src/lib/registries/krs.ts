import "server-only";
import { fetchJson, HttpError, tracked } from "@/lib/http";

/**
 * Otwarte API KRS (Ministerstwo Sprawiedliwości) – bez klucza.
 * https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/{krs}?rejestr=P&format=json
 * Uwaga: w otwartym API nazwiska członków organów są maskowane (np. "K*****"),
 * imiona i funkcje są pełne. Parser jest defensywny – struktura odpisu jest głęboko zagnieżdżona.
 */

export type KrsData = {
  krs: string;
  name?: string;
  legalForm?: string;
  nip?: string;
  regon?: string;
  address?: string;
  city?: string;
  website?: string;
  email?: string;
  registeredAt?: string;
  representatives: { name: string; role?: string }[];
};

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function fetchOdpis(krs: string, rejestr: "P" | "S"): Promise<Any | null> {
  try {
    return await tracked("krs", "odpis", () =>
      fetchJson<Any>(`https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/${krs}?rejestr=${rejestr}&format=json`),
    );
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return null;
    throw e;
  }
}

export async function krsLookup(krs: string): Promise<KrsData | null> {
  const odpis = (await fetchOdpis(krs, "P")) ?? (await fetchOdpis(krs, "S"));
  if (!odpis) return null;
  const dane: Any = odpis.odpis?.dane ?? {};
  const d1: Any = dane.dzial1 ?? {};
  const podmiot: Any = d1.danePodmiotu ?? {};
  const adres: Any = d1.siedzibaIAdres?.adres ?? {};
  const street = [adres.ulica, adres.nrDomu, adres.nrLokalu ? `/${adres.nrLokalu}` : null].filter(Boolean).join(" ");

  const representatives: KrsData["representatives"] = [];
  const sklad: Any[] = dane.dzial2?.reprezentacja?.sklad ?? [];
  for (const osoba of sklad) {
    const first = [osoba.imiona?.imie, osoba.imiona?.imieDrugie].filter(Boolean).join(" ");
    const last = osoba.nazwisko?.nazwiskoICzlon ?? osoba.nazwisko?.nazwiskoCzlonPierwszy ?? "";
    const name = [first, last].filter(Boolean).join(" ").trim();
    if (name) representatives.push({ name, role: osoba.funkcjaWOrganie ?? undefined });
  }

  return {
    krs,
    name: podmiot.nazwa,
    legalForm: podmiot.formaPrawna,
    nip: podmiot.identyfikatory?.nip,
    regon: podmiot.identyfikatory?.regon,
    address: [street, [adres.kodPocztowy, adres.miejscowosc].filter(Boolean).join(" ")].filter(Boolean).join(", ") || undefined,
    city: adres.miejscowosc,
    website: d1.siedzibaIAdres?.adresStronyInternetowej,
    email: d1.siedzibaIAdres?.adresPocztyElektronicznej,
    registeredAt: odpis.odpis?.naglowekA?.dataRejestracjiWKRS,
    representatives,
  };
}
