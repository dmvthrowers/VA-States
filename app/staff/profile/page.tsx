'use client';

import { FormEvent, useEffect, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';

type StaffRole = 'judge' | 'dj' | 'audio_tech' | 'admin';

type StaffProfile = {
  auth_user_id: string;
  email: string;
  role: StaffRole;
  display_name: string;
  pronouns: string | null;
  bio: string | null;
  photo_url: string | null;
  is_public_profile: boolean;
  is_active: boolean;
};

const roleLabel: Record<StaffRole, string> = {
  judge: 'Judge',
  dj: 'DJ',
  audio_tech: 'Audio Tech',
  admin: 'Staff Admin',
};

const supabase = createBrowserClient();

export default function StaffProfilePage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function fetchProfile(accessToken: string) {
    const res = await fetch('/api/staff/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json().catch(() => ({})) as StaffProfile & { error?: { message?: string } };
    if (!res.ok) {
      throw new Error(json.error?.message ?? 'Could not load staff profile.');
    }
    setProfile(json);
    setEmail(json.email);
  }

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token ?? null;
      if (!active) return;
      setToken(accessToken);
      if (accessToken) {
        try {
          await fetchProfile(accessToken);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not load staff profile.');
        }
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const accessToken = session?.access_token ?? null;
      setToken(accessToken);
      if (!accessToken) {
        setProfile(null);
        return;
      }
      try {
        await fetchProfile(accessToken);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load staff profile.');
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setSigningIn(true);
    setError(null);
    setSuccess(null);

    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (loginError || !data.session?.access_token) {
        throw new Error(loginError?.message ?? 'Invalid credentials.');
      }

      setToken(data.session.access_token);
      await fetchProfile(data.session.access_token);
      setPassword('');
      setSuccess('Signed in.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in.');
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!token || !profile) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/staff/me', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          display_name: profile.display_name,
          pronouns: profile.pronouns ?? '',
          bio: profile.bio ?? '',
          photo_url: profile.photo_url ?? '',
          is_public_profile: profile.is_public_profile,
        }),
      });

      const json = await res.json().catch(() => ({})) as { ok?: boolean; error?: { message?: string } };
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message ?? 'Could not save staff profile.');
      }

      await fetchProfile(token);
      setSuccess('Staff profile saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save staff profile.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setToken(null);
    setProfile(null);
    setSuccess('Signed out.');
  }

  return (
    <>
      <NavBar />
      <main id="main-content" className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="font-display font-black text-3xl text-gold mb-2">Staff Profile</h1>
        <p className="text-sm text-text-body mb-8">Judge/DJ/staff profile used for public listings and event identity.</p>

        {error && <div className="mb-4 border border-red bg-red/10 p-3 text-sm text-white">{error}</div>}
        {success && <div className="mb-4 border border-green-700 bg-green-900/30 p-3 text-sm text-white">{success}</div>}

        {!token || !profile ? (
          <section className="border border-navy-border bg-navy p-6">
            <h2 className="font-display font-bold text-xl text-white mb-2">Staff Sign In</h2>
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-xs font-black tracking-caps text-gold mb-1.5">Email</label>
                <input
                  aria-label="Staff email"
                  title="Staff email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-black tracking-caps text-gold mb-1.5">Password</label>
                <input
                  aria-label="Staff password"
                  title="Staff password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  required
                />
              </div>
              <button type="submit" disabled={signingIn} className="bg-gold text-navy-deep font-black tracking-caps px-5 py-3 text-xs disabled:opacity-60">
                {signingIn ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          </section>
        ) : (
          <>
            <section className="border border-navy-border bg-navy p-5 mb-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-gold tracking-caps font-black">SIGNED IN</div>
                  <div className="text-white font-semibold text-lg">{profile.display_name}</div>
                  <div className="text-text-body text-sm">{profile.email} · {roleLabel[profile.role]}</div>
                </div>
                <button type="button" onClick={handleSignOut} className="border border-navy-border px-3 py-2 text-xs tracking-caps text-text-body hover:text-white">
                  Sign out
                </button>
              </div>
            </section>

            <form onSubmit={handleSave} className="border border-navy-border bg-navy p-6 space-y-5">
              <h2 className="font-display font-bold text-xl text-white">Edit staff bio</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Display Name">
                  <input
                    aria-label="Staff display name"
                    title="Staff display name"
                    value={profile.display_name}
                    onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
                    className="input"
                    required
                  />
                </Field>
                <Field label="Pronouns">
                  <input
                    value={profile.pronouns ?? ''}
                    onChange={(e) => setProfile({ ...profile, pronouns: e.target.value })}
                    className="input"
                    placeholder="they/them"
                  />
                </Field>
              </div>

              <Field label="Bio">
                <textarea
                  aria-label="Staff bio"
                  title="Staff bio"
                  value={profile.bio ?? ''}
                  onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                  className="input min-h-24"
                  maxLength={1000}
                />
              </Field>

              <Field label="Photo URL">
                <input
                  value={profile.photo_url ?? ''}
                  onChange={(e) => setProfile({ ...profile, photo_url: e.target.value })}
                  className="input"
                  placeholder="https://example.com/staff-photo.jpg"
                />
              </Field>

              <label className="flex items-center gap-3 text-sm text-text-body">
                <input
                  type="checkbox"
                  checked={profile.is_public_profile}
                  onChange={(e) => setProfile({ ...profile, is_public_profile: e.target.checked })}
                  className="w-4 h-4 accent-gold"
                />
                Show my profile publicly on the Who&apos;s Coming list
              </label>

              <button type="submit" disabled={saving} className="bg-gold text-navy-deep font-black tracking-caps px-5 py-3 text-xs disabled:opacity-60">
                {saving ? 'Saving...' : 'Save profile'}
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
