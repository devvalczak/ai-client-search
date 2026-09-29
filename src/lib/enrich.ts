import "server-only";
import { eq } from "drizzle-orm";
import { config } from "@/lib/config";
import { db, schema } from "@/lib/db";
import type { EnrichmentStep, Lead, NewLead, SourceLink } from "@/lib/db/schema";
import { generateJson } from "@/lib/gemini";
import { SERVICES } from "@/lib/labels";
import { errorMessage } from "@/lib/http";
import { signalsFromSite, updateLeadSignals } from "@/lib/leads";
import {
  classifyWebsite,
  hasAnySocial,
  hostOf,
  mergeSocials,
  normalizeKrs,
  normalizeNip,
  normalizePhone,
  type Socials,
} from "@/lib/normalize";
import { krsLookup, type KrsData } from "@/lib/registries/krs";
import { regonByNip, type RegonData } from "@/lib/registries/regon";
import { ceidgByNip, type CeidgFirma } from "@/lib/sources/ceidg";
import type { Signals } from "@/lib/scoring";
import { MAX_AI_ADJUSTMENT } from "@/lib/scoring";
import { analyzeWebsite, pageSpeed, type PageSpeed, type SiteAnalysis } from "@/lib/website";


type AiContact = { name?: string; role?: string; email?: string; phone?: string; linkedin?: string; source?: string };

export type AiEnrichment = {
  summary?: string;
  category?: string;
  services?: string[];
  website?: string | null;
  websiteAssessment?: string;
  socials?: Socials & { other?: string[] };
  address?: { street?: string; postalCode?: string; city?: string; country?: string } | null;
  nip?: string | null;
  krs?: string | null;
  generalEmail?: string | null;
  generalPhone?: string | null;
  contacts?: AiContact[];
  sellsOnline?: { marketplaces?: string[]; viaSocial?: boolean; ownShop?: boolean };
  sizeEstimate?: string;
  needsAssessment?: {
    scoreAdjustment?: number;
    reasons?: string[];
    suggestedServices?: string[];
    pitch?: string;
  };
  confidence?: "low" | "medium" | "high";
};

const SYSTEM = `Jesteś analitykiem B2B w agencji tworzącej strony, sklepy internetowe, dedykowane aplikacje oraz SEO i kampanie.
Twoje zadanie: zebrać rzetelne informacje o firmie i ocenić, czy i czego potrzebuje od agencji.
Zasady bezwzględne:
- Korzystaj z wyszukiwarki. Każdą daną kontaktową podawaj tylko jeśli znalazłeś ją w źródle – wpisz URL źródła w polu "source".
- NIGDY nie zgaduj e-maili (np. imie@domena), telefonów, NIP, adresów ani nazwisk. Brak danych = null.
- Preferuj osoby decyzyjne: właściciel, prezes/członek zarządu, dyrektor marketingu, manager.
- Ocena potrzeb ma być konkretna i oparta o fakty (brak strony, stara strona, sprzedaż tylko przez IG, brak sklepu itp.).`;

function buildPrompt(lead: Lead, facts: Record<string, unknown>) {
  return `Firma do analizy:
${JSON.stringify(
  {
    nazwa: lead.name,
    kategoria: lead.category,
    adres: lead.address,
    miasto: lead.city,
    kraj: lead.country,
    strona: lead.website,
    telefon: lead.phone,
    social: lead.socials,
    nip: lead.nip,
    ...facts,
  },
  null,
  1,
)}

Znajdź i zweryfikuj informacje, a następnie zwróć WYŁĄCZNIE JSON o strukturze:
{
 "summary": "2-3 zdania czym firma się zajmuje",
 "category": "branża",
 "services": ["główne usługi/produkty"],
 "website": "URL własnej strony lub null",
 "websiteAssessment": "krótka ocena strony (lub jej braku)",
 "socials": {"facebook":null,"instagram":null,"linkedin":null,"tiktok":null,"youtube":null},
 "address": {"street":null,"postalCode":null,"city":null,"country":null},
 "nip": null, "krs": null,
 "generalEmail": null, "generalPhone": null,
 "contacts": [{"name":"","role":"","email":null,"phone":null,"linkedin":null,"source":"URL"}],
 "sellsOnline": {"marketplaces":["Allegro"],"viaSocial":false,"ownShop":false},
 "sizeEstimate": "np. 1 osoba / 2-9 / 10-49 / 50+",
 "needsAssessment": {
   "scoreAdjustment": 0,
   "reasons": ["konkretne powody"],
   "suggestedServices": ["jeden lub więcej z: ${Object.keys(SERVICES).join(", ")}"],
   "pitch": "1-2 zdania: co konkretnie im zaproponować i dlaczego"
 },
 "confidence": "low|medium|high"
}
scoreAdjustment: liczba od -${MAX_AI_ADJUSTMENT} do ${MAX_AI_ADJUSTMENT} – korekta automatycznej oceny ${lead.score}% (dodatnia gdy potrzeba jest większa niż wynika z sygnałów, ujemna gdy np. to duża sieć z własnym działem IT, franczyza z centralną stroną, firma nieaktywna).`;
}

export async function enrichLead(leadId: number): Promise<{ lead: Lead; steps: EnrichmentStep[] }> {
  let lead = db.select().from(schema.leads).where(eq(schema.leads.id, leadId)).get();
  if (!lead) throw new Error("Nie znaleziono leada.");

  const steps: EnrichmentStep[] = [];
  const data: Record<string, unknown> = {};
  let sources: SourceLink[] = [];
  const signals: Partial<Signals> = {};
  const patch: Partial<NewLead> = {};
  const newContacts: { name?: string; role?: string; email?: string; phone?: string; linkedin?: string; source: string; sourceUrl?: string }[] = [];
  let socials: Socials = lead.socials;
  const isPL = !lead.country || lead.country.toUpperCase() === "PL";

  const step = async <T>(name: string, fn: () => Promise<T>, skip?: string): Promise<T | undefined> => {
    if (skip) {
      steps.push({ step: name, ok: false, message: skip });
      return undefined;
    }
    try {
      const r = await fn();
      steps.push({ step: name, ok: true });
      return r;
    } catch (e) {
      steps.push({ step: name, ok: false, message: errorMessage(e) });
      return undefined;
    }
  };

  const analyzeSite = async (url: string) => {
    const [site, ps] = await Promise.all([
      step("Analiza strony www", () => analyzeWebsite(url, { deep: true })),
      step("PageSpeed Insights", () => pageSpeed(url)),
    ]);
    if (site) {
      data.site = site;
      Object.assign(signals, signalsFromSite(site));
      socials = mergeSocials(socials, site.socials);
      if (site.emails[0]) patch.email ??= site.emails[0];
      if (site.phones[0]) patch.phone ??= normalizePhone(site.phones[0]);
      for (const e of site.emails) newContacts.push({ email: e, source: "website", sourceUrl: site.finalUrl });
    }
    if (ps) {
      data.pagespeed = ps;
      signals.pagespeedPerformance = ps.performance;
      signals.pagespeedSeo = ps.seo;
    }
    return { site, ps };
  };

  // 1. Strona www (darmowe, pewne dane)
  let site: SiteAnalysis | undefined;
  if (lead.website) ({ site } = await analyzeSite(lead.website));

  let nip = lead.nip ?? site?.nips[0] ?? null;
  let krs = lead.krs ?? normalizeKrs(site?.krs);

  // 2. Rejestry po NIP
  const registries = async () => {
    if (!nip || !isPL) return;
    const [regon, ceidg] = await Promise.all([
      step("GUS REGON", () => regonByNip(nip!), config.regonApiKey || config.regonTest ? undefined : "pominięto – brak REGON_API_KEY"),
      step("CEIDG", () => ceidgByNip(nip!), config.ceidgToken ? undefined : "pominięto – brak CEIDG_API_TOKEN"),
    ]);
    if (regon) {
      data.regon = regon satisfies RegonData;
      patch.regon ??= regon.regon;
      patch.address ??= regon.address;
      if (regon.endedAt) signals.businessClosed = true;
    }
    if (ceidg) {
      data.ceidg = ceidg satisfies CeidgFirma;
      const owner = [ceidg.wlasciciel?.imie, ceidg.wlasciciel?.nazwisko].filter(Boolean).join(" ");
      if (owner) newContacts.push({ name: owner, role: "Właściciel (CEIDG)", email: ceidg.email, phone: ceidg.telefon, source: "ceidg" });
      if (ceidg.dataRozpoczecia) signals.foundedAt = ceidg.dataRozpoczecia;
      patch.ceidgId ??= ceidg.id;
    }
  };
  await registries();

  // 3. Gemini + Google Search
  let ai: AiEnrichment | undefined;
  if (config.geminiApiKey) {
    const res = await step("Gemini + Google Search", () =>
      generateJson<AiEnrichment>({
        operation: "enrich",
        search: true,
        system: SYSTEM,
        prompt: buildPrompt(lead!, {
          ...(site?.reachable
            ? {
                analiza_strony: {
                  tytul: site.title,
                  opis: site.metaDescription,
                  emaile: site.emails,
                  telefony: site.phones,
                  kreator: site.builder,
                  copyright: site.copyrightYear,
                },
              }
            : {}),
          ...(data.ceidg ? { ceidg: data.ceidg } : {}),
          ...(data.regon ? { regon: data.regon } : {}),
        }),
      }),
    );
    if (res) {
      ai = res.data;
      sources = res.sources;
      data.gemini = ai;
    }
  } else {
    steps.push({ step: "Gemini + Google Search", ok: false, message: "pominięto – brak GEMINI_API_KEY" });
  }

  if (ai) {
    patch.description = ai.summary ?? undefined;
    if (!lead.category && ai.category) patch.category = ai.category;
    const aiSite = classifyWebsite(ai.website, ai.socials ?? {});
    socials = mergeSocials(socials, aiSite.socials);
    if (!lead.website && aiSite.website) {
      patch.website = aiSite.website;
      patch.domain = hostOf(aiSite.website);
      ({ site } = await analyzeSite(aiSite.website));
    } else if (!lead.website && !aiSite.website) {
      signals.websiteState = aiSite.websiteIsProfileOnly || lead.signals.websiteState === "profile_only" ? "profile_only" : "none";
      signals.websiteCertain = true;
    }
    if (ai.address?.street && !lead.address)
      patch.address = [ai.address.street, [ai.address.postalCode, ai.address.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    patch.email ??= ai.generalEmail ?? undefined;
    patch.phone ??= normalizePhone(ai.generalPhone) ?? undefined;
    for (const c of ai.contacts ?? []) {
      if (!c.name && !c.email && !c.phone) continue;
      newContacts.push({ ...c, source: "gemini", sourceUrl: c.source });
    }
    const sells = ai.sellsOnline;
    if (sells && !sells.ownShop && ((sells.marketplaces?.length ?? 0) > 0 || sells.viaSocial)) signals.sellsOnMarketplaces = true;
    const na = ai.needsAssessment;
    if (na) {
      signals.aiAdjustment = Number(na.scoreAdjustment) || 0;
      patch.aiAdjustment = signals.aiAdjustment;
      patch.aiReasons = na.reasons ?? [];
      patch.suggestedServices = (na.suggestedServices ?? []).filter((s) => s in SERVICES);
      patch.pitch = na.pitch ?? null;
    }
    const aiNip = normalizeNip(ai.nip);
    if (!nip && aiNip) {
      nip = aiNip;
      await registries();
    }
    krs ??= normalizeKrs(ai.krs);
  }

  // 4. KRS – zarząd (nazwiska w otwartym API są maskowane)
  if (krs && isPL) {
    const k = await step("KRS", () => krsLookup(krs!));
    if (k) {
      data.krs = k satisfies KrsData;
      nip ??= normalizeNip(k.nip);
      patch.regon ??= k.regon;
      if (k.registeredAt && !signals.foundedAt) signals.foundedAt = k.registeredAt.split(".").reverse().join("-");
      for (const r of k.representatives) newContacts.push({ name: r.name, role: r.role ?? "Zarząd (KRS)", source: "krs" });
    }
  }

  signals.hasSocials = hasAnySocial(socials);
  patch.nip = lead.nip ?? nip;
  patch.krs = lead.krs ?? krs;
  patch.socials = socials;
  patch.enrichedAt = new Date();
  // nie nadpisujemy danych, które użytkownik/źródło już miało
  for (const k of ["email", "phone", "address", "regon"] as const) if (lead[k]) delete patch[k];
  const cleanPatch = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<NewLead>;

  lead = updateLeadSignals(lead, signals, cleanPatch);
  saveContacts(lead.id, newContacts);
  db.insert(schema.enrichments).values({ leadId: lead.id, steps, data, sources }).run();
  return { lead, steps };
}

function saveContacts(
  leadId: number,
  list: { name?: string; role?: string; email?: string; phone?: string; linkedin?: string; source: string; sourceUrl?: string }[],
) {
  const existing = db.select().from(schema.contacts).where(eq(schema.contacts.leadId, leadId)).all();
  const key = (c: { name?: string | null; email?: string | null }) =>
    (c.email ?? "").toLowerCase() || (c.name ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  const seen = new Set(existing.map(key));
  for (const c of list) {
    const k = key(c);
    if (!k || seen.has(k)) continue;
    // e-mail bez nazwiska dublujący się z osobą, która ma ten e-mail
    if (!c.name && c.email && existing.some((e) => e.email?.toLowerCase() === c.email!.toLowerCase())) continue;
    seen.add(k);
    db.insert(schema.contacts)
      .values({
        leadId,
        name: c.name || null,
        role: c.role || null,
        email: c.email?.toLowerCase() || null,
        phone: c.phone || null,
        linkedin: c.linkedin || null,
        source: c.source,
        sourceUrl: c.sourceUrl?.startsWith("http") ? c.sourceUrl : null,
      })
      .run();
  }
}

export type { PageSpeed };
export { SERVICES };
