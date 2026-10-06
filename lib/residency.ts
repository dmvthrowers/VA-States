/**
 * Home-state eligibility for the home-state champion (site issue #82, "Virginia State Champion").
 * Residency is decided by home address: the registrant gives their home state, and for the
 * champion's state they also give a street address and ZIP and confirm it is where they live.
 * Pure, so it's tested without a database.
 */

/** The 50 states plus DC, which is its own option (DC players are not grouped with Virginia). */
export const US_STATES: { code: string; name: string }[] = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'],
  ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'],
  ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'],
  ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'],
  ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'],
  ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'],
  ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'],
  ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
  ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
].map(([code, name]) => ({ code, name }));

export const US_STATE_CODES = US_STATES.map((s) => s.code);

/** The fields eligibility depends on (as stored on a registration). */
export interface ResidencyFields {
  state: string | null;
  home_state_confirmed?: boolean | null;
  /** An organizer's decision that overrides the automatic answer: true = eligible, false = not. null = automatic. */
  home_state_override?: boolean | null;
}

/**
 * Is this registrant eligible for the champion's state title? An organizer's override wins;
 * otherwise they must live in the champion's state and have confirmed their home address.
 * With no champion state ('' turns the title off) nobody is eligible.
 */
export function isHomeStateEligible(r: ResidencyFields, championState: string): boolean {
  const want = championState.trim().toUpperCase();
  if (!want) return false;
  if (r.home_state_override === true) return true;
  if (r.home_state_override === false) return false;
  return (r.state ?? '').trim().toUpperCase() === want && r.home_state_confirmed === true;
}

/** ZIP codes are 5 digits, optionally followed by -4 digits. */
export const isZip = (s: string): boolean => /^\d{5}(-\d{4})?$/.test(s.trim());

/** Problems with the home address fields for a registrant in `state`. Empty = fine. */
export function residencyIssues(
  r: { state: string; home_address?: string | null; home_zip?: string | null; home_state_confirmed?: boolean | null },
  championState: string,
): { field: 'home_address' | 'home_zip' | 'home_state_confirmed'; message: string }[] {
  const want = championState.trim().toUpperCase();
  if (!want || r.state.trim().toUpperCase() !== want) return [];
  const out: ReturnType<typeof residencyIssues> = [];
  if (!(r.home_address ?? '').trim()) out.push({ field: 'home_address', message: `Enter your home street address (it decides ${want} eligibility)` });
  if (!isZip(r.home_zip ?? '')) out.push({ field: 'home_zip', message: 'Enter a 5-digit ZIP code' });
  if (r.home_state_confirmed !== true) out.push({ field: 'home_state_confirmed', message: `Confirm that you live in ${want} at this address` });
  return out;
}
