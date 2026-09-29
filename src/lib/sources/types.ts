import type { Socials } from "@/lib/normalize";

export type SourceId = "places" | "osm" | "gemini" | "ceidg";

/** Znormalizowany wynik z dowolnego źródła, zanim trafi do bazy. */
export type Candidate = {
  source: SourceId;
  name: string;
  category?: string | null;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
  phone?: string | null;
  email?: string | null;
  /** Surowa "strona" ze źródła – może być też FB/IG/Booksy, klasyfikujemy później */
  website?: string | null;
  /** Czy brak strony jest pewny (Places) czy tylko brak danych (OSM) */
  websiteCertain?: boolean;
  socials?: Socials;
  rating?: number | null;
  reviewCount?: number | null;
  businessStatus?: string | null;
  foundedAt?: string | null;
  googlePlaceId?: string | null;
  osmId?: string | null;
  ceidgId?: string | null;
  nip?: string | null;
  regon?: string | null;
  krs?: string | null;
  ownerName?: string | null;
  /** Uzasadnienie z AI (tryb wyszukiwania Gemini) */
  aiReason?: string | null;
};

export type SourceResult = {
  candidates: Candidate[];
  nextPageToken?: string | null;
  warnings?: string[];
};

export type SearchInput = {
  source: SourceId;
  query: string;
  location?: string;
  /** "pl" | "en" – język wyników */
  language?: string;
  /** Kod kraju ISO-3166 alfa-2 (np. PL, DE) – zawęża Places */
  region?: string;
  pageToken?: string | null;
  limit?: number;
  /** CEIDG: firmy zarejestrowane w ciągu ostatnich N dni */
  registeredWithinDays?: number;
  /** CEIDG: kody PKD, np. 96.02.Z */
  pkd?: string[];
};
