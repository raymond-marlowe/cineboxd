/** Letterboxd username validation helpers and canonical URL builders. */

const LB_USERNAME_RE = /^[a-z0-9_]+$/;

export function normaliseLbUsername(s: string): string {
  return s.toLowerCase();
}

/** Returns true if `s` is a valid, normalised (lowercase) Letterboxd username. */
export function isValidLbUsername(s: string): boolean {
  return s.length > 0 && LB_USERNAME_RE.test(s);
}

type SearchParamsLike =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

function toSearchParams(input: SearchParamsLike): URLSearchParams {
  if (input instanceof URLSearchParams) return input;
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "string" && v.length) out.set(k, v);
    else if (Array.isArray(v)) {
      // Preserve multi-values as repeated keys
      for (const item of v) if (item) out.append(k, item);
    }
  }
  return out;
}

/**
 * Serialise query params while excluding identity params that are now in the path.
 * (We keep everything else so share links round-trip UI state.)
 */
const IDENTITY_KEYS = new Set(["user", "users", "list"]);

export function buildSoloUrl(
  username: string,
  searchParams?: SearchParamsLike
): string {
  const user = normaliseLbUsername(username);
  if (!isValidLbUsername(user)) throw new Error(`Invalid Letterboxd username: ${username}`);

  const qs = buildExtra(searchParams);
  return `/u/${user}${qs ? `?${qs}` : ""}`;
}

export function buildTogetherUrl(
  usernames: string[],
  searchParams?: SearchParamsLike
): string {
  if (usernames.length < 2 || usernames.length > 5) {
    throw new Error(`Together mode requires 2–5 usernames (got ${usernames.length})`);
  }

  const users = usernames.map(normaliseLbUsername);
  for (const u of users) {
    if (!isValidLbUsername(u)) throw new Error(`Invalid Letterboxd username: ${u}`);
  }

  const qs = buildExtra(searchParams);
  return `/t/${users.join("+")}${qs ? `?${qs}` : ""}`;
}

function buildExtra(searchParams?: SearchParamsLike): string {
  if (!searchParams) return "";
  const src = toSearchParams(searchParams);
  const out = new URLSearchParams();

  for (const [k, v] of src.entries()) {
    if (IDENTITY_KEYS.has(k)) continue;
    // Keep everything else (UI state)
    out.append(k, v);
  }

  return out.toString();
}
