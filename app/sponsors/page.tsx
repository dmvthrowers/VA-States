'use client';

import { useCallback, useEffect, useState } from 'react';
import BracketStaffGate from '@/components/BracketStaffGate';
import { SPONSOR_STATUSES, type Deliverable, type SponsorSummary } from '@/lib/sponsors';

interface Inquiry {
  id: string;
  created_at: string;
  status: string;
  contact_first: string;
  contact_last: string;
  email: string;
  phone: string | null;
  brand_name: string;
  tier: string;
  vendor_table: boolean | null;
  division_sponsor: boolean | null;
  in_kind: boolean | null;
  retail_value_cents: number | null;
  payment_method: string | null;
  notes: string | null;
}

interface Sponsor {
  id: string;
  name: string;
  tier: string | null;
  status: string;
  amount_cents: number;
  in_kind: string | null;
  contact_name: string | null;
  contact_email: string | null;
  notes: string | null;
  deliverables: Deliverable[];
}

const money = (c: number) => `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const field: React.CSSProperties = { background: '#0d1428', color: '#fff', border: '1px solid var(--navy-border)', padding: '0.4rem', fontSize: '0.85rem' };
const btn = (gold = false): React.CSSProperties => ({
  background: gold ? 'var(--gold)' : 'transparent', color: gold ? 'var(--navy-deep)' : '#fff',
  border: `1px solid ${gold ? 'var(--gold)' : 'var(--navy-border)'}`, padding: '0.4rem 0.8rem',
  fontWeight: 800, fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
});

function Board({ token }: { token: string }) {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [summary, setSummary] = useState<SponsorSummary | null>(null);
  const [manage, setManage] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [name, setName] = useState('');
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/sponsors', { headers: auth, cache: 'no-store' });
    if (!res.ok) { setMsg({ ok: false, text: 'Could not load sponsors. Reload and try again.' }); return; }
    const j = await res.json() as { manage: boolean; sponsors: Sponsor[]; summary: SponsorSummary | null };
    setManage(j.manage); setSponsors(j.sponsors); setSummary(j.summary);
    if (j.manage) {
      const r2 = await fetch('/api/admin/sponsors/inquiries', { headers: auth, cache: 'no-store' });
      if (r2.ok) setInquiries(((await r2.json()) as { inquiries: Inquiry[] }).inquiries.filter((i) => i.status === 'new'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function send(method: 'POST' | 'PATCH' | 'DELETE', id: string | null, body?: unknown) {
    setMsg(null);
    const res = await fetch(id ? `/api/admin/sponsors/${id}` : '/api/admin/sponsors', { method, headers: auth, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) {
      const j = await res.json().catch(() => null) as { error?: { message?: string } } | null;
      setMsg({ ok: false, text: j?.error?.message ?? 'That did not save. Try again.' });
      return false;
    }
    await load();
    return true;
  }

  async function handleInquiry(id: string, action: 'convert' | 'dismiss') {
    setMsg(null);
    const res = await fetch(`/api/admin/sponsors/inquiries/${id}`, { method: 'POST', headers: auth, body: JSON.stringify({ action }) });
    if (!res.ok) {
      const j = await res.json().catch(() => null) as { error?: { message?: string } } | null;
      setMsg({ ok: false, text: j?.error?.message ?? 'That did not save. Try again.' });
    } else {
      setMsg({ ok: true, text: action === 'convert' ? 'Added to the pipeline as a prospect.' : 'Dismissed.' });
    }
    await load();
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (await send('POST', null, { name, status: 'prospect', amount_cents: 0 })) setName('');
  }

  function toggle(s: Sponsor, i: number) {
    send('PATCH', s.id, { deliverables: s.deliverables.map((d, k) => (k === i ? { ...d, done: !d.done } : d)) });
  }

  return (
    <div>
      <h1 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.6rem', margin: '0 0 0.25rem' }}>Sponsors</h1>
      <p style={{ color: 'var(--text-muted)', margin: '0 0 1rem', fontSize: '0.85rem' }}>
        {manage ? 'Track every sponsor from first contact to paid, and what each one is owed.' : 'Your sponsorship: what you committed and what we owe you.'}
        {manage && <> <a href="/sponsors/form" style={{ color: 'var(--gold-light)' }}>Edit the sponsor form and tiers</a></>}
      </p>
      <p role="status" aria-live="polite" style={{ margin: '0 0 1rem', fontSize: '0.85rem', minHeight: '1.2rem', color: msg ? (msg.ok ? 'var(--gold-light)' : '#ff6b6b') : 'transparent' }}>{msg?.text ?? ''}</p>

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {[['Pledged', money(summary.pledgedCents)], ['Paid', money(summary.paidCents)], ['Still owed to us', money(summary.outstandingCents)], ['Deliverables done', `${summary.deliverablesDone} of ${summary.deliverablesTotal}`]].map(([k, v]) => (
            <div key={k} style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '0.8rem' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{k}</div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.2rem' }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {manage && inquiries.length > 0 && (
        <section aria-labelledby="inq-h" style={{ background: 'var(--navy)', border: '1px solid var(--gold)', padding: '1rem', marginBottom: '1.5rem' }}>
          <h2 id="inq-h" style={{ color: 'var(--gold)', fontSize: '1rem', margin: '0 0 0.75rem' }}>New inquiries ({inquiries.length})</h2>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {inquiries.map((i) => (
              <div key={i.id} style={{ borderTop: '1px solid var(--navy-border)', paddingTop: '0.75rem' }}>
                <strong style={{ color: '#fff' }}>{i.brand_name}</strong>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}> · {i.contact_first} {i.contact_last} · {i.email}{i.phone ? ` · ${i.phone}` : ''}</span>
                <p style={{ color: 'var(--text-body)', fontSize: '0.8rem', margin: '0.3rem 0' }}>
                  Interested in: {i.tier.replace(/_/g, ' ')}
                  {i.vendor_table ? ' · wants a vendor table' : ''}{i.division_sponsor ? ' · division sponsor' : ''}
                  {i.in_kind ? ` · product${i.retail_value_cents ? ` (about ${money(i.retail_value_cents)})` : ''}` : ''}
                  {i.payment_method ? ` · pay by ${i.payment_method}` : ''}
                </p>
                {i.notes && <p style={{ color: 'var(--text-body)', fontSize: '0.8rem', margin: '0 0 0.5rem', whiteSpace: 'pre-wrap' }}>{i.notes}</p>}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" style={btn(true)} onClick={() => handleInquiry(i.id, 'convert')}>Add as prospect</button>
                  <button type="button" style={btn()} onClick={() => { if (window.confirm(`Dismiss the inquiry from ${i.brand_name}?`)) handleInquiry(i.id, 'dismiss'); }}>Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {manage && (
        <form onSubmit={add} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          <label htmlFor="new-sponsor" style={{ position: 'absolute', left: '-9999px' }}>New sponsor name</label>
          <input id="new-sponsor" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sponsor name" required maxLength={120} style={{ ...field, minWidth: 240 }} />
          <button type="submit" style={btn(true)}>Add sponsor</button>
        </form>
      )}

      {sponsors.length === 0 && <p style={{ color: 'var(--text-muted)' }}>{manage ? 'No sponsors yet.' : 'No sponsorship is linked to your account yet. Ask an organizer.'}</p>}

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {sponsors.map((s) => (
          <section key={s.id} style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <strong style={{ color: '#fff' }}>{s.name}{s.tier ? ` · ${s.tier}` : ''}</strong>
              <span style={{ color: 'var(--gold-light)', fontWeight: 800 }}>{money(s.amount_cents)}</span>
            </div>
            {s.in_kind && <p style={{ color: 'var(--text-body)', fontSize: '0.8rem', margin: '0.4rem 0 0' }}>In kind: {s.in_kind}</p>}

            {manage ? (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.75rem 0' }}>
                <label htmlFor={`st-${s.id}`} style={{ position: 'absolute', left: '-9999px' }}>Status for {s.name}</label>
                <select id={`st-${s.id}`} value={s.status} onChange={(e) => send('PATCH', s.id, { status: e.target.value })} style={field}>
                  {SPONSOR_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                </select>
                <label htmlFor={`amt-${s.id}`} style={{ position: 'absolute', left: '-9999px' }}>Amount in dollars for {s.name}</label>
                <input
                  id={`amt-${s.id}`} type="number" min={0} step={50} defaultValue={s.amount_cents / 100} style={{ ...field, width: 110 }}
                  onBlur={(e) => { const c = Math.round(Number(e.target.value) * 100); if (Number.isFinite(c) && c >= 0 && c !== s.amount_cents) send('PATCH', s.id, { amount_cents: c }); }}
                />
                <button type="button" style={btn()} onClick={() => { const label = window.prompt('Deliverable (what we owe this sponsor)'); if (label?.trim()) send('PATCH', s.id, { deliverables: [...s.deliverables, { label, done: false }] }); }}>Add deliverable</button>
                <button type="button" style={btn()} onClick={() => { if (window.confirm(`Delete ${s.name}?`)) send('DELETE', s.id); }}>Delete</button>
              </div>
            ) : (
              <p style={{ color: 'var(--text-body)', fontSize: '0.8rem', margin: '0.5rem 0' }}>Status: {s.status}</p>
            )}

            {s.deliverables.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.3rem' }}>
                {s.deliverables.map((d, i) => (
                  <li key={`${d.label}-${i}`} style={{ color: '#fff', fontSize: '0.85rem' }}>
                    <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input type="checkbox" checked={d.done} disabled={!manage} onChange={() => toggle(s, i)} />
                      <span style={{ textDecoration: d.done ? 'line-through' : 'none' }}>{d.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

export default function SponsorsPage() {
  return (
    <BracketStaffGate title="Sponsors" roles={['admin']} landmark={false}>
      {({ token }) => <Board token={token} />}
    </BracketStaffGate>
  );
}
