'use client';

import { useEffect, useMemo, useState } from 'react';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import { createBrowserClient } from '@/lib/supabase/client';

type AuthMode = 'login' | 'signup';

type PlayerProfile = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  age_on_event: number;
  divisions: string[];
  paid: boolean;
  fee_cents: number;
  music_uploaded_at: string | null;
  can_upload_music: boolean;
  music_upload_url: string | null;
  preferred_bracket_name: string | null;
  pronouns: string | null;
  phone: string;
  city: string;
  state: string;
  club_affiliation: string | null;
  parent_name: string | null;
  parent_email: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  accessibility_needs: string | null;
  performance_time_pref: 'no_pref' | 'early' | 'late' | 'conflict' | null;
  scheduling_notes: string | null;
};

type EditableProfile = {
  preferred_bracket_name: string;
  pronouns: string;
  phone: string;
  city: string;
  state: string;
  club_affiliation: string;
  parent_name: string;
  parent_email: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  accessibility_needs: string;
  performance_time_pref: '' | 'no_pref' | 'early' | 'late' | 'conflict';
  scheduling_notes: string;
};

const supabase = createBrowserClient();

function toEditable(profile: PlayerProfile): EditableProfile {
  return {
    preferred_bracket_name: profile.preferred_bracket_name ?? '',
    pronouns: profile.pronouns ?? '',
    phone: profile.phone ?? '',
    city: profile.city ?? '',
    state: profile.state ?? '',
    club_affiliation: profile.club_affiliation ?? '',
    parent_name: profile.parent_name ?? '',
    parent_email: profile.parent_email ?? '',
    emergency_contact_name: profile.emergency_contact_name ?? '',
    emergency_contact_phone: profile.emergency_contact_phone ?? '',
    accessibility_needs: profile.accessibility_needs ?? '',
    performance_time_pref: profile.performance_time_pref ?? '',
    scheduling_notes: profile.scheduling_notes ?? '',
  };
}

export default function PlayerPortalPage() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [registrationId, setRegistrationId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  const [authToken, setAuthToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [editable, setEditable] = useState<EditableProfile | null>(null);

  const deadlineLabel = useMemo(() => 'September 12, 2026', []);

  async function loadProfile(token: string) {
    const res = await fetch('/api/player/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const json = await res.json().catch(() => ({})) as PlayerProfile & { error?: { message?: string } };
    if (!res.ok) {
      throw new Error(json?.error?.message ?? 'Could not load your registration.');
    }

    setProfile(json);
    setEditable(toEditable(json));
  }

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? null;
      if (!active) return;

      setAuthToken(token);
      if (token) {
        try {
          await loadProfile(token);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not load your registration.');
        }
      }
      setLoading(false);
    })();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const token = session?.access_token ?? null;
      setAuthToken(token);
      if (!token) {
        setProfile(null);
        setEditable(null);
        return;
      }
      try {
        await loadProfile(token);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load your registration.');
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const signUpRes = await fetch('/api/player-auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registration_id: registrationId.trim(),
          email: email.trim(),
          password,
        }),
      });
      const signUpBody = await signUpRes.json().catch(() => ({})) as { error?: { message?: string } };

      if (!signUpRes.ok) {
        throw new Error(signUpBody.error?.message ?? 'Could not create account.');
      }

      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (loginError || !data.session) {
        throw new Error(loginError?.message ?? 'Account created, but sign-in failed. Please sign in manually.');
      }

      setAuthToken(data.session.access_token);
      await loadProfile(data.session.access_token);
      setSuccess('Account created and signed in.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account.');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (loginError || !data.session) {
        throw new Error(loginError?.message ?? 'Invalid email or password.');
      }

      setAuthToken(data.session.access_token);
      await loadProfile(data.session.access_token);
      setSuccess('Signed in.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!authToken || !editable) return;

    setSaveLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/player/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(editable),
      });
      const body = await res.json().catch(() => ({})) as { ok?: boolean; error?: { message?: string } };
      if (!res.ok || !body.ok) {
        throw new Error(body.error?.message ?? 'Could not save your changes.');
      }

      await loadProfile(authToken);
      setSuccess('Your registration details were updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your changes.');
    } finally {
      setSaveLoading(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setAuthToken(null);
    setProfile(null);
    setEditable(null);
    setSuccess('Signed out.');
  }

  return (
    <>
      <NavBar />
      <main id="main-content" className="max-w-4xl mx-auto px-4 py-10">
        <h1 className="font-display font-black text-3xl text-gold mb-2">Competitor Portal</h1>
        <p className="text-sm text-text-body mb-8">Sign in to update your registration and access your music upload link.</p>

        {error && <div className="mb-4 border border-red bg-red/10 p-3 text-sm text-white">{error}</div>}
        {success && <div className="mb-4 border border-green-700 bg-green-900/30 p-3 text-sm text-white">{success}</div>}

        {loading ? (
          <p className="text-text-body">Loading...</p>
        ) : !authToken || !profile || !editable ? (
          <section className="border border-navy-border bg-navy p-6">
            <div className="flex gap-3 mb-5">
              <button
                type="button"
                onClick={() => setMode('login')}
                className={`px-3 py-2 text-xs tracking-caps font-black ${mode === 'login' ? 'bg-gold text-navy-deep' : 'bg-navy-deep text-text-body border border-navy-border'}`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setMode('signup')}
                className={`px-3 py-2 text-xs tracking-caps font-black ${mode === 'signup' ? 'bg-gold text-navy-deep' : 'bg-navy-deep text-text-body border border-navy-border'}`}
              >
                Create Account
              </button>
            </div>

            {mode === 'signup' ? (
              <form onSubmit={handleSignup} className="space-y-4">
                <div>
                  <label className="block text-xs font-black tracking-caps text-gold mb-1.5">Registration ID</label>
                  <input
                    value={registrationId}
                    onChange={(e) => setRegistrationId(e.target.value)}
                    aria-label="Registration ID"
                    title="Registration ID"
                    className="w-full bg-navy-deep border border-navy-border px-3 py-2.5 text-sm text-white focus:outline-none focus:border-gold"
                    placeholder="From your confirmation link: ?id=..."
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-black tracking-caps text-gold mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-label="Email"
                    title="Email"
                    className="w-full bg-navy-deep border border-navy-border px-3 py-2.5 text-sm text-white focus:outline-none focus:border-gold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-black tracking-caps text-gold mb-1.5">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-label="Password"
                    title="Password"
                    className="w-full bg-navy-deep border border-navy-border px-3 py-2.5 text-sm text-white focus:outline-none focus:border-gold"
                    minLength={8}
                    required
                  />
                  <p className="text-xs text-text-muted mt-1">Use at least 8 characters.</p>
                </div>
                <button type="submit" disabled={authLoading} className="bg-gold text-navy-deep font-black tracking-caps px-5 py-3 text-xs disabled:opacity-60">
                  {authLoading ? 'Creating account...' : 'Create account and sign in'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-black tracking-caps text-gold mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-label="Email"
                    title="Email"
                    className="w-full bg-navy-deep border border-navy-border px-3 py-2.5 text-sm text-white focus:outline-none focus:border-gold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-black tracking-caps text-gold mb-1.5">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-label="Password"
                    title="Password"
                    className="w-full bg-navy-deep border border-navy-border px-3 py-2.5 text-sm text-white focus:outline-none focus:border-gold"
                    required
                  />
                </div>
                <button type="submit" disabled={authLoading} className="bg-gold text-navy-deep font-black tracking-caps px-5 py-3 text-xs disabled:opacity-60">
                  {authLoading ? 'Signing in...' : 'Sign in'}
                </button>
              </form>
            )}
          </section>
        ) : (
          <>
            <section className="border border-navy-border bg-navy p-5 mb-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-gold tracking-caps font-black">SIGNED IN</div>
                  <div className="text-white font-semibold text-lg">{profile.first_name} {profile.last_name}</div>
                  <div className="text-text-body text-sm">{profile.email}</div>
                </div>
                <button type="button" onClick={handleSignOut} className="border border-navy-border px-3 py-2 text-xs tracking-caps text-text-body hover:text-white">
                  Sign out
                </button>
              </div>
              <div className="mt-4 text-sm text-text-body">
                <p>Divisions: <span className="text-white">{profile.divisions.join(', ')}</span></p>
                <p>Payment: <span className="text-white">{profile.paid || profile.fee_cents === 0 ? 'Complete' : 'Pending'}</span></p>
                <p>Music deadline: <span className="text-white">{deadlineLabel}</span></p>
                {profile.music_uploaded_at && (
                  <p>Music received: <span className="text-white">{new Date(profile.music_uploaded_at).toLocaleString()}</span></p>
                )}
              </div>
              {profile.music_upload_url ? (
                <a href={profile.music_upload_url} className="inline-block mt-4 bg-gold text-navy-deep font-black tracking-caps px-4 py-2 text-xs">
                  Upload music
                </a>
              ) : (
                <p className="mt-4 text-sm text-text-body">Music upload unlocks after payment is received.</p>
              )}
            </section>

            <form onSubmit={handleSave} className="border border-navy-border bg-navy p-6 space-y-5">
              <h2 className="font-display font-bold text-xl text-white">Edit registration details</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Bracket display name">
                  <input aria-label="Bracket display name" title="Bracket display name" value={editable.preferred_bracket_name} onChange={(e) => setEditable({ ...editable, preferred_bracket_name: e.target.value })} className="input" />
                </Field>
                <Field label="Pronouns">
                  <input aria-label="Pronouns" title="Pronouns" value={editable.pronouns} onChange={(e) => setEditable({ ...editable, pronouns: e.target.value })} className="input" />
                </Field>
                <Field label="Phone">
                  <input aria-label="Phone" title="Phone" value={editable.phone} onChange={(e) => setEditable({ ...editable, phone: e.target.value })} className="input" required />
                </Field>
                <Field label="City">
                  <input aria-label="City" title="City" value={editable.city} onChange={(e) => setEditable({ ...editable, city: e.target.value })} className="input" required />
                </Field>
                <Field label="State (2-letter)">
                  <input aria-label="State" title="State" value={editable.state} onChange={(e) => setEditable({ ...editable, state: e.target.value.toUpperCase() })} maxLength={2} className="input" required />
                </Field>
                <Field label="Club affiliation">
                  <input aria-label="Club affiliation" title="Club affiliation" value={editable.club_affiliation} onChange={(e) => setEditable({ ...editable, club_affiliation: e.target.value })} className="input" />
                </Field>
                {profile.age_on_event < 18 && (
                  <>
                    <Field label="Parent/guardian name">
                      <input aria-label="Parent guardian name" title="Parent guardian name" value={editable.parent_name} onChange={(e) => setEditable({ ...editable, parent_name: e.target.value })} className="input" />
                    </Field>
                    <Field label="Parent/guardian email">
                      <input aria-label="Parent guardian email" title="Parent guardian email" type="email" value={editable.parent_email} onChange={(e) => setEditable({ ...editable, parent_email: e.target.value })} className="input" />
                    </Field>
                  </>
                )}
                <Field label="Emergency contact name">
                  <input aria-label="Emergency contact name" title="Emergency contact name" value={editable.emergency_contact_name} onChange={(e) => setEditable({ ...editable, emergency_contact_name: e.target.value })} className="input" />
                </Field>
                <Field label="Emergency contact phone">
                  <input aria-label="Emergency contact phone" title="Emergency contact phone" value={editable.emergency_contact_phone} onChange={(e) => setEditable({ ...editable, emergency_contact_phone: e.target.value })} className="input" />
                </Field>
              </div>

              <Field label="Performance preference">
                <select
                  aria-label="Performance preference"
                  title="Performance preference"
                  value={editable.performance_time_pref}
                  onChange={(e) => setEditable({ ...editable, performance_time_pref: e.target.value as EditableProfile['performance_time_pref'] })}
                  className="input"
                >
                  <option value="">No preference</option>
                  <option value="no_pref">No preference</option>
                  <option value="early">Early in the day</option>
                  <option value="late">Late in the day</option>
                  <option value="conflict">I have a time conflict</option>
                </select>
              </Field>

              <Field label="Scheduling notes">
                <textarea
                  aria-label="Scheduling notes"
                  title="Scheduling notes"
                  value={editable.scheduling_notes}
                  onChange={(e) => setEditable({ ...editable, scheduling_notes: e.target.value })}
                  className="input min-h-24"
                  maxLength={300}
                />
              </Field>

              <Field label="Accessibility needs">
                <textarea
                  aria-label="Accessibility needs"
                  title="Accessibility needs"
                  value={editable.accessibility_needs}
                  onChange={(e) => setEditable({ ...editable, accessibility_needs: e.target.value })}
                  className="input min-h-24"
                  maxLength={500}
                />
              </Field>

              <button type="submit" disabled={saveLoading} className="bg-gold text-navy-deep font-black tracking-caps px-5 py-3 text-xs disabled:opacity-60">
                {saveLoading ? 'Saving...' : 'Save changes'}
              </button>
            </form>
          </>
        )}
      </main>
      <Footer />
      <style jsx>{`
        .input {
          width: 100%;
          background: var(--navy-deep);
          border: 1px solid var(--navy-border);
          padding: 0.625rem 0.75rem;
          font-size: 0.875rem;
          color: white;
          outline: none;
        }
        .input:focus {
          border-color: var(--gold);
        }
      `}</style>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-black tracking-caps text-gold mb-1.5">{label}</label>
      {children}
    </div>
  );
}
