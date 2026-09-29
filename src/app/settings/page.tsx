import { connection } from "next/server";
import { WeightsEditor } from "@/components/WeightsEditor";
import { config, integrationsStatus } from "@/lib/config";
import { getWeights } from "@/lib/leads";
import { usageSummary } from "@/lib/queries";
import { DEFAULT_WEIGHTS, WEIGHT_LABELS } from "@/lib/scoring";

const INTEGRATIONS: { key: keyof ReturnType<typeof integrationsStatus>; name: string; env: string; note: string }[] = [
  { key: "gemini", name: "Gemini", env: "GEMINI_API_KEY", note: "Wyszukiwanie AI, pogłębianie danych, wiadomości. Klucz: Google AI Studio." },
  { key: "places", name: "Google Places API (New)", env: "GOOGLE_API_KEY", note: "Wyszukiwanie firm lokalnych. Płatne ponad miesięczny darmowy limit." },
  { key: "pagespeedKey", name: "PageSpeed Insights", env: "PAGESPEED_API_KEY / GOOGLE_API_KEY", note: "Działa bez klucza, ale z niskim limitem zapytań." },
  { key: "ceidg", name: "CEIDG (Hurtownia Danych)", env: "CEIDG_API_TOKEN", note: "Nowe JDG + właściciele. Token bezpłatny na dane.biznes.gov.pl." },
  { key: "regon", name: "GUS REGON (BIR)", env: "REGON_API_KEY", note: "Dane rejestrowe po NIP. Klucz bezpłatny z GUS." },
  { key: "krs", name: "KRS (otwarte API)", env: "—", note: "Bez klucza. Nazwiska zarządu są w API maskowane." },
  { key: "osm", name: "OpenStreetMap", env: "—", note: "Bez klucza. Nominatim + Overpass." },
];

export default async function SettingsPage() {
  await connection();
  const status = integrationsStatus();
  const usage = usageSummary(30);
  const weights = getWeights();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Ustawienia</h1>

      <section className="card">
        <h2 className="mb-3 font-semibold">Integracje</h2>
        <p className="mb-3 text-sm text-zinc-500">
          Klucze ustawiasz w pliku <code>.env.local</code> (patrz <code>.env.example</code>) i restartujesz aplikację. Model
          Gemini: <code>{config.geminiModel}</code>.
        </p>
        <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
          {INTEGRATIONS.map((i) => (
            <li key={i.key} className="flex items-start gap-3 py-2">
              <span>{status[i.key] ? "🟢" : "⚪"}</span>
              <div>
                <div className="font-medium">
                  {i.name} <code className="ml-1 text-xs text-zinc-500">{i.env}</code>
                </div>
                <div className="text-xs text-zinc-500">{i.note}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2 className="mb-1 font-semibold">Wagi oceny</h2>
        <p className="mb-3 text-sm text-zinc-500">
          Ile punktów dodaje dany sygnał. Po zapisaniu wszystkie leady zostaną przeliczone.
        </p>
        <WeightsEditor initial={weights} defaults={{ ...DEFAULT_WEIGHTS }} labels={WEIGHT_LABELS} />
      </section>

      <section className="card">
        <h2 className="mb-3 font-semibold">Zużycie API (30 dni)</h2>
        {usage.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-zinc-500">
              <tr>
                <th className="py-1">Dostawca</th>
                <th className="py-1">Operacja</th>
                <th className="py-1 text-right">Wywołania</th>
                <th className="py-1 text-right">Błędy</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((u) => (
                <tr key={u.provider + u.operation} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="py-1">{u.provider}</td>
                  <td className="py-1">{u.operation}</td>
                  <td className="py-1 text-right tabular-nums">{u.calls}</td>
                  <td className="py-1 text-right tabular-nums">{u.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-zinc-500">Brak wywołań.</p>
        )}
      </section>
    </div>
  );
}
