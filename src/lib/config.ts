import "server-only";

export const config = {
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  // Alias wskazujący najnowszy model Flash; można nadpisać konkretną wersją.
  geminiModel: process.env.GEMINI_MODEL || "gemini-flash-latest",
  googleApiKey: process.env.GOOGLE_API_KEY || "",
  pagespeedApiKey: process.env.PAGESPEED_API_KEY || process.env.GOOGLE_API_KEY || "",
  ceidgToken: process.env.CEIDG_API_TOKEN || "",
  ceidgBaseUrl: process.env.CEIDG_API_URL || "https://dane.biznes.gov.pl/api/ceidg/v3",
  regonApiKey: process.env.REGON_API_KEY || "",
  regonTest: process.env.REGON_TEST === "1",
  overpassUrl: process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter",
  nominatimUrl: process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org",
  contactEmail: process.env.CONTACT_EMAIL || "",
};

export function integrationsStatus() {
  return {
    gemini: !!config.geminiApiKey,
    places: !!config.googleApiKey,
    pagespeed: true, // działa bez klucza, ale z niskim limitem
    pagespeedKey: !!config.pagespeedApiKey,
    ceidg: !!config.ceidgToken,
    regon: !!config.regonApiKey,
    krs: true,
    osm: true,
  };
}

export const USER_AGENT = `ai-client-search/0.1 (lead research tool${config.contactEmail ? `; ${config.contactEmail}` : ""})`;
