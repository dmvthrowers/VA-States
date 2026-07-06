'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';

const DIVISIONS = ['1A', 'X', 'SBJ'] as const;
type Division = typeof DIVISIONS[number];

interface Performer {
  position: number;
  status: 'upcoming' | 'performing' | 'done';
  registration_id: string;
  display_name: string;
  city: string | null;
  state: string | null;
  music_filename: string | null;
}

interface RunOrderResponse {
  division: Division;
  source: 'run_order' | 'registration_order';
  performers: Performer[];
}

interface StaffMe {
  auth_user_id: string;
  email: string;
  role: 'judge' | 'dj' | 'audio_tech' | 'admin';
  display_name: string;
  is_active: boolean;
}

const supabase = createBrowserClient();

export default function DJPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [staff, setStaff] = useState<StaffMe | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const [division, setDivision] = useState<Division>('1A');
  const [data, setData] = useState<RunOrderResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStaffMe = useCallback(async (accessToken: string): Promise<StaffMe | null> => {
    const res = await fetch('/api/staff/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return await res.json() as StaffMe;
  }, []);

  const fetchRunOrder = useCallback(async (div: Division, accessToken: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/run-order?division=${div}&include_music=1`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const json: RunOrderResponse = await res.json();
        setData(json);
        setLastRefresh(new Date());
      }
    } catch {
      // Keep stale data visible if refresh fails.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token ?? null;
      if (!active) return;
      setToken(accessToken);
      if (!accessToken) return;

      const me = await fetchStaffMe(accessToken);
      if (!me || !me.is_active || !['dj', 'audio_tech', 'admin'].includes(me.role)) {
        setAuthError('This account is not authorized for DJ/audio access.');
        await supabase.auth.signOut();
        setToken(null);
        setStaff(null);
        return;
      }
      setStaff(me);
      setEmail(me.email);
    })();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const accessToken = session?.access_token ?? null;
      setToken(accessToken);
      if (!accessToken) {
        setStaff(null);
        return;
      }

      const me = await fetchStaffMe(accessToken);
      if (!me || !me.is_active || !['dj', 'audio_tech', 'admin'].includes(me.role)) {
        setAuthError('This account is not authorized for DJ/audio access.');
        await supabase.auth.signOut();
        setToken(null);
        setStaff(null);
        return;
      }
      setStaff(me);
      setEmail(me.email);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [fetchStaffMe]);

  useEffect(() => {
    if (!staff || !token) return;
    fetchRunOrder(division, token);
    pollingRef.current = setInterval(() => fetchRunOrder(division, token), 15000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [staff, token, division, fetchRunOrder]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error || !data.session?.access_token) {
      setAuthError(error?.message ?? 'Invalid credentials.');
      return;
    }

    const me = await fetchStaffMe(data.session.access_token);
    if (!me || !me.is_active || !['dj', 'audio_tech', 'admin'].includes(me.role)) {
      setAuthError('This account is not authorized for DJ/audio access.');
      await supabase.auth.signOut();
      return;
    }

    setStaff(me);
    setToken(data.session.access_token);
    setPassword('');
  }

  if (!staff || !token) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--navy-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.6rem', fontWeight: 700 }}>
              DJ Portal
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.4rem', letterSpacing: '0.1em' }}>
              VSYC-26 - Staff Login
            </div>
          </div>

          <form onSubmit={handleLogin} style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '2rem' }}>
            <label style={{ display: 'block', fontSize: '0.65rem', letterSpacing: '0.16em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.5rem' }}>
              STAFF EMAIL
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              style={{
                width: '100%',
                padding: '0.75rem',
                background: '#0d1428',
                border: '1px solid var(--navy-border)',
                color: '#fff',
                fontSize: '0.95rem',
                marginBottom: '0.75rem',
                boxSizing: 'border-box',
              }}
            />

            <label style={{ display: 'block', fontSize: '0.65rem', letterSpacing: '0.16em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.5rem' }}>
              PASSWORD
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                background: '#0d1428',
                border: '1px solid var(--navy-border)',
                color: '#fff',
                fontSize: '1rem',
                marginBottom: '1rem',
                boxSizing: 'border-box',
              }}
            />

            {authError && <p style={{ color: '#ff6b6b', fontSize: '0.8rem', margin: '0 0 1rem' }}>{authError}</p>}

            <button
              type="submit"
              style={{
                width: '100%',
                background: 'var(--gold)',
                color: 'var(--navy-deep)',
                border: 'none',
                padding: '0.75rem',
                fontWeight: 800,
                fontSize: '0.85rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              Sign In
            </button>
          </form>
        </div>
      </div>
    );
  }

  const performers = data?.performers ?? [];
  const nowPerforming = performers.find((p) => p.status === 'performing');
  const upcoming = performers.filter((p) => p.status === 'upcoming');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--navy-deep)', padding: '0' }}>
      <header style={{ background: 'var(--navy)', borderBottom: '2px solid var(--gold)', padding: '0 1.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            <span style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontWeight: 700, fontSize: '1rem' }}>
              DJ Portal
            </span>
            <nav style={{ display: 'flex', gap: '0.5rem' }}>
              {DIVISIONS.map((div) => (
                <button
                  key={div}
                  onClick={() => {
                    setDivision(div);
                    setData(null);
                  }}
                  style={{
                    background: division === div ? 'var(--gold)' : 'transparent',
                    color: division === div ? 'var(--navy-deep)' : 'var(--text-body)',
                    border: '1px solid',
                    borderColor: division === div ? 'var(--gold)' : 'var(--navy-border)',
                    padding: '0.3rem 0.75rem',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    letterSpacing: '0.05em',
                    cursor: 'pointer',
                  }}
                >
                  {div}
                </button>
              ))}
            </nav>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{staff.display_name}</span>
            {lastRefresh && (
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                {loading ? 'Refreshing...' : `Updated ${lastRefresh.toLocaleTimeString()}`}
              </span>
            )}
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                setToken(null);
                setStaff(null);
              }}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.7rem', cursor: 'pointer', letterSpacing: '0.05em' }}
            >
              LOGOUT
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <section style={{ marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.18em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.75rem' }}>
            NOW PLAYING
          </div>
          {nowPerforming ? (
            <div style={{ background: '#1a1400', border: '2px solid var(--gold)', padding: '1.5rem 2rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '2rem', fontWeight: 700, lineHeight: 1.1 }}>
                    {nowPerforming.display_name}
                  </div>
                  {(nowPerforming.city || nowPerforming.state) && (
                    <div style={{ color: 'var(--text-muted)', marginTop: '0.25rem', fontSize: '0.9rem' }}>
                      {[nowPerforming.city, nowPerforming.state].filter(Boolean).join(', ')}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '0.6rem', letterSpacing: '0.14em', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    MUSIC FILE
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: nowPerforming.music_filename ? '#fff' : '#ff6b6b' }}>
                    {nowPerforming.music_filename ?? 'No file uploaded'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '1.5rem 2rem', color: 'var(--text-muted)' }}>
              {performers.length === 0 ? 'Run order not set yet.' : 'Division has not started - advance from admin panel.'}
            </div>
          )}
        </section>

        {upcoming.length > 0 && (
          <section style={{ marginBottom: '2.5rem' }}>
            <div style={{ fontSize: '0.6rem', letterSpacing: '0.18em', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              UP NEXT
            </div>
            <div style={{ border: '1px solid var(--navy-border)' }}>
              {upcoming.slice(0, 5).map((p, i) => (
                <div
                  key={p.registration_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    borderBottom: i < Math.min(upcoming.length, 5) - 1 ? '1px solid var(--navy-border)' : 'none',
                    background: i === 0 ? '#0d1428' : 'var(--navy)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ width: '1.5rem', height: '1.5rem', background: i === 0 ? 'var(--red)' : 'transparent', border: i === 0 ? 'none' : '1px solid var(--navy-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 800, color: i === 0 ? '#fff' : 'var(--text-muted)', flexShrink: 0 }}>
                      {p.position}
                    </span>
                    <div>
                      <div style={{ fontWeight: 700, color: i === 0 ? '#fff' : 'var(--text-body)', fontSize: '0.95rem' }}>{p.display_name}</div>
                      {(p.city || p.state) && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{[p.city, p.state].filter(Boolean).join(', ')}</div>
                      )}
                    </div>
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: p.music_filename ? 'var(--text-muted)' : '#ff6b6b', textAlign: 'right', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.music_filename ?? 'missing'}
                  </div>
                </div>
              ))}
              {upcoming.length > 5 && (
                <div style={{ padding: '0.5rem 1rem', color: 'var(--text-muted)', fontSize: '0.75rem', background: 'var(--navy)' }}>
                  +{upcoming.length - 5} more
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
