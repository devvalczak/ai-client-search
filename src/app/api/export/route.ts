import type { NextRequest } from "next/server";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { STATUS_LABELS } from "@/lib/labels";
import { listLeads } from "@/lib/queries";

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const leads = listLeads({
    status: p.get("status") ?? undefined,
    view: (p.get("view") as "processed" | "unprocessed" | "all") ?? undefined,
    q: p.get("q") ?? undefined,
    minScore: Number(p.get("minScore")) || undefined,
    limit: 10000,
  });
  const contacts = leads.length
    ? db.select().from(schema.contacts).where(inArray(schema.contacts.leadId, leads.map((l) => l.id))).all()
    : [];
  const byLead = new Map<number, typeof contacts>();
  for (const c of contacts) byLead.set(c.leadId, [...(byLead.get(c.leadId) ?? []), c]);

  const header = [
    "id", "nazwa", "ocena", "status", "kategoria", "miasto", "adres", "telefon", "email", "strona",
    "facebook", "instagram", "linkedin", "nip", "krs", "uslugi", "pitch", "kontakty", "zrodlo",
  ];
  const rows = leads.map((l) => [
    l.id, l.name, l.score, STATUS_LABELS[l.status], l.category, l.city, l.address, l.phone, l.email, l.website,
    l.socials.facebook, l.socials.instagram, l.socials.linkedin, l.nip, l.krs, (l.suggestedServices ?? []).join(", "),
    l.pitch,
    (byLead.get(l.id) ?? []).map((c) => [c.name, c.role, c.email, c.phone].filter(Boolean).join(" / ")).join(" | "),
    l.source,
  ]);
  // BOM + średnik – żeby Excel w polskich ustawieniach otworzył plik poprawnie
  const csv = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leady-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
