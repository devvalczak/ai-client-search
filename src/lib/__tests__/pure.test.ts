import { describe, expect, it } from "vitest";
import { extractJson } from "@/lib/json";
import { classifyWebsite, normalizeKrs, normalizeName, normalizeNip } from "@/lib/normalize";
import { computeScore, DEFAULT_WEIGHTS } from "@/lib/scoring";

const NOW = new Date("2026-09-29");

describe("classifyWebsite", () => {
  it("rozpoznaje Facebooka jako profil, nie stronę", () => {
    const r = classifyWebsite("https://www.facebook.com/salonanna");
    expect(r.website).toBeNull();
    expect(r.websiteIsProfileOnly).toBe(true);
    expect(r.socials.facebook).toContain("facebook.com/salonanna");
  });
  it("rozpoznaje Booksy jako platformę", () => {
    const r = classifyWebsite("booksy.com/pl-pl/123_salon");
    expect(r.websiteIsProfileOnly).toBe(true);
    expect(r.socials.platforms?.[0]).toContain("booksy.com");
  });
  it("zostawia własną domenę", () => {
    const r = classifyWebsite("http://www.firma.pl/o-nas");
    expect(r.domain).toBe("firma.pl");
    expect(r.websiteIsProfileOnly).toBe(false);
  });
});

describe("normalizacja", () => {
  it("waliduje sumę kontrolną NIP", () => {
    expect(normalizeNip("526-104-08-28")).toBe("5261040828");
    expect(normalizeNip("5261040827")).toBeNull();
  });
  it("uzupełnia KRS do 10 cyfr", () => {
    expect(normalizeKrs("19193")).toBe("0000019193");
  });
  it("usuwa formę prawną i polskie znaki z nazwy", () => {
    expect(normalizeName("Łódzka Piekarnia Sp. z o.o.")).toBe("lodzka piekarnia");
  });
});

describe("computeScore", () => {
  it("brak strony + aktywny social + opinie = wysoka ocena", () => {
    const { score } = computeScore({ websiteState: "none", websiteCertain: true, hasSocials: true, reviewCount: 120 }, DEFAULT_WEIGHTS, NOW);
    expect(score).toBe(20 + 35 + 10 + 8);
  });
  it("niepewny brak strony (OSM) daje mniej punktów", () => {
    const certain = computeScore({ websiteState: "none", websiteCertain: true }, DEFAULT_WEIGHTS, NOW).score;
    const uncertain = computeScore({ websiteState: "none", websiteCertain: false }, DEFAULT_WEIGHTS, NOW).score;
    expect(uncertain).toBeLessThan(certain);
  });
  it("nowoczesna szybka strona obniża ocenę", () => {
    const { score, breakdown } = computeScore(
      { websiteState: "own", https: true, mobileFriendly: true, pagespeedPerformance: 95, pagespeedSeo: 100, hasAnalytics: true, hasMetaDescription: true, copyrightYear: 2026 },
      DEFAULT_WEIGHTS,
      NOW,
    );
    expect(breakdown.some((b) => b.key === "modernSiteGood")).toBe(true);
    expect(score).toBe(5);
  });
  it("stara strona na Wixie bez HTTPS", () => {
    const { breakdown } = computeScore({ websiteState: "own", https: false, mobileFriendly: false, copyrightYear: 2018, builder: "Wix" }, DEFAULT_WEIGHTS, NOW);
    expect(breakdown.map((b) => b.key)).toEqual(expect.arrayContaining(["noHttps", "notMobileFriendly", "copyrightOld5", "siteBuilder"]));
  });
  it("zamknięta firma = 0", () => {
    expect(computeScore({ businessClosed: true, websiteState: "none" }, DEFAULT_WEIGHTS, NOW).score).toBe(0);
  });
  it("korekta AI jest ograniczona do ±20 a wynik do 0–100", () => {
    const r = computeScore({ websiteState: "none", hasSocials: true, reviewCount: 99, foundedAt: "2026-08-01", aiAdjustment: 80 }, DEFAULT_WEIGHTS, NOW);
    expect(r.breakdown.find((b) => b.key === "ai")?.points).toBe(20);
    expect(r.score).toBe(100);
  });
});

describe("extractJson", () => {
  it("wyciąga JSON z bloku markdown i tekstu wokół", () => {
    expect(extractJson<{ a: number }>('Oto wynik:\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(extractJson<{ b: number[] }>('Proszę: {"b":[1,2]} dzięki')).toEqual({ b: [1, 2] });
  });
});
