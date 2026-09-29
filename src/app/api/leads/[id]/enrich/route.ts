import { jsonError, parseId } from "@/lib/api";
import { enrichLead } from "@/lib/enrich";

export const maxDuration = 180;

export async function POST(_req: Request, ctx: RouteContext<"/api/leads/[id]/enrich">) {
  try {
    const id = parseId((await ctx.params).id);
    return Response.json(await enrichLead(id));
  } catch (e) {
    return jsonError(e, 500);
  }
}
