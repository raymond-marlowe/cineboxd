import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import SupportCard from "@/components/SupportCard";

export const metadata: Metadata = {
  title: "About — Cineboxd",
};

export default function AboutPage() {
  return (
    <div className="flex-1">
      <main className="max-w-4xl mx-auto px-4 py-12 space-y-6">
        <h2 className="text-3xl font-semibold tracking-tight">About</h2>

        <div className="space-y-4 text-muted leading-relaxed">
          <p>
            Cineboxd is a personal project that matches your Letterboxd watchlist against upcoming screenings at London’s independent and repertory cinemas. I’m gradually expanding the list of venues, and I’d love to take it beyond London over time.
          </p>
          <p>
            It was built with Next.js, a bit of AI help, and what remains of my brain. I am a chef living in London with my wife and cat. I have been frustrated with how hard it is to figure out what is currently showing at cinemas for years, and living in the glorious future means it’s surprisingly easy to solve this kind of problem yourself. I hope anyone who visits this site finds as useful as I found it fun to make.
          </p>
        </div>

        <figure className="mx-auto max-w-md space-y-2">
          <Image
            src="/about/catgpt.png"
            alt="A relaxed cat reclining on a chair"
            width={1152}
            height={1536}
            className="w-full h-auto rounded-lg border border-border"
          />
          <figcaption className="text-center text-xs text-muted">
            This site was made with CatGPT
          </figcaption>
        </figure>

        <SupportCard />

        <Link
          href="/"
          className="inline-block text-accent hover:underline text-sm"
        >
          &larr; Back to home
        </Link>
      </main>
    </div>
  );
}
