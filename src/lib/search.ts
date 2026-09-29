import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Lead } from "@/lib/db/schema";
import { mapLimit } from "@/lib/http";
import { findExisting, getWeights, upsertCandidate } from "@/lib/leads";
import { classifyWebsite, normalizeCity, normalizeName, normalizeNip } from "@/lib/normalize";
import { searchCeidg } from "@/lib/sources/ceidg";
import { searchGemini } from "@/lib/sources/gemini-search";
import { searchOsm } from "@/lib/sources/osm";
import { searchPlaces } from "@/lib/sources/places";
import type { SearchInput, SourceResult } from "@/lib/sources/types";
import { analyzeWebsite, type SiteAnalysis } from "@/lib/website";

export type SearchResultItem = { lead: Lead; wasNew: boolean; hidden: boolean; aiReason?: string | null };

export type SearchResponse = {
  searchId: number;
  items: SearchResultItem[];
  nextPageToken: string | null;
  warnings: string[];
};

const SOURCES: Record<SearchInput["source"], (i: SearchInput) => Promise<SourceResult>> = {
  places: searchPlaces,
  osm: searchOsm,
  gemini: searchGemini,
  ceidg: searchCeidg,
};

export async function runSearch(
  input: SearchInput,
  opts: { checkSites?: boolean; searchId?: number } = {},
): Promise<SearchResponse> {
  const result = await SOURCES[input.source](input);
  const warnings = [...(result.warnings ?? [])];

  // Szybka analiza stron (darmowa) – tylko dla tych, których jeszcze nie sprawdzaliśmy.
  const sites: (SiteAnalysis | undefined)[] = opts.checkSites
    ? await mapLimit(result.candidates, 6, async (c) => {
        const { website, domain } = classifyWebsite(c.website, c.socials);
        if (!website) return undefined;
        const existing = findExisting({
          nip: normalizeNip(c.nip),
          googlePlaceId: c.googlePlaceId,
          osmId: c.osmId,
          ceidgId: c.ceidgId,
          domain,
          normalizedName: normalizeName(c.name),
          city: normalizeCity(c.city),
        });
        if (existing?.signals.https !== undefined) return undefined;
        return analyzeWebsite(website);
      })
    : [];

  const weights = getWeights();
  const items: SearchResultItem[] = [];
  const seen = new Set<number>();
  db.transaction(() => {
    result.candidates.forEach((c, i) => {
      const r = upsertCandidate(c, sites[i], weights);
      if (seen.has(r.lead.id)) return; // ten sam podmiot 2x w jednej odpowiedzi
      seen.add(r.lead.id);
      items.push({ ...r, aiReason: c.aiReason });
    });
  });

  const newCount = items.filter((i) => i.wasNew).length;
  let searchId = opts.searchId;
  if (searchId) {
    db.update(schema.searches)
      .set({
        nextPageToken: result.nextPageToken ?? null,
        resultCount: sql`${schema.searches.resultCount} + ${items.length}`,
        newCount: sql`${schema.searches.newCount} + ${newCount}`,
      })
      .where(eq(schema.searches.id, searchId))
      .run();
  } else {
    searchId = db
      .insert(schema.searches)
      .values({
        source: input.source,
        query: input.query,
        location: input.location ?? null,
        params: { language: input.language, region: input.region, pkd: input.pkd, registeredWithinDays: input.registeredWithinDays },
        nextPageToken: result.nextPageToken ?? null,
        resultCount: items.length,
        newCount,
      })
      .returning({ id: schema.searches.id })
      .get().id;
  }
  if (items.length) {
    db.insert(schema.searchResults)
      .values(items.map((i) => ({ searchId: searchId!, leadId: i.lead.id, wasNew: i.wasNew })))
      .run();
  }

  const hiddenCount = items.filter((i) => i.hidden).length;
  if (hiddenCount) warnings.push(`${hiddenCount} wyników jest już w procesowanych/odrzuconych – ukryto je.`);

  items.sort((a, b) => b.lead.score - a.lead.score);
  return { searchId, items, nextPageToken: result.nextPageToken ?? null, warnings };
}
