import "server-only";
import { generateJson } from "@/lib/gemini";
import type { Candidate, SearchInput, SourceResult } from "./types";

type AiBusiness = {
  name: string;
  category?: string;
  city?: string;
  address?: string;
  country?: string;
  website?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  linkedin?: string | null;
  phone?: string | null;
  email?: string | null;
  nip?: string | null;
  reason?: string;
};

const SYSTEM = `Jesteś researcherem sprzedażowym agencji tworzącej strony internetowe, sklepy i działania SEO/marketingowe.
Szukasz REALNIE ISTNIEJĄCYCH działalności (firmy, JDG, startupy, lokalne usługi, twórcy), które mogą potrzebować
strony internetowej, sklepu, marketplace'u, dedykowanego rozwiązania lub marketingu.
Zasady:
- Używaj wyszukiwarki. Podawaj wyłącznie podmioty, które znalazłeś w wynikach wyszukiwania.
- Nigdy nie zmyślaj adresów, telefonów, e-maili, NIP ani URL-i. Jeśli nie wiesz – wpisz null.
- Preferuj podmioty z sygnałami potrzeby: brak strony, tylko Facebook/Instagram, stara lub niedziałająca strona,
  sprzedaż przez social media/Allegro bez własnego sklepu, świeżo założone firmy.`;

export async function searchGemini(input: SearchInput): Promise<SourceResult> {
  const limit = Math.min(input.limit ?? 15, 30);
  const prompt = `Znajdź do ${limit} działalności pasujących do: "${input.query}"${input.location ? ` w lokalizacji: "${input.location}"` : ""}.
${input.language === "en" ? "Search in English-language sources." : "Szukaj w polskojęzycznych źródłach, jeśli to lokalizacja w Polsce."}

Zwróć WYŁĄCZNIE JSON w formacie:
{"businesses":[{"name":"","category":"","city":"","address":null,"country":"PL","website":null,"facebook":null,"instagram":null,"linkedin":null,"phone":null,"email":null,"nip":null,"reason":"krótko: dlaczego mogą potrzebować naszych usług"}]}`;

  const { data, sources } = await generateJson<{ businesses?: AiBusiness[] }>({
    prompt,
    system: SYSTEM,
    search: true,
    operation: "search",
    temperature: 0.3,
  });

  const candidates: Candidate[] = (data.businesses ?? [])
    .filter((b) => b?.name)
    .map((b) => ({
      source: "gemini",
      name: b.name,
      category: b.category ?? null,
      city: b.city ?? null,
      address: b.address ?? null,
      country: b.country ?? null,
      website: b.website ?? null,
      // AI mogło po prostu nie znaleźć strony – traktujemy jako niepewne do czasu pogłębienia
      websiteCertain: false,
      socials: {
        facebook: b.facebook ?? undefined,
        instagram: b.instagram ?? undefined,
        linkedin: b.linkedin ?? undefined,
      },
      phone: b.phone ?? null,
      email: b.email ?? null,
      nip: b.nip ?? null,
      aiReason: b.reason ?? null,
    }));

  return {
    candidates,
    warnings: [
      `Wyniki z Gemini + Google Search (${sources.length} źródeł). Dane kontaktowe weryfikuj po pogłębieniu.`,
    ],
  };
}
