import { redirect } from "next/navigation";
import HomeContent from "@/components/HomeContent";
import { isValidLbUsername, normaliseLbUsername, buildSoloUrl, buildTogetherUrl } from "@/lib/urls";

// Back-compat: redirect old query-based URLs to canonical path URLs.
// ?user=alice         → /u/alice
// ?users=alice,bob    → /t/alice+bob
// Extra params (view, venue, …) are preserved in the redirect.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  const userParam = typeof sp.user === "string" ? sp.user.trim() : undefined;
  const usersParam = typeof sp.users === "string" ? sp.users.trim() : undefined;

  if (userParam) {
    const normalised = normaliseLbUsername(userParam);
    if (isValidLbUsername(normalised)) {
      redirect(buildSoloUrl(normalised, sp));
    }
    // Invalid username — fall through to the normal home page (will show input)
  }

  if (usersParam) {
    const parts = usersParam
      .split(",")
      .map((u) => normaliseLbUsername(u.trim()))
      .filter(Boolean);
    if (parts.length >= 2 && parts.length <= 5 && parts.every(isValidLbUsername)) {
      redirect(buildTogetherUrl(parts, sp));
    }
    // Bad usernames — fall through
  }

  return <HomeContent />;
}
