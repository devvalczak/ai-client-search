"use client";

import Link from "next/link";
import { useState } from "react";
import { api, type LeadJson } from "@/lib/client-types";
import { SOURCE_LABELS } from "@/lib/labels";
import { ScoreBadge, SignalChips, StatusBadge } from "@/components/ui";

type Item = { lead: LeadJson; wasNew: boolean; hidden: boolean; aiReason?: string | null };
type Resp = { searchId: number; items: Item[]; nextPageToken: string | null; warnings: string[] };
type Source = "places" | "osm" | "gemini" | "ceidg";

const SOURCE_HELP: Record<Source, string> = {
  places: "Najlepsze dane lokalne: strona, telefon, opinie. Płatne ponad darmowy limit Google.",
  osm: "Darmowe. Mniej danych – brak strony w OSM nie jest pewny.",
  gemini: "AI + wyszukiwarka Google. Dobre dla niszowych zapytań (np. „startupy fintech bez strony”).",
  ceidg: "Świeżo zarejestrowane JDG – często jeszcze bez strony. Wymaga tokenu CEIDG.",
};

export function SearchPanel({ available }: { available: Record<Source, boolean> }) {
  const [source, setSource] = useState<Source>(available.places ? "places" : available.gemini ? "gemini" : "osm");
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [language, setLanguage] = useState<"pl" | "en">("pl");
  const [region, setRegion] = useState("PL");
  const [pkd, setPkd] = useState("");
  const [days, setDays] = useState(60);
  const [checkSites, setCheckSites] = useState(true);
  const [showHidden, setShowHidden] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Resp | null>(null);

  async function run(more = false) {
    setLoading(true);
    setError(null);
    try {
      const r = await api<Resp>("/api/search", {
        method: "POST",
        json: {
          source,
          query,
          location: location || undefined,
          language,
          region: source === "places" ? region : undefined,
          checkSites,
          ...(source === "ceidg"
            ? { registeredWithinDays: days, pkd: pkd.split(/[,\s]+/).filter(Boolean) }
            : {}),
          ...(more && result ? { pageToken: result.nextPageToken, searchId: result.searchId } : {}),
        },
      });
      setResult(more && result ? { ...r, items: [...result.items, ...r.items], warnings: r.warnings } : r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function act(id: number, body: Record<string, unknown>) {
    const updated = await api<LeadJson>(`/api/leads/${id}`, { method: "PATCH", json: body });
    setResult((r) =>
      r
        ? {
            ...r,
            items: r.items.map((i) =>
              i.lead.id === id
                ? { ...i, lead: updated, hidden: !!updated.processedAt || updated.status === "rejected" }
                : i,
            ),
          }
        : r,
    );
  }

  const items = result?.items.filter((i) => showHidden || !i.hidden) ?? [];

  return (
    <div className="space-y-6">
      <form
        className="card space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <div className="flex flex-wrap gap-2">
          {(Object.keys(SOURCE_HELP) as Source[]).map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => setSource(s)}
              className={`btn ${source === s ? "bg-indigo-600 text-white" : "btn-secondary"}`}
              title={available[s] ? "" : "Brak klucza API – skonfiguruj w .env"}
            >
              {SOURCE_LABELS[s]}
              {!available[s] && <span className="text-xs opacity-70">(brak klucza)</span>}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-500">{SOURCE_HELP[source]}</p>

        <div className="grid gap-3 md:grid-cols-12">
          <div className="md:col-span-5">
            <label className="label">
              {source === "ceidg" ? "Fraza w nazwie (opcjonalnie)" : "Czego szukamy? (branża, słowa kluczowe)"}
            </label>
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={source === "gemini" ? "np. lokalne marki odzieżowe sprzedające tylko na Instagramie" : "np. fizjoterapeuta, salon kosmetyczny, warsztat"}
            />
          </div>
          <div className="md:col-span-3">
            <label className="label">Lokalizacja</label>
            <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="np. Kraków" />
          </div>
          {source === "places" && (
            <div className="md:col-span-1">
              <label className="label">Kraj</label>
              <input className="input uppercase" maxLength={2} value={region} onChange={(e) => setRegion(e.target.value)} />
            </div>
          )}
          {source === "ceidg" && (
            <>
              <div className="md:col-span-2">
                <label className="label">Kody PKD</label>
                <input className="input" value={pkd} onChange={(e) => setPkd(e.target.value)} placeholder="96.02.Z, 86.90.A" />
              </div>
              <div className="md:col-span-1">
                <label className="label">Ost. dni</label>
                <input className="input" type="number" min={1} value={days} onChange={(e) => setDays(Number(e.target.value))} />
              </div>
            </>
          )}
          <div className="md:col-span-1">
            <label className="label">Język</label>
            <select className="input" value={language} onChange={(e) => setLanguage(e.target.value as "pl" | "en")}>
              <option value="pl">PL</option>
              <option value="en">EN</option>
            </select>
          </div>
          <div className="flex items-end md:col-span-2">
            <button className="btn-primary w-full" disabled={loading}>
              {loading ? "Szukam…" : "Szukaj"}
            </button>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <input type="checkbox" checked={checkSites} onChange={(e) => setCheckSites(e.target.checked)} />
          Od razu sprawdź strony www (HTTPS, mobile, rok ©, kreator) – darmowe, ale wolniejsze
        </label>
      </form>

      {error && <div className="card border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-300">{error}</div>}

      {result && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-zinc-500">
              {result.items.length} wyników · {result.items.filter((i) => i.wasNew).length} nowych ·{" "}
              {result.items.filter((i) => i.hidden).length} już procesowanych/odrzuconych
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
              Pokaż procesowane i odrzucone
            </label>
          </div>
          {result.warnings.map((w) => (
            <div key={w} className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              {w}
            </div>
          ))}

          <div className="space-y-2">
            {items.map(({ lead, wasNew, hidden, aiReason }) => (
              <div key={lead.id} className={`card flex flex-col gap-3 md:flex-row md:items-center ${hidden ? "opacity-60" : ""}`}>
                <ScoreBadge score={lead.score} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/leads/${lead.id}`} className="font-medium hover:underline">
                      {lead.name}
                    </Link>
                    {wasNew && <span className="rounded bg-indigo-100 px-1.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200">NOWY</span>}
                    {lead.status !== "new" && <StatusBadge status={lead.status} />}
                  </div>
                  <div className="truncate text-xs text-zinc-500">
                    {[lead.category, lead.address ?? lead.city].filter(Boolean).join(" · ")}
                    {lead.website && (
                      <>
                        {" · "}
                        <a href={lead.website} target="_blank" rel="noreferrer" className="link">
                          {lead.domain}
                        </a>
                      </>
                    )}
                  </div>
                  {aiReason && <div className="mt-1 text-xs italic text-zinc-600 dark:text-zinc-400">{aiReason}</div>}
                  <div className="mt-1.5">
                    <SignalChips signals={lead.signals} />
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Link href={`/leads/${lead.id}`} className="btn-secondary">
                    Szczegóły
                  </Link>
                  {!lead.processedAt ? (
                    <button className="btn-primary" onClick={() => act(lead.id, { processed: true })}>
                      + Procesuj
                    </button>
                  ) : (
                    <button className="btn-ghost" onClick={() => act(lead.id, { processed: false })}>
                      Cofnij
                    </button>
                  )}
                  {lead.status !== "rejected" && (
                    <button className="btn-ghost" title="Nie pasuje – ukryj w kolejnych wyszukiwaniach" onClick={() => act(lead.id, { status: "rejected" })}>
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!items.length && <div className="card text-sm text-zinc-500">Brak wyników do pokazania.</div>}
          </div>

          {result.nextPageToken && (
            <button className="btn-secondary w-full" disabled={loading} onClick={() => run(true)}>
              {loading ? "Ładuję…" : "Więcej wyników"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
