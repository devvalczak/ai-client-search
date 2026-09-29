/**
 * Wyciąga JSON z odpowiedzi modelu. Przy włączonym groundingu (Google Search) nie zawsze
 * da się wymusić czysty JSON, więc szukamy pierwszego bloku {...} / [...] w tekście.
 */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const starts = [candidate.indexOf("{"), candidate.indexOf("[")].filter((i) => i >= 0);
  if (!starts.length) throw new Error("Model nie zwrócił JSON-a.");
  const start = Math.min(...starts);
  const open = candidate[start];
  const close = open === "{" ? "}" : "]";
  const end = candidate.lastIndexOf(close);
  if (end <= start) throw new Error("Niekompletny JSON w odpowiedzi modelu.");
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}
