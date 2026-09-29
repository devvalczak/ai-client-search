import Link from "next/link";
import { connection } from "next/server";
import { SOURCE_LABELS } from "@/lib/labels";
import { listSearches } from "@/lib/queries";

export default async function SearchesPage() {
  await connection();
  const searches = listSearches(100);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Historia wyszukiwań</h1>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2">Data</th>
              <th className="px-4 py-2">Źródło</th>
              <th className="px-4 py-2">Zapytanie</th>
              <th className="px-4 py-2">Lokalizacja</th>
              <th className="px-4 py-2 text-right">Wyniki</th>
              <th className="px-4 py-2 text-right">Nowe</th>
            </tr>
          </thead>
          <tbody>
            {searches.map((s) => (
              <tr key={s.id} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="px-4 py-2 text-xs">{s.createdAt.toLocaleString("pl-PL")}</td>
                <td className="px-4 py-2">{SOURCE_LABELS[s.source] ?? s.source}</td>
                <td className="px-4 py-2">
                  <Link className="link" href={`/leads?search=${s.id}`}>
                    {s.query || "(bez frazy)"}
                  </Link>
                </td>
                <td className="px-4 py-2">{s.location ?? "—"}</td>
                <td className="px-4 py-2 text-right tabular-nums">{s.resultCount}</td>
                <td className="px-4 py-2 text-right tabular-nums">{s.newCount}</td>
              </tr>
            ))}
            {!searches.length && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  Jeszcze nic nie wyszukano.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
