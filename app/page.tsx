'use client';

import { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import type { Division } from '@/lib/pricing';
import { calculateFeePreview, formatCents } from '@/lib/pricing';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';

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
  club_affiliation: string;
  parent_name: string;
  parent_email: string;
  parent_consented: boolean;
  divisions: Division[];
  x_substyles: Array<'2A' | '3A' | '4A' | '5A'>;
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

const EARLY_BIRD_CUTOFF = new Date('2026-06-01T00:00:00-04:00');

export default function RegisterPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [cocOpen, setCocOpen] = useState(false);
  const [liabilityScrolled, setLiabilityScrolled] = useState(false);
  const [codeStatus, setCodeStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [codeApplied, setCodeApplied] = useState(false);

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
      x_substyles: [],
      liability_waiver_accepted: false,
      photo_video_consent: false,
      code_of_conduct_accepted: false,
      parent_consented: false,
      // Competitor profiles are public by default (spectators opt in instead).
      is_public: true,
    },
  });

  const watchedDivisions = watch('divisions') as Division[];
  const watchedXSubstyles = watch('x_substyles') as Array<'2A' | '3A' | '4A' | '5A'>;
  const watchedAge = parseInt(watch('age_on_event') || '0', 10);
  const watchedCompCode = watch('comp_code');
  const isMinor = watchedAge > 0 && watchedAge < 18;
  const showXSubstyle = watchedDivisions.includes('X');
  const maxXSubstyles = watchedDivisions.includes('1A') ? 1 : 2;

  const feePreview = calculateFeePreview(
    watchedDivisions,
    codeApplied,
    new Date(),
    'online',
    EARLY_BIRD_CUTOFF,
  );

  const isEarlyBirdWindow = new Date() < EARLY_BIRD_CUTOFF;

  const handleDivisionToggle = (div: Division) => {
    const current = watchedDivisions;

    let next: Division[];
    if (current.includes(div)) {
      next = current.filter(d => d !== div);
    } else if (div === 'SBJ') {
      // SBJ cannot be combined with pro divisions.
      next = ['SBJ'];
    } else {
      // Picking 1A/X removes SBJ automatically.
      next = [...current.filter(d => d !== 'SBJ'), div];
    }

    setValue('divisions', next, { shouldValidate: true });
    if (!next.includes('X')) {
      setValue('x_substyles', [], { shouldValidate: true });
    }
    setCodeApplied(false);
    setCodeStatus('idle');
  };

  const handleXSubstyleToggle = (substyle: '2A' | '3A' | '4A' | '5A') => {
    const current = watchedXSubstyles ?? [];
    let next = current;
    if (current.includes(substyle)) {
      next = current.filter(s => s !== substyle);
    } else if (current.length < maxXSubstyles) {
      next = [...current, substyle];
    }
    setValue('x_substyles', next, { shouldValidate: true });
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
      const json = await res.json() as { valid: boolean };
      if (json.valid) {
        setCodeStatus('valid');
        setCodeApplied(true);
      } else {
        setCodeStatus('invalid');
        setCodeApplied(false);
      }
    } catch {
      setCodeStatus('invalid');
      setCodeApplied(false);
    }
  }, [watchedCompCode]);

  const onSubmit = async (values: FormValues) => {
    if (values._hp) return;
    setSubmitting(true);
    setServerError('');

    try {
      const { instagram, tiktok, youtube, ...rest } = values;
      const payload = {
        ...rest,
        x_substyles: values.x_substyles ?? [],
        socials: {
          instagram,
          tiktok,
          youtube,
        },
        age_on_event: parseInt(values.age_on_event, 10),
        comp_code: codeApplied ? values.comp_code?.trim().toUpperCase() : undefined,
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

  return (
    <>
      <NavBar activePage="register" />

      {/* Page hero */}
      <div className="bg-navy-deep border-b border-navy-border relative overflow-hidden py-12 px-6">
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(201,168,76,0.06) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
        <div className="max-w-5xl mx-auto relative">
          <span className="inline-block bg-gold text-navy-deep text-xs font-black tracking-widest px-3 py-1 mb-3">VSYC-26</span>
          <h1 className="font-display font-black text-4xl text-gold mb-2">Register to Compete</h1>
          <p className="text-xs tracking-widest text-white/70 font-semibold uppercase">Virginia State Yo-Yo Contest · September 19, 2026 · Sterling, VA</p>
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
                <input {...register('first_name', { required: 'Required' })} className={inputCls(!!errors.first_name)} placeholder="Brandon" />
              </Field>
              <Field label="Last Name *" error={errors.last_name?.message}>
                <input {...register('last_name', { required: 'Required' })} className={inputCls(!!errors.last_name)} placeholder="Rogers" />
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
                    required: 'Required',
                    min: { value: 1, message: 'Must be at least 1' },
                    max: { value: 120, message: 'Invalid age' },
                  })}
                  type="number" min={1} max={120}
                  className={inputCls(!!errors.age_on_event)}
                  placeholder="25"
                />
              </Field>
              <Field label="Email *" error={errors.email?.message}>
                <input {...register('email', { required: 'Required', pattern: { value: /^\S+@\S+\.\S+$/, message: 'Invalid email' } })} type="email" className={inputCls(!!errors.email)} placeholder="you@example.com" />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <Field label="Phone *" error={errors.phone?.message}>
                <input {...register('phone', { required: 'Required' })} type="tel" className={inputCls(!!errors.phone)} placeholder="(555) 555-5555" />
              </Field>
              <Field label="Club Affiliation" hint="Optional">
                <input {...register('club_affiliation')} className={inputCls(false)} placeholder="DMV Throwers" />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              <div className="col-span-2">
                <Field label="City *" error={errors.city?.message}>
                  <input {...register('city', { required: 'Required' })} className={inputCls(!!errors.city)} placeholder="Sterling" />
                </Field>
              </div>
              <Field label="State *" error={errors.state?.message}>
                <input {...register('state', { required: 'Required', maxLength: { value: 2, message: '2-letter code' } })} className={inputCls(!!errors.state)} placeholder="VA" maxLength={2} />
              </Field>
            </div>
          </section>

          {/* ── SECTION 2: Divisions ── */}
          <section>
            <SectionHeader tag="STEP 2" title="Division Selection" />
            <p className="text-sm text-text-body mb-4">Select your competition division(s). 1A + X can be combined. Sport / Beginner / Junior (SBJ) cannot be combined with 1A or X.</p>

            {errors.divisions && (
              <p className="text-red text-sm mb-3">{errors.divisions.message}</p>
            )}

            <div className="space-y-3">
              {([
                {
                  code: '1A' as Division,
                  name: '1A — Single String',
                  price: '$25',
                  desc: 'Classic 1-string freestyle. 2-minute routine, judged on technical execution plus trick presentation, performance quality, musicality, and routine construction.',
                  format: '2 min · Scored judging',
                },
                {
                  code: 'X' as Division,
                  name: 'X Division',
                  price: '$20',
                  desc: 'Non-1A styles: 2A (looping), 3A (two strings), 4A (offstring), or 5A (freehand). Pick one.',
                  format: '2 min · Scored judging',
                },
                {
                  code: 'SBJ' as Division,
                  name: 'Sport / Beginner / Junior',
                  price: '$15',
                  desc: 'Open to all skill levels and ages. Relaxed format, simplified judging, great entry point.',
                  format: '90 sec · Simplified scoring',
                },
              ] as const).map(({ code, name, price, desc, format }) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => handleDivisionToggle(code)}
                  className={`w-full text-left border p-4 transition-colors ${
                    watchedDivisions.includes(code)
                      ? 'border-gold bg-navy'
                      : 'border-navy-border bg-navy-deep hover:border-gold/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-5 h-5 border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${watchedDivisions.includes(code) ? 'border-gold bg-gold' : 'border-navy-border'}`}>
                        {watchedDivisions.includes(code) && <span className="text-navy-deep font-black text-xs">✓</span>}
                      </div>
                      <div>
                        <div className="font-bold text-white text-sm">{name}</div>
                        <div className="text-xs text-text-body mt-0.5">{desc}</div>
                        <div className="text-xs text-gold/60 mt-1">{format}</div>
                      </div>
                    </div>
                    <span className="font-display font-bold text-gold text-lg flex-shrink-0">{price}</span>
                  </div>
                </button>
              ))}
            </div>

            {/* X substyle */}
            {showXSubstyle && (
              <div className="mt-4 p-4 bg-navy border border-gold/30">
                <label className="block text-xs font-black tracking-caps text-gold mb-3">X DIVISION SUB-STYLES *</label>
                <p className="text-xs text-text-body mb-3">
                  {watchedDivisions.includes('1A')
                    ? '1A + X is limited to one X sub-style (max 2 total styles).'
                    : 'Choose up to two X sub-styles.'}
                </p>
                <div className="space-y-2">
                  {([
                    { code: '2A', desc: 'Looping - two looping yo-yos focused on rhythm and control.' },
                    { code: '3A', desc: 'Two-Handed String - two string-trick yo-yos, one in each hand.' },
                    { code: '4A', desc: 'Offstring - yo-yo is not attached to the string during play.' },
                    { code: '5A', desc: 'Freehand - counterweight style with no finger loop.' },
                  ] as const).map(({ code, desc }) => (
                    <label key={code} className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={watchedXSubstyles.includes(code)}
                        onChange={() => handleXSubstyleToggle(code)}
                        disabled={!watchedXSubstyles.includes(code) && watchedXSubstyles.length >= maxXSubstyles}
                        className="w-4 h-4 accent-gold mt-0.5"
                      />
                      <span>
                        <span className="text-sm font-semibold text-white">{code}</span>
                        <span className="text-xs text-text-body ml-2">{desc}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {errors.x_substyles && <p className="text-red text-sm mt-2">{errors.x_substyles.message}</p>}
              </div>
            )}

            {/* Combo note */}
            {watchedDivisions.includes('1A') && watchedDivisions.includes('X') && (
              <div className="mt-3 p-3 border border-gold/40 bg-navy text-xs text-gold font-semibold">
                ★ 1A + X Division combo: $40 (saves $5 vs. registering separately)
              </div>
            )}

            <div className="mt-2">
              <a
                href="https://dmvthrowers.club/vsyc26-rules.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gold/60 hover:text-gold"
              >
                → View full division rules &amp; judging criteria ↗
              </a>
            </div>

            {/* Comp code */}
            <div className="mt-5">
              <label className="block text-xs font-black tracking-caps text-gold mb-2">COMP / SPONSOR CODE</label>
              <div className="flex gap-2">
                <input
                  {...register('comp_code')}
                  className={`flex-1 bg-navy-deep border px-3 py-2 text-sm text-white font-mono uppercase ${codeStatus === 'valid' ? 'border-green-500' : codeStatus === 'invalid' ? 'border-red' : 'border-navy-border'} focus:outline-none focus:border-gold`}
                  placeholder="VOLUNTEER26"
                  onChange={() => { setCodeStatus('idle'); setCodeApplied(false); }}
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
              {codeStatus === 'valid' && <p className="text-green-400 text-xs mt-1 font-semibold">✓ Valid — entry fee waived</p>}
              {codeStatus === 'invalid' && <p className="text-red text-xs mt-1">✗ Invalid or expired code</p>}
            </div>
          </section>

          {/* ── SECTION 3: Minor Consent (conditional) ── */}
          {isMinor && (
            <section className="border border-gold/40 p-5">
              <SectionHeader tag="MINOR CONSENT" title="Parent / Guardian Information" />
              <p className="text-sm text-text-body mb-4">This competitor is under 18. A parent or guardian must provide their information and consent below.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Parent / Guardian Name *" error={errors.parent_name?.message}>
                  <input {...register('parent_name', { required: isMinor ? 'Required for minors' : false })} className={inputCls(!!errors.parent_name)} />
                </Field>
                <Field label="Parent / Guardian Email *" error={errors.parent_email?.message}>
                  <input {...register('parent_email', { required: isMinor ? 'Required for minors' : false, pattern: { value: /^\S+@\S+\.\S+$/, message: 'Invalid email' } })} type="email" className={inputCls(!!errors.parent_email)} />
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
              {errors.parent_consented && <p className="text-red text-xs mt-1">{errors.parent_consented.message}</p>}
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                <Field label="Yo-Yo">
                  <input {...register('yoyo')} className={inputCls(false)} placeholder="Edge Beyond" />
                </Field>
                <Field label="String">
                  <input {...register('string')} className={inputCls(false)} placeholder="Poly 100%" />
                </Field>
                <Field label="Counterweight">
                  <input {...register('counterweight')} className={inputCls(false)} placeholder="Dice CW" />
                </Field>
              </div>

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
                      {...register('scheduling_notes', { maxLength: { value: 300, message: 'Max 300 characters' } })}
                      className={`${inputCls(!!errors.scheduling_notes)} resize-none`}
                      rows={2}
                      placeholder={watch('performance_time_pref') === 'conflict' ? 'e.g. I need to be done by 2pm for a prior commitment' : 'Any notes for the organizers'}
                    />
                  </Field>
                  {errors.scheduling_notes && <p className="text-red text-xs mt-1">{errors.scheduling_notes.message}</p>}
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
                    {...register('code_of_conduct_accepted', { required: 'Required' })}
                    type="checkbox"
                    className="mt-0.5 w-4 h-4 accent-gold flex-shrink-0"
                  />
                  <span className="text-sm text-text-body">
                    I agree to the VSYC-26 Code of Conduct. I understand that violations may result in removal from the venue and a ban from future DMV Throwers events. <strong className="text-white">This applies to all attendees regardless of status, sponsorship, or affiliation.</strong>
                  </span>
                </label>
                {errors.code_of_conduct_accepted && <p className="text-red text-xs mt-1">{errors.code_of_conduct_accepted.message}</p>}
              </div>
            </div>

            {/* Liability */}
            <div className="border border-navy-border mb-4">
              <div className="p-4 border-b border-navy-border">
                <div className="text-xs font-black tracking-caps text-gold mb-2">LIABILITY RELEASE (REQUIRED)</div>
                <p className="text-xs text-text-body mb-3">Scroll to the end of this section to enable the checkbox.</p>
                <div
                  className="max-h-44 overflow-y-auto bg-navy-deep border border-navy-border p-3 text-sm text-text-body space-y-2"
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
                    {...register('liability_waiver_accepted', { required: 'Required' })}
                    type="checkbox"
                    disabled={!liabilityScrolled}
                    className="mt-0.5 w-4 h-4 accent-gold flex-shrink-0 disabled:opacity-50"
                  />
                  <span className="text-sm text-text-body">
                    I have read and agree to the VSYC-26 Liability Release.
                    {!liabilityScrolled && <span className="text-gold"> (Scroll to the end to unlock)</span>}
                  </span>
                </label>
              </div>
            </div>
            {errors.liability_waiver_accepted && <p className="text-red text-xs mb-3">{errors.liability_waiver_accepted.message}</p>}

            {/* Photo/video */}
            <label className="flex gap-3 items-start cursor-pointer">
              <input
                {...register('photo_video_consent', { required: 'Required' })}
                type="checkbox"
                className="mt-0.5 w-4 h-4 accent-gold flex-shrink-0"
              />
              <span className="text-sm text-text-body">
                <strong className="text-white">Photo / Video Consent (Required):</strong> I consent to being photographed and recorded at VSYC-26, including livestream broadcast, and for use in DMV Throwers promotional and archival materials.
              </span>
            </label>
            {errors.photo_video_consent && <p className="text-red text-xs mt-1">{errors.photo_video_consent.message}</p>}
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
              Payment and music upload are handled in this registration portal after you submit.
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
                  {watchedDivisions.map(d => (
                    <div key={d} className="flex justify-between text-sm">
                      <span className="text-text-body">{d === 'SBJ' ? 'Sport/Beginner/Junior' : d}</span>
                      <span className="text-white font-semibold">{formatCents({ '1A': 2500, 'X': 2000, 'SBJ': 1500 }[d] ?? 0)}</span>
                    </div>
                  ))}
                </div>

                {feePreview.combo_applied && (
                  <div className="flex justify-between text-sm text-green-400 mb-2">
                    <span>1A + X combo discount</span>
                    <span>−$5.00</span>
                  </div>
                )}
                {feePreview.early_bird_applied && (
                  <div className="flex justify-between text-sm text-green-400 mb-2">
                    <span>Early bird discount</span>
                    <span>−$5.00</span>
                  </div>
                )}
                {feePreview.is_comp && (
                  <div className="flex justify-between text-sm text-green-400 mb-2">
                    <span>Comp code applied</span>
                    <span>−100%</span>
                  </div>
                )}

                <div className="border-t border-navy-border pt-3 mt-3 flex justify-between">
                  <span className="font-bold text-white text-sm">TOTAL</span>
                  <span className="font-display font-bold text-gold text-xl">
                    {feePreview.is_comp ? 'FREE' : formatCents(feePreview.fee_cents)}
                  </span>
                </div>

                {isEarlyBirdWindow && !feePreview.early_bird_applied && !feePreview.is_comp && (
                  <p className="text-xs text-gold/70 mt-3">★ Early bird ends June 1 — register now and save $5</p>
                )}
              </>
            )}

            <div className="mt-5 pt-4 border-t border-navy-border">
              <div className="text-xs font-black tracking-caps text-gold mb-2">PAYMENT</div>
              <p className="text-xs text-text-body mb-2">Online registration payments are processed securely by Stripe at checkout.</p>
              <p className="text-xs text-text-body">Day-of payment options may be available at check-in. See the registration desk for details.</p>
            </div>

            <div className="mt-4 pt-4 border-t border-navy-border">
              <div className="text-xs font-black tracking-caps text-gold mb-2">MUSIC DEADLINE</div>
              <p className="text-xs text-text-body">Upload your music in this registration app after payment. <strong className="text-white">Deadline: Sept 12, 2026.</strong></p>
              <p className="text-xs text-text-body mt-2">Music must be appropriate for all audiences — no explicit language, sexual content, or glorification of violence. <strong className="text-white">Inappropriate music results in disqualification.</strong> Full rules are on the upload page.</p>
            </div>

            <div className="mt-4 pt-4 border-t border-navy-border">
              <div className="text-xs font-black tracking-caps text-gold mb-3">WHAT HAPPENS NEXT</div>
              <ol className="space-y-2.5">
                {[
                  { n: '1', label: 'Submit this form', sub: 'You\'re in the queue' },
                  { n: '2', label: 'Complete Stripe checkout', sub: 'Secure online payment in portal' },
                  { n: '3', label: 'Upload your music', sub: 'In-app upload · due Sept 12' },
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
              : <p className="font-display font-bold text-gold text-2xl">{feePreview.is_comp ? 'FREE' : formatCents(feePreview.fee_cents)}</p>
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

function SectionHeader({ tag, title }: { tag: string; title: string }) {
  return (
    <div className="mb-5">
      <span className="inline-block bg-gold text-navy-deep text-xs font-black tracking-widest px-2 py-0.5 mb-2">{tag}</span>
      <h2 className="font-display font-black text-2xl text-white">{title}</h2>
      <div className="w-12 h-0.5 bg-gold mt-2" />
    </div>
  );
}

function Field({ label, hint, error, children }: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-black tracking-caps text-gold mb-1.5">
        {label}
        {hint && <span className="text-gold/60 font-normal normal-case tracking-normal ml-1">— {hint}</span>}
      </label>
      {children}
      {error && <p className="text-red text-xs mt-1">{error}</p>}
    </div>
  );
}

function inputCls(hasError: boolean) {
  return `w-full bg-navy-deep border ${hasError ? 'border-red' : 'border-navy-border'} px-3 py-2.5 text-sm text-white focus:outline-none focus:border-gold transition-colors`;
}
