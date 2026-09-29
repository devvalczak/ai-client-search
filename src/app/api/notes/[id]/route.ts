import { eq } from "drizzle-orm";
import { jsonError, parseId } from "@/lib/api";
import { db, schema } from "@/lib/db";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/notes/[id]">) {
  try {
    const id = parseId((await ctx.params).id);
    db.delete(schema.notes).where(eq(schema.notes.id, id)).run();
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
