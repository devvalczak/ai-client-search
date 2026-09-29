import { z } from "zod";
import { jsonError } from "@/lib/api";
import { runSearch } from "@/lib/search";

export const maxDuration = 120;

const Body = z.object({
  source: z.enum(["places", "osm", "gemini", "ceidg"]),
  query: z.string().trim().max(200).default(""),
  location: z.string().trim().max(200).optional(),
  language: z.enum(["pl", "en"]).optional(),
  region: z.string().trim().length(2).optional().or(z.literal("").transform(() => undefined)),
  pageToken: z.string().nullish(),
  limit: z.number().int().min(1).max(200).optional(),
  registeredWithinDays: z.number().int().min(1).max(3650).optional(),
  pkd: z.array(z.string().trim().min(2)).optional(),
  checkSites: z.boolean().default(true),
  searchId: z.number().int().positive().optional(),
});

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    if (!body.query && body.source !== "ceidg") throw new Error("Podaj czego szukamy (branża, słowa kluczowe).");
    const { checkSites, searchId, ...input } = body;
    return Response.json(await runSearch(input, { checkSites, searchId }));
  } catch (e) {
    return jsonError(e);
  }
}
