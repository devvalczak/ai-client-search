import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lead Finder – wyszukiwarka klientów",
  description: "Wyszukiwanie i ocena potencjalnych klientów dla agencji SEO / web",
};

const NAV = [
  { href: "/", label: "Wyszukiwarka" },
  { href: "/leads", label: "Leady" },
  { href: "/searches", label: "Historia" },
  { href: "/settings", label: "Ustawienia" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pl" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
          <nav className="mx-auto flex max-w-7xl items-center gap-1 px-4 py-3">
            <Link href="/" className="mr-4 font-semibold tracking-tight">
              🎯 Lead Finder
            </Link>
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="btn-ghost">
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
