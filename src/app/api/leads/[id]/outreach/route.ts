import { z } from "zod";
import { jsonError, parseId } from "@/lib/api";
import { generateOutreach } from "@/lib/outreach";

const Body = z.object({
  channel: z.enum(["email", "linkedin", "phone"]),
  agencyName: z.string().max(100).optional(),
  language: z.enum(["pl", "en"]).optional(),
  contactName: z.string().max(200).optional(),
});

export async function POST(req: Request, ctx: RouteContext<"/api/leads/[id]/outreach">) {
  try {
    const id = parseId((await ctx.params).id);
    const text = await generateOutreach(id, Body.parse(await req.json()));
    return Response.json({ text });
  } catch (e) {
    return jsonError(e, 500);
  }
}
