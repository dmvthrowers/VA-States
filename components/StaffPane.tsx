'use client';

import { useCallback, useEffect, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';

interface Portal {
  id: string;
  label: string;
  href: string;
  ready: boolean;
}

interface StaffMe {
  email: string;
  display_name: string;
  is_active: boolean;
  grants: { role: string; event?: string | null }[];
  portals: Portal[];
}

const supabase = createBrowserClient();

const roleLabel = (r: string) => r.replace(/_/g, ' ');

/**
 * One sign-in, one menu. Shows every screen the account's roles allow (from /api/staff/me, which uses
 * lib/roles.ts). The menu is a convenience: each screen and API route still checks the role itself.
 */
export default function StaffPane() {
  const [me, setMe] = useState<StaffMe | null>(null);
  const [checked, setChecked] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (accessToken: string | null | undefined): Promise<boolean> => {
    if (!accessToken) return false;
    const res = await fetch('/api/staff/me', { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return false;
    const json = (await res.json()) as StaffMe;
    if (!json.is_active) return false;
    setMe(json);
    return true;
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      await load(data.session?.access_token);
      if (active) setChecked(true);
    })();
    return () => {
      active = false;
    };
  }, [load]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (err || !data.session?.access_token) {
      setError(err?.message ?? 'Check your email and password and try again.');
      setBusy(false);
      return;
    }
    if (!(await load(data.session.access_token))) {
      setError('This account is not set up for staff access. Ask an admin to add you.');
      await supabase.auth.signOut();
    }
    setPassword('');
    setBusy(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setMe(null);
  }

  if (!checked) return <p className="text-sm text-text-body">Checking your sign-in…</p>;

  if (!me) {
    return (
      <form onSubmit={signIn} className="border border-navy-border bg-navy p-5 max-w-sm">
        <h2 className="font-display font-bold text-2xl text-white mb-4">Staff sign in</h2>
        <label htmlFor="staff-email" className="block text-xs font-black tracking-caps text-gold mb-1">Email</label>
        <input
          id="staff-email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-3 p-3 bg-navy-deep border border-navy-border text-white"
        />
        <label htmlFor="staff-password" className="block text-xs font-black tracking-caps text-gold mb-1">Password</label>
        <input
          id="staff-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-4 p-3 bg-navy-deep border border-navy-border text-white"
        />
        {error && <p role="alert" className="mb-3 text-sm text-error">{error}</p>}
        <button type="submit" disabled={busy} className="w-full bg-gold text-navy-deep font-black tracking-caps px-4 py-3 text-xs">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    );
  }

  const roles = Array.from(new Set(me.grants.map((g) => roleLabel(g.role))));
  const open = me.portals.filter((p) => p.ready);
  const soon = me.portals.filter((p) => !p.ready);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-6">
        <p className="text-sm text-text-body">
          Signed in as <strong className="text-white">{me.display_name}</strong>
          {roles.length > 0 && <> · {roles.join(', ')}</>}
        </p>
        <div className="flex gap-4 text-xs">
          <a href="/staff/profile" className="text-gold-light underline">Edit profile</a>
          <button type="button" onClick={signOut} className="text-gold-light underline">Sign out</button>
        </div>
      </div>

      {open.length === 0 && (
        <p className="text-sm text-text-body">Your roles don&apos;t open any screens yet. Ask an admin what to add.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {open.map((p) => (
          <a key={p.id} href={p.href} className="border border-navy-border bg-navy p-4 text-white font-bold hover:border-gold">
            {p.label} →
          </a>
        ))}
      </div>

      {soon.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xs font-black tracking-caps text-gold mb-2">Coming soon</h2>
          <p className="text-sm text-text-body">{soon.map((p) => p.label).join(' · ')}</p>
        </div>
      )}
    </div>
  );
}
