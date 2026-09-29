import { z } from "zod";
import { jsonError, parseId } from "@/lib/api";
import { db, schema } from "@/lib/db";

const Body = z.object({ body: z.string().trim().min(1).max(10000), author: z.string().max(100).optional() });

export async function POST(req: Request, ctx: RouteContext<"/api/leads/[id]/notes">) {
  try {
    const leadId = parseId((await ctx.params).id);
    const { body, author } = Body.parse(await req.json());
    const note = db.insert(schema.notes).values({ leadId, body, author }).returning().get();
    return Response.json(note);
  } catch (e) {
    return jsonError(e);
  }
}
