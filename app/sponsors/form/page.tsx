'use client';

import { useCallback, useEffect, useState } from 'react';
import BracketStaffGate from '@/components/BracketStaffGate';
import type { SponsorSettings } from '@/lib/sponsor-settings';

/** One tier while editing: perks and slots are text so a half-typed value never breaks the form. */
interface TierRow { id?: string; label: string; amount: string; slots: string; perks: string }
interface Draft { enabled: boolean; intro: string; tiers: TierRow[]; otherChoices: { id?: string; label: string }[]; contactMethods: string; paymentMethods: string; heardFrom: string }

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const toDraft = (s: SponsorSettings): Draft => ({
  enabled: s.enabled, intro: s.intro,
  tiers: s.tiers.map((t) => ({ id: t.id, label: t.label, amount: t.amount, slots: t.slots?.toString() ?? '', perks: (t.perks ?? []).join('\n') })),
  otherChoices: s.otherChoices.map((o) => ({ ...o })),
  contactMethods: s.contactMethods.join('\n'), paymentMethods: s.paymentMethods.join('\n'), heardFrom: s.heardFrom.join('\n'),
});
const fromDraft = (d: Draft) => ({
  enabled: d.enabled, intro: d.intro.trim(),
  tiers: d.tiers.map((t) => ({
    ...(t.id ? { id: t.id } : {}), label: t.label.trim(), amount: t.amount.trim(),
    ...(t.slots.trim() ? { slots: Number(t.slots) } : {}), ...(lines(t.perks).length ? { perks: lines(t.perks) } : {}),
  })),
  otherChoices: d.otherChoices.filter((o) => o.label.trim()).map((o) => ({ ...(o.id ? { id: o.id } : {}), label: o.label.trim() })),
  contactMethods: lines(d.contactMethods), paymentMethods: lines(d.paymentMethods), heardFrom: lines(d.heardFrom),
});

const field: React.CSSProperties = { background: '#0d1428', color: '#fff', border: '1px solid var(--navy-border)', padding: '0.4rem', fontSize: '0.85rem', width: '100%' };
const lab: React.CSSProperties = { display: 'block', color: 'var(--text-muted)', fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.25rem' };
const btn = (gold = false): React.CSSProperties => ({
  background: gold ? 'var(--gold)' : 'transparent', color: gold ? 'var(--navy-deep)' : '#fff',
  border: `1px solid ${gold ? 'var(--gold)' : 'var(--navy-border)'}`, padding: '0.4rem 0.8rem',
  fontWeight: 800, fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
});
const card: React.CSSProperties = { background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '1rem', marginBottom: '1rem' };

function Editor({ token }: { token: string }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [customized, setCustomized] = useState(false);
  const [manage, setManage] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/sponsors/form', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (res.status === 403) { setManage(false); return; }
    if (!res.ok) { setMsg({ ok: false, text: 'Could not load the form settings. Reload and try again.' }); return; }
    const j = (await res.json()) as { settings: SponsorSettings; customized: boolean };
    setDraft(toDraft(j.settings)); setCustomized(j.customized);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  if (!manage) return <p style={{ color: 'var(--text-muted)' }}>Editing the sponsor form needs sponsor management access.</p>;
  if (!draft) return <p style={{ color: 'var(--text-muted)' }}>{msg?.text ?? 'Loading…'}</p>;

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const setTier = (i: number, patch: Partial<TierRow>) => set({ tiers: draft.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const move = (i: number, d: -1 | 1) => {
    const to = i + d;
    if (to < 0 || to >= draft.tiers.length) return;
    const tiers = [...draft.tiers];
    [tiers[i], tiers[to]] = [tiers[to], tiers[i]];
    set({ tiers });
  };

  async function save() {
    if (!draft) return;
    setBusy(true); setMsg(null);
    const res = await fetch('/api/admin/sponsors/form', { method: 'PUT', headers: auth, body: JSON.stringify({ settings: fromDraft(draft) }) });
    setBusy(false);
    if (res.ok) { setMsg({ ok: true, text: 'Saved. The public form uses it now.' }); await load(); return; }
    const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    setMsg({ ok: false, text: j?.error?.message ?? 'Could not save. Check the fields and try again.' });
  }
  async function reset() {
    if (!window.confirm('Go back to the default tiers and options? Your saved changes will be lost.')) return;
    setBusy(true);
    const res = await fetch('/api/admin/sponsors/form', { method: 'DELETE', headers: auth });
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: 'Could not reset.' }); return; }
    setMsg({ ok: true, text: 'Back to the defaults.' }); await load();
  }

  return (
    <div>
      <h1 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.6rem', margin: '0 0 0.25rem' }}>Sponsor form</h1>
      <p style={{ color: 'var(--text-muted)', margin: '0 0 1rem', fontSize: '0.85rem' }}>
        Rename, reprice, add and remove tiers, and edit the options on the public form. {customized ? 'You are using your saved version.' : 'You are using the defaults.'}{' '}
        <a href="/sponsors" style={{ color: 'var(--gold-light)' }}>Back to sponsors</a>
      </p>
      <p role="status" aria-live="polite" style={{ margin: '0 0 1rem', fontSize: '0.85rem', minHeight: '1.2rem', color: msg ? (msg.ok ? 'var(--gold-light)' : '#ff6b6b') : 'transparent' }}>{msg?.text ?? ''}</p>

      <section style={card}>
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: '#fff', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
          <input type="checkbox" checked={draft.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> The form is open
        </label>
        <label htmlFor="intro" style={lab}>Intro text</label>
        <textarea id="intro" rows={3} maxLength={600} value={draft.intro} onChange={(e) => set({ intro: e.target.value })} style={field} />
      </section>

      <h2 style={{ color: 'var(--gold)', fontSize: '1rem', margin: '0 0 0.5rem' }}>Tiers</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0 0 0.75rem' }}>
        Top first. The price is text, so it can say &quot;$500+&quot; or &quot;Product or service&quot;. Leave slots empty for an open tier. Renaming a tier also renames it on sponsors already placed there.
      </p>
      {draft.tiers.map((t, i) => (
        <section key={t.id ?? `new-${i}`} style={card} aria-label={`Tier ${i + 1}`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.6rem' }}>
            <div><label htmlFor={`n${i}`} style={lab}>Name</label><input id={`n${i}`} value={t.label} maxLength={60} onChange={(e) => setTier(i, { label: e.target.value })} style={field} /></div>
            <div><label htmlFor={`a${i}`} style={lab}>Price shown</label><input id={`a${i}`} value={t.amount} maxLength={40} onChange={(e) => setTier(i, { amount: e.target.value })} style={field} /></div>
            <div><label htmlFor={`s${i}`} style={lab}>Slots (empty = open)</label><input id={`s${i}`} value={t.slots} inputMode="numeric" maxLength={3} onChange={(e) => setTier(i, { slots: e.target.value.replace(/\D/g, '') })} style={field} /></div>
          </div>
          <label htmlFor={`p${i}`} style={{ ...lab, marginTop: '0.6rem' }}>What they get (one per line, optional)</label>
          <textarea id={`p${i}`} rows={3} value={t.perks} onChange={(e) => setTier(i, { perks: e.target.value })} style={field} />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
            <button type="button" style={btn()} onClick={() => move(i, -1)} disabled={i === 0}>Up</button>
            <button type="button" style={btn()} onClick={() => move(i, 1)} disabled={i === draft.tiers.length - 1}>Down</button>
            <button type="button" style={btn()} disabled={draft.tiers.length === 1} onClick={() => { if (window.confirm(`Remove ${t.label || 'this tier'}? Past inquiries keep what they asked for.`)) set({ tiers: draft.tiers.filter((_, j) => j !== i) }); }}>Remove</button>
          </div>
        </section>
      ))}
      <button type="button" style={{ ...btn(), marginBottom: '1.5rem' }} disabled={draft.tiers.length >= 12} onClick={() => set({ tiers: [...draft.tiers, { label: '', amount: '', slots: '', perks: '' }] })}>Add a tier</button>

      <h2 style={{ color: 'var(--gold)', fontSize: '1rem', margin: '0 0 0.5rem' }}>Other choices and options</h2>
      <section style={card}>
        <label htmlFor="oc" style={lab}>Other choices next to the tiers (one per line)</label>
        <textarea id="oc" rows={3} value={draft.otherChoices.map((o) => o.label).join('\n')} style={field}
          onChange={(e) => set({ otherChoices: e.target.value.split('\n').map((label, i) => ({ id: draft.otherChoices.find((o) => o.label === label)?.id ?? draft.otherChoices[i]?.id, label })) })} />
        <label htmlFor="cm" style={{ ...lab, marginTop: '0.6rem' }}>Ways to reach them (one per line)</label>
        <textarea id="cm" rows={4} value={draft.contactMethods} onChange={(e) => set({ contactMethods: e.target.value })} style={field} />
        <label htmlFor="pm" style={{ ...lab, marginTop: '0.6rem' }}>Ways to pay (one per line)</label>
        <textarea id="pm" rows={5} value={draft.paymentMethods} onChange={(e) => set({ paymentMethods: e.target.value })} style={field} />
        <label htmlFor="hf" style={{ ...lab, marginTop: '0.6rem' }}>How did you hear about us (one per line)</label>
        <textarea id="hf" rows={5} value={draft.heardFrom} onChange={(e) => set({ heardFrom: e.target.value })} style={field} />
      </section>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" style={btn(true)} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button>
        <button type="button" style={btn()} disabled={busy} onClick={load}>Discard edits</button>
        {customized && <button type="button" style={btn()} disabled={busy} onClick={reset}>Reset to defaults</button>}
      </div>
    </div>
  );
}

export default function SponsorFormPage() {
  return (
    <BracketStaffGate title="Sponsor form" roles={['admin']} landmark={false}>
      {({ token }) => <Editor token={token} />}
    </BracketStaffGate>
  );
}
