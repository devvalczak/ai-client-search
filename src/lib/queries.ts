import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, like, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/db/schema";

export type LeadFilters = {
  status?: string;
  view?: "all" | "processed" | "unprocessed";
  q?: string;
  minScore?: number;
  source?: string;
  sort?: "score" | "recent" | "followup";
  searchId?: number;
  limit?: number;
};

export function listLeads(f: LeadFilters) {
  const l = schema.leads;
  const conds: SQL[] = [];
  if (f.status && (LEAD_STATUSES as readonly string[]).includes(f.status)) conds.push(eq(l.status, f.status as LeadStatus));
  if (f.view === "processed") conds.push(isNotNull(l.processedAt));
  if (f.view === "unprocessed") conds.push(and(isNull(l.processedAt), sql`${l.status} != 'rejected'`)!);
  if (f.q) {
    const q = `%${f.q}%`;
    conds.push(or(like(l.name, q), like(l.city, q), like(l.category, q), like(l.domain, q), like(l.nip, q))!);
  }
  if (f.minScore) conds.push(gte(l.score, f.minScore));
  if (f.source) conds.push(eq(l.source, f.source));
  if (f.searchId) {
    const ids = db
      .select({ id: schema.searchResults.leadId })
      .from(schema.searchResults)
      .where(eq(schema.searchResults.searchId, f.searchId));
    conds.push(inArray(l.id, ids));
  }
  const order =
    f.sort === "recent"
      ? [desc(l.updatedAt)]
      : f.sort === "followup"
        ? [sql`${l.followUpAt} IS NULL`, asc(l.followUpAt)]
        : [desc(l.score), desc(l.updatedAt)];
  return db
    .select()
    .from(l)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(...order)
    .limit(f.limit ?? 500)
    .all();
}

export function getLeadDetail(id: number) {
  const lead = db.select().from(schema.leads).where(eq(schema.leads.id, id)).get();
  if (!lead) return null;
  const contacts = db.select().from(schema.contacts).where(eq(schema.contacts.leadId, id)).all();
  const notes = db.select().from(schema.notes).where(eq(schema.notes.leadId, id)).orderBy(desc(schema.notes.createdAt)).all();
  const enrichment = db
    .select()
    .from(schema.enrichments)
    .where(eq(schema.enrichments.leadId, id))
    .orderBy(desc(schema.enrichments.createdAt))
    .limit(1)
    .get();
  return { lead, contacts, notes, enrichment };
}

export function statusCounts() {
  const rows = db
    .select({ status: schema.leads.status, n: sql<number>`count(*)` })
    .from(schema.leads)
    .groupBy(schema.leads.status)
    .all();
  const processed = db
    .select({ n: sql<number>`count(*)` })
    .from(schema.leads)
    .where(isNotNull(schema.leads.processedAt))
    .get()!.n;
  const total = rows.reduce((a, r) => a + r.n, 0);
  return { byStatus: Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>, processed, total };
}

export function dueFollowUps() {
  return db
    .select()
    .from(schema.leads)
    .where(and(isNotNull(schema.leads.followUpAt), sql`${schema.leads.followUpAt} <= ${Date.now() + 86400000}`))
    .orderBy(asc(schema.leads.followUpAt))
    .limit(20)
    .all();
}

export function listSearches(limit = 50) {
  return db.select().from(schema.searches).orderBy(desc(schema.searches.createdAt)).limit(limit).all();
}

export function getSearch(id: number) {
  return db.select().from(schema.searches).where(eq(schema.searches.id, id)).get();
}

export function usageSummary(days = 30) {
  const since = Date.now() - days * 86400000;
  return db
    .select({
      provider: schema.apiUsage.provider,
      operation: schema.apiUsage.operation,
      calls: sql<number>`count(*)`,
      failed: sql<number>`sum(case when ${schema.apiUsage.ok} then 0 else 1 end)`,
    })
    .from(schema.apiUsage)
    .where(gte(schema.apiUsage.createdAt, new Date(since)))
    .groupBy(schema.apiUsage.provider, schema.apiUsage.operation)
    .orderBy(schema.apiUsage.provider)
    .all();
}
