'use client';

import { useState, useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import type { Division } from '@/lib/pricing';
import { calculateFeePreview, displayPrice, formatCents, PRICES_TBD } from '@/lib/pricing';
import { US_STATES } from '@/lib/residency';
import { describeRoundPlan } from '@/lib/round-plan';
import { cleanStyles, selectionIssues, entryOf, formatSummary, freeTeamJoins, styleCap, type DivisionStyles } from '@/lib/divisions-core';
import { JOIN_CODE_RE, TEAM_NAME_MAX, entrySummary, normalizeJoinCode, teamPricingNote, type TeamChoice } from '@/lib/team-entries';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import { contest, competition, divisionByCode, venueCity, longDate, monthDay, shortMonthDay, deadlineLabel, presentedLine, contestYear, type DivisionDef } from '@/contest.config';
import { Field, inputCls } from '@/components/form/Field';

type FormValues = {
  first_name: string;
  last_name: string;
  preferred_bracket_name: string;
  age_on_event: string;
  pronouns: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  home_address: string;
  home_zip: string;
  home_state_confirmed: boolean;
  club_affiliation: string;
  parent_name: string;
  parent_email: string;
  parent_consented: boolean;
  divisions: Division[];
  division_styles: DivisionStyles;
  comp_code: string;
  liability_waiver_accepted: boolean;
  photo_video_consent: boolean;
  code_of_conduct_accepted: boolean;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
  nickname: string;
  photo_url: string;
  bio: string;
  team: string;
  yoyo: string;
  string: string;
  counterweight: string;
  instagram: string;
  tiktok: string;
  youtube: string;
  is_public: boolean;
  accessibility_needs: string;
  performance_time_pref: 'no_pref' | 'early' | 'late' | 'conflict' | '';
  scheduling_notes: string;
  _hp: string;
};

/** "Pair", "Act"… for a team division. */
function teamLabel(d: DivisionDef): string {
  const e = entryOf(d);
  return e.type === 'team' ? e.label : 'Team';
}
const perTeamPriced = (d: DivisionDef) => { const e = entryOf(d); return e.type === 'team' && e.pricing === 'team'; };

/** What the registrant picked in a team division's box (sent as `teams` on submit). */
interface TeamDraft { mode?: 'create' | 'join'; name: string; code: string }
/** Live result of /api/teams/lookup for the code typed in a team box. */
interface TeamLookup {
  code: string;
  status: 'checking' | 'ok' | 'error';
  message: string;
  team?: { name: string; division: string; division_name: string; members: number; max: number };
}
const BLANK_TEAM: TeamDraft = { name: '', code: '' };

/** A team box's draft → the API's `teams` value, or an error to show. */
function teamPayload(d: DivisionDef, t: TeamDraft | undefined, lookup: TeamLookup | undefined): { value?: TeamChoice; error?: string } {
  const label = teamLabel(d).toLowerCase();
  if (!t?.mode) return { error: `${d.name}: choose whether to start a new ${label} or join one with a code.` };
  if (t.mode === 'create') {
    const name = t.name.trim();
    if (!name) return { error: `${d.name}: enter a name for your ${label}.` };
    return { value: { create: { name } } };
  }
  const code = normalizeJoinCode(t.code);
  if (!JOIN_CODE_RE.test(code)) return { error: `${d.name}: enter the join code from your ${label}'s captain.` };
  if (lookup?.code === code && lookup.status === 'error') return { error: `${d.name}: ${lookup.message}` };
  return { value: { join: { code } } };
}

const EARLY_BIRD_CUTOFF = new Date(contest.deadlines.earlyBird);
const EARLY_BIRD_SAVINGS = formatCents(competition.pricing.earlyBirdDiscountCents);
/** Does any division perform to uploaded music? Hides the music steps when none does. */
const ANY_MUSIC = competition.divisions.some(d => d.music);

/** Optional setup fields, labelled from competition.gear. A "" label hides the field. */
const GEAR_FIELDS = ([
  { key: 'yoyo', label: competition.gear.yoyo, placeholder: 'Brand and model' },
  { key: 'string', label: competition.gear.string, placeholder: 'Type or brand' },
  { key: 'counterweight', label: competition.gear.counterweight, placeholder: 'Type or brand' },
] as const).filter(f => f.label !== '');

const divisionName = (code: string) => divisionByCode(code)?.name ?? code;

/** Sum of the member divisions' list prices */
const memberCents = (codes: string[]) => codes.reduce((s, c) => s + (divisionByCode(c)?.priceCents ?? 0), 0);

/** The combos that apply to a selection, in the same order lib/divisions-core.ts applies them. */
function appliedCombos(selected: string[]) {
  let remaining = [...new Set(selected)];
  const out: typeof competition.combos = [];
  for (const k of competition.combos) {
    if (k.divisions.length > 0 && k.divisions.every(d => remaining.includes(d))) {
      out.push(k);
      remaining = remaining.filter(d => !k.divisions.includes(d));
    }
  }
  return out;
}

/** Divisions that can't be entered together with `code`, in either direction. */
function conflictsOf(code: string): string[] {
  const own = divisionByCode(code)?.cannotCombineWith ?? [];
  const reverse = competition.divisions.filter(d => d.cannotCombineWith?.includes(code)).map(d => d.code);
  return [...new Set([...own, ...reverse])];
}

/** Facts line for a division card, built from its config: how it's judged, entry size, music, styles. */
function divisionFacts(d: DivisionDef): string {
  const facts: string[] = [formatSummary(d)];
  const entry = entrySummary(d);
  if (entry) facts.push(entry);
  facts.push(d.music ? 'Performed to music' : 'No music');
  if (d.styles) {
    const { min, max } = d.styles;
    const n = min === max ? `${min}` : min === 0 ? `up to ${max}` : `${min}–${max}`;
    facts.push(`Pick ${n} style${max === 1 && min === max ? '' : 's'}`);
  }
  const conflicts = conflictsOf(d.code);
  if (conflicts.length) facts.push(`Can't combine with ${conflicts.map(divisionName).join(', ')}`);
  return facts.join(' · ');
}

export default function RegisterPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [cocOpen, setCocOpen] = useState(false);
  const [liabilityScrolled, setLiabilityScrolled] = useState(false);
  const [codeStatus, setCodeStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [codeApplied, setCodeApplied] = useState(false);
  // Store the exact code string that was validated — never submit the raw input
  // value, because on mobile paste/autofill can change the field without
  // triggering onChange, which would desync codeApplied and the field value.
  const [validatedCode, setValidatedCode] = useState<string>('');
  const [compDiscountPercent, setCompDiscountPercent] = useState(0);
  // Team divisions: start or join, keyed by division code
  const [teamDrafts, setTeamDrafts] = useState<Record<string, TeamDraft>>({});
  const [teamLookups, setTeamLookups] = useState<Record<string, TeamLookup>>({});
  const setTeamDraft = useCallback((code: string, patch: Partial<TeamDraft>) => {
    setTeamDrafts(prev => ({ ...prev, [code]: { ...(prev[code] ?? BLANK_TEAM), ...patch } }));
  }, []);
  const setTeamLookup = useCallback((code: string, l: TeamLookup | undefined) => {
    setTeamLookups(prev => {
      const next = { ...prev };
      if (l) next[code] = l; else delete next[code];
      return next;
    });
  }, []);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    mode: 'onChange',
    defaultValues: {
      divisions: [],
      division_styles: {},
      liability_waiver_accepted: false,
      photo_video_consent: false,
      code_of_conduct_accepted: false,
      parent_consented: false,
      // Public listing is opt-in for everyone — must be explicitly checked.
      is_public: false,
    },
  });

  const watchedDivisions = watch('divisions') as Division[];
  const watchedStyles = (watch('division_styles') ?? {}) as DivisionStyles;
  const watchedAge = parseInt(watch('age_on_event') || '0', 10);
  const championState = contest.stateChampion.state;
  const watchedState = watch('state');
  const watchedCompCode = watch('comp_code');
  const isMinor = watchedAge > 0 && watchedAge < 18;
  const styledSelected = competition.divisions.filter(d => d.styles && watchedDivisions.includes(d.code));
  const teamSelected = competition.divisions.filter(d => entryOf(d).type === 'team' && watchedDivisions.includes(d.code));
  /** Team divisions where they're joining someone else's team */
  const joining = teamSelected.filter(d => teamDrafts[d.code]?.mode === 'join').map(d => d.code);
  /** …of those, the ones that cost them nothing (per-team pricing: the captain pays) */
  const freeJoins = freeTeamJoins(competition, joining);
  const combosApplied = appliedCombos(watchedDivisions.filter(d => !freeJoins.includes(d)));

  // Competitors under 18 are private by default — a parent can ask us to
  // enable public listing after registration if they want it.
  useEffect(() => {
    if (isMinor) setValue('is_public', false);
  }, [isMinor, setValue]);

  const feePreview = calculateFeePreview(
    watchedDivisions,
    compDiscountPercent,
    new Date(),
    'online',
    EARLY_BIRD_CUTOFF,
    joining,
  );

  const isEarlyBirdWindow = new Date() < EARLY_BIRD_CUTOFF;

  const handleDivisionToggle = (div: Division) => {
    const current = watchedDivisions;

    let next: Division[];
    if (current.includes(div)) {
      next = current.filter(d => d !== div);
    } else {
      // Picking a division drops any selected one it can't be combined with
      // (competition.divisions[].cannotCombineWith, checked in both directions).
      const conflicts = conflictsOf(div);
      next = [...current.filter(d => !conflicts.includes(d)), div];
    }
    // Keep config order so the summary lists divisions consistently.
    next = competition.divisions.map(d => d.code).filter(c => next.includes(c));

    setValue('divisions', next, { shouldValidate: true });
    // Drop styles picked for divisions that are no longer selected.
    setValue('division_styles', cleanStyles(next, watchedStyles), { shouldValidate: true });
    setCodeApplied(false);
    setValidatedCode('');
    setCompDiscountPercent(0);
    setCodeStatus('idle');
  };

  const handleStyleToggle = (division: DivisionDef, style: string) => {
    if (!division.styles) return;
    const current = watchedStyles[division.code] ?? [];
    let picked = current;
    if (division.styles.max === 1) {
      // Radio behavior: one style at a time.
      picked = [style];
    } else if (current.includes(style)) {
      picked = current.filter(s => s !== style);
    } else if (current.length < styleCap(division.code, watchedDivisions, watchedStyles, competition)) {
      picked = [...current, style];
    }
    setValue('division_styles', { ...watchedStyles, [division.code]: picked }, { shouldValidate: true });
  };

  const handleValidateCode = useCallback(async () => {
    const code = watchedCompCode?.trim().toUpperCase();
    if (!code) return;
    setCodeStatus('checking');
    try {
      const res = await fetch('/api/validate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const json = await res.json() as { valid: boolean; discount_percent?: number };
      if (json.valid) {
        setCodeStatus('valid');
        setCodeApplied(true);
        setValidatedCode(code); // lock in the exact string that passed
        setCompDiscountPercent(json.discount_percent ?? 0);
      } else {
        setCodeStatus('invalid');
        setCodeApplied(false);
        setValidatedCode('');
        setCompDiscountPercent(0);
      }
    } catch {
      setCodeStatus('invalid');
      setCodeApplied(false);
      setValidatedCode('');
      setCompDiscountPercent(0);
    }
  }, [watchedCompCode]);

  const onSubmit = async (values: FormValues) => {
    if (values._hp) return;
    if (!liabilityScrolled) {
      setServerError('Please scroll through the full liability release before agreeing.');
      return;
    }
    const divisionStyles = cleanStyles(values.divisions, values.division_styles);
    const issues = selectionIssues(values.divisions, divisionStyles, competition);
    if (issues.length > 0) {
      setServerError(issues.map(i => i.message).join('. '));
      return;
    }
    const teams: Record<string, TeamChoice> = {};
    const teamErrors: string[] = [];
    for (const d of competition.divisions.filter(x => entryOf(x).type === 'team' && values.divisions.includes(x.code))) {
      const { value, error } = teamPayload(d, teamDrafts[d.code], teamLookups[d.code]);
      if (value) teams[d.code] = value;
      if (error) teamErrors.push(error);
    }
    if (teamErrors.length > 0) {
      setServerError(teamErrors.join(' '));
      return;
    }
    setSubmitting(true);
    setServerError('');

    try {
      const { instagram, tiktok, youtube, ...rest } = values;
      const payload = {
        ...rest,
        division_styles: divisionStyles,
        socials: {
          instagram,
          tiktok,
          youtube,
        },
        age_on_event: parseInt(values.age_on_event, 10),
        // Always send the exact code that was validated, not the current field
        // value — these can differ on mobile when paste/autofill bypasses onChange.
        comp_code: (codeApplied && validatedCode) ? validatedCode : undefined,
        teams,
      };

      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json() as {
        id?: string;
        fee_cents?: number;
        is_comp?: boolean;
        error?: { message: string };
      };

      if (!res.ok) {
        setServerError(json.error?.message ?? 'Registration failed. Please try again.');
        return;
      }

      // Payment due → send straight to Stripe Checkout. Comp / $0 → confirmation.
      if (json.id && (json.fee_cents ?? 0) > 0 && !json.is_comp) {
        try {
          const checkout = await fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: json.id }),
          });
          const co = await checkout.json() as { url?: string };
          if (checkout.ok && co.url) {
            window.location.href = co.url;
            return;
          }
        } catch {
          // Fall through to the confirmation page, which offers Pay Now + manual fallback.
        }
      }

      router.push(`/confirm?id=${json.id}`);
    } catch {
      setServerError('Network error — please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // After the online cutoff the form can't be submitted (the API refuses it), so don't show it.
  if (Date.now() > new Date(contest.deadlines.onlineRegistration).getTime()) {
    return <RegistrationClosed />;
  }

  return (
    <>
      <NavBar activePage="register" />

      {/* Page hero */}
      <div className="bg-navy-deep border-b border-navy-border relative overflow-hidden py-12 px-6">
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(201,168,76,0.06) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
        <div className="max-w-5xl mx-auto relative">
          <span className="inline-block bg-gold text-navy-deep text-xs font-black tracking-widest px-3 py-1 mb-3">VSYC-26</span>
          <h1 className="font-display font-black text-4xl text-gold mb-2">Register to Compete</h1>
          <p className="text-xs tracking-widest text-white/70 font-semibold uppercase">
            <span className="hidden sm:inline">Virginia State Yo-Yo Contest, brought to you by Goodles · September 19, 2026 · Sterling, VA</span>
            <span className="sm:hidden">VA State Yoyo × Goodles · Sept 19, 2026</span>
          </p>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-[0.6rem] tracking-widest text-white/50 font-semibold uppercase">Presented by</span>
            <Image
              src="https://dmvthrowers.club/assets/images/logos/goodles.png"
              alt="Goodles"
              width={100}
              height={34}
              className="object-contain"
            />
          </div>
          <a
            href="/spectate"
            className="inline-block mt-4 mr-3 border border-gold text-gold text-xs font-black tracking-caps px-3 py-2 hover:bg-gold hover:text-navy-deep transition-colors"
          >
            I AM SPECTATING →
          </a>
          <a
            href="/portal"
            className="inline-block mt-4 text-xs font-black tracking-caps text-gold hover:text-gold-light"
          >
            → Portal Access (Contestants, Spectators, Judge, DJ)
          </a>
        </div>
      </div>

      <main id="main-content" className="max-w-5xl mx-auto px-4 py-10 lg:grid lg:grid-cols-3 lg:gap-8">
        {/* ── Form ── */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="lg:col-span-2 space-y-10"
          noValidate
        >
          <section className="border border-gold/40 bg-navy p-4">
            <div className="text-xs font-black tracking-caps text-gold mb-2">CHOOSE YOUR PATH</div>
            <p className="text-sm text-text-body mb-3">This page is for competitors. Spectators use a separate RSVP with a simpler flow.</p>
            <div className="flex flex-wrap gap-3">
              <span className="bg-gold text-navy-deep font-black tracking-caps px-3 py-2 text-xs">COMPETITOR REGISTRATION</span>
              <a href="/spectate" className="border border-navy-border text-gold font-black tracking-caps px-3 py-2 text-xs hover:border-gold">SPECTATOR RSVP (FREE) →</a>
            </div>
          </section>

          {/* Honeypot */}
          <input {...register('_hp')} type="text" name="_hp" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

          {/* ── SECTION 1: Player Info ── */}
          <section>
            <SectionHeader tag="STEP 1" title="Player Information" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="First Name *" error={errors.first_name?.message}>
                <input {...register('first_name', { required: 'Enter your first name.' })} className={inputCls(!!errors.first_name)} placeholder="Brandon" />
              </Field>
              <Field label="Last Name *" error={errors.last_name?.message}>
                <input {...register('last_name', { required: 'Enter your last name.' })} className={inputCls(!!errors.last_name)} placeholder="Rogers" />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <Field label="Bracket Display Name" hint="Optional override — defaults to first + last">
                <input {...register('preferred_bracket_name')} className={inputCls(false)} placeholder="Brandito" />
              </Field>
              <Field label="Pronouns" hint="Optional">
                <input {...register('pronouns')} className={inputCls(false)} placeholder="he/him" />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <Field label="Age on September 19, 2026 *" error={errors.age_on_event?.message}>
                <input
                  {...register('age_on_event', {
                    required: 'Enter your age.',
                    min: { value: 1, message: 'Enter an age of 1 or more.' },
                    max: { value: 120, message: 'Enter an age between 1 and 120.' },
                  })}
                  type="number" min={1} max={120}
                  className={inputCls(!!errors.age_on_event)}
                  placeholder="25"
                />
              </Field>
              <Field label="Email *" error={errors.email?.message}>
                <input {...register('email', { required: 'Enter your email so we can send your confirmation.', pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email, like name@example.com.' } })} type="email" className={inputCls(!!errors.email)} placeholder="you@example.com" />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <Field label="Phone *" error={errors.phone?.message}>
                <input {...register('phone', { required: 'Enter a phone number we can reach you at.' })} type="tel" className={inputCls(!!errors.phone)} placeholder="(555) 555-5555" />
              </Field>
              <Field label="Club Affiliation" hint="Optional">
                <input {...register('club_affiliation')} className={inputCls(false)} placeholder="DMV Throwers" />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              <div className="col-span-2">
                <Field label="City *" error={errors.city?.message}>
                  <input {...register('city', { required: 'Enter your city.' })} className={inputCls(!!errors.city)} placeholder="Sterling" />
                </Field>
              </div>
              <Field label="State *" error={errors.state?.message}>
                <select {...register('state', { required: 'Choose your state' })} className={inputCls(!!errors.state)} defaultValue="">
                  <option value="" disabled>Choose…</option>
                  {US_STATES.map((st) => <option key={st.code} value={st.code}>{st.name}</option>)}
                </select>
              </Field>
            </div>
            {championState && watchedState === championState && (
              <div className="mt-4 border border-navy-border p-4">
                <p className="text-sm text-text-body mb-3">
                  <strong>{contest.stateChampion.title}.</strong> The title goes to the best-placed competitor in each division who lives in {stateName(championState)}, based on their home address. We keep your address private; it&rsquo;s only used to check eligibility.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <Field label="Home Street Address *" error={errors.home_address?.message}>
                      <input {...register('home_address', { required: 'Enter your home address.' })} autoComplete="street-address" className={inputCls(!!errors.home_address)} />
                    </Field>
                  </div>
                  <Field label="ZIP *" error={errors.home_zip?.message}>
                    <input {...register('home_zip', { required: 'Enter your ZIP code.', pattern: { value: /^\d{5}(-\d{4})?$/, message: 'Enter a 5-digit ZIP code.' } })} autoComplete="postal-code" inputMode="numeric" className={inputCls(!!errors.home_zip)} />
                  </Field>
                </div>
                <label className="flex gap-3 items-start mt-3 cursor-pointer">
                  <input {...register('home_state_confirmed', { required: `Please confirm you live in ${stateName(championState)}` })} type="checkbox" className="mt-1 w-4 h-4 accent-gold flex-shrink-0" />
                  <span className="text-sm text-text-body">I live at this address in {stateName(championState)}. (A home address, not a school, club or mailing address.)</span>
                </label>
                {errors.home_state_confirmed && <p className="text-error text-xs mt-1">{errors.home_state_confirmed.message}</p>}
              </div>
            )}
          </section>

          {/* ── SECTION 2: Divisions ── */}
          <section>
            <SectionHeader tag="STEP 2" title="Division Selection" />
            <p className="text-sm text-text-body mb-4">
              Select your division{competition.divisions.length === 1 ? '' : '(s)'}.
              {competition.divisions.length > 1 && ' You can enter more than one unless a division says otherwise.'}
            </p>

            {errors.divisions && (
              <p className="text-error text-sm mb-3">{errors.divisions.message}</p>
            )}

            <div className="space-y-3">
              {competition.divisions.map((d) => {
                const on = watchedDivisions.includes(d.code);
                return (
                  <button
                    key={d.code}
                    type="button"
                    onClick={() => handleDivisionToggle(d.code)}
                    aria-pressed={on}
                    className={`w-full text-left border p-4 transition-colors ${
                      on
                        ? 'border-gold bg-navy'
                        : 'border-navy-border bg-navy-deep hover:border-gold/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className={`w-5 h-5 border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${on ? 'border-gold bg-gold' : 'border-navy-border'}`}>
                          {on && <span className="text-navy-deep font-black text-xs">✓</span>}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-white text-sm">{d.name}</div>
                          <div className="text-xs text-text-body mt-0.5">{d.description}</div>
                          <div className="text-xs text-gold/60 mt-1">{divisionFacts(d)}</div>
                          {d.roundPlan && (
                            <div className="text-xs text-gold/60 mt-1">
                              <strong>Rounds depend on how many enter.</strong> {describeRoundPlan(d).join(' ')} We confirm the rounds when registration closes and post who advances after each one.
                            </div>
                          )}
                        </div>
                      </div>
                      <span className="font-display font-bold text-gold text-lg flex-shrink-0 text-right">
                        {displayPrice(d.priceCents)}
                        {perTeamPriced(d) && <span className="block text-[0.65rem] font-sans font-semibold text-gold/60 tracking-normal">per {teamLabel(d).toLowerCase()}</span>}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Style pickers for every selected division that has styles */}
            {styledSelected.map((d) => {
              const styles = d.styles!;
              const picked = watchedStyles[d.code] ?? [];
              const single = styles.max === 1;
              // competition.maxTotalStyles can lower this division's max (e.g. 1A + X allows one X style).
              const cap = styleCap(d.code, watchedDivisions, watchedStyles, competition);
              const range = styles.min === cap ? `${styles.min}` : styles.min === 0 ? `up to ${cap}` : `${styles.min}–${cap}`;
              const groupId = `styles-${d.code}`;
              const countOk = picked.length >= styles.min && picked.length <= cap;
              return (
                <fieldset key={d.code} className="mt-4 p-4 bg-navy border border-gold/30" aria-describedby={`${groupId}-hint`}>
                  <legend className="sr-only">{d.name} styles</legend>
                  <div className="block text-xs font-black tracking-caps text-gold mb-3" aria-hidden="true">
                    {d.name.toUpperCase()} STYLE{single ? '' : 'S'}{styles.min > 0 ? ' *' : ''}
                  </div>
                  <p id={`${groupId}-hint`} className="text-xs text-text-body mb-3">
                    {single ? (styles.min > 0 ? 'Choose one style.' : 'Choose a style (optional).') : `Choose ${range} style${cap === 1 && styles.min === cap ? '' : 's'}.`}
                    {!single && cap < styles.max && competition.maxTotalStyles !== undefined && ` You can enter at most ${competition.maxTotalStyles} styles in total, and each other division counts as one.`}
                  </p>
                  <div className="space-y-2">
                    {styles.options.map((o) => {
                      const checked = picked.includes(o.code);
                      return (
                        <label key={o.code} className="flex items-start gap-2 cursor-pointer">
                          <input
                            type={single ? 'radio' : 'checkbox'}
                            name={groupId}
                            value={o.code}
                            checked={checked}
                            onChange={() => handleStyleToggle(d, o.code)}
                            disabled={!single && !checked && picked.length >= cap}
                            className="w-4 h-4 accent-gold mt-0.5 flex-shrink-0"
                          />
                          <span>
                            <span className="text-sm font-semibold text-white">{o.label}</span>
                            {o.description && <span className="text-xs text-text-body ml-2">{o.description}</span>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {!countOk && picked.length > 0 && (
                    <p className="text-error text-sm mt-2" role="alert">Choose {range} {d.name} style{cap === 1 ? '' : 's'}.</p>
                  )}
                </fieldset>
              );
            })}

            {/* Team boxes: start a new team or join one with a code */}
            {teamSelected.map((d) => (
              <TeamBox
                key={d.code}
                division={d}
                draft={teamDrafts[d.code] ?? BLANK_TEAM}
                lookup={teamLookups[d.code]}
                onDraft={(patch) => setTeamDraft(d.code, patch)}
                onLookup={(l) => setTeamLookup(d.code, l)}
              />
            ))}

            {/* Combo notes */}
            {combosApplied.map((k) => {
              const names = k.divisions.map(divisionName).join(' + ');
              const savings = memberCents(k.divisions) - k.priceCents;
              return (
                <div key={k.divisions.join('+')} className="mt-3 p-3 border border-gold/40 bg-navy text-xs text-gold font-semibold">
                  {PRICES_TBD
                    ? `★ ${names} combo pricing: TBD`
                    : `★ ${names} combo: ${formatCents(k.priceCents)}${savings > 0 ? ` (saves ${formatCents(savings)} vs. registering separately)` : ''}`}
                </div>
              );
            })}


            <div className="mt-2">
              <a
                href="https://dmvthrowers.club/vsyc26-rules.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gold/60 hover:text-gold"
              >
                → View full division rules &amp; judging criteria ↗
              </a>
              {' · '}
              <a
                href="https://yoyocontest.com/freestyle-rules-for-nyyl-events/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gold/60 hover:text-gold"
              >
                Source: NYYL freestyle rules ↗
              </a>
            </div>

            {/* Comp code */}
            <div className="mt-5">
              <label className="block text-xs font-black tracking-caps text-gold mb-2">COMP / SPONSOR CODE</label>
              <div className="flex gap-2">
                <input
                  {...register('comp_code', {
                    // Pass onChange through register options so RHF's internal
                    // tracking fires alongside our reset, preventing the field
                    // value and codeApplied from drifting out of sync.
                    onChange: () => { setCodeStatus('idle'); setCodeApplied(false); setValidatedCode(''); setCompDiscountPercent(0); },
                  })}
                  className={`flex-1 bg-navy-deep border px-3 py-2 text-sm text-white font-mono uppercase ${codeStatus === 'valid' ? 'border-green-500' : codeStatus === 'invalid' ? 'border-red' : 'border-navy-border'} focus:outline-none focus:border-gold`}
                  placeholder="e.g. SPONSOR2026"
                />
                <button
                  type="button"
                  onClick={handleValidateCode}
                  disabled={!watchedCompCode || codeStatus === 'checking'}
                  className="bg-navy border border-navy-border px-4 py-2 text-xs font-black tracking-caps text-gold hover:border-gold disabled:opacity-40 transition-colors"
                >
                  {codeStatus === 'checking' ? '...' : 'APPLY'}
                </button>
              </div>
              {codeStatus === 'valid' && (
                <p className="text-green-400 text-xs mt-1 font-semibold">
                  ✓ Valid — {compDiscountPercent === 100 ? 'entry fee waived' : `${compDiscountPercent}% off applied`}
                </p>
              )}
              {codeStatus === 'invalid' && <p className="text-error text-xs mt-1">That code is not valid or has expired. Check it and try again.</p>}
            </div>
          </section>

          {/* ── SECTION 3: Minor Consent (conditional) ── */}
          {isMinor && (
            <section className="border border-gold/40 p-5">
              <SectionHeader tag="MINOR CONSENT" title="Parent / Guardian Information" />
              <p className="text-sm text-text-body mb-4">This competitor is under 18. A parent or guardian must provide their information and consent below.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Parent / Guardian Name *" error={errors.parent_name?.message}>
                  <input {...register('parent_name', { required: isMinor ? 'Enter a parent or guardian email. It is required for competitors under 18.' : false })} className={inputCls(!!errors.parent_name)} />
                </Field>
                <Field label="Parent / Guardian Email *" error={errors.parent_email?.message}>
                  <input {...register('parent_email', { required: isMinor ? 'Enter a parent or guardian email. It is required for competitors under 18.' : false, pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email, like name@example.com.' } })} type="email" className={inputCls(!!errors.parent_email)} />
                </Field>
              </div>
              <label className="flex gap-3 items-start mt-4 cursor-pointer">
                <input
                  {...register('parent_consented', { required: isMinor ? 'Parent consent is required' : false })}
                  type="checkbox"
                  className="mt-1 w-4 h-4 accent-gold flex-shrink-0"
                />
                <span className="text-sm text-text-body">I am the parent or legal guardian of this competitor and I consent to their participation in VSYC-26, including the liability waiver and photo/video consent on their behalf.</span>
              </label>
              {errors.parent_consented && <p className="text-error text-xs mt-1">{errors.parent_consented.message}</p>}
            </section>
          )}

          {/* ── SECTION 3: Safety + Optional Info ── */}
          <section>
            <SectionHeader tag="STEP 3" title="Safety + Additional Information" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Emergency Contact Name *" error={errors.emergency_contact_name?.message}>
                <input {...register('emergency_contact_name', { required: 'Required for competitors' })} className={inputCls(!!errors.emergency_contact_name)} placeholder="Jane Rogers" />
              </Field>
              <Field label="Emergency Contact Phone *" error={errors.emergency_contact_phone?.message}>
                <input {...register('emergency_contact_phone', { required: 'Required for competitors' })} className={inputCls(!!errors.emergency_contact_phone)} placeholder="(555) 555-5555" />
              </Field>
              <Field label="Emergency Contact Relationship *" error={errors.emergency_contact_relationship?.message}>
                <input {...register('emergency_contact_relationship', { required: 'Required for competitors' })} className={inputCls(!!errors.emergency_contact_relationship)} placeholder="Parent, spouse, friend…" />
              </Field>
            </div>
            <p className="text-xs text-text-body mt-2">Emergency contact is required for competitors. Spectator RSVP does not require emergency contact.</p>

            <div className="mt-4">
              <Field label="Accessibility Needs" hint="Anything we should know for day-of accommodation">
                <textarea {...register('accessibility_needs')} className={`${inputCls(false)} resize-none`} rows={2} />
              </Field>
            </div>

            <div className="mt-6 p-4 border border-navy-border bg-navy-deep">
              <div className="text-xs font-black tracking-caps text-gold mb-1">OPTIONAL PUBLIC PROFILE + SETUP</div>

              {isMinor ? (
                <p className="text-sm text-text-body">
                  <strong className="text-white">Public profile is off for competitors under 18.</strong>{' '}
                  This registration stays private — no nickname, photo, bio, or socials are collected. A parent or guardian can email{' '}
                  <a href="mailto:contact@dmvthrowers.club" className="text-gold hover:text-gold-light">contact@dmvthrowers.club</a>{' '}
                  after registering to enable a public listing if you&apos;d like one.
                </p>
              ) : (
                <>
                  <p className="text-xs text-text-body mb-4">If you want to appear in the public participant directory, add whatever you want shared.</p>

                  <label className="flex gap-3 items-start cursor-pointer mb-4">
                    <input {...register('is_public')} type="checkbox" className="mt-0.5 w-4 h-4 accent-gold flex-shrink-0" />
                    <span className="text-sm text-text-body"><strong className="text-white">List me publicly.</strong> If unchecked, your registration stays private.</span>
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Nickname / Screenname">
                      <input {...register('nickname')} className={inputCls(false)} placeholder="Brandito" />
                    </Field>
                    <Field label="Team">
                      <input {...register('team')} className={inputCls(false)} placeholder="DMV Throwers" />
                    </Field>
                  </div>

                  <div className="mt-4">
                    <Field label="Profile Photo URL" hint="Optional image link (https://...)" error={errors.photo_url?.message}>
                      <input {...register('photo_url')} className={inputCls(!!errors.photo_url)} placeholder="https://example.com/me.jpg" />
                    </Field>
                  </div>

                  {GEAR_FIELDS.length > 0 && (
                    <div className={`grid grid-cols-1 ${GEAR_FIELDS.length === 3 ? 'sm:grid-cols-3' : GEAR_FIELDS.length === 2 ? 'sm:grid-cols-2' : ''} gap-4 mt-4`}>
                      {GEAR_FIELDS.map(({ key, label, placeholder }) => (
                        <Field key={key} label={label}>
                          <input {...register(key)} className={inputCls(false)} placeholder={placeholder} />
                        </Field>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                    <Field label="Instagram">
                      <input {...register('instagram')} className={inputCls(false)} placeholder="@yourhandle" />
                    </Field>
                    <Field label="TikTok">
                      <input {...register('tiktok')} className={inputCls(false)} placeholder="@yourhandle" />
                    </Field>
                    <Field label="YouTube">
                      <input {...register('youtube')} className={inputCls(false)} placeholder="@yourchannel" />
                    </Field>
                  </div>

                  <div className="mt-4">
                    <Field label="Bio" hint="Optional short intro" error={errors.bio?.message}>
                      <textarea {...register('bio')} className={`${inputCls(!!errors.bio)} resize-none`} rows={3} placeholder="Yo-yo player from Northern Virginia..." />
                    </Field>
                  </div>
                </>
              )}
            </div>

            {/* ── Scheduling preference ── */}
            <div className="mt-6 p-4 border border-navy-border bg-navy-deep">
              <div className="text-xs font-black tracking-caps text-gold mb-1">SCHEDULE PREFERENCE</div>
              <p className="text-xs text-text-body mb-3">Optional — helps us build the run order. We&apos;ll do our best to accommodate.</p>
              <Field label="Performance Time Preference">
                <select
                  {...register('performance_time_pref')}
                  className={`${inputCls(false)} appearance-none`}
                  defaultValue=""
                >
                  <option value="">— No preference —</option>
                  <option value="no_pref">No preference</option>
                  <option value="early">Early in the day (first half)</option>
                  <option value="late">Late in the day (second half)</option>
                  <option value="conflict">I have a time conflict — please see notes</option>
                </select>
              </Field>
              {(watch('performance_time_pref') === 'conflict' || watch('performance_time_pref') === 'early' || watch('performance_time_pref') === 'late') && (
                <div className="mt-3">
                  <Field label="Scheduling Notes" hint="Up to 300 characters">
                    <textarea
                      {...register('scheduling_notes', { maxLength: { value: 300, message: 'Keep this under 300 characters.' } })}
                      className={`${inputCls(!!errors.scheduling_notes)} resize-none`}
                      rows={2}
                      placeholder={watch('performance_time_pref') === 'conflict' ? 'e.g. I need to be done by 2pm for a prior commitment' : 'Any notes for the organizers'}
                    />
                  </Field>
                  {errors.scheduling_notes && <p className="text-error text-xs mt-1">{errors.scheduling_notes.message}</p>}
                </div>
              )}
            </div>

          </section>

          {/* ── SECTION 4: Waivers ── */}
          <section>
            <SectionHeader tag="STEP 4" title="Waivers &amp; Agreements" />
            <p className="text-sm text-text-body mb-5">Code of Conduct is required for everyone. Competitors must also read and scroll through the liability release before agreeing.</p>

            {/* CoC Panel — Option C */}
            <div className="border border-navy-border mb-5">
              <div className="p-4">
                <div className="text-xs font-black tracking-caps text-gold mb-2">CODE OF CONDUCT</div>
                <p className="text-sm text-text-body mb-3">
                  All participants — competitors, spectators, volunteers, and sponsors — are expected to treat everyone at VSYC-26 with respect. Harassment, discrimination, or unsafe behavior of any kind will not be tolerated.
                </p>
                <button
                  type="button"
                  onClick={() => setCocOpen(o => !o)}
                  className="text-xs font-bold text-gold hover:text-gold-light flex items-center gap-1"
                >
                  {cocOpen ? '▲' : '▾'} {cocOpen ? 'Collapse' : 'Read full Code of Conduct'}
                </button>
                {cocOpen && (
                  <div className="mt-3 p-3 bg-navy-deep border border-navy-border text-sm text-text-body space-y-2 max-h-48 overflow-y-auto">
                    <p><strong className="text-white">1. Be respectful.</strong> Treat all attendees with dignity regardless of skill level, age, background, or affiliation.</p>
                    <p><strong className="text-white">2. No harassment.</strong> Harassment in any form — verbal, physical, or online related to the event — is grounds for immediate removal.</p>
                    <p><strong className="text-white">3. No discrimination.</strong> VSYC-26 is a welcoming space for everyone. Discriminatory conduct is not welcome here.</p>
                    <p><strong className="text-white">4. Sportsmanship.</strong> Compete with integrity. Celebrate others. Losing gracefully is part of the sport.</p>
                    <p><strong className="text-white">5. Venue rules apply.</strong> Follow all Dulles Town Center policies at all times.</p>
                    <p><strong className="text-white">6. Enforcement.</strong> Violations may result in removal from the venue and a ban from future DMV Throwers events. This applies to all attendees regardless of status, sponsorship, or affiliation.</p>
                  </div>
                )}
                <a
                  href="https://dmvthrowers.club/vsyc26-rules.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gold/70 hover:text-gold mt-2 inline-block"
                >
                  → Read on the website ↗
                </a>
              </div>
              <div className="border-t border-navy-border p-4">
                <label className="flex gap-3 items-start cursor-pointer">
                  <input
                    {...register('code_of_conduct_accepted', { required: 'Check this box to accept the code of conduct.' })}
                    type="checkbox"
                    className="mt-0.5 w-4 h-4 accent-gold flex-shrink-0"
                  />
                  <span className="text-sm text-text-body">
                    I agree to the VSYC-26 Code of Conduct. I understand that violations may result in removal from the venue and a ban from future DMV Throwers events. <strong className="text-white">This applies to all attendees regardless of status, sponsorship, or affiliation.</strong>
                  </span>
                </label>
                {errors.code_of_conduct_accepted && <p className="text-error text-xs mt-1">{errors.code_of_conduct_accepted.message}</p>}
              </div>
            </div>

            {/* Liability */}
            <div className="border border-navy-border mb-4">
              <div className="p-4 border-b border-navy-border">
                <div className="text-xs font-black tracking-caps text-gold mb-2">LIABILITY RELEASE (REQUIRED)</div>
                <p className="text-xs text-text-body mb-3">Please read the full release below before agreeing.</p>
                <div
                  tabIndex={0}
                  role="region"
                  aria-label="Liability Release text — scroll to read in full"
                  className="max-h-44 overflow-y-auto bg-navy-deep border border-navy-border p-3 text-sm text-text-body space-y-2 focus:outline-none focus:border-gold"
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    const reachedBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
                    if (reachedBottom) setLiabilityScrolled(true);
                  }}
                >
                  <p><strong className="text-white">Assumption of Risk:</strong> I understand that participation in a yo-yo contest includes physical movement, crowded public spaces, equipment handling, and other event-related risks.</p>
                  <p><strong className="text-white">Release:</strong> I release and hold harmless DMV Throwers, event staff, volunteers, sponsors, and Dulles Town Center from claims, liabilities, damages, or expenses arising out of participation in VSYC-26, except where prohibited by law.</p>
                  <p><strong className="text-white">Personal Responsibility:</strong> I am responsible for my own safety, property, and conduct while at the event and will follow venue and event rules.</p>
                  <p><strong className="text-white">Medical:</strong> I authorize emergency care if needed and understand all costs are my responsibility.</p>
                  <p><strong className="text-white">Acknowledgment:</strong> By checking the box below, I confirm I have read this release and agree to participate at my own risk.</p>
                  <p className="text-gold text-xs font-semibold pt-1">End of liability release.</p>
                </div>
              </div>
              <div className="p-4">
                <label className="flex gap-3 items-start cursor-pointer">
                  <input
                    {...register('liability_waiver_accepted', { required: 'Check this box to accept the waiver.' })}
                    type="checkbox"
                    disabled={!liabilityScrolled}
                    className="mt-0.5 w-4 h-4 accent-gold flex-shrink-0"
                  />
                  <span className="text-sm text-text-body">
                    I have read and agree to the VSYC-26 Liability Release.
                    {!liabilityScrolled && <span className="text-gold/70"> (Please scroll through the release above.)</span>}
                  </span>
                </label>
                {!liabilityScrolled && (
                  <p className="text-xs text-gold/70 mt-2">Scroll to the end of the release to enable this checkbox.</p>
                )}
              </div>
            </div>
            {errors.liability_waiver_accepted && <p className="text-error text-xs mb-3">{errors.liability_waiver_accepted.message}</p>}

            {/* Photo/video */}
            <label className="flex gap-3 items-start cursor-pointer">
              <input
                {...register('photo_video_consent', { required: 'Check this box to agree to the photo and video release.' })}
                type="checkbox"
                className="mt-0.5 w-4 h-4 accent-gold flex-shrink-0"
              />
              <span className="text-sm text-text-body">
                <strong className="text-white">Photo / Video Consent (Required):</strong> I consent to being photographed and recorded at VSYC-26, including livestream broadcast, and for use in DMV Throwers promotional and archival materials.
              </span>
            </label>
            {errors.photo_video_consent && <p className="text-error text-xs mt-1">{errors.photo_video_consent.message}</p>}
          </section>

          {/* Server error */}
          {serverError && (
            <div className="p-4 border border-red bg-red/10 text-sm text-white">
              {serverError}
            </div>
          )}

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gold text-navy-deep font-black tracking-caps py-4 text-sm hover:bg-gold-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'SUBMITTING...' : 'SUBMIT REGISTRATION →'}
            </button>
            <p className="text-xs text-text-body mt-3 text-center">
              {ANY_MUSIC ? 'Payment and music upload are' : 'Payment is'} handled in this registration portal after you submit.
            </p>
            <p className="text-xs text-text-body mt-2 text-center">
              Review our{' '}
              <a href="/policies" className="text-gold hover:text-gold-light">Policies &amp; Event Terms</a>{' '}
              before submitting.
            </p>
          </div>
        </form>

        {/* ── Pricing Summary (sticky sidebar) ── */}
        <aside className="hidden lg:block">
          <div className="sticky top-6 border border-navy-border bg-navy p-5">
            <div className="text-xs font-black tracking-caps text-gold mb-4">REGISTRATION SUMMARY</div>

            {watchedDivisions.length === 0 ? (
              <p className="text-sm text-text-body">Select division(s) to see pricing.</p>
            ) : (
              <>
                <div className="space-y-2 mb-4">
                  {watchedDivisions.map(d => {
                    const def = divisionByCode(d);
                    const free = freeJoins.includes(d);
                    const draft = teamDrafts[d];
                    const lookup = teamLookups[d];
                    const teamNote = def && entryOf(def).type === 'team'
                      ? draft?.mode === 'join'
                        ? `Joining ${lookup?.status === 'ok' && lookup.team ? lookup.team.name : `a ${teamLabel(def).toLowerCase()}`}${free ? ' (captain pays)' : ''}`
                        : draft?.mode === 'create'
                          ? `Starting ${draft.name.trim() || `a ${teamLabel(def).toLowerCase()}`}${perTeamPriced(def) ? ` (one fee per ${teamLabel(def).toLowerCase()})` : ''}`
                          : null
                      : null;
                    return (
                      <div key={d} className="flex justify-between gap-3 text-sm">
                        <span className="text-text-body min-w-0 break-words">
                          {divisionName(d)}
                          {(watchedStyles[d]?.length ?? 0) > 0 && (
                            <span className="block text-xs text-text-muted">
                              {watchedStyles[d].map(s => def?.styles?.options.find(o => o.code === s)?.label ?? s).join(', ')}
                            </span>
                          )}
                          {teamNote && <span className="block text-xs text-text-muted">{teamNote}</span>}
                        </span>
                        <span className="text-white font-semibold flex-shrink-0">{free ? formatCents(0) : displayPrice(def?.priceCents ?? 0)}</span>
                      </div>
                    );
                  })}
                </div>

                {!PRICES_TBD && combosApplied.map(k => {
                  const savings = memberCents(k.divisions) - k.priceCents;
                  return savings !== 0 && (
                    <div key={k.divisions.join('+')} className="flex justify-between gap-3 text-sm text-green-400 mb-2">
                      <span>{k.divisions.map(divisionName).join(' + ')} combo {savings > 0 ? 'discount' : 'price'}</span>
                      <span className="flex-shrink-0">{savings > 0 ? `−${formatCents(savings)}` : `+${formatCents(-savings)}`}</span>
                    </div>
                  );
                })}
                {feePreview.early_bird_applied && !PRICES_TBD && competition.pricing.earlyBirdDiscountCents > 0 && (
                  <div className="flex justify-between text-sm text-green-400 mb-2">
                    <span>Early bird discount</span>
                    <span>−{EARLY_BIRD_SAVINGS}</span>
                  </div>
                )}
                {feePreview.comp_discount_percent > 0 && (
                  <div className="flex justify-between text-sm text-green-400 mb-2">
                    <span>Comp code discount ({feePreview.comp_discount_percent}%)</span>
                    <span>−{formatCents(feePreview.comp_base_fee_cents - feePreview.fee_cents)}</span>
                  </div>
                )}

                <div className="border-t border-navy-border pt-3 mt-3 flex justify-between">
                  <span className="font-bold text-white text-sm">TOTAL</span>
                  <span className="font-display font-bold text-gold text-xl">
                    {feePreview.is_comp ? 'FREE' : displayPrice(feePreview.fee_cents)}
                  </span>
                </div>

                {isEarlyBirdWindow && !feePreview.early_bird_applied && feePreview.comp_discount_percent === 0 && !feePreview.is_comp && (
                  <p className="text-xs text-gold/70 mt-3">★ Early bird ends June 1 — register now and save $5</p>
                )}
              </>
            )}

            <div className="mt-5 pt-4 border-t border-navy-border">
              <div className="text-xs font-black tracking-caps text-gold mb-2">PAYMENT</div>
              <p className="text-xs text-text-body mb-2">Online registration payments are processed securely by Stripe at checkout.</p>
              <p className="text-xs text-text-body">Day-of payment options may be available at check-in. See the registration desk for details.</p>
            </div>

            {ANY_MUSIC && <div className="mt-4 pt-4 border-t border-navy-border">
              <div className="text-xs font-black tracking-caps text-gold mb-2">MUSIC DEADLINE</div>
              <p className="text-xs text-text-body">Upload your music in this registration app after payment. <strong className="text-white">Deadline: Sept 17, 2026.</strong></p>
              <p className="text-xs text-text-body mt-2">Music must be appropriate for all audiences — no explicit language, sexual content, or glorification of violence. <strong className="text-white">Inappropriate music results in disqualification.</strong> Full rules are on the upload page.</p>
            </div>}

            <div className="mt-4 pt-4 border-t border-navy-border">
              <div className="text-xs font-black tracking-caps text-gold mb-3">WHAT HAPPENS NEXT</div>
              <ol className="space-y-2.5">
                {[
                  { n: '1', label: 'Submit this form', sub: 'You\'re in the queue' },
                  { n: '2', label: 'Complete Stripe checkout', sub: 'Secure online payment in portal' },
                  { n: '3', label: 'Upload your music', sub: 'In-app upload · due Sept 17' },
                  { n: '4', label: 'Show up Sept 19', sub: 'Dulles Town Center, Sterling VA' },
                ].map(({ n, label, sub }) => (
                  <li key={n} className="flex items-start gap-2.5">
                    <span className="w-5 h-5 bg-gold text-navy-deep text-xs font-black flex items-center justify-center flex-shrink-0 mt-0.5">{n}</span>
                    <div>
                      <div className="text-xs font-semibold text-white">{label}</div>
                      <div className="text-xs text-text-body">{sub}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-4 pt-4 border-t border-navy-border space-y-2">
              <a
                href="/fee-calculator"
                className="block text-xs text-text-muted hover:text-gold-light"
                style={{ fontFamily: 'var(--font-condensed)', letterSpacing: '0.10em', textTransform: 'uppercase' as const, textDecoration: 'none' }}
              >
                → Fee Calculator
              </a>
              <a
                href="https://dmvthrowers.club/vsyc26-register.html"
                className="block text-xs text-text-muted hover:text-gold-light"
                style={{ fontFamily: 'var(--font-condensed)', letterSpacing: '0.10em', textTransform: 'uppercase' as const, textDecoration: 'none' }}
              >
                ← VSYC-26 Event Page
              </a>
            </div>
          </div>
        </aside>

        {/* Mobile pricing bar */}
        <div className="lg:hidden col-span-full mt-6 border border-navy-border bg-navy p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-black tracking-caps text-gold">TOTAL</div>
            {watchedDivisions.length === 0
              ? <p className="text-sm text-text-body">Select division(s)</p>
              : <p className="font-display font-bold text-gold text-2xl">{feePreview.is_comp ? 'FREE' : displayPrice(feePreview.fee_cents)}</p>
            }
          </div>
          {feePreview.early_bird_applied && <span className="text-xs text-green-400 font-semibold">Early bird applied</span>}
        </div>
      </main>

      <Footer />
    </>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** "Your Pair" box for a selected team division: start a new one (name) or join with a code (live lookup). */
function TeamBox({ division: d, draft, lookup, onDraft, onLookup }: {
  division: DivisionDef;
  draft: TeamDraft;
  lookup: TeamLookup | undefined;
  onDraft: (patch: Partial<TeamDraft>) => void;
  onLookup: (l: TeamLookup | undefined) => void;
}) {
  const label = teamLabel(d);
  const lower = label.toLowerCase();
  const id = `team-${d.code}`;
  const code = normalizeJoinCode(draft.code);
  const wantLookup = draft.mode === 'join' && code.length >= 6 && JOIN_CODE_RE.test(code);

  // Look the code up once typing pauses; ignore answers for a code that's since changed.
  useEffect(() => {
    if (!wantLookup) { onLookup(undefined); return; }
    let cancelled = false;
    onLookup({ code, status: 'checking', message: 'Checking code…' });
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/teams/lookup?code=${encodeURIComponent(code)}`, { cache: 'no-store' });
        const json = await res.json() as { team?: TeamLookup['team']; error?: { message?: string } };
        if (cancelled) return;
        const t = json.team;
        if (!res.ok || !t) {
          onLookup({ code, status: 'error', message: json.error?.message ?? `No ${lower} found with that code.` });
        } else if (t.division !== d.code) {
          onLookup({ code, status: 'error', message: `That code is for a ${t.division_name} ${lower}, not ${d.name}.`, team: t });
        } else if (t.members >= t.max) {
          onLookup({ code, status: 'error', message: `${t.name} is full (${t.members}/${t.max}).`, team: t });
        } else {
          onLookup({ code, status: 'ok', message: `Joining ${t.name} (${t.members}/${t.max})`, team: t });
        }
      } catch {
        if (!cancelled) onLookup({ code, status: 'error', message: 'Could not check that code. Try again.' });
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
    // onLookup is stable per division; re-run only when the code changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantLookup, code]);

  const optionCls = (on: boolean) => `flex items-center gap-2 border px-3 py-2.5 cursor-pointer text-sm transition-colors ${on ? 'border-gold bg-navy-deep text-white' : 'border-navy-border text-text-body hover:border-gold/50'}`;
  const shown = lookup && lookup.code === code ? lookup : undefined;

  return (
    <fieldset className="mt-4 p-4 bg-navy border border-gold/30 min-w-0" aria-describedby={`${id}-hint`}>
      <legend className="sr-only">Your {lower} for {d.name}</legend>
      <div className="block text-xs font-black tracking-caps text-gold mb-1" aria-hidden="true">
        {d.name.toUpperCase()} · YOUR {label.toUpperCase()} *
      </div>
      <p id={`${id}-hint`} className="text-xs text-text-body mb-3">
        {[entrySummary(d), teamPricingNote(d)].filter(Boolean).join('. ')} Everyone on the {lower} registers and signs the waiver themselves.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className={optionCls(draft.mode === 'create')}>
          <input type="radio" name={`${id}-mode`} value="create" checked={draft.mode === 'create'} onChange={() => onDraft({ mode: 'create' })} className="w-4 h-4 accent-gold flex-shrink-0" />
          <span className="font-semibold">Start a new {lower}</span>
        </label>
        <label className={optionCls(draft.mode === 'join')}>
          <input type="radio" name={`${id}-mode`} value="join" checked={draft.mode === 'join'} onChange={() => onDraft({ mode: 'join' })} className="w-4 h-4 accent-gold flex-shrink-0" />
          <span className="font-semibold">Join with a code</span>
        </label>
      </div>

      {draft.mode === 'create' && (
        <div className="mt-3">
          <label htmlFor={`${id}-name`} className="block text-xs font-black tracking-caps text-gold mb-1.5">{label.toUpperCase()} NAME *</label>
          <input
            id={`${id}-name`}
            value={draft.name}
            onChange={(e) => onDraft({ name: e.target.value })}
            maxLength={TEAM_NAME_MAX}
            autoComplete="off"
            className={inputCls(false)}
            placeholder={`Your ${lower}'s name`}
            aria-describedby={`${id}-name-hint`}
          />
          <p id={`${id}-name-hint`} className="text-xs text-text-muted mt-1">
            Shown in the run order and results. You&apos;ll get a join code to share with your teammates.
          </p>
        </div>
      )}

      {draft.mode === 'join' && (
        <div className="mt-3">
          <label htmlFor={`${id}-code`} className="block text-xs font-black tracking-caps text-gold mb-1.5">JOIN CODE *</label>
          <input
            id={`${id}-code`}
            value={draft.code}
            onChange={(e) => onDraft({ code: e.target.value.toUpperCase() })}
            maxLength={12}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className={`${inputCls(shown?.status === 'error')} font-mono uppercase tracking-widest`}
            placeholder="ABC123"
            aria-describedby={`${id}-code-status`}
          />
          <p id={`${id}-code-status`} role="status" aria-live="polite" className={`text-xs mt-1 font-semibold ${shown?.status === 'ok' ? 'text-green-400' : shown?.status === 'error' ? 'text-red' : 'text-text-muted'}`}>
            {shown ? `${shown.status === 'ok' ? '✓ ' : shown.status === 'error' ? '✗ ' : ''}${shown.message}` : `Ask your ${lower}'s captain for the code from their confirmation.`}
          </p>
          {perTeamPriced(d) && <p className="text-xs text-green-400 mt-1">You pay {formatCents(0)} for {d.name}: your captain&apos;s entry covers the {lower}.</p>}
        </div>
      )}
    </fieldset>
  );
}

function SectionHeader({ tag, title }: { tag: string; title: string }) {
  return (
    <div className="mb-5">
      <span className="inline-block bg-gold text-navy-deep text-xs font-black tracking-widest px-2 py-0.5 mb-2">{tag}</span>
      <h2 className="font-display font-black text-2xl text-white">{title}</h2>
      <div className="w-12 h-0.5 bg-gold mt-2" />
    </div>
  );
}

const stateName = (code: string) => US_STATES.find((x) => x.code === code)?.name ?? code;

function RegistrationClosed() {
  return (
    <>
      <NavBar activePage="register" />
      <main id="main-content" className="max-w-3xl mx-auto px-4 py-16">
        <span className="inline-block bg-gold text-navy-deep text-xs font-black tracking-widest px-3 py-1 mb-3">{contest.shortName}</span>
        <h1 className="font-display font-black text-4xl text-gold mb-4">Registration Is Closed</h1>
        <p className="text-text-body leading-relaxed mb-3">
          Thank you to every competitor who registered and took the stage at {contest.name} on {longDate()}.
        </p>
        <p className="text-text-body leading-relaxed mb-8">
          See how the day went, or come throw with us at a free {contest.organizer.name} meetup. Questions? Email{' '}
          <a className="text-gold underline" href={`mailto:${contest.contactEmail}`}>{contest.contactEmail}</a>.
        </p>
        <div className="flex flex-wrap gap-3">
          <a href="/results" className="inline-block bg-gold text-navy-deep text-xs font-black tracking-caps px-5 py-3 hover:bg-gold-light transition-colors">SEE THE RESULTS →</a>
          <a href={contest.organizer.url} className="inline-block border border-gold text-gold text-xs font-black tracking-caps px-5 py-3 hover:bg-gold hover:text-navy-deep transition-colors">VISIT {contest.organizer.name.toUpperCase()} →</a>
        </div>
      </main>
      <Footer />
    </>
  );
}
