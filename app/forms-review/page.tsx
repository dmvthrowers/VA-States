'use client';

import { useEffect, useState } from 'react';
import BracketStaffGate from '@/components/BracketStaffGate';
import { SUBMISSION_STATUSES, type Answer } from '@/lib/forms';

interface FormInfo { id: string; title: string; enabled: boolean; fields: { id: string; label: string }[] }
interface Submission { id: string; created_at: string; form_id: string; status: string; answers: Record<string, Answer>; note: string | null }

const field: React.CSSProperties = { background: '#0d1428', color: '#fff', border: '1px solid var(--navy-border)', padding: '0.4rem', fontSize: '0.85rem' };
const btn: React.CSSProperties = { background: 'transparent', color: '#fff', border: '1px solid var(--navy-border)', padding: '0.4rem 0.8rem', fontWeight: 800, fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' };
const show = (a: Answer) => (Array.isArray(a) ? a.join(', ') : typeof a === 'boolean' ? (a ? 'yes' : 'no') : String(a));

function Board({ token }: { token: string }) {
  const [forms, setForms] = useState<FormInfo[]>([]);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [formId, setFormId] = useState('');
  const [status, setStatus] = useState('new');
  const [msg, setMsg] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Bumped after a change so the list loads again.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    const qs = new URLSearchParams();
    if (formId) qs.set('form', formId);
    if (status) qs.set('status', status);
    fetch(`/api/admin/forms?${qs}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<{ forms: FormInfo[]; submissions: Submission[] }>) : Promise.reject(new Error('bad response'))))
      .then((j) => { if (live) { setForms(j.forms); setSubs(j.submissions); setMsg(''); } })
      .catch(() => { if (live) setMsg('Could not load answers. Reload and try again.'); });
    return () => { live = false; };
  }, [token, formId, status, tick]);

  async function mark(s: Submission, next: string) {
    const res = await fetch(`/api/admin/forms/${s.id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ status: next, note: notes[s.id] ?? s.note ?? '' }) });
    if (!res.ok) { setMsg('Could not save that. Try again.'); return; }
    setTick((t) => t + 1);
  }

  const titleOf = (id: string) => forms.find((f) => f.id === id)?.title ?? id;
  const labelOf = (fid: string, key: string) => forms.find((f) => f.id === fid)?.fields.find((x) => x.id === key)?.label ?? key;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '1rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1rem' }}>
        <label style={{ color: '#fff', fontSize: '0.8rem' }}>Form{' '}
          <select style={field} value={formId} onChange={(e) => setFormId(e.target.value)}>
            <option value="">All forms</option>
            {forms.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
          </select>
        </label>
        <label style={{ color: '#fff', fontSize: '0.8rem' }}>Status{' '}
          <select style={field} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any</option>
            {SUBMISSION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      {msg && <p role="alert" style={{ color: '#ff8a8a', fontSize: '0.85rem' }}>{msg}</p>}
      {subs.length === 0 && !msg && <p style={{ color: 'var(--text-body)', fontSize: '0.9rem' }}>No answers here.</p>}
      <div style={{ display: 'grid', gap: '1rem' }}>
        {subs.map((s) => (
          <section key={s.id} style={{ border: '1px solid var(--navy-border)', padding: '1rem', background: 'var(--navy)' }}>
            <h2 style={{ color: 'var(--gold)', fontSize: '0.8rem', letterSpacing: '0.1em', margin: '0 0 0.5rem' }}>
              {titleOf(s.form_id)} · {new Date(s.created_at).toLocaleString()} · {s.status}
            </h2>
            <dl style={{ margin: 0 }}>
              {Object.entries(s.answers).map(([k, a]) => (
                <div key={k} style={{ marginBottom: '0.4rem' }}>
                  <dt style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{labelOf(s.form_id, k)}</dt>
                  <dd style={{ color: '#fff', fontSize: '0.9rem', margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{show(a)}</dd>
                </div>
              ))}
            </dl>
            <label style={{ display: 'block', color: '#fff', fontSize: '0.75rem', margin: '0.6rem 0 0.3rem' }}>Private note</label>
            <textarea style={{ ...field, width: '100%' }} rows={2} maxLength={2000} value={notes[s.id] ?? s.note ?? ''} onChange={(e) => setNotes((p) => ({ ...p, [s.id]: e.target.value }))} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
              {SUBMISSION_STATUSES.filter((x) => x !== s.status).map((x) => <button key={x} type="button" style={btn} onClick={() => void mark(s, x)}>Mark {x}</button>)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export default function FormsReviewPage() {
  return (
    <BracketStaffGate title="Form answers" roles={['admin', 'form_reader']} landmark={false}>
      {({ token }) => <Board token={token} />}
    </BracketStaffGate>
  );
}
