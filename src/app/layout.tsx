import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import TopNav from "@/components/TopNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cineboxd",
  description:
    "Find your Letterboxd watchlist films screening at London repertory cinemas",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen flex flex-col`}
      >
        <TopNav />
        {children}
        <footer className="border-t border-border mt-auto">
          <div className="max-w-4xl mx-auto px-4 py-6 text-center flex flex-col gap-1">
            <p className="text-sm font-medium text-foreground/80">
              Screening data may be inaccurate — always check the venue before booking
            </p>
            <p className="text-xs text-foreground/85 leading-relaxed">
              <Link href="/venues" className="hover:underline">
                Supported venues
              </Link>
              <span className="mx-1.5">&middot;</span>
              <Link href="/whats-on" className="hover:underline">
                What&apos;s on
              </Link>
              <span className="mx-1.5">&middot;</span>
              <Link href="/suggest-a-cinema" className="hover:underline">
                Suggest a cinema
              </Link>
              <span className="mx-1.5">&middot;</span>
              <Link href="/faq" className="hover:underline">
                FAQ
              </Link>
              <span className="mx-1.5">&middot;</span>
              <Link href="/about" className="hover:underline">
                About
              </Link>
              <span className="mx-1.5">&middot;</span>
              <Link href="/contact" className="hover:underline">
                Contact
              </Link>
              <span className="mx-1.5">&middot;</span>
              <Link href="/status" className="hover:underline">
                Status
              </Link>
              <span className="mx-1.5">&middot;</span>
              <Link href="/terms" className="hover:underline">
                Terms
              </Link>
              <span className="mx-1.5">&middot;</span>
              <Link href="/privacy" className="hover:underline">
                Privacy
              </Link>
            </p>
            <p className="mt-2 text-xs text-muted/90">
              Made by Alexander Nikolov
              <span className="mx-1.5">&middot;</span>
              Copyright &copy; 2026
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
