import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { LeadDetail } from "@/components/LeadDetail";
import { integrationsStatus } from "@/lib/config";
import { getLeadDetail } from "@/lib/queries";

export default async function LeadPage(props: PageProps<"/leads/[id]">) {
  await connection();
  const { id } = await props.params;
  const detail = getLeadDetail(Number(id));
  if (!detail) notFound();
  const canEnrich = integrationsStatus().gemini;

  return (
    <div className="space-y-4">
      <Link href="/leads" className="link text-sm">
        ← Leady
      </Link>
      <LeadDetail
        // Po serializacji przez granicę server→client daty stają się stringami
        {...(JSON.parse(JSON.stringify(detail)) as Parameters<typeof LeadDetail>[0])}
        autoEnrich={canEnrich && !detail.lead.enrichedAt}
        canEnrich={canEnrich}
      />
    </div>
  );
}
