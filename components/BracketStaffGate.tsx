'use client';

import { useCallback, useEffect, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';
import { contest } from '@/contest.config';

/**
 * Minimal staff sign-in (the same flow as app/judge/page.tsx): Supabase email + password,
 * then /api/staff/me must report an active account with one of `roles`. Renders children
 * with the access token once signed in. Shared by /judge/battles and /admin/brackets.
 */
type Role = 'judge' | 'dj' | 'audio_tech' | 'admin';
interface StaffMe { auth_user_id: string; email: string; role: Role; display_name: string; is_active: boolean }

const supabase = createBrowserClient();

export default function BracketStaffGate({ title, roles, children, landmark = true }: {
  title: string;
  roles: Role[];
  /** Wrap the sign-in form in <main>. Pass false inside a layout that already has one. */
  landmark?: boolean;
  children: (ctx: { token: string; staff: StaffMe; signOut: () => void }) => React.ReactNode;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [staff, setStaff] = useState<StaffMe | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const deny = `This account is not authorized for ${title.toLowerCase()}.`;
  // A string key, so a new roles array each render doesn't re-run the check.
  const rolesKey = roles.join(',');

  const check = useCallback(async (accessToken: string | null) => {
    setToken(accessToken);
    if (!accessToken) { setStaff(null); return; }
    const res = await fetch('/api/staff/me', { headers: { Authorization: `Bearer ${accessToken}` } }).catch(() => null);
    const me = res?.ok ? (await res.json()) as StaffMe : null;
    if (!me || !me.is_active || !rolesKey.split(',').includes(me.role)) {
      setAuthError(deny);
      await supabase.auth.signOut();
      setToken(null);
      setStaff(null);
      return;
    }
    setStaff(me);
    setEmail(me.email);
  }, [deny, rolesKey]);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) check(data.session?.access_token ?? null); });
    // Token refreshes arrive here too, so polling always uses a current token.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { check(session?.access_token ?? null); });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [check]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error || !data.session?.access_token) { setAuthError(error?.message ?? 'Invalid credentials.'); return; }
    setPassword('');
    await check(data.session.access_token);
  }

  if (staff && token) return <>{children({ token, staff, signOut: () => { supabase.auth.signOut(); } })}</>;

  const Wrap = landmark ? 'main' : 'div';
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.6rem', letterSpacing: '0.16em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.4rem' };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '0.7rem', background: '#0d1428', border: '1px solid var(--navy-border)', color: '#fff', fontSize: '1rem', boxSizing: 'border-box' };
  return (
    <div style={{ minHeight: '100vh', background: 'var(--navy-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <Wrap {...(landmark ? { id: 'main-content' } : {})} style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>{title}</h1>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.4rem', letterSpacing: '0.1em' }}>{contest.shortName} - Staff Login</div>
        </div>
        <form onSubmit={handleLogin} style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label htmlFor="sg-email" style={labelStyle}>STAFF EMAIL</label>
            <input id="sg-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus style={inputStyle} />
          </div>
          <div>
            <label htmlFor="sg-password" style={labelStyle}>PASSWORD</label>
            <input id="sg-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
          </div>
          {authError && <p role="alert" style={{ color: '#ff6b6b', fontSize: '0.8rem', margin: 0 }}>{authError}</p>}
          <button type="submit" style={{ background: 'var(--gold)', color: 'var(--navy-deep)', border: 'none', padding: '0.75rem', fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
            Sign In
          </button>
        </form>
      </Wrap>
    </div>
  );
}
