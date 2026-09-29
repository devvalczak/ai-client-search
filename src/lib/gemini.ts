import "server-only";
import { GoogleGenAI } from "@google/genai";
import { config } from "@/lib/config";
import { tracked } from "@/lib/http";
import type { SourceLink } from "@/lib/db/schema";
import { extractJson } from "@/lib/json";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!config.geminiApiKey) throw new Error("Brak GEMINI_API_KEY.");
  client ??= new GoogleGenAI({ apiKey: config.geminiApiKey });
  return client;
}

export type GeminiResult<T> = { data: T; sources: SourceLink[]; text: string };

export async function generateJson<T>(opts: {
  prompt: string;
  system?: string;
  /** Włącza grounding w wyszukiwarce Google – model podaje źródła */
  search?: boolean;
  operation: string;
  temperature?: number;
}): Promise<GeminiResult<T>> {
  const ai = getClient();
  const res = await tracked("gemini", opts.operation + (opts.search ? "+search" : ""), () =>
    ai.models.generateContent({
      model: config.geminiModel,
      contents: opts.prompt,
      config: {
        systemInstruction: opts.system,
        temperature: opts.temperature ?? 0.2,
        ...(opts.search ? { tools: [{ googleSearch: {} }] } : { responseMimeType: "application/json" }),
      },
    }),
  );
  const text = res.text ?? "";
  const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const seen = new Set<string>();
  const sources: SourceLink[] = [];
  for (const c of chunks) {
    const uri = c.web?.uri;
    if (uri && !seen.has(uri)) {
      seen.add(uri);
      sources.push({ uri, title: c.web?.title });
    }
  }
  return { data: extractJson<T>(text), sources, text };
}

export async function generateText(opts: { prompt: string; system?: string; operation: string }): Promise<string> {
  const ai = getClient();
  const res = await tracked("gemini", opts.operation, () =>
    ai.models.generateContent({
      model: config.geminiModel,
      contents: opts.prompt,
      config: { systemInstruction: opts.system, temperature: 0.7 },
    }),
  );
  return res.text ?? "";
}
