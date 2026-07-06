'use client';

import { FormEvent, useEffect, useState } from 'react';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import { createBrowserClient } from '@/lib/supabase/client';

type SpectatorProfile = {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  pronouns: string | null;
  email: string;
  state: string;
  photo_url: string | null;
  bio: string | null;
  team: string | null;
  club: string | null;
  yoyo: string | null;
  string: string | null;
  counterweight: string | null;
  socials: {
    instagram?: string;
    tiktok?: string;
    youtube?: string;
    other?: string;
  } | null;
  is_public: boolean;
  volunteer_interest: boolean;
};

type Editable = {
  nickname: string;
  pronouns: string;
  state: string;
  photo_url: string;
  bio: string;
  team: string;
  club: string;
  yoyo: string;
  string: string;
  counterweight: string;
  instagram: string;
  tiktok: string;
  youtube: string;
  other: string;
  is_public: boolean;
  volunteer_interest: boolean;
};

const supabase = createBrowserClient();

function toEditable(profile: SpectatorProfile): Editable {
  return {
    nickname: profile.nickname ?? '',
    pronouns: profile.pronouns ?? '',
    state: profile.state ?? '',
    photo_url: profile.photo_url ?? '',
    bio: profile.bio ?? '',
    team: profile.team ?? '',
    club: profile.club ?? '',
    yoyo: profile.yoyo ?? '',
    string: profile.string ?? '',
    counterweight: profile.counterweight ?? '',
    instagram: profile.socials?.instagram ?? '',
    tiktok: profile.socials?.tiktok ?? '',
    youtube: profile.socials?.youtube ?? '',
    other: profile.socials?.other ?? '',
    is_public: Boolean(profile.is_public),
    volunteer_interest: Boolean(profile.volunteer_interest),
  };
}

export default function SpectatorPortalPage() {
  const [loading, setLoading] = useState(true);
  const [sendingLink, setSendingLink] = useState(false);
  const [saving, setSaving] = useState(false);

  const [email, setEmail] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<SpectatorProfile | null>(null);
  const [editable, setEditable] = useState<Editable | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadProfile(accessToken: string) {
    const res = await fetch('/api/spectator/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const json = await res.json().catch(() => ({})) as SpectatorProfile & { error?: { message?: string } };
    if (!res.ok) {
      throw new Error(json?.error?.message ?? 'Could not load your RSVP.');
    }

    setProfile(json);
    setEditable(toEditable(json));
    setEmail(json.email);
  }

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const currentToken = data.session?.access_token ?? null;
      if (!active) return;

      setToken(currentToken);
      if (currentToken) {
        try {
          await loadProfile(currentToken);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not load your RSVP.');
        }
      }
      setLoading(false);
    })();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentToken = session?.access_token ?? null;
      setToken(currentToken);
      if (!currentToken) {
        setProfile(null);
        setEditable(null);
        return;
      }
      try {
        await loadProfile(currentToken);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load your RSVP.');
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function sendMagicLink(e: FormEvent) {
    e.preventDefault();
    setSendingLink(true);
    setError(null);
    setSuccess(null);

    try {
      const redirectTo = `${window.location.origin}/spectators/portal`;
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: true,
        },
      });

      if (otpError) {
        throw new Error(otpError.message);
      }

      setSuccess('Magic link sent. Open the email and tap the sign-in link.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send magic link.');
    } finally {
      setSendingLink(false);
    }
  }

  async function saveChanges(e: FormEvent) {
    e.preventDefault();
    if (!token || !editable) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/spectator/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          nickname: editable.nickname,
          pronouns: editable.pronouns,
          state: editable.state.toUpperCase(),
          photo_url: editable.photo_url,
          bio: editable.bio,
          team: editable.team,
          club: editable.club,
          yoyo: editable.yoyo,
          string: editable.string,
          counterweight: editable.counterweight,
          socials: {
            instagram: editable.instagram,
            tiktok: editable.tiktok,
            youtube: editable.youtube,
            other: editable.other,
          },
          is_public: editable.is_public,
          volunteer_interest: editable.volunteer_interest,
        }),
      });

      const body = await res.json().catch(() => ({})) as { ok?: boolean; error?: { message?: string } };
      if (!res.ok || !body.ok) {
        throw new Error(body.error?.message ?? 'Could not save updates.');
      }

      await loadProfile(token);
      setSuccess('Your spectator RSVP was updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save updates.');
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setToken(null);
    setProfile(null);
    setEditable(null);
    setSuccess('Signed out.');
  }

  return (
    <>
      <NavBar />
      <main id="main-content" className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="font-display font-black text-3xl text-gold mb-2">Spectator Portal</h1>
        <p className="text-sm text-text-body mb-8">Use a magic link to update your spectator RSVP anytime.</p>

        {error && <div className="mb-4 border border-red bg-red/10 p-3 text-sm text-white">{error}</div>}
        {success && <div className="mb-4 border border-green-700 bg-green-900/30 p-3 text-sm text-white">{success}</div>}

        {loading ? (
          <p className="text-text-body">Loading...</p>
        ) : !token || !profile || !editable ? (
          <section className="border border-navy-border bg-navy p-6">
            <h2 className="font-display font-bold text-xl text-white mb-2">Sign in with magic link</h2>
            <p className="text-sm text-text-body mb-4">Enter the same email used on your spectator RSVP.</p>
            <form onSubmit={sendMagicLink} className="space-y-4">
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
              <button type="submit" disabled={sendingLink} className="bg-gold text-navy-deep font-black tracking-caps px-5 py-3 text-xs disabled:opacity-60">
                {sendingLink ? 'Sending link...' : 'Send magic link'}
              </button>
            </form>
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
                <button type="button" onClick={signOut} className="border border-navy-border px-3 py-2 text-xs tracking-caps text-text-body hover:text-white">
                  Sign out
                </button>
              </div>
            </section>

            <form onSubmit={saveChanges} className="border border-navy-border bg-navy p-6 space-y-5">
              <h2 className="font-display font-bold text-xl text-white">Edit spectator profile</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Nickname">
                  <input aria-label="Nickname" title="Nickname" value={editable.nickname} onChange={(e) => setEditable({ ...editable, nickname: e.target.value })} className="input" />
                </Field>
                <Field label="State (2-letter)">
                  <input aria-label="State" title="State" value={editable.state} onChange={(e) => setEditable({ ...editable, state: e.target.value.toUpperCase() })} maxLength={2} className="input" required />
                </Field>
                <Field label="Pronouns">
                  <input aria-label="Pronouns" title="Pronouns" value={editable.pronouns} onChange={(e) => setEditable({ ...editable, pronouns: e.target.value })} className="input" />
                </Field>
                <Field label="Team">
                  <input aria-label="Team" title="Team" value={editable.team} onChange={(e) => setEditable({ ...editable, team: e.target.value })} className="input" />
                </Field>
                <Field label="Club">
                  <input aria-label="Club" title="Club" value={editable.club} onChange={(e) => setEditable({ ...editable, club: e.target.value })} className="input" />
                </Field>
                <Field label="Yo-Yo">
                  <input aria-label="Yo-Yo" title="Yo-Yo" value={editable.yoyo} onChange={(e) => setEditable({ ...editable, yoyo: e.target.value })} className="input" />
                </Field>
                <Field label="String">
                  <input aria-label="String" title="String" value={editable.string} onChange={(e) => setEditable({ ...editable, string: e.target.value })} className="input" />
                </Field>
                <Field label="Counterweight">
                  <input aria-label="Counterweight" title="Counterweight" value={editable.counterweight} onChange={(e) => setEditable({ ...editable, counterweight: e.target.value })} className="input" />
                </Field>
                <Field label="Photo URL">
                  <input aria-label="Photo URL" title="Photo URL" value={editable.photo_url} onChange={(e) => setEditable({ ...editable, photo_url: e.target.value })} className="input" />
                </Field>
              </div>

              <Field label="Bio">
                <textarea aria-label="Bio" title="Bio" value={editable.bio} onChange={(e) => setEditable({ ...editable, bio: e.target.value })} className="input min-h-24" maxLength={1000} />
              </Field>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Instagram">
                  <input aria-label="Instagram" title="Instagram" value={editable.instagram} onChange={(e) => setEditable({ ...editable, instagram: e.target.value })} className="input" />
                </Field>
                <Field label="TikTok">
                  <input aria-label="TikTok" title="TikTok" value={editable.tiktok} onChange={(e) => setEditable({ ...editable, tiktok: e.target.value })} className="input" />
                </Field>
                <Field label="YouTube">
                  <input aria-label="YouTube" title="YouTube" value={editable.youtube} onChange={(e) => setEditable({ ...editable, youtube: e.target.value })} className="input" />
                </Field>
                <Field label="Other social">
                  <input aria-label="Other social" title="Other social" value={editable.other} onChange={(e) => setEditable({ ...editable, other: e.target.value })} className="input" />
                </Field>
              </div>

              <label className="flex items-center gap-3 text-sm text-text-body">
                <input
                  type="checkbox"
                  checked={editable.is_public}
                  onChange={(e) => setEditable({ ...editable, is_public: e.target.checked })}
                  className="w-4 h-4 accent-gold"
                />
                Show my profile publicly on the spectator list
              </label>

              <label className="flex items-center gap-3 text-sm text-text-body">
                <input
                  type="checkbox"
                  checked={editable.volunteer_interest}
                  onChange={(e) => setEditable({ ...editable, volunteer_interest: e.target.checked })}
                  className="w-4 h-4 accent-gold"
                />
                I can volunteer (contact me by email)
              </label>

              <button type="submit" disabled={saving} className="bg-gold text-navy-deep font-black tracking-caps px-5 py-3 text-xs disabled:opacity-60">
                {saving ? 'Saving...' : 'Save changes'}
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
