import "server-only";
import { z } from "zod";
import { errorMessage } from "@/lib/http";

export function jsonError(e: unknown, status = 400) {
  if (e instanceof z.ZodError) return Response.json({ error: "Nieprawidłowe dane", issues: e.issues }, { status: 400 });
  return Response.json({ error: errorMessage(e) }, { status });
}

export function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Nieprawidłowe id");
  return id;
}
