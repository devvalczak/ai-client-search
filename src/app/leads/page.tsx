import Link from "next/link";
import { connection } from "next/server";
import { ScoreBadge, SignalChips, StatusBadge } from "@/components/ui";
import { SOURCE_LABELS, STATUS_LABELS } from "@/lib/labels";
import { getSearch, listLeads, statusCounts } from "@/lib/queries";
import { LEAD_STATUSES } from "@/lib/statuses";

export default async function LeadsPage(props: PageProps<"/leads">) {
  await connection();
  const sp = await props.searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) || undefined;
  const filters = {
    status: one("status"),
    view: (one("view") as "all" | "processed" | "unprocessed") ?? "all",
    q: one("q"),
    minScore: Number(one("minScore")) || undefined,
    source: one("source"),
    sort: (one("sort") as "score" | "recent" | "followup") ?? "score",
    searchId: Number(one("search")) || undefined,
  };
  const leads = listLeads(filters);
  const counts = statusCounts();
  const search = filters.searchId ? getSearch(filters.searchId) : undefined;
  const exportParams = new URLSearchParams(
    Object.entries({ status: filters.status, view: filters.view, q: filters.q, minScore: filters.minScore?.toString() }).filter(
      (e): e is [string, string] => !!e[1],
    ),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Leady {search && <span className="text-base font-normal text-zinc-500">z wyszukiwania „{search.query}”</span>}
        </h1>
        <a href={`/api/export?${exportParams}`} className="btn-secondary">
          ⬇ Eksport CSV
        </a>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/leads" className={`btn ${!filters.status ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "btn-secondary"}`}>
          Wszystkie ({counts.total})
        </Link>
        {LEAD_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/leads?status=${s}`}
            className={`btn ${filters.status === s ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "btn-secondary"}`}
          >
            {STATUS_LABELS[s]} ({counts.byStatus[s] ?? 0})
          </Link>
        ))}
      </div>

      <form className="card grid gap-3 md:grid-cols-6" method="get">
        {filters.status && <input type="hidden" name="status" value={filters.status} />}
        <div className="md:col-span-2">
          <label className="label">Szukaj</label>
          <input className="input" name="q" defaultValue={filters.q} placeholder="nazwa, miasto, domena, NIP" />
        </div>
        <div>
          <label className="label">Widok</label>
          <select className="input" name="view" defaultValue={filters.view}>
            <option value="all">Wszystkie</option>
            <option value="unprocessed">Nieprocesowane</option>
            <option value="processed">Procesowane</option>
          </select>
        </div>
        <div>
          <label className="label">Min. ocena</label>
          <input className="input" type="number" name="minScore" min={0} max={100} defaultValue={filters.minScore} />
        </div>
        <div>
          <label className="label">Sortuj</label>
          <select className="input" name="sort" defaultValue={filters.sort}>
            <option value="score">Ocena</option>
            <option value="recent">Ostatnio zmienione</option>
            <option value="followup">Follow-up</option>
          </select>
        </div>
        <div className="flex items-end">
          <button className="btn-primary w-full">Filtruj</button>
        </div>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2">Ocena</th>
              <th className="px-4 py-2">Firma</th>
              <th className="px-4 py-2">Sygnały</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Follow-up</th>
              <th className="px-4 py-2">Źródło</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} className="border-t border-zinc-100 align-top hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/40">
                <td className="px-4 py-3">
                  <ScoreBadge score={l.score} />
                </td>
                <td className="px-4 py-3">
                  <Link href={`/leads/${l.id}`} className="font-medium hover:underline">
                    {l.name}
                  </Link>
                  <div className="text-xs text-zinc-500">{[l.category, l.city].filter(Boolean).join(" · ")}</div>
                  {l.processedAt && <div className="text-[11px] text-indigo-600">procesowany</div>}
                </td>
                <td className="max-w-md px-4 py-3">
                  <SignalChips signals={l.signals} max={5} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={l.status} />
                </td>
                <td className="px-4 py-3 text-xs">{l.followUpAt ? l.followUpAt.toLocaleDateString("pl-PL") : "—"}</td>
                <td className="px-4 py-3 text-xs text-zinc-500">{SOURCE_LABELS[l.source] ?? l.source}</td>
              </tr>
            ))}
            {!leads.length && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  Brak leadów. <Link href="/" className="link">Wyszukaj</Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
