'use client';

import { useCallback, useEffect, useState } from 'react';
import BracketStaffGate from '@/components/BracketStaffGate';
import { contest } from '@/contest.config';

interface Flags {
  results_published: boolean;
  online_registration_open: boolean;
}

const FLAGS: { key: keyof Flags; label: string; on: string; off: string }[] = [
  { key: 'online_registration_open', label: 'Online registration', on: 'Open: players can register online.', off: 'Closed: the home page shows the closed notice and the API refuses new sign-ups.' },
  { key: 'results_published', label: 'Results', on: 'Published: the results page is public.', off: 'Hidden: the results page is not public yet.' },
];

function Setup({ token }: { token: string }) {
  const [flags, setFlags] = useState<Flags | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    const res = await fetch('/api/ops/event-flags', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!res.ok) { setMsg({ ok: false, text: 'Could not load the switches. Reload and try again.' }); return; }
    setFlags((await res.json()) as Flags);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function flip(key: keyof Flags) {
    if (!flags) return;
    const next = !flags[key];
    if (!window.confirm(`${next ? 'Turn on' : 'Turn off'} "${FLAGS.find((f) => f.key === key)?.label}"? This changes the live site right away.`)) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/ops/event-flags', { method: 'PATCH', headers: auth, body: JSON.stringify({ [key]: next }) });
    if (res.ok) { setMsg({ ok: true, text: 'Saved.' }); await load(); }
    else setMsg({ ok: false, text: 'That did not save. Try again.' });
    setBusy(false);
  }

  return (
    <div>
      <h1 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.6rem', margin: '0 0 0.25rem' }}>Event Setup</h1>
      <p style={{ color: 'var(--text-muted)', margin: '0 0 1rem', fontSize: '0.85rem' }}>
        {contest.name}: the live switches. Divisions, prices, rounds and prizes are set in <code>contest.config.ts</code> (see docs/FORMATS.md); a screen for editing them is on the roadmap.
      </p>
      <p role="status" aria-live="polite" style={{ margin: '0 0 1rem', fontSize: '0.85rem', minHeight: '1.2rem', color: msg ? (msg.ok ? 'var(--gold-light)' : '#ff6b6b') : 'transparent' }}>{msg?.text ?? ''}</p>
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {FLAGS.map((f) => (
          <section key={f.key} style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '1rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <strong style={{ color: '#fff' }}>{f.label}</strong>
              <p style={{ color: 'var(--text-body)', fontSize: '0.85rem', margin: '0.3rem 0 0' }}>{flags ? (flags[f.key] ? f.on : f.off) : 'Loading…'}</p>
            </div>
            <button
              type="button"
              disabled={busy || !flags}
              onClick={() => flip(f.key)}
              style={{ background: 'var(--gold)', color: 'var(--navy-deep)', border: '1px solid var(--gold)', padding: '0.5rem 1rem', fontWeight: 800, fontSize: '0.75rem', letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}
            >
              {flags ? (flags[f.key] ? 'Turn off' : 'Turn on') : '…'}
            </button>
          </section>
        ))}
      </div>
    </div>
  );
}

export default function EventSetupPage() {
  return (
    <BracketStaffGate title="Event Setup" roles={['admin']} landmark={false}>
      {({ token }) => <Setup token={token} />}
    </BracketStaffGate>
  );
}
