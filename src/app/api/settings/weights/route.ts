import { z } from "zod";
import { jsonError } from "@/lib/api";
import { getWeights, rescoreAll, saveWeights } from "@/lib/leads";

export async function GET() {
  return Response.json(getWeights());
}

export async function PUT(req: Request) {
  try {
    const body = z.record(z.string(), z.number().min(-100).max(100)).parse(await req.json());
    saveWeights(body);
    const rescored = rescoreAll();
    return Response.json({ weights: getWeights(), rescored });
  } catch (e) {
    return jsonError(e);
  }
}
