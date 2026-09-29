/**
 * Ocena "na ile procent dana działalność potrzebuje naszych usług".
 *
 * Wynik = punkt bazowy + suma twardych sygnałów (liczonych deterministycznie z danych)
 * + korekta AI (Gemini, w zakresie ±MAX_AI_ADJUSTMENT) po pogłębieniu danych.
 * Każdy składnik trafia do `breakdown`, żeby w UI było widać, skąd wziął się wynik.
 */

export type WebsiteState = "none" | "profile_only" | "unreachable" | "own";

export type Signals = {
  websiteState?: WebsiteState;
  /** false gdy brak strony wynika np. tylko z braku tagu w OSM (niepewne) */
  websiteCertain?: boolean;
  hasSocials?: boolean;
  https?: boolean;
  mobileFriendly?: boolean;
  copyrightYear?: number;
  builder?: string;
  ecommercePlatform?: string;
  hasAnalytics?: boolean;
  hasMetaDescription?: boolean;
  pagespeedPerformance?: number;
  pagespeedSeo?: number;
  reviewCount?: number;
  rating?: number;
  businessClosed?: boolean;
  foundedAt?: string;
  sellsOnMarketplaces?: boolean;
  aiAdjustment?: number;
};

export type ScoreItem = { key: string; label: string; points: number };

export const MAX_AI_ADJUSTMENT = 20;

export const DEFAULT_WEIGHTS = {
  base: 20,
  noWebsite: 35,
  noWebsiteUncertain: 15,
  profileOnly: 30,
  unreachable: 30,
  activeOnSocials: 10,
  noHttps: 10,
  notMobileFriendly: 12,
  copyrightOld3: 8,
  copyrightOld5: 12,
  siteBuilder: 8,
  pagespeedPoor: 10,
  pagespeedMedium: 5,
  seoPoor: 6,
  noAnalytics: 5,
  noMetaDescription: 4,
  manyReviews: 8,
  someReviews: 4,
  newBusiness6m: 15,
  newBusiness24m: 6,
  sellsOnMarketplaces: 8,
  modernSiteGood: -15,
} as const;

export type Weights = { [K in keyof typeof DEFAULT_WEIGHTS]: number };

export const WEIGHT_LABELS: Record<keyof Weights, string> = {
  base: "Punkt bazowy",
  noWebsite: "Brak strony internetowej",
  noWebsiteUncertain: "Brak strony w danych źródła (niepewne)",
  profileOnly: "Zamiast strony tylko social media / profil na platformie",
  unreachable: "Strona nie działa",
  activeOnSocials: "Aktywni w social media, ale bez własnej strony",
  noHttps: "Brak HTTPS",
  notMobileFriendly: "Strona nieprzystosowana do telefonów",
  copyrightOld3: "Strona nieaktualizowana od 3+ lat",
  copyrightOld5: "Strona nieaktualizowana od 5+ lat",
  siteBuilder: "Strona na prostym kreatorze (Wix, Jimdo...)",
  pagespeedPoor: "Bardzo wolna strona (PageSpeed < 50)",
  pagespeedMedium: "Przeciętna wydajność (PageSpeed 50–79)",
  seoPoor: "Słabe podstawy SEO (Lighthouse SEO < 80)",
  noAnalytics: "Brak analityki / pikseli reklamowych",
  noMetaDescription: "Brak meta description",
  manyReviews: "Dużo opinii (50+) – firma z klientami i budżetem",
  someReviews: "Kilkanaście+ opinii (10–49)",
  newBusiness6m: "Nowa firma (< 6 mies.)",
  newBusiness24m: "Młoda firma (< 2 lata)",
  sellsOnMarketplaces: "Sprzedaje przez social/marketplace bez własnego sklepu",
  modernSiteGood: "Nowoczesna, szybka strona (mniejsza potrzeba)",
};

const SIMPLE_BUILDERS = ["wix", "jimdo", "weebly", "strikingly", "godaddy", "site123", "webnode", "mozello", "yola"];

function monthsSince(date: string, now: Date): number | null {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
}

export function computeScore(
  s: Signals,
  weights: Weights = DEFAULT_WEIGHTS,
  now: Date = new Date(),
): { score: number; breakdown: ScoreItem[] } {
  const items: ScoreItem[] = [];
  const add = (key: keyof Weights) => {
    if (weights[key]) items.push({ key, label: WEIGHT_LABELS[key], points: weights[key] });
  };

  if (s.businessClosed) {
    return { score: 0, breakdown: [{ key: "closed", label: "Firma zamknięta na stałe", points: 0 }] };
  }

  add("base");

  switch (s.websiteState) {
    case "none":
      add(s.websiteCertain === false ? "noWebsiteUncertain" : "noWebsite");
      if (s.hasSocials) add("activeOnSocials");
      break;
    case "profile_only":
      add("profileOnly");
      if (s.hasSocials) add("activeOnSocials");
      break;
    case "unreachable":
      add("unreachable");
      break;
    case "own": {
      if (s.https === false) add("noHttps");
      if (s.mobileFriendly === false) add("notMobileFriendly");
      if (s.copyrightYear) {
        const age = now.getFullYear() - s.copyrightYear;
        if (age >= 5) add("copyrightOld5");
        else if (age >= 3) add("copyrightOld3");
      }
      if (s.builder && SIMPLE_BUILDERS.includes(s.builder.toLowerCase())) add("siteBuilder");
      if (s.pagespeedPerformance != null) {
        if (s.pagespeedPerformance < 50) add("pagespeedPoor");
        else if (s.pagespeedPerformance < 80) add("pagespeedMedium");
      }
      if (s.pagespeedSeo != null && s.pagespeedSeo < 80) add("seoPoor");
      if (s.hasAnalytics === false) add("noAnalytics");
      if (s.hasMetaDescription === false) add("noMetaDescription");
      const looksModern =
        s.https !== false &&
        s.mobileFriendly !== false &&
        (s.pagespeedPerformance ?? 0) >= 80 &&
        (!s.copyrightYear || now.getFullYear() - s.copyrightYear <= 1);
      if (looksModern) add("modernSiteGood");
      break;
    }
  }

  if (s.reviewCount != null) {
    if (s.reviewCount >= 50) add("manyReviews");
    else if (s.reviewCount >= 10) add("someReviews");
  }

  if (s.foundedAt) {
    const m = monthsSince(s.foundedAt, now);
    if (m != null && m >= 0) {
      if (m < 6) add("newBusiness6m");
      else if (m < 24) add("newBusiness24m");
    }
  }

  if (s.sellsOnMarketplaces && !s.ecommercePlatform) add("sellsOnMarketplaces");

  if (s.aiAdjustment) {
    const adj = Math.max(-MAX_AI_ADJUSTMENT, Math.min(MAX_AI_ADJUSTMENT, Math.round(s.aiAdjustment)));
    items.push({ key: "ai", label: "Korekta AI (Gemini)", points: adj });
  }

  const raw = items.reduce((acc, i) => acc + i.points, 0);
  return { score: Math.max(0, Math.min(100, raw)), breakdown: items };
}

/** Krótkie etykiety sygnałów do wyświetlenia jako "chipy" na liście wyników. */
export function signalChips(s: Signals): { label: string; tone: "hot" | "warm" | "info" }[] {
  const chips: { label: string; tone: "hot" | "warm" | "info" }[] = [];
  if (s.businessClosed) chips.push({ label: "Zamknięta", tone: "info" });
  if (s.websiteState === "none")
    chips.push({ label: s.websiteCertain === false ? "Brak strony?" : "Brak strony", tone: "hot" });
  if (s.websiteState === "profile_only") chips.push({ label: "Tylko social/profil", tone: "hot" });
  if (s.websiteState === "unreachable") chips.push({ label: "Strona nie działa", tone: "hot" });
  if (s.https === false) chips.push({ label: "Brak HTTPS", tone: "warm" });
  if (s.mobileFriendly === false) chips.push({ label: "Nie-mobilna", tone: "warm" });
  if (s.copyrightYear && new Date().getFullYear() - s.copyrightYear >= 3)
    chips.push({ label: `© ${s.copyrightYear}`, tone: "warm" });
  if (s.builder) chips.push({ label: s.builder, tone: "info" });
  if (s.ecommercePlatform) chips.push({ label: `Sklep: ${s.ecommercePlatform}`, tone: "info" });
  if (s.pagespeedPerformance != null)
    chips.push({ label: `PageSpeed ${s.pagespeedPerformance}`, tone: s.pagespeedPerformance < 50 ? "warm" : "info" });
  if (s.hasSocials && s.websiteState !== "own") chips.push({ label: "Aktywni w social", tone: "info" });
  if (s.reviewCount) chips.push({ label: `${s.reviewCount} opinii`, tone: "info" });
  if (s.foundedAt) chips.push({ label: `Od ${s.foundedAt.slice(0, 7)}`, tone: "info" });
  return chips;
}
