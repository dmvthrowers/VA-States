/**
 * Display-name rules for competitor-facing surfaces.
 *
 * Two audiences:
 *   - Staff (authenticated judges, DJ/audio, admin) always see the full legal
 *     name so they can match a performer to registration and music files.
 *   - The public sees the legal name only when the competitor is an adult, or
 *     a minor whose parent/guardian has opted them into public listing.
 *
 * Minors register with `is_public = false` and `nickname = null` (see
 * app/api/register/route.ts) — a guardian can email in afterwards to enable a
 * public listing, which flips `is_public`.
 */

export interface DisplayNameParts {
  first_name?: string | null;
  last_name?: string | null;
  preferred_bracket_name?: string | null;
  nickname?: string | null;
  is_minor?: boolean | null;
  is_public?: boolean | null;
}

const clean = (value?: string | null): string => (value ?? '').trim();

/** The chosen handle, if any: nickname wins, then the bracket display name. */
const handleOf = (parts: DisplayNameParts): string =>
  clean(parts.nickname) || clean(parts.preferred_bracket_name);

export function legalName(parts: DisplayNameParts): string {
  return [clean(parts.first_name), clean(parts.last_name)].filter(Boolean).join(' ');
}

/**
 * Handle first, legal name in parentheses — "Brandito (Brandon Rogers)".
 * Falls back to whichever half exists, and never renders "Name (Name)".
 */
export function handleWithLegalName(parts: DisplayNameParts): string {
  const legal = legalName(parts);
  const handle = handleOf(parts);

  if (!handle) return legal || 'Unnamed competitor';
  if (!legal || handle.toLowerCase() === legal.toLowerCase()) return handle;
  return `${handle} (${legal})`;
}

/**
 * Privacy-restricted form: the handle alone if they picked one, otherwise
 * first name + last initial. Never exposes a full legal name.
 */
export function restrictedDisplayName(parts: DisplayNameParts): string {
  // A "handle" that is just their legal name (e.g. a bracket name typed as "Sam Rivera")
  // must not leak it, so it doesn't count. Matches the vsyc_results view's rule.
  const handle = handleOf(parts);
  if (handle && handle.toLowerCase() !== legalName(parts).toLowerCase()) return handle;

  const first = clean(parts.first_name);
  const lastInitial = clean(parts.last_name).charAt(0);
  if (first && lastInitial) return `${first} ${lastInitial}.`;
  return first || 'Junior competitor';
}

/** True when this registrant's legal name must not appear on a public surface. */
export function isNameRestricted(parts: DisplayNameParts): boolean {
  return Boolean(parts.is_minor) && !parts.is_public;
}

/** Public board name — minors keep their legal name off the page by default. */
export function publicDisplayName(parts: DisplayNameParts): string {
  return isNameRestricted(parts) ? restrictedDisplayName(parts) : handleWithLegalName(parts);
}

/**
 * Run order name for a given viewer. Staff see everyone in full; the public
 * sees restricted names for minors who have not opted in.
 */
export function runOrderDisplayName(parts: DisplayNameParts, viewerIsStaff: boolean): string {
  return viewerIsStaff ? handleWithLegalName(parts) : publicDisplayName(parts);
}
