import Link from "next/link";
import { connection } from "next/server";
import { SearchPanel } from "@/components/SearchPanel";
import { StatusBadge } from "@/components/ui";
import { integrationsStatus } from "@/lib/config";
import { dueFollowUps, statusCounts } from "@/lib/queries";

export default async function Home() {
  await connection();
  const s = integrationsStatus();
  const counts = statusCounts();
  const followUps = dueFollowUps();

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div>
        <h1 className="mb-4 text-2xl font-semibold tracking-tight">Znajdź klientów</h1>
        <SearchPanel available={{ places: s.places, osm: true, gemini: s.gemini, ceidg: s.ceidg }} />
      </div>
      <aside className="space-y-4">
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold">Baza</h2>
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            {counts.total} leadów · {counts.processed} procesowanych
          </div>
        </div>
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold">Follow-upy na dziś</h2>
          {followUps.length ? (
            <ul className="space-y-2 text-sm">
              {followUps.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2">
                  <Link href={`/leads/${l.id}`} className="link truncate">
                    {l.name}
                  </Link>
                  <StatusBadge status={l.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">Brak zaplanowanych.</p>
          )}
        </div>
        {(!s.gemini || !s.places) && (
          <div className="card text-xs text-zinc-600 dark:text-zinc-400">
            Brakuje kluczy API ({[!s.gemini && "Gemini", !s.places && "Google Places"].filter(Boolean).join(", ")}). Zobacz{" "}
            <Link href="/settings" className="link">
              Ustawienia
            </Link>
            .
          </div>
        )}
      </aside>
    </div>
  );
}
