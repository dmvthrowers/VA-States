'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import RunOrderManager from '@/components/RunOrderManager';
import { createBrowserClient } from '@/lib/supabase/client';

interface StaffMe {
  auth_user_id: string;
  email: string;
  role: 'judge' | 'dj' | 'audio_tech' | 'admin';
  display_name: string;
  is_active: boolean;
}

interface Contestant {
  id: string;
  created_at: string;
  first_name: string;
  last_name: string;
  preferred_bracket_name: string | null;
  email: string;
  city: string | null;
  state: string | null;
  divisions: string[];
  x_substyle: string | null;
  fee_cents: number;
  paid: boolean;
  paid_at: string | null;
  music_filename: string | null;
  music_uploaded_at: string | null;
  is_public: boolean;
  admin_notes: string | null;
  registration_source: string;
}

interface Spectator {
  id: string;
  created_at: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  email: string;
  state: string;
  team: string | null;
  club: string | null;
  is_public: boolean;
}

interface DashboardData {
  admin: {
    auth_user_id: string;
    email: string;
    display_name: string;
  };
  stats: {
    contestants_total: number;
    contestants_paid: number;
    contestants_music_uploaded: number;
    contestants_public_profiles: number;
    spectators_total: number;
    spectators_public_profiles: number;
    revenue_cents: number;
  };
  event_flags: {
    results_published: boolean;
    online_registration_open: boolean;
  };
  contestants: Contestant[];
  spectators: Spectator[];
}

const supabase = createBrowserClient();

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AdminDashboardPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const [token, setToken] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffMe | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [contestantQuery, setContestantQuery] = useState('');
  const [spectatorQuery, setSpectatorQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'run-order'>('overview');

  const fetchStaffMe = async (accessToken: string): Promise<StaffMe | null> => {
    const res = await fetch('/api/staff/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return await res.json() as StaffMe;
  };

  const loadDashboard = async (accessToken: string, isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await fetch('/api/ops/dashboard', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? 'Failed to load dashboard data.');
      }
      const json = await res.json() as DashboardData;
      setData(json);
      setStatusMsg(null);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token ?? null;
      if (!active) return;

      setToken(accessToken);
      if (!accessToken) {
        setLoading(false);
        return;
      }

      const me = await fetchStaffMe(accessToken);
      if (!me || !me.is_active || me.role !== 'admin') {
        setAuthError('This account is not authorized for admin dashboard access.');
        await supabase.auth.signOut();
        setToken(null);
        setStaff(null);
        setLoading(false);
        return;
      }

      setStaff(me);
      setEmail(me.email);
      await loadDashboard(accessToken);
    })();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const accessToken = session?.access_token ?? null;
      setToken(accessToken);
      if (!accessToken) {
        setStaff(null);
        setData(null);
        return;
      }

      const me = await fetchStaffMe(accessToken);
      if (!me || !me.is_active || me.role !== 'admin') {
        setAuthError('This account is not authorized for admin dashboard access.');
        await supabase.auth.signOut();
        setToken(null);
        setStaff(null);
        setData(null);
        return;
      }

      setStaff(me);
      setEmail(me.email);
      await loadDashboard(accessToken);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const filteredContestants = useMemo(() => {
    if (!data) return [];
    const q = contestantQuery.trim().toLowerCase();
    if (!q) return data.contestants;
    return data.contestants.filter((c) => {
      const hay = [
        c.first_name,
        c.last_name,
        c.preferred_bracket_name ?? '',
        c.email,
        c.divisions.join(','),
        c.registration_source,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [data, contestantQuery]);

  const filteredSpectators = useMemo(() => {
    if (!data) return [];
    const q = spectatorQuery.trim().toLowerCase();
    if (!q) return data.spectators;
    return data.spectators.filter((s) => {
      const hay = [s.first_name, s.last_name, s.nickname ?? '', s.email, s.team ?? '', s.club ?? ''].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [data, spectatorQuery]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error || !data.session?.access_token) {
      setAuthError(error?.message ?? 'Invalid credentials.');
      return;
    }

    const me = await fetchStaffMe(data.session.access_token);
    if (!me || !me.is_active || me.role !== 'admin') {
      setAuthError('This account is not authorized for admin dashboard access.');
      await supabase.auth.signOut();
      return;
    }

    setStaff(me);
    setToken(data.session.access_token);
    setPassword('');
    await loadDashboard(data.session.access_token);
  };

  const saveContestant = async (id: string, patch: Record<string, unknown>) => {
    if (!token || !data) return;
    setSaving(`contestant:${id}`);
    setStatusMsg(null);

    try {
      const res = await fetch(`/api/ops/contestants/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? 'Failed to save contestant changes.');
      }

      await loadDashboard(token, true);
      setStatusMsg('Contestant update saved.');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to save contestant changes.');
    } finally {
      setSaving(null);
    }
  };

  const saveSpectator = async (id: string, patch: Record<string, unknown>) => {
    if (!token || !data) return;
    setSaving(`spectator:${id}`);
    setStatusMsg(null);

    try {
      const res = await fetch(`/api/ops/spectators/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? 'Failed to save spectator changes.');
      }

      await loadDashboard(token, true);
      setStatusMsg('Spectator update saved.');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to save spectator changes.');
    } finally {
      setSaving(null);
    }
  };

  const saveEventFlags = async (patch: { results_published?: boolean; online_registration_open?: boolean }) => {
    if (!token) return;
    setSaving('event_flags');
    setStatusMsg(null);

    try {
      const res = await fetch('/api/ops/event-flags', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? 'Failed to update event controls.');
      }

      await loadDashboard(token, true);
      setStatusMsg('Event control updated.');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to update event controls.');
    } finally {
      setSaving(null);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setToken(null);
    setStaff(null);
    setData(null);
    setStatusMsg('Signed out.');
  };

  if (!staff || !token) {
    return (
      <>
        <NavBar />
        <main id="main-content" className="max-w-md mx-auto px-4 py-12 min-h-[60vh]">
          <h1 className="font-display font-black text-3xl text-gold mb-2">Admin Dashboard</h1>
          <p className="text-sm text-text-body mb-6">Secure sign-in for event operators.</p>

          <form onSubmit={handleLogin} className="border border-navy-border bg-navy p-6 space-y-4">
            <div>
              <label className="block text-xs font-black tracking-caps text-gold mb-1.5">Admin Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                className="w-full bg-navy-deep border border-navy-border px-3 py-2.5 text-sm text-white focus:outline-none focus:border-gold"
                required
              />
            </div>

            {authError && <p className="text-sm text-red-300">{authError}</p>}

            <button type="submit" className="w-full bg-gold text-navy-deep font-black tracking-caps py-3 text-xs">
              Sign In
            </button>
          </form>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <NavBar />
      <main id="main-content" className="max-w-7xl mx-auto px-4 py-10">
        <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="font-display font-black text-3xl text-gold">Admin Dashboard</h1>
            <p className="text-sm text-text-body mt-1">Live event controls and profile management for contestants and spectators.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">{staff.display_name}</span>
            <button
              type="button"
              onClick={() => token && loadDashboard(token, true)}
              disabled={refreshing}
              className="border border-navy-border px-3 py-2 text-xs text-text-body hover:text-white disabled:opacity-50"
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button type="button" onClick={signOut} className="border border-navy-border px-3 py-2 text-xs text-text-body hover:text-white">Sign Out</button>
          </div>
        </header>

        <nav className="flex gap-2 mb-6 border-b border-navy-border">
          {(['overview', 'run-order'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-xs font-black tracking-caps border-b-2 -mb-px ${
                activeTab === tab ? 'border-gold text-gold' : 'border-transparent text-text-muted hover:text-text-body'
              }`}
            >
              {tab === 'overview' ? 'Overview' : 'Run Order'}
            </button>
          ))}
        </nav>

        {statusMsg && <div className="mb-4 border border-navy-border bg-navy p-3 text-sm text-white">{statusMsg}</div>}

        {activeTab === 'run-order' && token && (
          <section className="border border-navy-border bg-navy p-4">
            <RunOrderManager token={token} />
          </section>
        )}

        {activeTab === 'overview' && (loading || !data ? (
          <p className="text-text-body">Loading dashboard...</p>
        ) : (
          <>
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <StatCard label="Contestants" value={String(data.stats.contestants_total)} />
              <StatCard label="Paid Contestants" value={`${data.stats.contestants_paid} / ${data.stats.contestants_total}`} />
              <StatCard label="Music Uploaded" value={`${data.stats.contestants_music_uploaded} / ${data.stats.contestants_total}`} />
              <StatCard label="Projected Revenue" value={formatMoney(data.stats.revenue_cents)} />
              <StatCard label="Spectators" value={String(data.stats.spectators_total)} />
              <StatCard label="Public Spectators" value={`${data.stats.spectators_public_profiles} / ${data.stats.spectators_total}`} />
              <StatCard label="Public Contestants" value={`${data.stats.contestants_public_profiles} / ${data.stats.contestants_total}`} />
            </section>

            <section className="border border-navy-border bg-navy p-4 mb-8">
              <div className="text-xs text-gold font-black tracking-caps mb-3">Event Controls</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border border-navy-border bg-navy-deep p-3">
                  <div className="text-sm text-white font-semibold mb-2">Results Visibility</div>
                  <div className="text-xs text-text-body mb-3">Show or hide public standings without redeploying.</div>
                  <button
                    type="button"
                    onClick={() => saveEventFlags({ results_published: !data.event_flags.results_published })}
                    disabled={saving === 'event_flags'}
                    className="bg-gold text-navy-deep font-black tracking-caps px-3 py-2 text-xs disabled:opacity-60"
                  >
                    {data.event_flags.results_published ? 'Set to Hidden' : 'Publish Results'}
                  </button>
                </div>

                <div className="border border-navy-border bg-navy-deep p-3">
                  <div className="text-sm text-white font-semibold mb-2">Online Registration</div>
                  <div className="text-xs text-text-body mb-3">Open or close online competitor registration immediately.</div>
                  <button
                    type="button"
                    onClick={() => saveEventFlags({ online_registration_open: !data.event_flags.online_registration_open })}
                    disabled={saving === 'event_flags'}
                    className="bg-gold text-navy-deep font-black tracking-caps px-3 py-2 text-xs disabled:opacity-60"
                  >
                    {data.event_flags.online_registration_open ? 'Close Online Registration' : 'Open Online Registration'}
                  </button>
                </div>
              </div>
            </section>

            <section className="border border-navy-border bg-navy p-4 mb-8">
              <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
                <h2 className="font-display text-2xl text-white font-bold">Contestants</h2>
                <input
                  value={contestantQuery}
                  onChange={(e) => setContestantQuery(e.target.value)}
                  placeholder="Search contestant name or email"
                  aria-label="Search contestants"
                  title="Search contestants"
                  className="w-full max-w-sm bg-navy-deep border border-navy-border px-3 py-2 text-sm text-white focus:outline-none focus:border-gold"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-navy-border text-left text-xs uppercase tracking-wide text-text-muted">
                      <th className="py-2 pr-3">Name</th>
                      <th className="py-2 pr-3">Divisions</th>
                      <th className="py-2 pr-3">Paid</th>
                      <th className="py-2 pr-3">Public</th>
                      <th className="py-2 pr-3">Music</th>
                      <th className="py-2 pr-3">Admin Notes</th>
                      <th className="py-2 pr-3">Save</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContestants.map((c) => (
                      <ContestantRow key={c.id} contestant={c} busy={saving === `contestant:${c.id}`} onSave={saveContestant} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="border border-navy-border bg-navy p-4">
              <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
                <h2 className="font-display text-2xl text-white font-bold">Spectators</h2>
                <input
                  value={spectatorQuery}
                  onChange={(e) => setSpectatorQuery(e.target.value)}
                  placeholder="Search spectator name or email"
                  aria-label="Search spectators"
                  title="Search spectators"
                  className="w-full max-w-sm bg-navy-deep border border-navy-border px-3 py-2 text-sm text-white focus:outline-none focus:border-gold"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-navy-border text-left text-xs uppercase tracking-wide text-text-muted">
                      <th className="py-2 pr-3">Name</th>
                      <th className="py-2 pr-3">Email</th>
                      <th className="py-2 pr-3">Team / Club</th>
                      <th className="py-2 pr-3">Public</th>
                      <th className="py-2 pr-3">Save</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSpectators.map((s) => (
                      <SpectatorRow key={s.id} spectator={s} busy={saving === `spectator:${s.id}`} onSave={saveSpectator} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ))}
      </main>
      <Footer />
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-navy-border bg-navy p-3">
      <div className="text-xs uppercase tracking-wide text-text-muted mb-1">{label}</div>
      <div className="font-display text-gold text-2xl font-bold">{value}</div>
    </div>
  );
}

function ContestantRow({
  contestant,
  busy,
  onSave,
}: {
  contestant: Contestant;
  busy: boolean;
  onSave: (id: string, patch: Record<string, unknown>) => Promise<void>;
}) {
  const [paid, setPaid] = useState(contestant.paid);
  const [isPublic, setIsPublic] = useState(contestant.is_public);
  const [musicFilename, setMusicFilename] = useState(contestant.music_filename ?? '');
  const [adminNotes, setAdminNotes] = useState(contestant.admin_notes ?? '');

  useEffect(() => {
    setPaid(contestant.paid);
    setIsPublic(contestant.is_public);
    setMusicFilename(contestant.music_filename ?? '');
    setAdminNotes(contestant.admin_notes ?? '');
  }, [contestant]);

  return (
    <tr className="border-b border-navy-border align-top">
      <td className="py-2 pr-3 min-w-[220px]">
        <div className="text-white font-semibold">{contestant.preferred_bracket_name || `${contestant.first_name} ${contestant.last_name}`}</div>
        <div className="text-xs text-text-muted">{contestant.email}</div>
      </td>
      <td className="py-2 pr-3 text-xs text-text-body min-w-[140px]">{contestant.divisions.join(', ')}</td>
      <td className="py-2 pr-3">
        <input aria-label="Mark contestant paid" title="Mark contestant paid" type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="w-4 h-4 accent-gold" />
      </td>
      <td className="py-2 pr-3">
        <input aria-label="Show contestant publicly" title="Show contestant publicly" type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="w-4 h-4 accent-gold" />
      </td>
      <td className="py-2 pr-3 min-w-[170px]">
        <input
          value={musicFilename}
          onChange={(e) => setMusicFilename(e.target.value)}
          className="w-full bg-navy-deep border border-navy-border px-2 py-1.5 text-xs text-white focus:outline-none focus:border-gold"
          placeholder="music filename"
        />
      </td>
      <td className="py-2 pr-3 min-w-[220px]">
        <textarea
          value={adminNotes}
          onChange={(e) => setAdminNotes(e.target.value)}
          rows={2}
          className="w-full bg-navy-deep border border-navy-border px-2 py-1.5 text-xs text-white focus:outline-none focus:border-gold"
          placeholder="admin notes"
        />
      </td>
      <td className="py-2 pr-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave(contestant.id, { paid, is_public: isPublic, music_filename: musicFilename, admin_notes: adminNotes })}
          className="bg-gold text-navy-deep font-black tracking-caps px-3 py-2 text-xs disabled:opacity-60"
        >
          Save
        </button>
      </td>
    </tr>
  );
}

function SpectatorRow({
  spectator,
  busy,
  onSave,
}: {
  spectator: Spectator;
  busy: boolean;
  onSave: (id: string, patch: Record<string, unknown>) => Promise<void>;
}) {
  const [isPublic, setIsPublic] = useState(spectator.is_public);
  const [team, setTeam] = useState(spectator.team ?? '');
  const [club, setClub] = useState(spectator.club ?? '');

  useEffect(() => {
    setIsPublic(spectator.is_public);
    setTeam(spectator.team ?? '');
    setClub(spectator.club ?? '');
  }, [spectator]);

  return (
    <tr className="border-b border-navy-border align-top">
      <td className="py-2 pr-3 min-w-[220px]">
        <div className="text-white font-semibold">{spectator.nickname || `${spectator.first_name} ${spectator.last_name}`}</div>
        <div className="text-xs text-text-muted">{spectator.first_name} {spectator.last_name}</div>
      </td>
      <td className="py-2 pr-3 text-xs text-text-body">{spectator.email}</td>
      <td className="py-2 pr-3 min-w-[220px]">
        <div className="grid grid-cols-1 gap-1">
          <input
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            className="w-full bg-navy-deep border border-navy-border px-2 py-1.5 text-xs text-white focus:outline-none focus:border-gold"
            placeholder="team"
          />
          <input
            value={club}
            onChange={(e) => setClub(e.target.value)}
            className="w-full bg-navy-deep border border-navy-border px-2 py-1.5 text-xs text-white focus:outline-none focus:border-gold"
            placeholder="club"
          />
        </div>
      </td>
      <td className="py-2 pr-3">
        <input aria-label="Show spectator publicly" title="Show spectator publicly" type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="w-4 h-4 accent-gold" />
      </td>
      <td className="py-2 pr-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave(spectator.id, { is_public: isPublic, team, club })}
          className="bg-gold text-navy-deep font-black tracking-caps px-3 py-2 text-xs disabled:opacity-60"
        >
          Save
        </button>
      </td>
    </tr>
  );
}
