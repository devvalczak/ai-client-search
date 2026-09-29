import type { LeadStatus } from "@/lib/statuses";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/labels";
import { signalChips, type Signals } from "@/lib/scoring";

export function ScoreBadge({ score, size = "md" }: { score: number; size?: "md" | "lg" }) {
  const color =
    score >= 70 ? "bg-emerald-500" : score >= 45 ? "bg-amber-500" : score >= 25 ? "bg-orange-400" : "bg-zinc-400";
  const text =
    score >= 70
      ? "text-emerald-700 dark:text-emerald-400"
      : score >= 45
        ? "text-amber-700 dark:text-amber-400"
        : "text-zinc-500";
  return (
    <div className={size === "lg" ? "w-32" : "w-16"} title="Szacowana potrzeba naszych usług">
      <div className={`font-semibold tabular-nums ${text} ${size === "lg" ? "text-3xl" : "text-sm"}`}>{score}%</div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div className={`h-full ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

const TONES = {
  hot: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
  warm: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  info: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export function SignalChips({ signals, max = 6 }: { signals: Signals; max?: number }) {
  const chips = signalChips(signals).slice(0, max);
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <span key={c.label} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${TONES[c.tone]}`}>
          {c.label}
        </span>
      ))}
    </div>
  );
}

export function SocialLinks({ socials }: { socials: Record<string, unknown> }) {
  const entries = Object.entries(socials).filter(([k, v]) => k !== "platforms" && typeof v === "string") as [string, string][];
  const platforms = (socials.platforms as string[] | undefined) ?? [];
  if (!entries.length && !platforms.length) return <span className="text-zinc-400">—</span>;
  return (
    <span className="flex flex-wrap gap-2">
      {entries.map(([k, v]) => (
        <a key={k} href={v} target="_blank" rel="noreferrer" className="link capitalize">
          {k}
        </a>
      ))}
      {platforms.map((p) => (
        <a key={p} href={p} target="_blank" rel="noreferrer" className="link">
          {new URL(p).hostname.replace(/^www\./, "")}
        </a>
      ))}
    </span>
  );
}
