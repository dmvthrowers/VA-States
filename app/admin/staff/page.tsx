'use client';

import { useCallback, useEffect, useState } from 'react';
import BracketStaffGate from '@/components/BracketStaffGate';

interface StaffRow {
  auth_user_id: string;
  display_name: string;
  is_active: boolean;
  grants: { role: string; event?: string | null }[];
}
interface RoleInfo {
  id: string;
  label: string;
  description: string;
}

const btn = (tone: 'gold' | 'outline'): React.CSSProperties => ({
  background: tone === 'gold' ? 'var(--gold)' : 'transparent',
  color: tone === 'gold' ? 'var(--navy-deep)' : '#fff',
  border: `1px solid ${tone === 'gold' ? 'var(--gold)' : 'var(--navy-border)'}`,
  padding: '0.4rem 0.8rem', fontWeight: 800, fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
});

function Roster({ token }: { token: string }) {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const label = (id: string) => roles.find((r) => r.id === id)?.label ?? id;

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/roles', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!res.ok) { setMsg({ ok: false, text: 'Could not load staff. Reload and try again.' }); return; }
    const json = (await res.json()) as { staff: StaffRow[]; roles: RoleInfo[] };
    setStaff(json.staff);
    setRoles(json.roles);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function change(method: 'POST' | 'DELETE', auth_user_id: string, role: string) {
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/admin/roles', {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth_user_id, role }),
    });
    if (res.ok) {
      setMsg({ ok: true, text: method === 'POST' ? `Added ${label(role)}.` : `Removed ${label(role)}.` });
      setPick((p) => ({ ...p, [auth_user_id]: '' }));
      await load();
    } else {
      const j = await res.json().catch(() => null) as { error?: { message?: string } } | null;
      setMsg({ ok: false, text: j?.error?.message ?? 'That did not save. Try again.' });
    }
    setBusy(false);
  }

  return (
    <div>
      <h1 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.6rem', margin: '0 0 0.25rem' }}>Staff and Roles</h1>
      <p style={{ color: 'var(--text-muted)', margin: '0 0 1rem', fontSize: '0.85rem' }}>
        One account can hold several roles. Admin can do everything; every other role opens only its own screens. Players and volunteers get their access automatically.
      </p>
      <p role="status" aria-live="polite" style={{ margin: '0 0 1rem', fontSize: '0.85rem', minHeight: '1.2rem', color: msg ? (msg.ok ? 'var(--gold-light)' : '#ff6b6b') : 'transparent' }}>{msg?.text ?? ''}</p>

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {staff.map((s) => {
          const held = new Set(s.grants.filter((g) => !g.event).map((g) => g.role));
          const addable = roles.filter((r) => !held.has(r.id));
          return (
            <section key={s.auth_user_id} style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <strong style={{ color: '#fff' }}>{s.display_name}</strong>
                {!s.is_active && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Inactive</span>}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                {s.grants.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No roles. This account can sign in but opens nothing.</span>}
                {s.grants.map((g) => (
                  <span key={`${g.role}|${g.event ?? ''}`} style={{ border: '1px solid var(--navy-border)', padding: '0.3rem 0.5rem', fontSize: '0.8rem', color: '#fff' }}>
                    {label(g.role)}{g.event ? ` (${g.event})` : ''}
                    {!g.event && (
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`Remove ${label(g.role)} from ${s.display_name}`}
                        onClick={() => change('DELETE', s.auth_user_id, g.role)}
                        style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: 'var(--gold-light)', cursor: 'pointer' }}
                      >
                        Remove
                      </button>
                    )}
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <label htmlFor={`add-${s.auth_user_id}`} style={{ position: 'absolute', left: '-9999px' }}>Add a role for {s.display_name}</label>
                <select
                  id={`add-${s.auth_user_id}`}
                  value={pick[s.auth_user_id] ?? ''}
                  onChange={(e) => setPick((p) => ({ ...p, [s.auth_user_id]: e.target.value }))}
                  style={{ background: '#0d1428', color: '#fff', border: '1px solid var(--navy-border)', padding: '0.4rem' }}
                >
                  <option value="">Add a role…</option>
                  {addable.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
                <button type="button" disabled={busy || !pick[s.auth_user_id]} style={btn('gold')} onClick={() => change('POST', s.auth_user_id, pick[s.auth_user_id])}>Add</button>
              </div>
              {pick[s.auth_user_id] && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '0.5rem 0 0' }}>{roles.find((r) => r.id === pick[s.auth_user_id])?.description}</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default function StaffAndRolesPage() {
  return (
    <BracketStaffGate title="Staff and Roles" roles={['admin']} landmark={false}>
      {({ token }) => <Roster token={token} />}
    </BracketStaffGate>
  );
}
