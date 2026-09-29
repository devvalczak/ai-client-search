# Lead Finder: wyszukiwarka klientów dla agencji web / SEO

Aplikacja wyszukuje firmy, JDG i startupy, które mogą potrzebować strony, sklepu, dedykowanego rozwiązania albo marketingu.
Ocenia, **na ile procent** potrzebują usług agencji, a po kliknięciu pogłębia dane przez Gemini z Google Search
(opis działalności, strona, adres, **osoby kontaktowe ze źródłami**). Leady mają statusy, notatki i follow-upy.
Te, które trafiły do procesowanych lub zostały odrzucone, nie pojawiają się ponownie w kolejnych wyszukiwaniach.

Stack: Next.js 16 (App Router) + TypeScript + SQLite (better-sqlite3 + Drizzle) + Tailwind 4 + `@google/genai`.

## Start

```bash
npm install
cp .env.example .env.local   # uzupełnij klucze
npm run dev                  # http://localhost:3000
```

Baza (`data/app.db`) i migracje tworzą się automatycznie przy starcie. Po zmianie `src/lib/db/schema.ts` uruchom `npm run db:generate`.

Testy: `npm test`. Lint: `npm run lint`.

## Jak to działa

```
Wyszukiwanie ─► Normalizacja + deduplikacja ─► Szybka analiza strony ─► Ocena % ─► (klik) Pogłębienie ─► CRM
```

### Źródła wyszukiwania
| Źródło | Klucz | Do czego |
|---|---|---|
| Google Places API (New) | `GOOGLE_API_KEY` | Najlepsze dane lokalne: strona, telefon, liczba opinii. Płatne ponad darmowy limit |
| OpenStreetMap (Nominatim + Overpass) | – | Darmowe. Brak tagu `website` jest traktowany jako sygnał *niepewny* |
| Gemini + Google Search | `GEMINI_API_KEY` | Zapytania opisowe, np. „marki odzieżowe sprzedające tylko na IG” |
| CEIDG (nowe JDG) | `CEIDG_API_TOKEN` | Świeżo zarejestrowane firmy (filtr PKD + ostatnie N dni). Zwykle jeszcze bez strony |

### Deduplikacja
Kolejność dopasowania: NIP → Google Place ID → OSM ID → CEIDG ID → domena → telefon → znormalizowana nazwa + miasto
(bez form prawnych i polskich znaków). Dane z różnych źródeł się scalają.

### Ocena (0–100%)
Hybryda, żeby wynik był powtarzalny i dało się go wytłumaczyć:
1. **Twarde sygnały** liczone w kodzie (`src/lib/scoring.ts`): brak strony; FB/IG/Booksy/Linktree zamiast strony;
   strona nie działa; brak HTTPS; brak viewportu (nie jest mobilna); stary rok ©; prosty kreator (Wix, Jimdo…);
   niski PageSpeed/SEO; brak analityki; dużo opinii (firma z budżetem); świeża rejestracja; sprzedaż przez social
   media lub marketplace bez własnego sklepu; nowoczesna, szybka strona (punkty ujemne).
2. **Korekta AI** (±20) z uzasadnieniem, po pogłębieniu danych.

Wagi edytujesz w **Ustawieniach**. Po zapisaniu wszystkie leady są przeliczane. W widoku leada widać rozbicie punktów.

### Pogłębienie danych (klik w lead)
Przy pierwszym otwarciu uruchamia się automatycznie, później przyciskiem „Odśwież”:
1. Analiza strony + podstrony kontaktowej: e-maile, telefony, NIP, KRS, social media, kreator, rok ©.
2. PageSpeed Insights (mobile).
3. GUS REGON i CEIDG po NIP (właściciel JDG).
4. Gemini + Google Search: opis, usługi, osoby decyzyjne, rekomendowane usługi i pitch. Każdy kontakt
   ma zapisany URL źródła, a model ma zakaz zgadywania danych.
5. KRS: skład zarządu (nazwiska są maskowane w otwartym API, pełne dane da się uzupełnić z Gemini).

W widoku leada jest też **generator pierwszej wiadomości** (e-mail, LinkedIn, skrypt rozmowy) oparty na znalezionych problemach.

### Pozostałe
- Historia wyszukiwań z listą wyników.
- Eksport CSV (z BOM i średnikami, żeby Excel otwierał polskie znaki).
- Licznik wywołań API (Ustawienia): kontrola kosztów Places i Gemini.
- Kolumna `assigned_to` i `notes.author` są przygotowane pod pracę zespołową i logowanie.

## Znane ograniczenia / do weryfikacji
- **CEIDG v3**: mapowanie parametrów i pól (`firmy[]`, `wlasciciel`, `adresDzialalnosci`, `dataod`, `pkd`…) powstało
  na podstawie publicznych opisów dokumentacji. Nie było jak przetestować go na żywo, bo środowisko, w którym powstał
  kod, nie miało dostępu do API. Przy pustej odpowiedzi surowy JSON trafia do logu serwera.
- **GUS REGON / KRS**: zaimplementowane wg dokumentacji, nietestowane na żywo z tego samego powodu.
- **Google Places / Gemini / OSM**: nietestowane na żywo (brak kluczy i dostępu sieciowego w środowisku budowania).
  Logika przetwarzania ich wyników jest pokryta testami.
- Grounding Gemini nie zawsze zwraca czysty JSON, więc parser szuka pierwszego bloku JSON w odpowiedzi.

## RODO / prawo
Aplikacja zbiera dane osób (imię, nazwisko, e-mail, telefon) z publicznych źródeł. Przetwarzanie w celach B2B
zwykle opiera się na prawnie uzasadnionym interesie (obowiązek informacyjny!). Od 2024 r. Prawo komunikacji
elektronicznej wymaga **uprzedniej zgody** na przesyłanie informacji handlowej e-mailem lub telefonem, także do firm.
Skonsultuj proces z prawnikiem. Aplikacja zapisuje źródło każdego kontaktu, co ułatwia rozliczalność.
