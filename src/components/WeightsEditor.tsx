"use client";

import { useState } from "react";
import { api } from "@/lib/client-types";

export function WeightsEditor({
  initial,
  defaults,
  labels,
}: {
  initial: Record<string, number>;
  defaults: Record<string, number>;
  labels: Record<string, string>;
}) {
  const [weights, setWeights] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(values: Record<string, number>) {
    setSaving(true);
    setMsg(null);
    try {
      const r = await api<{ rescored: number }>("/api/settings/weights", { method: "PUT", json: values });
      setWeights(values);
      setMsg(`Zapisano. Przeliczono ${r.rescored} leadów.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
        {Object.keys(defaults).map((k) => (
          <label key={k} className="flex items-center justify-between gap-3 text-sm">
            <span className={weights[k] !== defaults[k] ? "font-medium text-indigo-600 dark:text-indigo-400" : ""}>{labels[k] ?? k}</span>
            <input
              type="number"
              className="input w-20 py-1 text-right"
              value={weights[k]}
              min={-100}
              max={100}
              onChange={(e) => setWeights({ ...weights, [k]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button className="btn-primary" disabled={saving} onClick={() => save(weights)}>
          Zapisz i przelicz
        </button>
        <button className="btn-ghost" disabled={saving} onClick={() => save(defaults)}>
          Przywróć domyślne
        </button>
        {msg && <span className="text-sm text-zinc-500">{msg}</span>}
      </div>
    </div>
  );
}
