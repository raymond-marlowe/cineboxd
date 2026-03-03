import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { isValidLbUsername, normaliseLbUsername } from "@/lib/urls";
import HomeContent from "@/components/HomeContent";

function parseUsers(raw: string): string[] | null {
  const parts = raw.split("+").map((u) => normaliseLbUsername(u.trim()));
  if (parts.length < 2 || parts.length > 5) return null;
  if (!parts.every(isValidLbUsername)) return null;
  return parts;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ users: string }>;
}): Promise<Metadata> {
  const { users } = await params;
  const parsed = parseUsers(users);
  return {
    title: parsed
      ? `${parsed.join(" + ")} — Cineboxd`
      : "Watch together — Cineboxd",
  };
}

export default async function TogetherPage({
  params,
}: {
  params: Promise<{ users: string }>;
}) {
  const { users } = await params;
  const parsed = parseUsers(users);

  if (!parsed) {
    notFound();
  }

  // Canonicalise: lowercase and normalised separator
  const canonical = parsed.join("+");
  if (users !== canonical) {
    redirect(`/t/${canonical}`);
  }

  return <HomeContent initialUsernames={parsed} />;
}
