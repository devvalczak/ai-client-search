import "server-only";
import { config, USER_AGENT } from "@/lib/config";
import { generateJson } from "@/lib/gemini";
import { fetchJson, tracked } from "@/lib/http";
import type { Candidate, SearchInput, SourceResult } from "./types";

/**
 * OpenStreetMap: Nominatim (geokodowanie obszaru) + Overpass (obiekty z tagami).
 * Darmowe, ale z limitami (Nominatim: max 1 zapytanie/s). Dane o stronach www są niepełne,
 * więc brak tagu `website` traktujemy jako sygnał niepewny.
 */

type TagFilter = { key: string; value?: string };

// Najczęstsze branże klientów agencji -> tagi OSM. Klucz to fragment słowa (PL/EN).
const CATEGORY_TAGS: [RegExp, TagFilter[]][] = [
  [/fryzj|barber|hair/i, [{ key: "shop", value: "hairdresser" }]],
  [/kosmet|beauty|uroda|paznok|nail/i, [{ key: "shop", value: "beauty" }]],
  [/restaur|bistro|jedzen|food/i, [{ key: "amenity", value: "restaurant" }]],
  [/kawiar|cafe|coffee/i, [{ key: "amenity", value: "cafe" }]],
  [/pizz/i, [{ key: "cuisine", value: "pizza" }]],
  [/dentyst|stomat|dentist/i, [{ key: "amenity", value: "dentist" }, { key: "healthcare", value: "dentist" }]],
  [/lekarz|przychodn|klinik|clinic|doctor/i, [{ key: "amenity", value: "clinic" }, { key: "amenity", value: "doctors" }]],
  [/fizjo|physio/i, [{ key: "healthcare", value: "physiotherapist" }]],
  [/weteryn|vet/i, [{ key: "amenity", value: "veterinary" }]],
  [/siłown|silown|fitness|gym/i, [{ key: "leisure", value: "fitness_centre" }]],
  [/mechan|warsztat|car repair|serwis samoch/i, [{ key: "shop", value: "car_repair" }]],
  [/hotel/i, [{ key: "tourism", value: "hotel" }]],
  [/pensjonat|guest ?house|nocleg/i, [{ key: "tourism", value: "guest_house" }]],
  [/piekar|bakery/i, [{ key: "shop", value: "bakery" }]],
  [/kwiac|florist/i, [{ key: "shop", value: "florist" }]],
  [/prawn|adwokat|kancelari|lawyer/i, [{ key: "office", value: "lawyer" }]],
  [/księgow|ksiegow|biuro rachunk|account/i, [{ key: "office", value: "accountant" }]],
  [/nieruchom|real estate|estate agent/i, [{ key: "office", value: "estate_agent" }]],
  [/stolar|carpenter/i, [{ key: "craft", value: "carpenter" }]],
  [/elektryk|electrician/i, [{ key: "craft", value: "electrician" }]],
  [/hydraulik|plumber/i, [{ key: "craft", value: "plumber" }]],
  [/optyk|optician/i, [{ key: "shop", value: "optician" }]],
  [/tatu|tattoo/i, [{ key: "shop", value: "tattoo" }]],
  [/przedszk|kindergarten/i, [{ key: "amenity", value: "kindergarten" }]],
  [/szkoła językow|szkola jezykow|language school/i, [{ key: "amenity", value: "language_school" }]],
];

async function tagsForQuery(query: string): Promise<{ tags: TagFilter[]; viaAi: boolean }> {
  for (const [re, tags] of CATEGORY_TAGS) if (re.test(query)) return { tags, viaAi: false };
  if (!config.geminiApiKey) return { tags: [], viaAi: false };
  try {
    const { data } = await generateJson<{ tags: TagFilter[] }>({
      operation: "osm_tags",
      prompt: `Zamień opis branży na maksymalnie 3 filtry tagów OpenStreetMap (klucz=wartość), które najlepiej wyszukają takie działalności.
Opis: "${query}"
Zwróć JSON: {"tags":[{"key":"shop","value":"hairdresser"}]}. Używaj wyłącznie istniejących, popularnych tagów OSM.`,
    });
    const tags = (data.tags ?? []).filter((t) => /^[a-z_:]+$/.test(t.key) && (!t.value || /^[a-z_;]+$/.test(t.value)));
    return { tags: tags.slice(0, 3), viaAi: true };
  } catch {
    return { tags: [], viaAi: false };
  }
}

async function areaIdFor(location: string): Promise<{ areaId: number; displayName: string }> {
  const url = `${config.nominatimUrl}/search?format=jsonv2&limit=5&q=${encodeURIComponent(location)}`;
  const results = await tracked("nominatim", "search", () =>
    fetchJson<{ osm_type: string; osm_id: number; display_name: string }[]>(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "pl,en" },
    }),
  );
  const rel = results.find((r) => r.osm_type === "relation");
  if (!rel) throw new Error(`Nie znaleziono obszaru "${location}" w OpenStreetMap.`);
  // Overpass: id obszaru = 3 600 000 000 + id relacji
  return { areaId: 3600000000 + rel.osm_id, displayName: rel.display_name };
}

function escapeOverpass(s: string) {
  return s.replace(/["\\]/g, "\\$&");
}

type OverpassEl = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export async function searchOsm(input: SearchInput): Promise<SourceResult> {
  if (!input.location) throw new Error("OpenStreetMap wymaga lokalizacji (miasto/region).");
  const warnings: string[] = [];
  const [{ areaId, displayName }, { tags, viaAi }] = await Promise.all([
    areaIdFor(input.location),
    tagsForQuery(input.query),
  ]);
  if (viaAi) warnings.push(`Tagi OSM dobrane przez AI: ${tags.map((t) => `${t.key}=${t.value ?? "*"}`).join(", ")}`);

  const limit = Math.min(input.limit ?? 50, 200);
  const filters = tags.length
    ? tags.map((t) => `nwr["${escapeOverpass(t.key)}"${t.value ? `="${escapeOverpass(t.value)}"` : ""}]["name"](area.a);`)
    : [`nwr["name"~"${escapeOverpass(input.query)}",i][~"^(shop|amenity|office|craft|healthcare|leisure|tourism)$"~"."](area.a);`];
  if (!tags.length) warnings.push("Brak dopasowania branży do tagów OSM – szukam po nazwie.");

  const q = `[out:json][timeout:25];area(id:${areaId})->.a;(${filters.join("")});out center tags ${limit};`;
  const data = await tracked("overpass", "interpreter", () =>
    fetchJson<{ elements: OverpassEl[] }>(config.overpassUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
      body: `data=${encodeURIComponent(q)}`,
      timeoutMs: 30000,
    }),
  );

  const candidates: Candidate[] = data.elements
    .filter((e) => e.tags?.name)
    .map((e) => {
      const t = e.tags!;
      const street = [t["addr:street"] ?? t["addr:place"], t["addr:housenumber"]].filter(Boolean).join(" ");
      const city = t["addr:city"] ?? input.location!.split(",")[0].trim();
      return {
        source: "osm",
        name: t.name,
        category: t.shop ?? t.amenity ?? t.office ?? t.craft ?? t.healthcare ?? t.leisure ?? t.tourism ?? null,
        address: [street, t["addr:postcode"], t["addr:city"]].filter(Boolean).join(", ") || null,
        city,
        country: t["addr:country"] ?? null,
        lat: e.lat ?? e.center?.lat ?? null,
        lng: e.lon ?? e.center?.lon ?? null,
        phone: t.phone ?? t["contact:phone"] ?? null,
        email: t.email ?? t["contact:email"] ?? null,
        website: t.website ?? t["contact:website"] ?? t.url ?? null,
        websiteCertain: false,
        socials: {
          facebook: t["contact:facebook"],
          instagram: t["contact:instagram"],
        },
        osmId: `${e.type}/${e.id}`,
      } satisfies Candidate;
    });

  warnings.push(`Obszar: ${displayName}`);
  return { candidates, warnings };
}
