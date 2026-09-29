import "server-only";
import { USER_AGENT } from "@/lib/config";
import { fetchJson, fetchWithTimeout, tracked } from "@/lib/http";
import { config } from "@/lib/config";
import { normalizeNip, socialKind, type Socials } from "@/lib/normalize";

/** Lekka, darmowa analiza strony: pobieramy HTML i wyciągamy sygnały jakości + dane kontaktowe. */
export type SiteAnalysis = {
  reachable: boolean;
  status?: number;
  finalUrl?: string;
  https?: boolean;
  loadMs?: number;
  title?: string;
  metaDescription?: string;
  mobileFriendly?: boolean;
  copyrightYear?: number;
  builder?: string;
  ecommercePlatform?: string;
  hasAnalytics?: boolean;
  emails: string[];
  phones: string[];
  nips: string[];
  krs?: string;
  socials: Socials;
  contactPageUrl?: string;
  error?: string;
};

const BUILDERS: [string, RegExp][] = [
  ["Wix", /wix\.com|_wixCIDX|wixstatic/i],
  ["Jimdo", /jimdo/i],
  ["Weebly", /weebly/i],
  ["Squarespace", /squarespace/i],
  ["Webflow", /webflow/i],
  ["Strikingly", /strikingly/i],
  ["GoDaddy", /godaddy|img1\.wsimg\.com/i],
  ["Site123", /site123/i],
  ["Webnode", /webnode/i],
  ["WebWave", /webwave/i],
  ["Framer", /framer\.com|framerusercontent/i],
  ["Tilda", /tilda\.ws|tildacdn/i],
  ["WordPress", /wp-content|wp-includes/i],
  ["Joomla", /\/media\/jui\/|joomla/i],
  ["Drupal", /drupal/i],
];

const ECOMMERCE: [string, RegExp][] = [
  ["Shopify", /cdn\.shopify\.com|Shopify\.theme/i],
  ["WooCommerce", /woocommerce/i],
  ["PrestaShop", /prestashop/i],
  ["Shoper", /shoper\.pl|shoperpl/i],
  ["IdoSell", /idosell|iai-shop/i],
  ["Magento", /mage\/|magento/i],
  ["Sky-Shop", /sky-shop/i],
  ["Wix Stores", /wixstores|wix-ecommerce/i],
];

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_RE = /(?:\+48[\s-]?)?(?:\(?\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}|\d{3}[\s-]\d{3}[\s-]\d{3})/g;
const NIP_RE = /NIP[:\s]*([0-9]{3}[-\s]?[0-9]{3}[-\s]?[0-9]{2}[-\s]?[0-9]{2}|[0-9]{3}[-\s]?[0-9]{2}[-\s]?[0-9]{2}[-\s]?[0-9]{3})/gi;
const KRS_RE = /KRS[:\s]*(\d{10})/i;

function stripTags(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

function extractLinks(html: string, base: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      out.push(new URL(m[1], base).toString());
    } catch {
      /* ignore */
    }
  }
  return out;
}

async function getHtml(url: string) {
  const started = Date.now();
  const res = await fetchWithTimeout(url, {
    headers: { "User-Agent": `Mozilla/5.0 (compatible; ${USER_AGENT})`, Accept: "text/html" },
    redirect: "follow",
    timeoutMs: 10000,
  });
  const html = (await res.text()).slice(0, 1_500_000);
  return { res, html, loadMs: Date.now() - started };
}

function parseContacts(html: string, pageUrl: string, into: SiteAnalysis) {
  const text = stripTags(html);
  const links = extractLinks(html, pageUrl);
  const emails = new Set(into.emails);
  for (const l of links) if (l.startsWith("mailto:")) emails.add(decodeURIComponent(l.slice(7).split("?")[0]).toLowerCase());
  for (const e of text.match(EMAIL_RE) ?? []) {
    if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(e) && !/sentry|example\.|wixpress/i.test(e)) emails.add(e.toLowerCase());
  }
  into.emails = [...emails].slice(0, 10);

  const phones = new Set(into.phones);
  for (const l of links) if (l.startsWith("tel:")) phones.add(l.slice(4).replace(/\s/g, ""));
  if (!phones.size) for (const p of text.match(PHONE_RE) ?? []) phones.add(p.trim());
  into.phones = [...phones].slice(0, 5);

  const nips = new Set(into.nips);
  for (const m of text.matchAll(NIP_RE)) {
    const n = normalizeNip(m[1]);
    if (n) nips.add(n);
  }
  into.nips = [...nips];
  into.krs ??= text.match(KRS_RE)?.[1];

  for (const l of links) {
    const kind = socialKind(l);
    if (kind && !into.socials[kind] && !/sharer|share\.php|intent\/tweet/i.test(l)) into.socials[kind] = l;
  }
  return links;
}

export async function analyzeWebsite(url: string, opts: { deep?: boolean } = {}): Promise<SiteAnalysis> {
  const out: SiteAnalysis = { reachable: false, emails: [], phones: [], nips: [], socials: {} };
  try {
    const { res, html, loadMs } = await getHtml(url);
    out.status = res.status;
    out.finalUrl = res.url || url;
    out.https = out.finalUrl.startsWith("https://");
    out.loadMs = loadMs;
    out.reachable = res.ok && html.length > 200;
    if (!out.reachable) return out;

    out.title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim().slice(0, 200);
    out.metaDescription = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1]?.trim();
    out.mobileFriendly = /<meta[^>]+name=["']viewport["']/i.test(html);
    out.hasAnalytics = /googletagmanager|gtag\(|google-analytics|fbq\(|connect\.facebook\.net|hotjar|clarity\.ms|plausible|matomo/i.test(html);

    const generator = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']*)["']/i)?.[1] ?? "";
    out.ecommercePlatform = ECOMMERCE.find(([, re]) => re.test(html))?.[0];
    out.builder = BUILDERS.find(([, re]) => re.test(generator) || re.test(html))?.[0];

    const text = stripTags(html);
    const years = [...text.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)]
      .map((m) => Number(m[1]))
      .filter((y) => y > 1995 && y <= new Date().getFullYear());
    if (years.length) out.copyrightYear = Math.max(...years);

    const links = parseContacts(html, out.finalUrl, out);
    const host = new URL(out.finalUrl).host;
    out.contactPageUrl = links.find((l) => {
      try {
        const u = new URL(l);
        return u.host === host && /kontakt|contact|o-nas|about/i.test(u.pathname);
      } catch {
        return false;
      }
    });

    if (opts.deep && out.contactPageUrl) {
      try {
        const contact = await getHtml(out.contactPageUrl);
        if (contact.res.ok) parseContacts(contact.html, out.contactPageUrl, out);
      } catch {
        /* strona kontaktowa opcjonalna */
      }
    }
  } catch (e) {
    out.error = e instanceof Error ? (e.name === "AbortError" ? "Timeout" : e.message) : String(e);
  }
  return out;
}

export type PageSpeed = { performance?: number; seo?: number; accessibility?: number; bestPractices?: number };

/** Google PageSpeed Insights (Lighthouse, strategia mobile). Działa bez klucza, ale z niskim limitem. */
export async function pageSpeed(url: string): Promise<PageSpeed> {
  const params = new URLSearchParams({ url, strategy: "mobile" });
  for (const c of ["performance", "seo", "accessibility", "best-practices"]) params.append("category", c);
  if (config.pagespeedApiKey) params.set("key", config.pagespeedApiKey);
  type Resp = { lighthouseResult?: { categories?: Record<string, { score: number | null }> } };
  const data = await tracked("pagespeed", "runPagespeed", () =>
    fetchJson<Resp>(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`, { timeoutMs: 60000 }),
  );
  const cat = data.lighthouseResult?.categories ?? {};
  const pct = (k: string) => (cat[k]?.score != null ? Math.round(cat[k].score! * 100) : undefined);
  return {
    performance: pct("performance"),
    seo: pct("seo"),
    accessibility: pct("accessibility"),
    bestPractices: pct("best-practices"),
  };
}
