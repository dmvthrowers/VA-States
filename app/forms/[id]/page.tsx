'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import { Field, inputCls } from '@/components/form/Field';
import { Turnstile } from '@/components/Turnstile';
import { contest } from '@/contest.config';
import type { Answer, FieldDef } from '@/lib/forms';

interface PublicForm { id: string; title: string; intro: string; fields: FieldDef[]; submitLabel: string; doneMessage: string }

/** A form from contest.forms (docs/FORMS.md): the fields come from the server, so the page never drifts from the validation. */
export default function FormPage() {
  const { id } = useParams<{ id: string }>();
  const [form, setForm] = useState<PublicForm | null>(null);
  const [missing, setMissing] = useState(false);
  const [v, setV] = useState<Record<string, Answer>>({});
  const [hp, setHp] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  useEffect(() => {
    fetch(`/api/forms/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? (r.json() as Promise<PublicForm>) : Promise.reject(new Error('closed'))))
      .then(setForm)
      .catch(() => setMissing(true));
  }, [id]);

  const set = (fid: string, value: Answer) => setV((p) => ({ ...p, [fid]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError('');
    setBusy(true);
    try {
      // Empty optional values are left out; numbers and checkboxes keep their types.
      const body: Record<string, Answer> = { _hp: hp };
      for (const f of form.fields) {
        const val = v[f.id];
        if (val === undefined || val === '') continue;
        body[f.id] = val;
      }
      const res = await fetch(`/api/forms/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, turnstileToken }) });
      if (res.ok) { setDone(true); return; }
      const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(j?.error?.message ?? 'That did not send. Please try again, or email us.');
    } catch {
      setError('That did not send. Check your connection and try again.');
    } finally {
      setTurnstileResetKey((k) => k + 1);
      setBusy(false);
    }
  }

  const shell = (title: string, intro: string, body: React.ReactNode) => (
    <>
      <NavBar />
      <div className="bg-navy-deep border-b border-navy-border py-12 px-6">
        <div className="max-w-3xl mx-auto">
          <span className="inline-block bg-gold text-navy-deep text-xs font-black tracking-widest px-3 py-1 mb-3">{contest.shortName}</span>
          <h1 className="font-display font-black text-4xl text-gold mb-2">{title}</h1>
          {intro && <p className="text-sm text-text-body mt-3">{intro}</p>}
        </div>
      </div>
      <main id="main-content" className="max-w-3xl mx-auto px-4 py-10">{body}</main>
      <Footer />
    </>
  );

  if (missing) return shell('Form closed', '', <p className="text-sm text-text-body">This form is not open. Write to {contest.contactEmail} and we will get back to you.</p>);
  if (!form) return shell('Loading', '', <p className="text-sm text-text-body">Loading the form.</p>);
  if (done) return shell(form.title, '', <p role="status" className="text-sm text-text-body">{form.doneMessage}</p>);

  return shell(form.title, form.intro, (
    <form onSubmit={submit} className="space-y-6">
      <input type="text" name="_hp" value={hp} onChange={(e) => setHp(e.target.value)} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      {form.fields.map((f) => {
        const label = f.required ? `${f.label} *` : f.label;
        const val = v[f.id];
        switch (f.type) {
          case 'longtext':
            return <Field key={f.id} label={label} hint={f.help}><textarea className={inputCls(false)} rows={5} maxLength={f.max ?? 4000} value={(val as string) ?? ''} onChange={(e) => set(f.id, e.target.value)} required={f.required} /></Field>;
          case 'select':
            return (
              <Field key={f.id} label={label} hint={f.help}>
                <select className={inputCls(false)} value={(val as string) ?? ''} onChange={(e) => set(f.id, e.target.value)} required={f.required}>
                  <option value="">Pick one</option>
                  {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
            );
          case 'multiselect':
            return (
              <Field key={f.id} label={label} hint={f.help}>
                <div className="space-y-2">
                  {(f.options ?? []).map((o) => {
                    const cur = (val as string[] | undefined) ?? [];
                    return (
                      <label key={o} className="flex items-center gap-2 text-sm text-white">
                        <input type="checkbox" checked={cur.includes(o)} onChange={(e) => set(f.id, e.target.checked ? [...cur, o] : cur.filter((x) => x !== o))} />
                        {o}
                      </label>
                    );
                  })}
                </div>
              </Field>
            );
          case 'checkbox':
            return (
              <label key={f.id} className="flex items-start gap-2 text-sm text-white">
                <input type="checkbox" className="mt-1" checked={val === true} onChange={(e) => set(f.id, e.target.checked)} required={f.required} />
                <span>{f.label}{f.help && <span className="block text-xs text-text-muted">{f.help}</span>}</span>
              </label>
            );
          case 'number':
            return <Field key={f.id} label={label} hint={f.help}><input type="number" className={inputCls(false)} value={typeof val === 'number' ? val : ''} onChange={(e) => (e.target.value === '' ? setV((p) => { const n = { ...p }; delete n[f.id]; return n; }) : set(f.id, Number(e.target.value)))} required={f.required} /></Field>;
          default: {
            const type = f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : f.type === 'url' ? 'url' : 'text';
            const auto = f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : undefined;
            return <Field key={f.id} label={label} hint={f.help}><input type={type} className={inputCls(false)} maxLength={f.max ?? 200} value={(val as string) ?? ''} onChange={(e) => set(f.id, e.target.value)} required={f.required} autoComplete={auto} /></Field>;
          }
        }
      })}
      {error && <p role="alert" className="text-sm text-red">{error}</p>}
      <Turnstile onToken={setTurnstileToken} resetKey={turnstileResetKey} />
      <button type="submit" disabled={busy} className="bg-gold text-navy-deep font-black text-xs tracking-widest px-6 py-3 disabled:opacity-60">{busy ? 'SENDING' : form.submitLabel.toUpperCase()}</button>
    </form>
  ));
}
