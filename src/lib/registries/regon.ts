import "server-only";
import { config } from "@/lib/config";
import { fetchWithTimeout, tracked } from "@/lib/http";

/**
 * GUS REGON – usługa BIR1 (SOAP 1.2 + WS-Addressing). Klucz bezpłatny po rejestracji w GUS.
 * Środowisko testowe: REGON_TEST=1 (publiczny klucz testowy: abcde12345abcde12345).
 */

const PROD = "https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc";
const TEST = "https://wyszukiwarkaregontest.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc";
const NS = "http://CIS/BIR/PUBL/2014/07";

export type RegonData = {
  regon?: string;
  nip?: string;
  name?: string;
  city?: string;
  address?: string;
  voivodeship?: string;
  type?: string;
  endedAt?: string;
};

function envelope(url: string, action: string, body: string) {
  return `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="${NS}" xmlns:dat="${NS}/DataContract">
<soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing"><wsa:To>${url}</wsa:To><wsa:Action>${NS}/IUslugaBIRzewnPubl/${action}</wsa:Action></soap:Header>
<soap:Body>${body}</soap:Body></soap:Envelope>`;
}

async function call(action: string, body: string, sid?: string): Promise<string> {
  const url = config.regonTest ? TEST : PROD;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/soap+xml; charset=utf-8", ...(sid ? { sid } : {}) },
    body: envelope(url, action, body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`REGON ${action}: HTTP ${res.status}`);
  const m = text.match(new RegExp(`<${action}Result>([\\s\\S]*?)</${action}Result>`));
  return m ? m[1] : "";
}

function decodeXml(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#xD;/g, "")
    .replace(/&amp;/g, "&");
}

function tag(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  const v = m?.[1]?.trim();
  return v ? decodeXml(v) : undefined;
}

export async function regonByNip(nip: string): Promise<RegonData | null> {
  const key = config.regonTest ? config.regonApiKey || "abcde12345abcde12345" : config.regonApiKey;
  if (!key) throw new Error("Brak REGON_API_KEY.");
  return tracked("regon", "szukaj_nip", async () => {
    const sid = await call("Zaloguj", `<ns:Zaloguj><ns:pKluczUzytkownika>${key}</ns:pKluczUzytkownika></ns:Zaloguj>`);
    if (!sid) throw new Error("REGON: logowanie nieudane (sprawdź klucz).");
    try {
      const raw = await call(
        "DaneSzukajPodmioty",
        `<ns:DaneSzukajPodmioty><ns:pParametryWyszukiwania><dat:Nip>${nip}</dat:Nip></ns:pParametryWyszukiwania></ns:DaneSzukajPodmioty>`,
        sid,
      );
      const xml = decodeXml(raw);
      const dane = xml.match(/<dane>([\s\S]*?)<\/dane>/)?.[1];
      if (!dane || tag(dane, "ErrorCode")) return null;
      const street = [tag(dane, "Ulica"), tag(dane, "NrNieruchomosci"), tag(dane, "NrLokalu") ? `/${tag(dane, "NrLokalu")}` : ""]
        .filter(Boolean)
        .join(" ");
      return {
        regon: tag(dane, "Regon"),
        nip: tag(dane, "Nip"),
        name: tag(dane, "Nazwa"),
        city: tag(dane, "Miejscowosc"),
        voivodeship: tag(dane, "Wojewodztwo"),
        address: [street, [tag(dane, "KodPocztowy"), tag(dane, "Miejscowosc")].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", "),
        type: tag(dane, "Typ"),
        endedAt: tag(dane, "DataZakonczeniaDzialalnosci"),
      };
    } finally {
      call("Wyloguj", `<ns:Wyloguj><ns:pIdentyfikatorSesji>${sid}</ns:pIdentyfikatorSesji></ns:Wyloguj>`).catch(() => {});
    }
  });
}
