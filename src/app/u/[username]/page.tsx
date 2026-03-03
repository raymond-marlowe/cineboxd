import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { isValidLbUsername, normaliseLbUsername } from "@/lib/urls";
import HomeContent from "@/components/HomeContent";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const normalised = normaliseLbUsername(username);
  return {
    title: isValidLbUsername(normalised)
      ? `${normalised}'s watchlist — Cineboxd`
      : "Cineboxd",
  };
}

export default async function UserPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const normalised = normaliseLbUsername(username);

  if (!isValidLbUsername(normalised)) {
    notFound();
  }

  // Canonicalise: redirect uppercase / mixed-case to lowercase
  if (username !== normalised) {
    redirect(`/u/${normalised}`);
  }

  return <HomeContent initialUsername={normalised} />;
}
