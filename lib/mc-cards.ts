/**
 * MC cards (master plan T4): one card per competitor in run order, with the name as the player says it,
 * how they want to be introduced, and their sponsor. Pure; /api/staff/mc-cards feeds it.
 *
 * The announcer speaks to the room, so a card follows the public-name rules (lib/display-name.ts): a minor
 * whose guardian hasn't opted them into public listing is named by handle or first name + last initial,
 * gets no location, and no pronunciation (it would spell out the surname).
 */
import type { DisplayNameParts } from './display-name';

export interface McCardRow extends DisplayNameParts {
  position: number;
  status: 'upcoming' | 'performing' | 'done';
  city?: string | null;
  state?: string | null;
  club_affiliation?: string | null;
  name_pronunciation?: string | null;
  intro_note?: string | null;
  sponsor_name?: string | null;
}

export interface McCard {
  position: number;
  status: McCardRow['status'];
  /** What to read aloud */
  name: string;
  /** How to say it, as the player typed it; null when not given or withheld for privacy */
  say_as: string | null;
  intro: string | null;
  sponsor: string | null;
  club: string | null;
  from: string | null;
  /** The name is the short public form: do not add a surname */
  restricted: boolean;
}

const orNull = (v?: string | null): string | null => {
  const t = (v ?? '').trim();
  return t ? t : null;
};

/** The naming rules from lib/display-name.ts, passed in so this file imports nothing at run time (plain-Node tests). */
export interface NameRules {
  isNameRestricted: (parts: DisplayNameParts) => boolean;
  publicDisplayName: (parts: DisplayNameParts) => string;
}

export function buildMcCards(rows: McCardRow[], rules: NameRules): McCard[] {
  return [...rows]
    .sort((a, b) => a.position - b.position)
    .map((r) => {
      const restricted = rules.isNameRestricted(r);
      const from = restricted ? null : [orNull(r.city), orNull(r.state)].filter(Boolean).join(', ') || null;
      return {
        position: r.position,
        status: r.status,
        name: rules.publicDisplayName(r),
        say_as: restricted ? null : orNull(r.name_pronunciation),
        intro: orNull(r.intro_note),
        sponsor: orNull(r.sponsor_name),
        club: orNull(r.club_affiliation),
        from,
        restricted,
      };
    });
}
