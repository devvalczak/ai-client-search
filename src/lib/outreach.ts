import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { generateText } from "@/lib/gemini";
import { SERVICES } from "@/lib/labels";

export type OutreachChannel = "email" | "linkedin" | "phone";

const CHANNEL_HINT: Record<OutreachChannel, string> = {
  email: "krótki e-mail (temat + treść, max 120 słów)",
  linkedin: "wiadomość na LinkedIn (max 60 słów, bez tematu)",
  phone: "skrypt rozmowy telefonicznej (otwarcie, 2-3 pytania, propozycja spotkania)",
};

export async function generateOutreach(
  leadId: number,
  opts: { channel: OutreachChannel; agencyName?: string; language?: string; contactName?: string },
) {
  const lead = db.select().from(schema.leads).where(eq(schema.leads.id, leadId)).get();
  if (!lead) throw new Error("Nie znaleziono leada.");
  const services = (lead.suggestedServices ?? []).map((s) => SERVICES[s as keyof typeof SERVICES] ?? s);
  const problems = [
    ...lead.scoreBreakdown.filter((i) => i.points > 0 && i.key !== "base" && i.key !== "ai").map((i) => i.label),
    ...(lead.aiReasons ?? []),
  ];

  return generateText({
    operation: "outreach",
    system: `Piszesz spersonalizowane, uprzejme i konkretne wiadomości sprzedażowe w imieniu agencji ${opts.agencyName || "interaktywnej"}.
Bez nachalności, bez przesadnych obietnic, bez wymyślania faktów o firmie. Jedna jasna propozycja i jedno pytanie na końcu.`,
    prompt: `Przygotuj: ${CHANNEL_HINT[opts.channel]}.
Język: ${opts.language === "en" ? "angielski" : "polski"}.
Adresat: ${opts.contactName || "osoba decyzyjna"} w firmie "${lead.name}" (${lead.category ?? "branża nieznana"}, ${lead.city ?? ""}).
Czym się zajmują: ${lead.description ?? "brak opisu"}.
Obecna obecność online: strona ${lead.website ?? "brak"}, social: ${Object.entries(lead.socials)
      .filter(([k, v]) => k !== "platforms" && v)
      .map(([k]) => k)
      .join(", ") || "brak"}.
Zaobserwowane problemy/szanse: ${problems.join("; ") || "brak danych"}.
Proponowane usługi: ${services.join(", ") || "strona internetowa"}.
Sugerowany pitch: ${lead.pitch ?? "-"}.`,
  });
}
