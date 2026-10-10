/**
 * VSYC-26 contest settings: the divisions, the day-of schedule and side events, plus the
 * name/date/venue those features show. Most of the app still keeps VSYC values in place
 * (lib/pricing.ts, lib/ics.ts, ...); new features read them from here. The shape matches
 * dmvthrowers/yoyo-registration-template's contest.config.ts so its code ports straight over.
 *
 * Safe to import from both server and browser code: nothing secret belongs in this file.
 */

export const contest = {
  name: 'Virginia State Yo-Yo Contest',
  shortName: 'VSYC-26',
  nextShortName: 'VSYC-27',
  tagline: 'All ages, all levels. Free to watch.',

  date: '2026-09-19',
  startTime: '10:00',
  endTime: '19:00',
  doorsNote: 'doors open 10am',
  timeZone: 'America/New_York',

  venue: {
    name: 'Dulles Town Center',
    streetAddress: '21100 Dulles Town Cir',
    city: 'Sterling',
    region: 'VA',
    postalCode: '20166',
    country: 'US',
  },

  /**
   * Server code reads the server-only env vars first (EARLY_BIRD_CUTOFF_ISO,
   * ONLINE_REG_CUTOFF_ISO, MUSIC_DEADLINE_ISO), as lib/pricing.ts and the register routes did
   * before; browser code only sees the NEXT_PUBLIC_* ones.
   */
  deadlines: {
    earlyBird: process.env.EARLY_BIRD_CUTOFF_ISO || process.env.NEXT_PUBLIC_EARLY_BIRD_CUTOFF_ISO || '2026-06-01T00:00:00-04:00',
    onlineRegistration: process.env.ONLINE_REG_CUTOFF_ISO || process.env.NEXT_PUBLIC_ONLINE_REG_CUTOFF_ISO || '2026-09-17T23:59:59-04:00',
    musicUpload: process.env.MUSIC_DEADLINE_ISO || process.env.NEXT_PUBLIC_MUSIC_DEADLINE_ISO || '2026-09-17T23:59:59-04:00',
    compCodes: process.env.NEXT_PUBLIC_COMP_CODE_EXPIRY_ISO || '2026-09-17T23:59:59-04:00',
  },

  organizer: {
    name: 'DMV Throwers',
    url: 'https://dmvthrowers.club/',
  },

  /**
   * Home-state champion: in each division, the top finisher from this state gets this title on
   * the results page, even if they finished off the podium. Matched on the 2-letter state
   * competitors enter when they register. Set state to '' to turn it off.
   */
  stateChampion: {
    state: 'VA',
    title: 'VA State Champion',
  },

  /**
   * Prizes. `places` is how many podium places win a prize in each division (1st to Nth, ties
   * included). A division can change that with its own `prizes` (by how many entered) or turn off
   * its champion prize. The home-state champion's prize (above) is on top of the podium.
   */
  prizes: {
    places: 3,
  },

  presentedBy: {
    name: 'Goodles',
    url: '',
    logoUrl: '',
  },

  /**
   * The public "Want to sponsor?" form at /sponsor. Tiers are what you offer; the form lists them in
   * this order and the review screen at /sponsors can match a choice back to a tier. `amount` is shown
   * as written ("$500+"), so it can say "Product or service only". Set `enabled: false` to hide the form.
   * Notices go to SPONSOR_NOTICE_EMAIL, else ADMIN_ALERT_EMAIL, else contactEmail.
   * These are the defaults: staff can rename, reprice, add and remove tiers and edit the option lists on
   * /sponsors/form, and the saved copy wins. `perks` is an optional list shown under a tier.
   */
  sponsors: {
    enabled: true,
    intro: 'Thanks for wanting to support the contest. Tell us a little about you and what you have in mind, and we will get back to you.',
    /**
     * Tiers, top first. `slots` caps how many can be committed (leave it out for open tiers); the form shows
     * how many are left, counting sponsors at that tier who are committed or paid on the /sponsors screen.
     */
    tiers: [
      { id: 'diamond', label: 'Diamond', amount: '$2,000+', slots: 1 },
      { id: 'platinum', label: 'Platinum', amount: '$500+', slots: 2 },
      { id: 'gold', label: 'Gold', amount: '$250+', slots: 4 },
      { id: 'silver', label: 'Silver', amount: '$75+' },
      { id: 'bronze', label: 'Bronze', amount: '$50' },
      { id: 'in_kind', label: 'In-kind / local', amount: '$25+ in value (product, services, gift cards or food)' },
    ] as readonly { id: string; label: string; amount: string; slots?: number; perks?: readonly string[] }[],
    /** Other things someone can ask for instead of (or before choosing) a tier. [] for none. */
    otherChoices: [
      { id: 'not_sure', label: 'Not sure yet' },
      { id: 'table_only', label: 'Table purchase only' },
    ],
    contactMethods: ['Email', 'Phone call', 'Text message', 'Instagram or other social DM'],
    /** How sponsors can pay. Payment happens outside the form (an invoice or link after review); this only records what is easiest. */
    paymentMethods: ['PayPal', 'Venmo', 'Check', 'Bank transfer', 'Not sure yet'],
    heardFrom: ['Social media', 'Friend or club member', 'At an event', 'Web search', 'Other'],
  },

  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'contact@dmvthrowers.club',

  /**
   * Shade each row of the results tables by how close it is to the best score, so the gaps between
   * places show without reading every number. Off by default.
   */
  resultsShading: false,

  links: {
    home: 'https://dmvthrowers.club/vsyc26.html',
    about: 'https://dmvthrowers.club/vsyc26.html',
    schedule: 'https://dmvthrowers.club/vsyc26-schedule.html',
    rules: process.env.NEXT_PUBLIC_RULES_URL || 'https://dmvthrowers.club/vsyc26-rules.html',
    sponsors: 'https://dmvthrowers.club/vsyc26-sponsors.html',
    venue: 'https://dmvthrowers.club/vsyc26-venue.html',
    faq: 'https://dmvthrowers.club/vsyc26-faq.html',
    codeOfConduct: 'https://dmvthrowers.club/code-of-conduct.html',
    events: 'https://dmvthrowers.club/events.html',
    results: 'https://dmvthrowers.club/vsyc26-results.html',
    resources: 'https://dmvthrowers.club/resources.html',
    sourceCode: 'https://github.com/dmvthrowers/VA-States',
  },

  videos: {
    winnersPlaylist: '',
    livestream: '',
    divisions: {} as Record<string, string>,
  },

  logos: {
    small: '/logo-32.png',
    icon: '/logo-180.png',
    large: '/logo-512.png',
    alt: 'VSYC-26 logo',
  },
} as const;

// ---------------------------------------------------------------- divisions & scoring

/** A style inside a division, e.g. X Division's 2A–5A, or a kendama "ken / no ken" category. */
export interface StyleDef {
  code: string;
  label: string;
  description?: string;
  /** Freestyle only: raw clicks are multiplied by this before normalizing (1 = none). */
  multiplier?: number;
}

/**
 * "freestyle": NYYL-style sheet. A clicker tally (Technical Execution, normalized per judge to
 * techCap) + four evaluation categories (0–evalCap each) − deductions.
 */
export interface FreestyleScoring {
  format: 'freestyle';
  techCap: number;
  evalCap: number;
  /** Can a judge click below zero (misses)? */
  negativeClicks: boolean;
  /** Points per stop / discard / detach. null = no deductions. */
  deductions: { stop: number; discard: number; detach: number } | null;
}

/**
 * "manual": a judge types in a number from 0 to max — a total from a paper sheet, seconds
 * spun, catches, a speed time. With several judges, scores are averaged.
 */
export interface ManualScoring {
  format: 'manual';
  max: number;
  /** "lower" for speed runs and other timed events. Default "higher". */
  better?: 'higher' | 'lower';
  /** Shown next to the number, e.g. "seconds", "catches". Default "points". */
  unit?: string;
  /** Best of N attempts (1 = a single score). The best attempt counts. */
  attempts?: number;
}

/**
 * "panel": judges score each of your criteria (0–max each); the total is their sum and judges
 * are averaged. Use it for Artistic Performance, doubles, juggling acts, best trick.
 */
export interface PanelScoring {
  format: 'panel';
  criteria: { key: string; label: string; max: number }[];
}

/**
 * "ladder": a fixed list of tricks in order. A player gets attemptsPerTrick tries at each and
 * moves up until they miss one on every try. Rank by highest rung (ties: fewest attempts used),
 * or by points if tricks carry points.
 */
export interface LadderScoring {
  format: 'ladder';
  tricks: { name: string; points?: number }[];
  attemptsPerTrick: number;
  /** "rung" (default): stop at the first missed trick. "points": try every trick, add up points. */
  rankBy?: 'rung' | 'points';
}

/**
 * "bracket": single-elimination battles. Judges vote each match; an admin confirms the winner.
 * Byes fill the bracket to a power of two.
 */
export interface BracketScoring {
  format: 'bracket';
  /** How first-round matchups are made: random draw, or the order entrants registered. */
  seeding: 'random' | 'registration';
  thirdPlaceMatch: boolean;
  /** e.g. "30-second rounds, two rounds each" — shown to players and judges */
  matchFormat?: string;
  /**
   * Who picks each winner. "judges" (default) vote in the app. "audience": a crowd or stream
   * poll (e.g. a YouTube/Twitch chat poll); an admin enters each poll's vote counts.
   */
  decidedBy?: 'judges' | 'audience';
  /** With no third-place match: rank the two semifinal losers by their vote totals instead of tying. */
  thirdPlaceByVotes?: boolean;
  /** Extra battle rules shown to players, e.g. "Music is random", "No repeating a routine". */
  rules?: string[];
}

/** "showcase": performances in a run order, not judged (exhibitions, guest acts, kids' showcase). */
export interface ShowcaseScoring {
  format: 'showcase';
}

export type Scoring = FreestyleScoring | ManualScoring | PanelScoring | LadderScoring | BracketScoring | ShowcaseScoring;

/** Solo entries, or teams (doubles, groups, acts) where every member registers themselves. */
export type EntryDef =
  | { type: 'solo' }
  | {
      type: 'team';
      /** e.g. "Doubles", "Group", "Act" */
      label: string;
      min: number;
      max: number;
      /** "person": every member pays priceCents. "team": the captain pays once, members pay $0. */
      pricing: 'person' | 'team';
    };

/** A round, e.g. { name: 'Prelims', advance: 8 } then { name: 'Finals' }. */
export interface RoundDef {
  name: string;
  /** Stable ID for this round's music track (lowercase letters, numbers, - or _). Default: the name, e.g. "semi-final". */
  key?: string;
  /** How many move on to the next round (leave out on the last round) */
  advance?: number;
  /** Routine length in seconds for this round (e.g. 60, 90, 180). Falls back to the division's routineSeconds. */
  seconds?: number;
}

/**
 * How many rounds a division runs depends on how many entered. Tiers are checked in order and the
 * first whose `upTo` is at least the entrant count wins; leave `upTo` off the last tier to catch
 * everyone else. `rounds` names the division's rounds that run (by round key, see RoundDef.key)
 * and how many advance from each. Rounds a tier leaves out are skipped, and keep their numbers.
 * Example (1A): ≤25 → Final only; ≤50 → Prelims (top 15) + Final; more → Prelims (top 20) +
 * Semi-final (top 10) + Final. The organizer confirms the plan before it's applied.
 */
export interface RoundTier {
  upTo?: number;
  rounds: { key: string; advance?: number }[];
}

/** One music track a player uploads for a division, e.g. { key: 'battle', label: 'Battle music' }. */
export interface MusicSlotDef {
  /** Stable ID: lowercase letters, numbers, - or _ (up to 30). "main" is reserved for the single routine track. */
  key: string;
  label: string;
}

/**
 * Music a division takes, beyond plain `music: true` (one routine track for the whole division).
 * Players upload one track per slot, up front.
 */
export interface MusicConfig {
  /** Routine music. Default true; false when the division only has the extras below (e.g. a battle division). */
  routine?: boolean;
  /** One routine track per round (prelims, semi-final, final...) instead of one for the whole division. */
  perRound?: boolean;
  /** Extra tracks, e.g. battle music. */
  extra?: MusicSlotDef[];
}

export interface DivisionDef {
  /** Short, permanent ID stored in the database: letters, numbers, - or _. Never rename one in use. */
  code: string;
  name: string;
  description: string;
  /** Entry fee in cents */
  priceCents: number;
  /**
   * Does this division perform to uploaded music? true is one routine track per player; give a
   * MusicConfig for one track per round and/or extra tracks such as battle music, e.g.
   *   music: { perRound: true }                                        (prelims + final tracks)
   *   music: { extra: [{ key: 'battle', label: 'Battle music' }] }     (routine + battle)
   */
  music: boolean | MusicConfig;
  /** Optional styles. Registrants pick between min and max of them. */
  styles?: { options: StyleDef[]; min: number; max: number };
  /** Division codes this one can't be entered together with */
  cannotCombineWith?: string[];
  scoring: Scoring;
  /** Solo (default) or team entries */
  entry?: EntryDef;
  /** Rounds for freestyle, panel and manual divisions. Default: one round. */
  rounds?: RoundDef[];
  /**
   * Split a big division by age: with more than `above` entrants it can split into a younger and an
   * older bracket, each with its own podium, provided both have at least `minBracket` players (a floor only: a bracket can be as large as it needs). Age is
   * age on contest day. The organizer sees a preview and chooses the cut; the app only suggests one.
   */
  split?: { above: number; minBracket: number; labels: [string, string] };
  /** Which rounds run, by how many entered. Needs `rounds`. Without it every round always runs. */
  roundPlan?: RoundTier[];
  /**
   * How long a routine runs, in seconds. The DJ page shows it and times it so a track isn't cut
   * early. A round's own `seconds` wins. Leave out when it varies or doesn't matter.
   */
  routineSeconds?: number;
}

/**
 * The toy, the divisions and how they're judged. Edit this block for a kendama, diabolo,
 * spintop or mixed contest. After changing divisions, run `npm run divisions` and apply
 * supabase/divisions.sql (see docs/SETUP.md) so the database matches.
 */
export const competition: {
  toy: { singular: string; plural: string };
  /** Labels for the three optional "setup" fields on profiles. "" hides a field. */
  gear: { yoyo: string; string: string; counterweight: string };
  divisions: DivisionDef[];
  /**
   * Optional cap on styles across everything one person enters. A division with styles counts
   * the styles picked; a division without styles (e.g. 1A) counts as one. Leave out for no cap.
   */
  maxTotalStyles?: number;
  /** Bundle prices: entering every listed division costs priceCents instead of the sum. */
  combos: { divisions: string[]; priceCents: number }[];
  pricing: {
    earlyBirdDiscountCents: number;
    walkUpSurchargeCents: number;
    /** true shows "TBD" instead of prices on public pages (checkout still charges the real amount). */
    pricesTbd: boolean;
  };
} = {
  toy: { singular: 'yo-yo', plural: 'yo-yos' },
  gear: { yoyo: 'Yo-yo', string: 'String', counterweight: 'Counterweight' },

  divisions: [
    {
      code: '1A',
      name: '1A — Single String',
      description: 'String Trick — single yo-yo on a single string. The most popular competitive style.',
      priceCents: 3000,
      music: true,
      routineSeconds: 120,
      scoring: { format: 'freestyle', techCap: 60, evalCap: 10, negativeClicks: true, deductions: { stop: 1, discard: 3, detach: 5 } },
    },
    {
      code: 'X',
      name: 'X Division',
      description: 'Multi-style division: 2A looping, 3A two-handed string, 4A offstring, 5A freehand.',
      priceCents: 2500,
      music: true,
      routineSeconds: 120,
      styles: {
        min: 1,
        max: 2,
        options: [
          { code: '2A', label: '2A — Looping', description: 'Two looping yo-yos focused on rhythm and control.', multiplier: 1.4 },
          { code: '3A', label: '3A — Two-Handed String', description: 'Two string-trick yo-yos, one in each hand.', multiplier: 1.5 },
          { code: '4A', label: '4A — Offstring', description: 'The yo-yo is not attached to the string.', multiplier: 1.3 },
          { code: '5A', label: '5A — Freehand', description: 'Counterweight instead of a finger loop.', multiplier: 1.6 },
        ],
      },
      scoring: { format: 'freestyle', techCap: 60, evalCap: 10, negativeClicks: true, deductions: { stop: 1, discard: 3, detach: 5 } },
    },
    {
      code: 'SBJ',
      name: 'Sport / Beginner / Junior',
      description: 'For new competitors and youth players learning the competitive experience.',
      priceCents: 2000,
      music: true,
      cannotCombineWith: ['1A', 'X'],
      // #81: more than 15 players may split into Youth and Adult brackets (preview only for now).
      split: { above: 15, minBracket: 5, labels: ['Youth', 'Adult'] },
      routineSeconds: 90,
      scoring: { format: 'freestyle', techCap: 20, evalCap: 20, negativeClicks: false, deductions: null },
    },
  ],

  combos: [{ divisions: ['1A', 'X'], priceCents: 5000 }],

  // Up to 2 styles in total: 1A plus one X style, or two X styles.
  maxTotalStyles: 2,

  // VSYC-26 is over and next year's fees aren't set: price lists read "TBD" (checkout amounts unchanged).
  pricing: { earlyBirdDiscountCents: 500, walkUpSurchargeCents: 1000, pricesTbd: true },
};

// ---------------------------------------------------------------- day of: schedule & side events

/**
 * One block on the day's schedule. Items tied to a division (and round) are run from the
 * admin schedule screen: Start → Close judging → Publish results. Publishing makes that
 * division's results public, and every later item's estimated time moves with the real ones.
 */
export interface ScheduleItem {
  /** Short, permanent ID, e.g. "1a-prelims" */
  id: string;
  title: string;
  /** Planned start, 24-hour "HH:MM" on contest day in contest.timeZone */
  start: string;
  /** Planned length in minutes */
  minutes: number;
  /** The division (and round, default 1) this block judges */
  division?: string;
  round?: number;
  kind?: 'event' | 'break' | 'ceremony' | 'side' | 'other';
  /** Fixed blocks (lunch, awards, venue close) never move later or earlier */
  fixed?: boolean;
  note?: string;
}

/**
 * Quick crowd events that need no registration or fee: longest sleeper, most loops in 60
 * seconds, longest kendama juggle. Staff type a name and use a stopwatch or tap counter.
 */
export interface SideEventDef {
  code: string;
  name: string;
  description: string;
  /** "timer": a stopwatch (seconds). "counter": tap +1 per catch, loop or trick. */
  kind: 'timer' | 'counter';
  better: 'higher' | 'lower';
  /** Shown next to the number, e.g. "seconds", "loops" */
  unit: string;
  /** Counter only: stop counting after this many seconds (e.g. 60 for "most loops in a minute") */
  timeLimitSeconds?: number;
}

export const dayOf: {
  schedule: ScheduleItem[];
  /** Let blocks start before their planned time when the day runs ahead (default: no) */
  allowEarlyStarts: boolean;
  sideEvents: SideEventDef[];
} = {
  allowEarlyStarts: false,
  schedule: [
    { id: 'doors', title: 'Doors open & kick off', start: '10:00', minutes: 30, kind: 'other', note: 'Registration desk open. Welcome and rules briefing.' },
    { id: 'sbj', title: 'Sport / Beginner / Junior', start: '10:30', minutes: 90, division: 'SBJ' },
    { id: 'duel', title: 'Stella Duellum · Prismatic Stars', start: '12:00', minutes: 60, kind: 'event', note: 'One-minute routines, random music, crowd vote.' },
    { id: '1a', title: 'Pro Division (1A)', start: '13:00', minutes: 120, division: '1A' },
    { id: 'x', title: 'X Division', start: '15:00', minutes: 120, division: 'X' },
    { id: 'awards', title: 'Closing ceremony & awards', start: '17:00', minutes: 60, kind: 'ceremony', fixed: true },
    { id: 'wrap', title: 'Wrap up & breakdown', start: '18:00', minutes: 60, kind: 'other', fixed: true },
  ],
  sideEvents: [
    {
      code: 'SLEEPER', name: 'Longest Sleeper', description: 'One throw. The yo-yo that spins longest wins.',
      kind: 'timer', better: 'higher', unit: 'seconds',
    },
    {
      code: 'LOOPS60', name: 'Loop Challenge', description: 'Most inside loops in 60 seconds.',
      kind: 'counter', better: 'higher', unit: 'loops', timeLimitSeconds: 60,
    },
  ],
};

/** Look up a division by code */
export const divisionByCode = (code: string): DivisionDef | undefined =>
  competition.divisions.find((d) => d.code === code);

/** All division codes, in display order */
export const DIVISION_CODES: string[] = competition.divisions.map((d) => d.code);


// ---------------------------------------------------------------- derived helpers

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

function parts(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

/** "March 13, 2027" for any YYYY-MM-DD (defaults to the contest date) */
export function longDate(iso: string = contest.date): string {
  const { y, m, d } = parts(iso);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** "March 13" (no year) */
export function monthDay(iso: string = contest.date): string {
  const { m, d } = parts(iso);
  return `${MONTHS[m - 1]} ${d}`;
}

/** "Mar 13" */
export function shortMonthDay(iso: string = contest.date): string {
  const { m, d } = parts(iso);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}`;
}

/** Contest year as a number */
export const contestYear = parts(contest.date).y;

/** "Springfield, IL" */
export const venueCity = `${contest.venue.city}, ${contest.venue.region}`;

/** "Springfield Civic Center · Springfield, IL" */
export const venueLine = `${contest.venue.name} · ${venueCity}`;

/** "200 Capitol Ave, Springfield, IL 62701" */
export const venueAddress =
  `${contest.venue.streetAddress}, ${contest.venue.city}, ${contest.venue.region} ${contest.venue.postalCode}`.trim();

/** "March 13, 2027 · Springfield Civic Center · Springfield, IL" — the standard footer line */
export const whenWhere = `${longDate()} · ${venueLine}`;

/** "Springfield Yo-Yo Open 2027" */
export const fullTitle = `${contest.name} ${contestYear}`;

/** "Brought to you by X" or "" */
export const presentedLine = contest.presentedBy.name ? `Brought to you by ${contest.presentedBy.name}` : '';

/** "MARCH 13, 2027 · SPRINGFIELD CIVIC CENTER" for page banners */
export const bannerLine = `${longDate()} · ${contest.venue.name}`.toUpperCase();

/** A deadline as a Date */
export const deadlineDate = (key: keyof typeof contest.deadlines) => new Date(contest.deadlines[key]);

/** Format an ISO timestamp (or YYYY-MM-DD) from an env var as "March 11, 2027", or fall back */
export function deadlineLabel(iso: string | undefined, fallback = 'the deadline'): string {
  if (!iso) return fallback;
  const day = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? longDate(day) : fallback;
}

/** UTC offset (ms) of `timeZone` at instant `utcMs`, via Intl (handles daylight saving). */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const v: Record<string, number> = {};
  for (const part of f.formatToParts(new Date(utcMs))) {
    if (part.type !== 'literal') v[part.type] = Number(part.value);
  }
  return Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second) - utcMs;
}

/** "2027-03-13" + "10:00" in a time zone → the matching instant as a Date. */
export function zonedDate(dateIso: string, hhmm: string, timeZone: string): Date {
  const [y, m, d] = dateIso.split('-').map(Number);
  const [hh, mm, ss = 0] = hhmm.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm, ss);
  // Two passes settle the offset correctly on daylight-saving change days.
  let utc = wall - zoneOffsetMs(wall, timeZone);
  utc = wall - zoneOffsetMs(utc, timeZone);
  return new Date(utc);
}

/** "2027-03-13" + "10:00" in a time zone → iCalendar UTC stamp "20270313T160000Z". */
export function zonedStamp(dateIso: string, hhmm: string, timeZone: string): string {
  return zonedDate(dateIso, hhmm, timeZone).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}
