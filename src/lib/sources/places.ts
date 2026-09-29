import "server-only";
import { config } from "@/lib/config";
import { fetchJson, tracked } from "@/lib/http";
import type { Candidate, SearchInput, SourceResult } from "./types";

/**
 * Google Places API (New) – Text Search.
 * https://developers.google.com/maps/documentation/places/web-service/text-search
 * Uwaga: pola websiteUri/telefon/opinie należą do droższych SKU – każda strona wyników jest płatna
 * (w ramach miesięcznego darmowego limitu Google Maps Platform).
 */
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.location",
  "places.primaryTypeDisplayName",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.googleMapsUri",
  "nextPageToken",
].join(",");

type Place = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  addressComponents?: { longText: string; shortText: string; types: string[] }[];
  location?: { latitude: number; longitude: number };
  primaryTypeDisplayName?: { text: string };
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
};

export async function searchPlaces(input: SearchInput): Promise<SourceResult> {
  if (!config.googleApiKey) throw new Error("Brak GOOGLE_API_KEY – ustaw klucz z włączonym Places API (New).");
  const textQuery = input.location ? `${input.query} ${input.location}` : input.query;
  const body: Record<string, unknown> = {
    textQuery,
    languageCode: input.language || "pl",
    pageSize: Math.min(input.limit ?? 20, 20),
  };
  if (input.region) body.regionCode = input.region.toUpperCase();
  if (input.pageToken) body.pageToken = input.pageToken;

  const data = await tracked("google_places", "searchText", () =>
    fetchJson<{ places?: Place[]; nextPageToken?: string }>("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": config.googleApiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
    }),
  );

  const candidates: Candidate[] = (data.places ?? []).map((p) => {
    const comp = (type: string) => p.addressComponents?.find((c) => c.types.includes(type));
    return {
      source: "places",
      name: p.displayName?.text ?? "(bez nazwy)",
      category: p.primaryTypeDisplayName?.text ?? null,
      address: p.formattedAddress ?? null,
      city: comp("locality")?.longText ?? comp("postal_town")?.longText ?? null,
      country: comp("country")?.shortText ?? null,
      lat: p.location?.latitude ?? null,
      lng: p.location?.longitude ?? null,
      phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null,
      website: p.websiteUri ?? null,
      websiteCertain: true,
      rating: p.rating ?? null,
      reviewCount: p.userRatingCount ?? null,
      businessStatus: p.businessStatus ?? null,
      googlePlaceId: p.id,
    };
  });

  return { candidates, nextPageToken: data.nextPageToken ?? null };
}
