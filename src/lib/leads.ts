import "server-only";
import { and, eq, isNull, or, type SQL } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Lead, NewLead } from "@/lib/db/schema";
import {
  classifyWebsite,
  hasAnySocial,
  mergeSocials,
  normalizeCity,
  normalizeKrs,
  normalizeName,
  normalizeNip,
  normalizePhone,
  type Socials,
} from "@/lib/normalize";
import { computeScore, DEFAULT_WEIGHTS, type Signals, type Weights } from "@/lib/scoring";
import type { Candidate } from "@/lib/sources/types";
import type { SiteAnalysis } from "@/lib/website";

export function getWeights(): Weights {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, "weights")).get();
  return { ...DEFAULT_WEIGHTS, ...((row?.value as Partial<Weights>) ?? {}) };
}

export function saveWeights(w: Partial<Weights>) {
  const clean: { -readonly [K in keyof Weights]?: number } = {};
  for (const k of Object.keys(DEFAULT_WEIGHTS) as (keyof Weights)[]) {
    const v = Number(w[k]);
    if (Number.isFinite(v)) clean[k] = Math.round(v);
  }
  db.insert(schema.settings)
    .values({ key: "weights", value: clean })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: clean } })
    .run();
}

/** Szuka istniejącego leada – od najpewniejszego identyfikatora do dopasowania po nazwie+mieście. */
export function findExisting(c: {
  nip?: string | null;
  googlePlaceId?: string | null;
  osmId?: string | null;
  ceidgId?: string | null;
  domain?: string | null;
  phone?: string | null;
  normalizedName: string;
  city?: string | null;
}): Lead | undefined {
  const l = schema.leads;
  const conds: SQL[] = [];
  if (c.nip) conds.push(eq(l.nip, c.nip));
  if (c.googlePlaceId) conds.push(eq(l.googlePlaceId, c.googlePlaceId));
  if (c.osmId) conds.push(eq(l.osmId, c.osmId));
  if (c.ceidgId) conds.push(eq(l.ceidgId, c.ceidgId));
  if (c.domain) conds.push(eq(l.domain, c.domain));
  if (c.phone) conds.push(eq(l.phone, c.phone));
  if (conds.length) {
    const hit = db.select().from(l).where(or(...conds)).get();
    if (hit) return hit;
  }
  if (c.normalizedName) {
    return db
      .select()
      .from(l)
      .where(and(eq(l.normalizedName, c.normalizedName), c.city ? eq(l.city, c.city) : isNull(l.city)))
      .get();
  }
  return undefined;
}

export function signalsFromSite(site: SiteAnalysis): Partial<Signals> {
  if (!site.reachable) return { websiteState: "unreachable", websiteCertain: true };
  return {
    websiteState: "own",
    websiteCertain: true,
    https: site.https,
    mobileFriendly: site.mobileFriendly,
    copyrightYear: site.copyrightYear,
    builder: site.builder,
    ecommercePlatform: site.ecommercePlatform,
    hasAnalytics: site.hasAnalytics,
    hasMetaDescription: !!site.metaDescription,
  };
}

function pickDefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as Partial<T>;
}

/** Wylicza stan "strony" na podstawie scalonych danych. */
function websiteSignals(
  website: string | null,
  socials: Socials,
  prev: Signals,
  profileOnlyNow: boolean,
  certainNow: boolean | undefined,
): Partial<Signals> {
  if (website) {
    if (prev.websiteState === "own" || prev.websiteState === "unreachable") return {};
    return { websiteState: "own", websiteCertain: true };
  }
  const profileOnly = profileOnlyNow || prev.websiteState === "profile_only";
  return {
    websiteState: profileOnly ? "profile_only" : "none",
    websiteCertain: prev.websiteCertain === true || certainNow === true,
    hasSocials: hasAnySocial(socials),
  };
}

export function applyScore(signals: Signals, weights = getWeights()) {
  const { score, breakdown } = computeScore(signals, weights);
  return { score, scoreBreakdown: breakdown };
}

export type UpsertResult = { lead: Lead; wasNew: boolean; hidden: boolean };

export function isHidden(lead: Lead) {
  return lead.processedAt != null || lead.status === "rejected";
}

export function upsertCandidate(c: Candidate, site?: SiteAnalysis, weights = getWeights()): UpsertResult {
  const classified = classifyWebsite(c.website, c.socials ?? {});
  const normalized = {
    nip: normalizeNip(c.nip),
    krs: normalizeKrs(c.krs),
    phone: normalizePhone(c.phone),
    city: normalizeCity(c.city),
    normalizedName: normalizeName(c.name),
  };
  const existing = findExisting({ ...c, ...normalized, domain: classified.domain });

  const prevSignals: Signals = existing?.signals ?? {};
  const socials = mergeSocials(existing?.socials ?? {}, classified.socials);
  const website = existing?.website ?? classified.website;

  const signals: Signals = {
    ...prevSignals,
    ...websiteSignals(website, socials, prevSignals, classified.websiteIsProfileOnly, c.websiteCertain),
    ...(site ? pickDefined(signalsFromSite(site)) : {}),
    ...pickDefined({
      reviewCount: c.reviewCount ?? undefined,
      rating: c.rating ?? undefined,
      businessClosed: c.businessStatus === "CLOSED_PERMANENTLY" ? true : undefined,
      foundedAt: c.foundedAt ?? undefined,
    }),
  };
  const fields: Partial<NewLead> = {
    name: existing?.name ?? c.name,
    normalizedName: existing?.normalizedName ?? normalized.normalizedName,
    category: existing?.category ?? c.category ?? null,
    description: existing?.description ?? c.description ?? c.aiReason ?? null,
    address: existing?.address ?? c.address ?? null,
    city: existing?.city ?? normalized.city,
    country: existing?.country ?? c.country ?? null,
    lat: existing?.lat ?? c.lat ?? null,
    lng: existing?.lng ?? c.lng ?? null,
    phone: existing?.phone ?? normalized.phone,
    email: existing?.email ?? c.email ?? null,
    website,
    domain: existing?.domain ?? classified.domain,
    socials,
    rating: c.rating ?? existing?.rating ?? null,
    reviewCount: c.reviewCount ?? existing?.reviewCount ?? null,
    businessStatus: c.businessStatus ?? existing?.businessStatus ?? null,
    foundedAt: existing?.foundedAt ?? c.foundedAt ?? null,
    googlePlaceId: existing?.googlePlaceId ?? c.googlePlaceId ?? null,
    osmId: existing?.osmId ?? c.osmId ?? null,
    ceidgId: existing?.ceidgId ?? c.ceidgId ?? null,
    nip: existing?.nip ?? normalized.nip,
    regon: existing?.regon ?? c.regon ?? null,
    krs: existing?.krs ?? normalized.krs,
    signals,
    ...applyScore(signals, weights),
    updatedAt: new Date(),
  };

  if (existing) {
    const lead = db.update(schema.leads).set(fields).where(eq(schema.leads.id, existing.id)).returning().get();
    return { lead, wasNew: false, hidden: isHidden(lead) };
  }
  const lead = db
    .insert(schema.leads)
    .values({ ...(fields as NewLead), source: c.source })
    .returning()
    .get();
  if (c.ownerName) {
    db.insert(schema.contacts)
      .values({ leadId: lead.id, name: c.ownerName, role: "Właściciel (CEIDG)", source: "ceidg" })
      .run();
  }
  return { lead, wasNew: true, hidden: false };
}

export function updateLeadSignals(lead: Lead, patch: Partial<Signals>, extra: Partial<NewLead> = {}): Lead {
  const signals = { ...lead.signals, ...pickDefined(patch) };
  return db
    .update(schema.leads)
    .set({ ...extra, signals, ...applyScore(signals), updatedAt: new Date() })
    .where(eq(schema.leads.id, lead.id))
    .returning()
    .get();
}

export function rescoreAll() {
  const weights = getWeights();
  const all = db.select({ id: schema.leads.id, signals: schema.leads.signals }).from(schema.leads).all();
  db.transaction((tx) => {
    for (const l of all) {
      tx.update(schema.leads).set(applyScore(l.signals, weights)).where(eq(schema.leads.id, l.id)).run();
    }
  });
  return all.length;
}
