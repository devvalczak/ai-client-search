import { z } from "zod";
import { jsonError, parseId } from "@/lib/api";
import { db, schema } from "@/lib/db";

const Body = z
  .object({
    name: z.string().trim().max(200).optional(),
    role: z.string().trim().max(200).optional(),
    email: z.string().trim().max(200).optional(),
    phone: z.string().trim().max(50).optional(),
    linkedin: z.string().trim().max(500).optional(),
  })
  .refine((b) => b.name || b.email || b.phone || b.linkedin, "Podaj przynajmniej jedno pole");

export async function POST(req: Request, ctx: RouteContext<"/api/leads/[id]/contacts">) {
  try {
    const leadId = parseId((await ctx.params).id);
    const b = Body.parse(await req.json());
    const contact = db
      .insert(schema.contacts)
      .values({
        leadId,
        name: b.name || null,
        role: b.role || null,
        email: b.email || null,
        phone: b.phone || null,
        linkedin: b.linkedin || null,
        source: "manual",
      })
      .returning()
      .get();
    return Response.json(contact);
  } catch (e) {
    return jsonError(e);
  }
}
