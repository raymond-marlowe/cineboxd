/**
 * Robust feature-flag reader for server-side env vars.
 *
 * Accepts "true", "1", "yes", "on" (case-insensitive) as enabled.
 * Anything else — including undefined, empty string, "false", "0" — is disabled.
 * Using a Set avoids the `=== "true"` trap where "True"/"TRUE"/" true" silently fail.
 */
const TRUTHY = new Set(["true", "1", "yes", "on"]);

export function isEnabled(envKey: string): boolean {
  const raw = process.env[envKey];
  if (!raw) return false;
  return TRUTHY.has(raw.trim().toLowerCase());
}
