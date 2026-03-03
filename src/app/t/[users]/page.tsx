import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { isValidLbUsername, normaliseLbUsername } from "@/lib/urls";
import HomeContent from "@/components/HomeContent";

function parseUsers(raw: string): string[] | null {
  // Next may pass dynamic segments percent-encoded (e.g. "%2C" for ",")
  const decoded = decodeURIComponent(raw);

  // Accept comma (canonical), plus, or whitespace
  const parts = decoded
    .split(/[,+\s]+/)
    .map((u) => normaliseLbUsername(u.trim()))
    .filter(Boolean);

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
    title: parsed ? `${parsed.join(" + ")} — Cineboxd` : "Watch together — Cineboxd",
  };
}

export default async function TogetherPage({
  params,
}: {
  params: Promise<{ users: string }>;
}) {
  const { users } = await params;

  const parsed = parseUsers(users);
  if (!parsed) notFound();

  // Canonical form uses comma
  const canonical = parsed.join(",");

  // Normalise decoded raw: treat "+" and whitespace as comma so redirect fires once
  const decodedUsers = decodeURIComponent(users);
  const normRaw = decodedUsers.replace(/[+\s]+/g, ",");
  if (normRaw !== canonical) {
    redirect(`/t/${canonical}`);
  }

  return <HomeContent initialUsernames={parsed} />;
}