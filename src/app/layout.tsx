import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
        {children}
        <footer className="border-t border-border mt-auto">
          <div className="max-w-4xl mx-auto px-4 py-6 text-center text-sm text-muted">
            <p>
              Made by Alexander Nikolov{" "}
              <span className="mx-1">&middot;</span>{" "}
              <a href="/about" className="text-accent hover:underline">
                About
              </a>{" "}
              <span className="mx-1">&middot;</span>{" "}
              Screening data may be inaccurate — always check the venue before
              booking
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
