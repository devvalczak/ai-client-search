"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { EnrichmentStep, SourceLink } from "@/lib/db/schema";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/statuses";
import { api, type ContactJson, type Jsonify, type LeadJson, type NoteJson } from "@/lib/client-types";
import { CONTACT_SOURCE_LABELS, SERVICES, SOURCE_LABELS, STATUS_LABELS } from "@/lib/labels";
import { ScoreBadge, SignalChips, SocialLinks, StatusBadge } from "@/components/ui";

type EnrichmentJson = Jsonify<{
  id: number;
  steps: EnrichmentStep[];
  data: Record<string, unknown>;
  sources: SourceLink[];
  createdAt: Date;
}>;

type Props = {
  lead: LeadJson;
  contacts: ContactJson[];
  notes: NoteJson[];
  enrichment?: EnrichmentJson;
  autoEnrich: boolean;
  canEnrich: boolean;
};

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" }) : "");

export function LeadDetail({ lead, contacts, notes, enrichment, autoEnrich, canEnrich }: Props) {
  const router = useRouter();
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  async function enrich() {
    setEnriching(true);
    setError(null);
    try {
      await api(`/api/leads/${lead.id}/enrich`, { method: "POST" });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnriching(false);
    }
  }

  useEffect(() => {
    if (autoEnrich && !started.current) {
      started.current = true;
      enrich();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEnrich]);

  async function patch(body: Record<string, unknown>) {
    try {
      await api(`/api/leads/${lead.id}`, { method: "PATCH", json: body });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const ps = enrichment?.data.pagespeed as { performance?: number; seo?: number; accessibility?: number } | undefined;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        {/* Nagłówek */}
        <div className="card flex flex-col gap-4 md:flex-row md:items-start">
          <ScoreBadge score={lead.score} size="lg" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{lead.name}</h1>
              <StatusBadge status={lead.status} />
              {lead.processedAt && <span className="text-xs text-zinc-500">procesowany od {fmtDate(lead.processedAt)}</span>}
            </div>
            <div className="text-sm text-zinc-500">
              {[lead.category, lead.city, SOURCE_LABELS[lead.source] ?? lead.source].filter(Boolean).join(" · ")}
            </div>
            {lead.description && <p className="pt-1 text-sm">{lead.description}</p>}
            <div className="pt-1">
              <SignalChips signals={lead.signals} max={12} />
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <button className="btn-primary" onClick={enrich} disabled={enriching || !canEnrich} title={canEnrich ? "" : "Brak GEMINI_API_KEY"}>
              {enriching ? "Analizuję… (do ~1 min)" : lead.enrichedAt ? "↻ Odśwież dane (AI)" : "Pogłęb dane (AI)"}
            </button>
            {lead.enrichedAt && <span className="text-center text-[11px] text-zinc-500">ostatnio: {fmtDate(lead.enrichedAt)}</span>}
          </div>
        </div>

        {error && <div className="card text-sm text-rose-600">{error}</div>}

        {/* Rekomendacja AI */}
        {(lead.pitch || lead.suggestedServices?.length || lead.aiReasons?.length) && (
          <div className="card space-y-2 border-indigo-200 dark:border-indigo-900">
            <h2 className="text-sm font-semibold">💡 Co im zaproponować</h2>
            {lead.suggestedServices?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {lead.suggestedServices.map((s) => (
                  <span key={s} className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200">
                    {SERVICES[s as keyof typeof SERVICES] ?? s}
                  </span>
                ))}
              </div>
            ) : null}
            {lead.pitch && <p className="text-sm">{lead.pitch}</p>}
            {lead.aiReasons?.length ? (
              <ul className="list-disc pl-5 text-sm text-zinc-600 dark:text-zinc-400">
                {lead.aiReasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : null}
          </div>
        )}

        {/* Dane firmy */}
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold">Dane firmy</h2>
          <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-zinc-500">Strona</dt>
            <dd>
              <EditableField
                value={lead.website}
                render={(v) => (
                  <a href={v} target="_blank" rel="noreferrer" className="link break-all">
                    {v}
                  </a>
                )}
                onSave={(v) => patch({ website: v })}
              />
            </dd>
            <dt className="text-zinc-500">Social / profile</dt>
            <dd>
              <SocialLinks socials={lead.socials} />
            </dd>
            <dt className="text-zinc-500">Adres</dt>
            <dd>{lead.address ?? "—"}</dd>
            <dt className="text-zinc-500">Telefon</dt>
            <dd>
              <EditableField value={lead.phone} render={(v) => <a href={`tel:${v}`} className="link">{v}</a>} onSave={(v) => patch({ phone: v })} />
            </dd>
            <dt className="text-zinc-500">E-mail</dt>
            <dd>
              <EditableField value={lead.email} render={(v) => <a href={`mailto:${v}`} className="link">{v}</a>} onSave={(v) => patch({ email: v })} />
            </dd>
            <dt className="text-zinc-500">NIP / KRS / REGON</dt>
            <dd>{[lead.nip, lead.krs, lead.regon].map((x) => x ?? "—").join(" / ")}</dd>
            {lead.foundedAt && (
              <>
                <dt className="text-zinc-500">Działa od</dt>
                <dd>{lead.foundedAt}</dd>
              </>
            )}
            {lead.reviewCount != null && (
              <>
                <dt className="text-zinc-500">Opinie Google</dt>
                <dd>
                  {lead.rating ?? "—"} ★ ({lead.reviewCount})
                </dd>
              </>
            )}
            {ps && (
              <>
                <dt className="text-zinc-500">PageSpeed (mobile)</dt>
                <dd>
                  wydajność {ps.performance ?? "—"} · SEO {ps.seo ?? "—"} · dostępność {ps.accessibility ?? "—"}
                </dd>
              </>
            )}
            {lead.lat != null && lead.lng != null && (
              <>
                <dt className="text-zinc-500">Mapa</dt>
                <dd>
                  <a
                    className="link"
                    target="_blank"
                    rel="noreferrer"
                    href={lead.googlePlaceId ? `https://www.google.com/maps/place/?q=place_id:${lead.googlePlaceId}` : `https://www.openstreetmap.org/?mlat=${lead.lat}&mlon=${lead.lng}#map=18/${lead.lat}/${lead.lng}`}
                  >
                    Otwórz
                  </a>
                </dd>
              </>
            )}
          </dl>
        </div>

        <ContactsPanel leadId={lead.id} contacts={contacts} onChange={() => router.refresh()} />

        {/* Rozbicie oceny */}
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold">Skąd {lead.score}%?</h2>
          <table className="w-full text-sm">
            <tbody>
              {lead.scoreBreakdown.map((i) => (
                <tr key={i.key} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="py-1.5">{i.label}</td>
                  <td className={`py-1.5 text-right tabular-nums ${i.points < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {i.points > 0 ? "+" : ""}
                    {i.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-zinc-500">Wagi zmienisz w Ustawieniach. Wynik jest ograniczony do 0–100.</p>
        </div>

        {enrichment && (
          <div className="card space-y-3">
            <h2 className="text-sm font-semibold">Przebieg pogłębiania ({fmtDate(enrichment.createdAt)})</h2>
            <ul className="space-y-1 text-sm">
              {enrichment.steps.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span>{s.ok ? "✅" : s.message?.startsWith("pominięto") ? "⏭️" : "⚠️"}</span>
                  <span className="font-medium">{s.step}</span>
                  {s.message && <span className="truncate text-zinc-500" title={s.message}>{s.message}</span>}
                </li>
              ))}
            </ul>
            {enrichment.sources.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm text-zinc-500">Źródła Gemini ({enrichment.sources.length})</summary>
                <ul className="mt-2 space-y-1 text-xs">
                  {enrichment.sources.map((s) => (
                    <li key={s.uri}>
                      <a href={s.uri} target="_blank" rel="noreferrer" className="link">
                        {s.title || s.uri}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>

      {/* Prawa kolumna: CRM */}
      <div className="space-y-4">
        <div className="card space-y-3">
          <h2 className="text-sm font-semibold">Status</h2>
          <select className="input" value={lead.status} onChange={(e) => patch({ status: e.target.value as LeadStatus })}>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!lead.processedAt} onChange={(e) => patch({ processed: e.target.checked })} />
            Procesowany (nie pokazuj w nowych wyszukiwaniach)
          </label>
          <div>
            <label className="label">Follow-up</label>
            <input
              type="date"
              className="input"
              value={lead.followUpAt ? lead.followUpAt.slice(0, 10) : ""}
              onChange={(e) => patch({ followUpAt: e.target.value || null })}
            />
          </div>
          <div>
            <label className="label">Opiekun</label>
            <EditableField value={lead.assignedTo} render={(v) => <span>{v}</span>} onSave={(v) => patch({ assignedTo: v })} />
          </div>
          <button
            className="btn-ghost w-full text-rose-600"
            onClick={async () => {
              if (!confirm("Usunąć leada razem z notatkami i kontaktami?")) return;
              await api(`/api/leads/${lead.id}`, { method: "DELETE" });
              router.push("/leads");
            }}
          >
            Usuń leada
          </button>
        </div>

        <NotesPanel leadId={lead.id} notes={notes} onChange={() => router.refresh()} />
        <OutreachPanel leadId={lead.id} contacts={contacts} canUse={canEnrich} onSaved={() => router.refresh()} />
      </div>
    </div>
  );
}

function EditableField({
  value,
  render,
  onSave,
}: {
  value: string | null;
  render: (v: string) => React.ReactNode;
  onSave: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  if (editing)
    return (
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(draft.trim() || null);
          setEditing(false);
        }}
      >
        <input className="input py-1" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="btn-secondary py-1">OK</button>
      </form>
    );
  return (
    <span className="group inline-flex items-center gap-2">
      {value ? render(value) : <span className="text-zinc-400">—</span>}
      <button
        className="text-xs text-zinc-400 opacity-0 hover:text-zinc-700 group-hover:opacity-100"
        onClick={() => {
          setDraft(value ?? "");
          setEditing(true);
        }}
      >
        edytuj
      </button>
    </span>
  );
}

function ContactsPanel({ leadId, contacts, onChange }: { leadId: number; contacts: ContactJson[]; onChange: () => void }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", role: "", email: "", phone: "", linkedin: "" });
  const people = contacts.filter((c) => c.name);
  const generic = contacts.filter((c) => !c.name);

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Osoby kontaktowe</h2>
        <button className="btn-ghost py-1 text-xs" onClick={() => setAdding((a) => !a)}>
          {adding ? "Anuluj" : "+ Dodaj"}
        </button>
      </div>
      {adding && (
        <form
          className="mb-3 grid gap-2 md:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await api(`/api/leads/${leadId}/contacts`, { method: "POST", json: form });
            setForm({ name: "", role: "", email: "", phone: "", linkedin: "" });
            setAdding(false);
            onChange();
          }}
        >
          {(["name", "role", "email", "phone", "linkedin"] as const).map((k) => (
            <input
              key={k}
              className="input"
              placeholder={{ name: "Imię i nazwisko", role: "Stanowisko", email: "E-mail", phone: "Telefon", linkedin: "LinkedIn URL" }[k]}
              value={form[k]}
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
            />
          ))}
          <button className="btn-primary">Zapisz</button>
        </form>
      )}
      {!contacts.length && <p className="text-sm text-zinc-500">Brak – kliknij „Pogłęb dane (AI)” lub dodaj ręcznie.</p>}
      <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
        {[...people, ...generic].map((c) => (
          <li key={c.id} className="group flex items-start justify-between gap-2 py-2">
            <div className="min-w-0">
              <div className="font-medium">
                {c.name ?? c.email}
                {c.role && <span className="ml-2 font-normal text-zinc-500">{c.role}</span>}
              </div>
              <div className="flex flex-wrap gap-x-3 text-xs">
                {c.name && c.email && <a className="link" href={`mailto:${c.email}`}>{c.email}</a>}
                {c.phone && <a className="link" href={`tel:${c.phone}`}>{c.phone}</a>}
                {c.linkedin && <a className="link" href={c.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>}
                <span className="text-zinc-400">
                  źródło:{" "}
                  {c.sourceUrl ? (
                    <a className="link" href={c.sourceUrl} target="_blank" rel="noreferrer">
                      {CONTACT_SOURCE_LABELS[c.source] ?? c.source}
                    </a>
                  ) : (
                    CONTACT_SOURCE_LABELS[c.source] ?? c.source
                  )}
                </span>
              </div>
            </div>
            <button
              className="text-xs text-zinc-400 opacity-0 hover:text-rose-600 group-hover:opacity-100"
              onClick={async () => {
                await api(`/api/contacts/${c.id}`, { method: "DELETE" });
                onChange();
              }}
            >
              usuń
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-zinc-400">
        Dane osobowe – przetwarzaj zgodnie z RODO. Pierwszy kontakt handlowy e-mailem/telefonem może wymagać zgody (PKE).
      </p>
    </div>
  );
}

function NotesPanel({ leadId, notes, onChange }: { leadId: number; notes: NoteJson[]; onChange: () => void }) {
  const [body, setBody] = useState("");
  return (
    <div className="card space-y-3">
      <h2 className="text-sm font-semibold">Notatki</h2>
      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!body.trim()) return;
          await api(`/api/leads/${leadId}/notes`, { method: "POST", json: { body } });
          setBody("");
          onChange();
        }}
      >
        <textarea className="input min-h-20" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Np. dzwoniłem, oddzwonić w czwartek…" />
        <button className="btn-secondary w-full">Dodaj notatkę</button>
      </form>
      <ul className="space-y-2">
        {notes.map((n) => (
          <li key={n.id} className="group rounded-lg bg-zinc-50 p-2 text-sm dark:bg-zinc-800/50">
            <div className="whitespace-pre-wrap">{n.body}</div>
            <div className="mt-1 flex justify-between text-[11px] text-zinc-400">
              <span>{fmtDate(n.createdAt)}</span>
              <button
                className="opacity-0 hover:text-rose-600 group-hover:opacity-100"
                onClick={async () => {
                  await api(`/api/notes/${n.id}`, { method: "DELETE" });
                  onChange();
                }}
              >
                usuń
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OutreachPanel({
  leadId,
  contacts,
  canUse,
  onSaved,
}: {
  leadId: number;
  contacts: ContactJson[];
  canUse: boolean;
  onSaved: () => void;
}) {
  const [channel, setChannel] = useState<"email" | "linkedin" | "phone">("email");
  const [contactName, setContactName] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const agencyKey = "agencyName";
  const [agency, setAgency] = useState(() => {
    try {
      return typeof window === "undefined" ? "" : (localStorage.getItem(agencyKey) ?? "");
    } catch {
      return "";
    }
  });

  return (
    <div className="card space-y-2">
      <h2 className="text-sm font-semibold">✉️ Pierwsza wiadomość (AI)</h2>
      <div className="grid grid-cols-2 gap-2">
        <select className="input" value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
          <option value="email">E-mail</option>
          <option value="linkedin">LinkedIn</option>
          <option value="phone">Skrypt rozmowy</option>
        </select>
        <select className="input" value={contactName} onChange={(e) => setContactName(e.target.value)}>
          <option value="">Do: osoba decyzyjna</option>
          {contacts.filter((c) => c.name).map((c) => (
            <option key={c.id} value={c.name!}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <input
        className="input"
        placeholder="Nazwa Twojej agencji"
        suppressHydrationWarning
        value={agency}
        onChange={(e) => {
          setAgency(e.target.value);
          try {
            localStorage.setItem(agencyKey, e.target.value);
          } catch {
            /* ignore */
          }
        }}
      />
      <button
        className="btn-secondary w-full"
        disabled={loading || !canUse}
        onClick={async () => {
          setLoading(true);
          setError(null);
          try {
            const r = await api<{ text: string }>(`/api/leads/${leadId}/outreach`, {
              method: "POST",
              json: { channel, agencyName: agency || undefined, contactName: contactName || undefined },
            });
            setText(r.text);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setLoading(false);
          }
        }}
      >
        {loading ? "Piszę…" : "Wygeneruj"}
      </button>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {text && (
        <>
          <textarea className="input min-h-48 text-xs" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn-ghost flex-1 text-xs" onClick={() => navigator.clipboard.writeText(text)}>
              Kopiuj
            </button>
            <button
              className="btn-ghost flex-1 text-xs"
              onClick={async () => {
                await api(`/api/leads/${leadId}/notes`, { method: "POST", json: { body: `[Wiadomość – ${channel}]\n${text}` } });
                onSaved();
              }}
            >
              Zapisz jako notatkę
            </button>
          </div>
        </>
      )}
    </div>
  );
}
