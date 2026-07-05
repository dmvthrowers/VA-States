'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';

type FormValues = {
  first_name: string;
  last_name: string;
  nickname: string;
  email: string;
  state: string;
  bio: string;
  team: string;
  club: string;
  yoyo: string;
  string: string;
  counterweight: string;
  instagram: string;
  tiktok: string;
  youtube: string;
  is_public: boolean;
  liability_accepted: boolean;
  code_of_conduct_accepted: boolean;
  _hp: string;
};

export default function SpectatePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [cocOpen, setCocOpen] = useState(false);
  const [showSetup, setShowSetup] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    mode: 'onChange',
    defaultValues: {
      is_public: false,
      liability_accepted: false,
      code_of_conduct_accepted: false,
    },
  });

  const onSubmit = async (values: FormValues) => {
    if (values._hp) return;
    setSubmitting(true);
    setServerError('');

    try {
      const payload = {
        first_name: values.first_name,
        last_name: values.last_name,
        nickname: values.nickname,
        email: values.email,
        state: values.state,
        bio: values.bio,
        team: values.team,
        club: values.club,
        yoyo: values.yoyo,
        string: values.string,
        counterweight: values.counterweight,
        socials: {
          instagram: values.instagram,
          tiktok: values.tiktok,
          youtube: values.youtube,
        },
        is_public: values.is_public,
        liability_accepted: values.liability_accepted,
        code_of_conduct_accepted: values.code_of_conduct_accepted,
      };

      const res = await fetch('/api/spectator-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json() as { id?: string; error?: { message: string } };

      if (!res.ok) {
        setServerError(json.error?.message ?? 'Something went wrong. Please try again.');
        return;
      }

      router.push(`/spectate/confirm?id=${json.id}`);
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
          <h1 className="font-display font-black text-4xl text-gold mb-2">RSVP to Spectate</h1>
          <p className="text-xs tracking-widest text-white/70 font-semibold uppercase">Free · All Ages · September 19, 2026 · Sterling, VA</p>
        </div>
      </div>

      <main id="main-content" className="max-w-3xl mx-auto px-4 py-10">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-10" noValidate>
          <input {...register('_hp')} type="text" name="_hp" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

          <section>
            <SectionHeader tag="STEP 1" title="Your Info" />
            <div className="grid grid-cols-2 gap-4">
              <Field label="First Name *" error={errors.first_name?.message}>
                <input {...register('first_name', { required: 'Required' })} className={inputCls(!!errors.first_name)} placeholder="Alex" />
              </Field>
              <Field label="Last Name *" error={errors.last_name?.message}>
                <input {...register('last_name', { required: 'Required' })} className={inputCls(!!errors.last_name)} placeholder="Kim" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <Field label="Nickname / Screenname" hint="Shown instead of your full name if you go public">
                <input {...register('nickname')} className={inputCls(false)} placeholder="AKtheStringSlinger" />
              </Field>
              <Field label="State *" error={errors.state?.message}>
                <input {...register('state', { required: 'Required', maxLength: { value: 2, message: '2-letter code' } })} className={inputCls(!!errors.state)} placeholder="VA" maxLength={2} />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Email *" error={errors.email?.message} hint="Used for your confirmation + calendar invite">
                <input {...register('email', { required: 'Required', pattern: { value: /^\S+@\S+\.\S+$/, message: 'Invalid email' } })} type="email" className={inputCls(!!errors.email)} placeholder="you@example.com" />
              </Field>
            </div>
          </section>

          <section>
            <SectionHeader tag="OPTIONAL" title="Public Profile" />
            <p className="text-sm text-text-body mb-4">
              Fill this in if you&apos;d like to show up on the public &quot;who&apos;s coming&quot; list. Leave it blank and stay anonymous — totally fine either way.
            </p>
            <label className="flex gap-3 items-start cursor-pointer mb-5 p-4 border border-navy-border bg-navy-deep">
              <input {...register('is_public')} type="checkbox" className="mt-0.5 w-4 h-4 accent-gold flex-shrink-0" />
              <span className="text-sm text-text-body">
                <strong className="text-white">List me publicly.</strong> Show my name/nickname (and anything I fill in below) on the site. If unchecked, I&apos;m registered privately and nothing about me is shown publicly.
              </span>
            </label>

            <Field label="Bio" hint="A couple sentences, optional">
              <textarea {...register('bio', { maxLength: { value: 1000, message: 'Max 1000 characters' } })} className={`${inputCls(!!errors.bio)} resize-none`} rows={3} />
            </Field>
            {errors.bio && <p className="text-red text-xs mt-1">{errors.bio.message}</p>}

            <div className="grid grid-cols-2 gap-4 mt-4">
              <Field label="Team">
                <input {...register('team')} className={inputCls(false)} placeholder="Team YoYoFactory" />
              </Field>
              <Field label="Club">
                <input {...register('club')} className={inputCls(false)} placeholder="DMV Throwers" />
              </Field>
            </div>

            <button
              type="button"
              onClick={() => setShowSetup(o => !o)}
              className="mt-4 text-xs font-bold text-gold hover:text-gold-light flex items-center gap-1"
            >
              {showSetup ? '▲' : '▾'} {showSetup ? 'Hide setup & socials' : 'Add my setup & socials'}
            </button>

            {showSetup && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <Field label="Yo-Yo">
                    <input {...register('yoyo')} className={inputCls(false)} placeholder="Duncan Freehand" />
                  </Field>
                  <Field label="String">
                    <input {...register('string')} className={inputCls(false)} placeholder="100% Poly" />
                  </Field>
                  <Field label="Counterweight">
                    <input {...register('counterweight')} className={inputCls(false)} placeholder="—" />
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <Field label="Instagram">
                    <input {...register('instagram')} className={inputCls(false)} placeholder="@handle" />
                  </Field>
                  <Field label="TikTok">
                    <input {...register('tiktok')} className={inputCls(false)} placeholder="@handle" />
                  </Field>
                  <Field label="YouTube">
                    <input {...register('youtube')} className={inputCls(false)} placeholder="@handle" />
                  </Field>
                </div>
              </div>
            )}
          </section>

          <section>
            <SectionHeader tag="STEP 2" title="Waivers & Agreements" />

            <div className="border border-navy-border mb-5">
              <div className="p-4">
                <div className="text-xs font-black tracking-caps text-gold mb-2">CODE OF CONDUCT</div>
                <p className="text-sm text-text-body mb-3">
                  All participants — competitors, spectators, volunteers, and sponsors — are expected to treat everyone at VSYC-26 with respect.
                </p>
                <button type="button" onClick={() => setCocOpen(o => !o)} className="text-xs font-bold text-gold hover:text-gold-light flex items-center gap-1">
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
                <strong className="text-white">Personal Responsibility:</strong> I understand that I am responsible for myself at this event and DMV Throwers is not liable for injury or loss.
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
              {submitting ? 'SUBMITTING...' : 'RSVP — IT\'S FREE →'}
            </button>
            <p className="text-xs text-text-body mt-3 text-center">
              You&apos;ll get a confirmation email with a calendar invite.
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
