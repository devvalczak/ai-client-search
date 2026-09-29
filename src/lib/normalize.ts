export type Socials = {
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  tiktok?: string;
  youtube?: string;
  x?: string;
  /** Profile na platformach (Booksy, ZnanyLekarz, Linktree...) */
  platforms?: string[];
};

const SOCIAL_HOSTS: Record<Exclude<keyof Socials, "platforms">, RegExp> = {
  facebook: /(^|\.)(facebook\.com|fb\.com|fb\.me)$/,
  instagram: /(^|\.)instagram\.com$/,
  linkedin: /(^|\.)linkedin\.com$/,
  tiktok: /(^|\.)tiktok\.com$/,
  youtube: /(^|\.)(youtube\.com|youtu\.be)$/,
  x: /(^|\.)(twitter\.com|x\.com)$/,
};

/**
 * Serwisy, które firmy często podają jako "stronę", choć nie jest to ich własna witryna.
 * Wystąpienie ich zamiast domeny to mocny sygnał, że firma potrzebuje prawdziwej strony.
 */
const PLATFORM_HOSTS = [
  /(^|\.)business\.site$/, // Google Business Profile websites (wyłączone w 2024)
  /(^|\.)sites\.google\.com$/,
  /(^|\.)linktr\.ee$/,
  /(^|\.)booksy\.com$/,
  /(^|\.)znanylekarz\.pl$/,
  /(^|\.)doctolib\./,
  /(^|\.)allegro\.pl$/,
  /(^|\.)olx\.pl$/,
  /(^|\.)etsy\.com$/,
  /(^|\.)fresha\.com$/,
  /(^|\.)treatwell\./,
  /(^|\.)pyszne\.pl$/,
  /(^|\.)ubereats\.com$/,
  /(^|\.)wolt\.com$/,
  /(^|\.)oferteo\.pl$/,
  /(^|\.)fixly\.pl$/,
  /(^|\.)panoramafirm\.pl$/,
  /(^|\.)pkt\.pl$/,
  /(^|\.)wa\.me$/,
  /(^|\.)beacons\.ai$/,
];

export function toUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
}

export function hostOf(raw: string | null | undefined): string | null {
  const url = toUrl(raw);
  return url ? url.hostname.toLowerCase().replace(/^www\./, "") : null;
}

export function socialKind(raw: string): Exclude<keyof Socials, "platforms"> | null {
  const host = hostOf(raw);
  if (!host) return null;
  for (const [kind, re] of Object.entries(SOCIAL_HOSTS)) {
    if (re.test(host)) return kind as Exclude<keyof Socials, "platforms">;
  }
  return null;
}

export function isPlatformUrl(raw: string): boolean {
  const host = hostOf(raw);
  return !!host && PLATFORM_HOSTS.some((re) => re.test(host));
}

export type ClassifiedWebsite = {
  /** Własna domena firmy (null jeśli brak lub to tylko social/platforma) */
  website: string | null;
  domain: string | null;
  socials: Socials;
  /** Firma podała social/platformę zamiast własnej strony */
  websiteIsProfileOnly: boolean;
};

/** Rozdziela "stronę" podaną przez źródło na własną domenę vs profil social/platformy. */
export function classifyWebsite(raw: string | null | undefined, socials: Socials = {}): ClassifiedWebsite {
  const out: Socials = { ...socials, platforms: [...(socials.platforms ?? [])] };
  const url = toUrl(raw);
  if (!url) return { website: null, domain: null, socials: out, websiteIsProfileOnly: false };
  const href = url.toString();
  const kind = socialKind(href);
  if (kind) {
    out[kind] ??= href;
    return { website: null, domain: null, socials: out, websiteIsProfileOnly: true };
  }
  if (isPlatformUrl(href)) {
    if (!out.platforms!.includes(href)) out.platforms!.push(href);
    return { website: null, domain: null, socials: out, websiteIsProfileOnly: true };
  }
  return { website: href, domain: hostOf(href), socials: out, websiteIsProfileOnly: false };
}

export function mergeSocials(a: Socials, b: Socials): Socials {
  const out: Socials = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (k === "platforms") continue;
    if (v && !out[k as keyof Omit<Socials, "platforms">]) (out as Record<string, unknown>)[k] = v;
  }
  const platforms = [...new Set([...(a.platforms ?? []), ...(b.platforms ?? [])])];
  if (platforms.length) out.platforms = platforms;
  return out;
}

export function hasAnySocial(s: Socials): boolean {
  return !!(s.facebook || s.instagram || s.linkedin || s.tiktok || s.youtube || s.x);
}

const LEGAL_FORMS =
  /\b(sp\.?\s*z\.?\s*o\.?\s*o\.?|spółka z ograniczoną odpowiedzialnością|s\.?\s*a\.?|sp\.?\s*j\.?|sp\.?\s*k\.?|s\.?\s*c\.?|spółka cywilna|spółka jawna|spółka komandytowa|ltd\.?|llc|gmbh|inc\.?)\b/gi;

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(LEGAL_FORMS, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeCity(city: string | null | undefined): string | null {
  if (!city) return null;
  const c = city.trim();
  return c ? c.charAt(0).toUpperCase() + c.slice(1) : null;
}

export function normalizeNip(nip: string | null | undefined): string | null {
  if (!nip) return null;
  const digits = nip.replace(/\D/g, "");
  if (digits.length !== 10) return null;
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = w.reduce((acc, weight, i) => acc + weight * Number(digits[i]), 0);
  return sum % 11 === Number(digits[9]) ? digits : null;
}

export function normalizeKrs(krs: string | null | undefined): string | null {
  if (!krs) return null;
  const digits = krs.replace(/\D/g, "");
  return digits.length > 0 && digits.length <= 10 ? digits.padStart(10, "0") : null;
}

export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, "");
  return digits.length >= 7 ? digits : null;
}
