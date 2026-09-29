import { eq } from "drizzle-orm";
import { z } from "zod";
import { jsonError, parseId } from "@/lib/api";
import { db, schema } from "@/lib/db";
import { LEAD_STATUSES } from "@/lib/db/schema";
import { classifyWebsite, mergeSocials } from "@/lib/normalize";
import { updateLeadSignals } from "@/lib/leads";

const Patch = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  processed: z.boolean().optional(),
  followUpAt: z.string().nullable().optional(),
  assignedTo: z.string().max(100).nullable().optional(),
  name: z.string().trim().min(1).max(300).optional(),
  email: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  website: z.string().trim().max(500).nullable().optional(),
  category: z.string().trim().max(200).nullable().optional(),
});

export async function GET(_req: Request, ctx: RouteContext<"/api/leads/[id]">) {
  try {
    const id = parseId((await ctx.params).id);
    const lead = db.select().from(schema.leads).where(eq(schema.leads.id, id)).get();
    if (!lead) return jsonError("Nie znaleziono", 404);
    return Response.json(lead);
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/leads/[id]">) {
  try {
    const id = parseId((await ctx.params).id);
    const body = Patch.parse(await req.json());
    const lead = db.select().from(schema.leads).where(eq(schema.leads.id, id)).get();
    if (!lead) return jsonError("Nie znaleziono", 404);

    const set: Partial<typeof schema.leads.$inferInsert> = { updatedAt: new Date() };
    if (body.status) set.status = body.status;
    if (body.processed !== undefined) {
      set.processedAt = body.processed ? (lead.processedAt ?? new Date()) : null;
      if (body.processed && lead.status === "new" && !body.status) set.status = "to_contact";
    }
    if (body.followUpAt !== undefined) set.followUpAt = body.followUpAt ? new Date(body.followUpAt) : null;
    for (const k of ["assignedTo", "name", "email", "phone", "category"] as const) {
      if (body[k] !== undefined) (set as Record<string, unknown>)[k] = body[k] || null;
    }
    if (body.website !== undefined) {
      const c = classifyWebsite(body.website, lead.socials);
      set.website = c.website;
      set.domain = c.domain;
      set.socials = mergeSocials(lead.socials, c.socials);
      const updated = updateLeadSignals(
        lead,
        c.website
          ? { websiteState: "own", websiteCertain: true }
          : { websiteState: c.websiteIsProfileOnly ? "profile_only" : "none", websiteCertain: true },
        set,
      );
      return Response.json(updated);
    }
    const updated = db.update(schema.leads).set(set).where(eq(schema.leads.id, id)).returning().get();
    return Response.json(updated);
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/leads/[id]">) {
  try {
    const id = parseId((await ctx.params).id);
    db.delete(schema.leads).where(eq(schema.leads.id, id)).run();
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
