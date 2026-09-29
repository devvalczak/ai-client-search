import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbFile = process.env.DATABASE_PATH!;
fs.rmSync(path.dirname(dbFile), { recursive: true, force: true });

const { upsertCandidate } = await import("@/lib/leads");
const { analyzeWebsite } = await import("@/lib/website");
const { listLeads } = await import("@/lib/queries");

describe("deduplikacja i procesowane", () => {
  it("łączy ten sam podmiot z różnych źródeł (po domenie) i uzupełnia dane", () => {
    const a = upsertCandidate({ source: "osm", name: "Salon Anna", city: "Kraków", website: "https://salon-anna.pl", osmId: "node/1" });
    const b = upsertCandidate({
      source: "places",
      name: "Salon Anna - fryzjer",
      city: "Kraków",
      website: "http://www.salon-anna.pl/",
      googlePlaceId: "abc",
      reviewCount: 80,
      phone: "+48 600 100 200",
    });
    expect(a.wasNew).toBe(true);
    expect(b.wasNew).toBe(false);
    expect(b.lead.id).toBe(a.lead.id);
    expect(b.lead.googlePlaceId).toBe("abc");
    expect(b.lead.phone).toBe("+48600100200");
    expect(b.lead.reviewCount).toBe(80);
  });

  it("łączy po nazwie + mieście i oznacza procesowane jako ukryte", async () => {
    const first = upsertCandidate({ source: "gemini", name: "Kwiaciarnia Róża Sp. z o.o.", city: "gdańsk" });
    const { db, schema } = await import("@/lib/db");
    const { eq } = await import("drizzle-orm");
    db.update(schema.leads).set({ processedAt: new Date(), status: "to_contact" }).where(eq(schema.leads.id, first.lead.id)).run();
    const again = upsertCandidate({ source: "places", name: "Kwiaciarnia Róża", city: "Gdańsk", googlePlaceId: "xyz" });
    expect(again.lead.id).toBe(first.lead.id);
    expect(again.hidden).toBe(true);
    expect(listLeads({ view: "unprocessed" }).some((l) => l.id === first.lead.id)).toBe(false);
  });

  it("Facebook jako 'strona' daje stan profile_only i wysoką ocenę", () => {
    const r = upsertCandidate({ source: "places", name: "Pizzeria Bella", city: "Łódź", website: "https://facebook.com/bella", websiteCertain: true, reviewCount: 200 });
    expect(r.lead.website).toBeNull();
    expect(r.lead.signals.websiteState).toBe("profile_only");
    expect(r.lead.score).toBeGreaterThanOrEqual(60);
  });
});

describe("analyzeWebsite", () => {
  let server: http.Server;
  let base: string;
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      if (req.url === "/kontakt") {
        res.end(`<html><body><a href="mailto:biuro@firma.pl">napisz</a> Tel. <a href="tel:+48 601 222 333">zadzwoń</a>
          NIP: 526-104-08-28, KRS: 0000019193</body></html>`);
        return;
      }
      res.end(`<!doctype html><html><head><title>Firma Test</title><meta name="generator" content="Wix.com Website Builder"></head>
        <body><nav><a href="/kontakt">Kontakt</a> <a href="https://www.facebook.com/firmatest">FB</a></nav>
        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer nec odio. Praesent libero. Sed cursus ante dapibus diam.</p>
        <footer>© 2017 Firma Test</footer></body></html>`);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  it("wyciąga sygnały jakości i dane kontaktowe (także ze strony /kontakt)", async () => {
    const s = await analyzeWebsite(base + "/", { deep: true });
    expect(s.reachable).toBe(true);
    expect(s.https).toBe(false);
    expect(s.mobileFriendly).toBe(false);
    expect(s.builder).toBe("Wix");
    expect(s.copyrightYear).toBe(2017);
    expect(s.hasAnalytics).toBe(false);
    expect(s.socials.facebook).toContain("facebook.com/firmatest");
    expect(s.emails).toContain("biuro@firma.pl");
    expect(s.phones).toContain("+48601222333");
    expect(s.nips).toContain("5261040828");
    expect(s.krs).toBe("0000019193");
  });
});
