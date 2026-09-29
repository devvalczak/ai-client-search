import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { ScoreItem, Signals } from "@/lib/scoring";
import type { Socials } from "@/lib/normalize";
import type { LeadStatus } from "@/lib/statuses";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

export { LEAD_STATUSES, type LeadStatus } from "@/lib/statuses";

export const leads = sqliteTable(
  "leads",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    category: text("category"),
    description: text("description"),
    address: text("address"),
    city: text("city"),
    country: text("country"),
    lat: real("lat"),
    lng: real("lng"),
    phone: text("phone"),
    email: text("email"),
    website: text("website"),
    domain: text("domain"),
    socials: text("socials", { mode: "json" }).$type<Socials>().notNull().default({}),
    rating: real("rating"),
    reviewCount: integer("review_count"),
    businessStatus: text("business_status"),
    foundedAt: text("founded_at"),

    // Identyfikatory do deduplikacji
    googlePlaceId: text("google_place_id"),
    osmId: text("osm_id"),
    ceidgId: text("ceidg_id"),
    nip: text("nip"),
    regon: text("regon"),
    krs: text("krs"),

    source: text("source").notNull(),

    // Ocena
    signals: text("signals", { mode: "json" }).$type<Signals>().notNull().default({}),
    score: integer("score").notNull().default(0),
    scoreBreakdown: text("score_breakdown", { mode: "json" }).$type<ScoreItem[]>().notNull().default([]),
    aiAdjustment: integer("ai_adjustment"),
    aiReasons: text("ai_reasons", { mode: "json" }).$type<string[]>(),
    suggestedServices: text("suggested_services", { mode: "json" }).$type<string[]>(),
    pitch: text("pitch"),

    // CRM
    status: text("status").$type<LeadStatus>().notNull().default("new"),
    processedAt: integer("processed_at", { mode: "timestamp_ms" }),
    followUpAt: integer("follow_up_at", { mode: "timestamp_ms" }),
    assignedTo: text("assigned_to"),

    enrichedAt: integer("enriched_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index("leads_place_idx").on(t.googlePlaceId),
    index("leads_osm_idx").on(t.osmId),
    index("leads_ceidg_idx").on(t.ceidgId),
    index("leads_nip_idx").on(t.nip),
    index("leads_domain_idx").on(t.domain),
    index("leads_name_city_idx").on(t.normalizedName, t.city),
    index("leads_status_idx").on(t.status),
    index("leads_score_idx").on(t.score),
  ],
);

export const contacts = sqliteTable(
  "contacts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    leadId: integer("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    name: text("name"),
    role: text("role"),
    email: text("email"),
    phone: text("phone"),
    linkedin: text("linkedin"),
    source: text("source").notNull(),
    sourceUrl: text("source_url"),
    createdAt: createdAt(),
  },
  (t) => [index("contacts_lead_idx").on(t.leadId)],
);

export const notes = sqliteTable(
  "notes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    leadId: integer("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    author: text("author"),
    createdAt: createdAt(),
  },
  (t) => [index("notes_lead_idx").on(t.leadId)],
);

export type EnrichmentStep = { step: string; ok: boolean; message?: string };
export type SourceLink = { title?: string; uri: string };

export const enrichments = sqliteTable(
  "enrichments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    leadId: integer("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    steps: text("steps", { mode: "json" }).$type<EnrichmentStep[]>().notNull(),
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    sources: text("sources", { mode: "json" }).$type<SourceLink[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index("enrichments_lead_idx").on(t.leadId)],
);

export const searches = sqliteTable("searches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(),
  query: text("query").notNull(),
  location: text("location"),
  params: text("params", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
  nextPageToken: text("next_page_token"),
  resultCount: integer("result_count").notNull().default(0),
  newCount: integer("new_count").notNull().default(0),
  createdAt: createdAt(),
});

export const searchResults = sqliteTable(
  "search_results",
  {
    searchId: integer("search_id")
      .notNull()
      .references(() => searches.id, { onDelete: "cascade" }),
    leadId: integer("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    wasNew: integer("was_new", { mode: "boolean" }).notNull(),
  },
  (t) => [index("search_results_search_idx").on(t.searchId)],
);

export const apiUsage = sqliteTable(
  "api_usage",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    provider: text("provider").notNull(),
    operation: text("operation").notNull(),
    ok: integer("ok", { mode: "boolean" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("api_usage_provider_idx").on(t.provider, t.createdAt)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type Enrichment = typeof enrichments.$inferSelect;
export type Search = typeof searches.$inferSelect;
