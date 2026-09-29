import type { LeadStatus } from "@/lib/statuses";

export const SERVICES = {
  wizytowka: "Strona-wizytówka",
  ecommerce: "Sklep internetowy",
  marketplace: "Marketplace / platforma",
  custom: "Dedykowane rozwiązanie / aplikacja",
  redesign: "Przebudowa istniejącej strony",
  seo: "SEO / pozycjonowanie",
  ads: "Kampanie reklamowe (Google/Meta)",
  social: "Prowadzenie social media",
  booking: "System rezerwacji online",
} as const;

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Nowy",
  to_contact: "Do kontaktu",
  contacted: "Wysłano kontakt",
  in_talks: "W rozmowach",
  offer: "Oferta wysłana",
  won: "Wygrany",
  lost: "Przegrany",
  rejected: "Odrzucony",
};

export const STATUS_COLORS: Record<LeadStatus, string> = {
  new: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  to_contact: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
  contacted: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200",
  in_talks: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  offer: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200",
  won: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  lost: "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200",
  rejected: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export const SOURCE_LABELS: Record<string, string> = {
  places: "Google Maps",
  osm: "OpenStreetMap",
  gemini: "Gemini + Google",
  ceidg: "CEIDG (nowe firmy)",
};

export const CONTACT_SOURCE_LABELS: Record<string, string> = {
  website: "strona www",
  ceidg: "CEIDG",
  krs: "KRS",
  gemini: "Gemini",
  manual: "ręcznie",
};
