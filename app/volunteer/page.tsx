'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import { VOLUNTEER_ROLES, SHIFT_PREFERENCES, SHIFT_PREFERENCE_LABELS, OTHER_ROLE_KEY, isExperienceRequired, type ShiftPreference } from '@/lib/volunteer-roles';

type FormValues = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  pronouns: string;
  is_18_or_older: boolean;
  parent_guardian_name: string;
  parent_guardian_email: string;
  parent_guardian_phone: string;
  role_choice_1: string;
  role_choice_2: string;
  shift_preference: ShiftPreference;
  experience_notes: string;
  other_role_description: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  photo_video_consent: boolean;
  liability_accepted: boolean;
  code_of_conduct_accepted: boolean;
  _hp: string;
};

interface RoleAvailability {
  role_key: string;
  label: string;
  category: 'core' | 'judge' | 'non_core';
  spots_remaining: number | null;
  is_full: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  core: 'Core roles (small honorarium possible)',
  judge: 'Judges',
  non_core: 'Volunteer roles',
  other: 'Something else? (talent / show idea)',
};

export default function VolunteerPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [cocOpen, setCocOpen] = useState(false);
  const [availability, setAvailability] = useState<RoleAvailability[]>([]);

  useEffect(() => {
    fetch('/api/volunteer-roles')
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { roles?: RoleAvailability[] } | null) => {
        if (json?.roles) setAvailability(json.roles);
      })
      .catch(() => {});
  }, []);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    mode: 'onChange',
    defaultValues: {
      is_18_or_older: true,
      shift_preference: 'flexible',
      photo_video_consent: false,
      liability_accepted: false,
      code_of_conduct_accepted: false,
      role_choice_2: '',
    },
  });

  const isAdult = watch('is_18_or_older');
  const roleChoice1 = watch('role_choice_1');
  const roleChoice2 = watch('role_choice_2');
  const experienceRequired = isExperienceRequired(roleChoice1) || isExperienceRequired(roleChoice2);
  const choseOther = roleChoice1 === OTHER_ROLE_KEY || roleChoice2 === OTHER_ROLE_KEY;

  const spotsLabel = (roleKey: string) => {
    const a = availability.find((x) => x.role_key === roleKey);
    if (!a || a.spots_remaining === null) return '';
    return a.is_full ? ' — FULL (still accepting applications)' : ` — ${a.spots_remaining} confirmed spot${a.spots_remaining === 1 ? '' : 's'} open`;
  };

  const onSubmit = async (values: FormValues) => {
    if (values._hp) return;
    setSubmitting(true);
    setServerError('');

    try {
      const payload = {
        first_name: values.first_name,
        last_name: values.last_name,
        email: values.email,
        phone: values.phone,
        pronouns: values.pronouns,
        is_18_or_older: values.is_18_or_older,
        parent_guardian_name: values.is_18_or_older ? '' : values.parent_guardian_name,
        parent_guardian_email: values.is_18_or_older ? '' : values.parent_guardian_email,
        parent_guardian_phone: values.is_18_or_older ? '' : values.parent_guardian_phone,
        role_choice_1: values.role_choice_1,
        role_choice_2: values.role_choice_2,
        shift_preference: values.shift_preference,
        experience_notes: values.experience_notes,
        other_role_description: values.other_role_description,
        emergency_contact_name: values.emergency_contact_name,
        emergency_contact_phone: values.emergency_contact_phone,
        photo_video_consent: values.photo_video_consent,
        liability_accepted: values.liability_accepted,
        code_of_conduct_accepted: values.code_of_conduct_accepted,
      };

      const res = await fetch('/api/volunteer-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json() as { id?: string; error?: { message: string } };

      if (!res.ok) {
        setServerError(json.error?.message ?? 'Something went wrong. Please try again.');
        return;
      }

      router.push(`/volunteer/confirm?id=${json.id}`);
    } catch {
      setServerError('Network error — please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <NavBar />

      <div className="bg-navy-deep border-b border-navy-border relative overflow-hidden py-12 px-6">
        <div className="max-w-3xl mx-auto relative">
          <span className="inline-block bg-gold text-navy-deep text-xs font-black tracking-widest px-3 py-1 mb-3">VSYC-26</span>
          <h1 className="font-display font-black text-4xl text-gold mb-2">Volunteer for VSYC-26</h1>
          <p className="text-xs tracking-widest text-white/70 font-semibold uppercase">All Ages · All Levels · September 19, 2026 · Sterling, VA</p>
          <p className="text-sm text-text-body mt-3">
            Every role starts as volunteer. Final role assignments are the event organizer&apos;s call, so your assigned
            role may differ from your top choice. Registration Booth is our highest-priority support role outside of
            the core roles.
          </p>
          <Link href="/volunteer/roles" className="inline-block mt-4 text-xs font-black tracking-caps text-gold hover:text-gold-light">
            → See all roles and current availability
          </Link>
        </div>
      </div>

      <main id="main-content" className="max-w-3xl mx-auto px-4 py-10">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-10" noValidate>
          <input {...register('_hp')} type="text" name="_hp" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

          <section>
            <SectionHeader tag="STEP 1" title="Your Info" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="First Name *" error={errors.first_name?.message}>
                <input {...register('first_name', { required: 'Required' })} className={inputCls(!!errors.first_name)} placeholder="Alex" />
              </Field>
              <Field label="Last Name *" error={errors.last_name?.message}>
                <input {...register('last_name', { required: 'Required' })} className={inputCls(!!errors.last_name)} placeholder="Kim" />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <Field label="Email *" error={errors.email?.message} hint="Used for your confirmation and any follow-up">
                <input {...register('email', { required: 'Required', pattern: { value: /^\S+@\S+\.\S+$/, message: 'Invalid email' } })} type="email" className={inputCls(!!errors.email)} placeholder="you@example.com" />
              </Field>
              <Field label="Phone *" error={errors.phone?.message} hint="For day-of coordination">
                <input {...register('phone', { required: 'Required' })} type="tel" className={inputCls(!!errors.phone)} placeholder="(555) 555-5555" />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Pronouns" hint="Optional">
                <input {...register('pronouns')} className={inputCls(false)} placeholder="she/her" />
              </Field>
            </div>

            <label className="flex gap-3 items-start cursor-pointer mt-5 p-4 border border-navy-border bg-navy-deep">
              <input {...register('is_18_or_older')} type="checkbox" className="mt-0.5 w-4 h-4 accent-gold flex-shrink-0" />
              <span className="text-sm text-text-body">
                <strong className="text-white">I am 18 or older.</strong> Uncheck this if you&apos;re under 18 — we&apos;ll need a parent/guardian contact.
              </span>
            </label>

            {!isAdult && (
              <div className="mt-4 p-4 border border-gold/40 bg-navy space-y-4">
                <div className="text-xs font-black tracking-caps text-gold">PARENT / GUARDIAN CONTACT (required for volunteers under 18)</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Parent/Guardian Name *" error={errors.parent_guardian_name?.message}>
                    <input {...register('parent_guardian_name', { required: !isAdult ? 'Required for volunteers under 18' : false })} className={inputCls(!!errors.parent_guardian_name)} />
                  </Field>
                  <Field label="Parent/Guardian Phone *" error={errors.parent_guardian_phone?.message}>
                    <input {...register('parent_guardian_phone', { required: !isAdult ? 'Required for volunteers under 18' : false })} type="tel" className={inputCls(!!errors.parent_guardian_phone)} />
                  </Field>
                </div>
                <Field label="Parent/Guardian Email" hint="Optional but recommended">
                  <input {...register('parent_guardian_email')} type="email" className={inputCls(false)} />
                </Field>
              </div>
            )}
          </section>

          <section>
            <SectionHeader tag="STEP 2" title="Role Preferences" />
            <p className="text-sm text-text-body mb-4">
              Pick your top choice and, if you&apos;re flexible, a second choice. This helps us fill critical roles like
              Registration Booth even if your first pick is already full.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="1st Choice Role *" error={errors.role_choice_1?.message}>
                <select {...register('role_choice_1', { required: 'Required' })} className={inputCls(!!errors.role_choice_1)}>
                  <option value="">Select a role…</option>
                  {(['core', 'judge', 'non_core', 'other'] as const).map((cat) => (
                    <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
                      {VOLUNTEER_ROLES.filter((r) => r.category === cat).map((r) => (
                        <option key={r.key} value={r.key}>{r.label}{spotsLabel(r.key)}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
              <Field label="2nd Choice Role" hint="Optional">
                <select {...register('role_choice_2')} className={inputCls(false)}>
                  <option value="">No second choice</option>
                  {(['core', 'judge', 'non_core', 'other'] as const).map((cat) => (
                    <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
                      {VOLUNTEER_ROLES.filter((r) => r.category === cat && r.key !== roleChoice1).map((r) => (
                        <option key={r.key} value={r.key}>{r.label}{spotsLabel(r.key)}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
            </div>

            {choseOther && (
              <div className="mt-4">
                <Field label="What's the idea? *" error={errors.other_role_description?.message} hint="Magician, lunch-break band, something else — tell us what it is">
                  <textarea
                    {...register('other_role_description', { required: choseOther ? 'Tell us what the act/idea is' : false, maxLength: { value: 300, message: 'Max 300 characters' } })}
                    className={`${inputCls(!!errors.other_role_description)} resize-none`}
                    rows={2}
                  />
                </Field>
              </div>
            )}

            <div className="mt-4">
              <Field label="Shift Preference">
                <select {...register('shift_preference')} className={inputCls(false)}>
                  {SHIFT_PREFERENCES.map((s) => (
                    <option key={s} value={s}>{SHIFT_PREFERENCE_LABELS[s]}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="mt-4">
              <Field
                label={experienceRequired ? 'Relevant Experience *' : 'Relevant Experience'}
                hint={experienceRequired
                  ? 'Required for core roles, judges, and "Other" — why you’d be a good fit'
                  : 'Optional — sound/AV experience, judging history, certifications, etc.'}
              >
                <textarea
                  {...register('experience_notes', {
                    required: experienceRequired ? 'Relevant experience is required for this role' : false,
                    maxLength: { value: 500, message: 'Max 500 characters' },
                  })}
                  className={`${inputCls(!!errors.experience_notes)} resize-none`}
                  rows={3}
                />
              </Field>
              {errors.experience_notes && <p className="text-red text-xs mt-1">{errors.experience_notes.message}</p>}
            </div>
          </section>

          <section>
            <SectionHeader tag="OPTIONAL" title="Emergency Contact & Media" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Emergency Contact Name">
                <input {...register('emergency_contact_name')} className={inputCls(false)} />
              </Field>
              <Field label="Emergency Contact Phone">
                <input {...register('emergency_contact_phone')} type="tel" className={inputCls(false)} />
              </Field>
            </div>

            <label className="flex gap-3 items-start cursor-pointer mt-5 p-4 border border-navy-border bg-navy-deep">
              <input {...register('photo_video_consent')} type="checkbox" className="mt-0.5 w-4 h-4 accent-gold flex-shrink-0" />
              <span className="text-sm text-text-body">
                <strong className="text-white">I&apos;m okay appearing in event photos/video.</strong> VSYC-26 includes photography, livestream, and event recap media.
              </span>
            </label>
          </section>

          <section>
            <SectionHeader tag="STEP 3" title="Waivers & Agreements" />

            <div className="border border-navy-border mb-5">
              <div className="p-4">
                <div className="text-xs font-black tracking-caps text-gold mb-2">CODE OF CONDUCT</div>
                <p className="text-sm text-text-body mb-3">
                  All participants — competitors, spectators, volunteers, and sponsors — are expected to treat everyone at VSYC-26 with respect.
                </p>
                <button type="button" onClick={() => setCocOpen((o) => !o)} className="text-xs font-bold text-gold hover:text-gold-light flex items-center gap-1">
                  {cocOpen ? '▲' : '▾'} {cocOpen ? 'Collapse' : 'Read full Code of Conduct'}
                </button>
                {cocOpen && (
                  <div className="mt-3 p-3 bg-navy-deep border border-navy-border text-sm text-text-body space-y-2 max-h-48 overflow-y-auto">
                    <p><strong className="text-white">1. Be respectful.</strong> Treat all attendees with dignity regardless of skill level, age, background, or affiliation.</p>
                    <p><strong className="text-white">2. No harassment.</strong> Harassment in any form is grounds for immediate removal.</p>
                    <p><strong className="text-white">3. No discrimination.</strong> VSYC-26 is a welcoming space for everyone.</p>
                    <p><strong className="text-white">4. Venue rules apply.</strong> Follow all Dulles Town Center policies at all times.</p>
                    <p><strong className="text-white">5. Enforcement.</strong> Violations may result in removal from the venue and a ban from future DMV Throwers events.</p>
                  </div>
                )}
                <a href="https://dmvthrowers.club/code-of-conduct.html" target="_blank" rel="noopener noreferrer" className="text-xs text-gold/70 hover:text-gold mt-2 inline-block">
                  → Read on the website ↗
                </a>
              </div>
              <div className="border-t border-navy-border p-4">
                <label className="flex gap-3 items-start cursor-pointer">
                  <input {...register('code_of_conduct_accepted', { required: 'Required' })} type="checkbox" className="mt-0.5 w-4 h-4 accent-gold flex-shrink-0" />
                  <span className="text-sm text-text-body">I agree to the VSYC-26 Code of Conduct.</span>
                </label>
                {errors.code_of_conduct_accepted && <p className="text-red text-xs mt-1">{errors.code_of_conduct_accepted.message}</p>}
              </div>
            </div>

            <label className="flex gap-3 items-start cursor-pointer">
              <input {...register('liability_accepted', { required: 'Required' })} type="checkbox" className="mt-0.5 w-4 h-4 accent-gold flex-shrink-0" />
              <span className="text-sm text-text-body">
                <strong className="text-white">Personal Responsibility:</strong> I understand that I am responsible for myself while volunteering at this event and DMV Throwers is not liable for injury or loss.
              </span>
            </label>
            {errors.liability_accepted && <p className="text-red text-xs mt-1">{errors.liability_accepted.message}</p>}
          </section>

          {serverError && (
            <div className="p-4 border border-red bg-red/10 text-sm text-white">{serverError}</div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gold text-navy-deep font-black tracking-caps py-4 text-sm hover:bg-gold-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'SUBMITTING...' : 'SUBMIT VOLUNTEER APPLICATION →'}
            </button>
            <p className="text-xs text-text-body mt-3 text-center">
              You&apos;ll get a confirmation email. Role assignments follow separately.
            </p>
          </div>
        </form>
      </main>

      <Footer />
    </>
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
