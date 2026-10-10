'use client';

import { useEffect, useState } from 'react';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import { Field, inputCls } from '@/components/form/Field';
import { Turnstile } from '@/components/Turnstile';
import { contest } from '@/contest.config';
import type { TierDef } from '@/lib/sponsor-settings';

type V = Record<string, string>;
const EMPTY: V = {
  first_name: '', last_name: '', email: '', phone: '', brand_name: '', social_handle: '', contact_method: '', website: '',
  logo_url: '', payment_method: '', billing_email: '', display_name: '', product_use_ok: '', tier: '', vendor_table: '', division_sponsor: '', in_kind: '', retail_value: '', heard_from: '', notes: '', _hp: '',
};

function YesNo({ name, value, onChange }: { name: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-6">
      {(['yes', 'no'] as const).map((o) => (
        <label key={o} className="flex items-center gap-2 text-sm text-white">
          <input type="radio" name={name} value={o} checked={value === o} onChange={() => onChange(o)} />
          {o === 'yes' ? 'Yes' : 'No'}
        </label>
      ))}
    </div>
  );
}

interface TierState extends TierDef { left?: number; full: boolean }
interface FormState { enabled: boolean; intro: string; otherChoices: { id: string; label: string }[]; contactMethods: string[]; paymentMethods: string[]; heardFrom: string[] }

export default function SponsorPage() {
  // Starts from the config defaults; the saved settings (tiers, prices, options, slots left) come from the server.
  const [cfg, setCfg] = useState<FormState>({ enabled: contest.sponsors.enabled, intro: contest.sponsors.intro, otherChoices: [...contest.sponsors.otherChoices], contactMethods: [...contest.sponsors.contactMethods], paymentMethods: [...contest.sponsors.paymentMethods], heardFrom: [...contest.sponsors.heardFrom] });
  const [tiers, setTiers] = useState<TierState[]>(contest.sponsors.tiers.map((t) => ({ id: t.id, label: t.label, amount: t.amount, slots: t.slots, perks: t.perks ? [...t.perks] : undefined, full: false })));
  useEffect(() => {
    fetch('/api/sponsor-inquiry').then((r) => (r.ok ? r.json() : null)).then((j: (FormState & { tiers: TierState[] }) | null) => {
      if (!j?.tiers) return;
      setTiers(j.tiers);
      setCfg({ enabled: j.enabled, intro: j.intro, otherChoices: j.otherChoices, contactMethods: j.contactMethods, paymentMethods: j.paymentMethods, heardFrom: j.heardFrom });
    }).catch(() => {});
  }, []);
  const [v, setV] = useState<V>(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  const setVal = (k: string) => (val: string) => setV((p) => ({ ...p, [k]: val }));

  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/sponsor-inquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...v, turnstileToken }) });
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

  const header = (
    <div className="bg-navy-deep border-b border-navy-border py-12 px-6">
      <div className="max-w-3xl mx-auto">
        <span className="inline-block bg-gold text-navy-deep text-xs font-black tracking-widest px-3 py-1 mb-3">{contest.shortName}</span>
        <h1 className="font-display font-black text-4xl text-gold mb-2">Want to sponsor?</h1>
        <p className="text-sm text-text-body mt-3">{cfg.intro}</p>
      </div>
    </div>
  );

  if (!cfg.enabled) {
    return (
      <>
        <NavBar />
        {header}
        <main id="main-content" className="max-w-3xl mx-auto px-4 py-10">
          <p className="text-sm text-text-body">Sponsor inquiries are closed right now. Write to {contest.contactEmail} and we will get back to you.</p>
        </main>
        <Footer />
      </>
    );
  }

  if (done) {
    return (
      <>
        <NavBar />
        {header}
        <main id="main-content" className="max-w-3xl mx-auto px-4 py-10">
          <h2 className="font-display font-bold text-2xl text-white mb-2">Thank you.</h2>
          <p role="status" className="text-sm text-text-body">We got your inquiry and sent a confirmation to {v.email}. A person reads every one and will get back to you soon.</p>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <NavBar />
      {header}
      <main id="main-content" className="max-w-3xl mx-auto px-4 py-10">
        <form onSubmit={submit} className="space-y-6" noValidate={false}>
          <input type="text" name="_hp" value={v._hp} onChange={set('_hp')} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="First name *"><input className={inputCls(false)} value={v.first_name} onChange={set('first_name')} required maxLength={80} autoComplete="given-name" /></Field>
            <Field label="Last name *"><input className={inputCls(false)} value={v.last_name} onChange={set('last_name')} required maxLength={80} autoComplete="family-name" /></Field>
          </div>
          <Field label="Email *"><input type="email" className={inputCls(false)} value={v.email} onChange={set('email')} required maxLength={254} autoComplete="email" /></Field>
          <Field label="Phone" hint="Optional"><input type="tel" className={inputCls(false)} value={v.phone} onChange={set('phone')} maxLength={40} autoComplete="tel" /></Field>
          <Field label="Brand or business name *"><input className={inputCls(false)} value={v.brand_name} onChange={set('brand_name')} required maxLength={160} autoComplete="organization" /></Field>
          <Field label="Social media handle"><input className={inputCls(false)} value={v.social_handle} onChange={set('social_handle')} maxLength={100} /></Field>
          <Field label="Best way to reach you">
            <select className={inputCls(false)} value={v.contact_method} onChange={set('contact_method')}>
              <option value="">Pick one</option>
              {cfg.contactMethods.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Company website" hint="Starts with https://"><input type="url" className={inputCls(false)} value={v.website} onChange={set('website')} maxLength={300} /></Field>
          <Field label="Link to your logo" hint="A link to a logo file we can download. We will ask for the final artwork later."><input type="url" className={inputCls(false)} value={v.logo_url} onChange={set('logo_url')} maxLength={500} /></Field>

          <Field label="What would you like to do? *">
            <div className="space-y-2">
              {[
                ...tiers.map((t) => ({
                  id: t.id,
                  full: t.full,
                  text: `${t.label} (${t.amount})`,
                  note: t.slots === undefined ? '' : t.full ? 'Full' : `${t.left} of ${t.slots} left`,
                  perks: t.perks ?? [],
                })),
                ...cfg.otherChoices.map((c) => ({ id: c.id, full: false, text: c.label, note: '', perks: [] as string[] })),
              ].map((o) => (
                <label key={o.id} className={`flex items-center gap-2 text-sm ${o.full ? 'text-text-muted' : 'text-white'}`}>
                  <input type="radio" name="tier" value={o.id} checked={v.tier === o.id} disabled={o.full} onChange={() => setVal('tier')(o.id)} required />
                  <span>{o.text}{o.note && <span className="text-gold-light"> · {o.note}</span>}
                    {o.perks.length > 0 && <span className="block text-xs text-text-muted">{o.perks.join(' · ')}</span>}
                  </span>
                </label>
              ))}
            </div>
          </Field>

          <Field label="Interested in a vendor table?"><YesNo name="vendor_table" value={v.vendor_table} onChange={setVal('vendor_table')} /></Field>
          <Field label="Interested in sponsoring a division?"><YesNo name="division_sponsor" value={v.division_sponsor} onChange={setVal('division_sponsor')} /></Field>
          <Field label="Will you include product?"><YesNo name="in_kind" value={v.in_kind} onChange={setVal('in_kind')} /></Field>
          {v.in_kind === 'yes' && (
            <>
              <Field label="Estimated retail value" hint="A rough dollar amount is fine."><input className={inputCls(false)} value={v.retail_value} onChange={set('retail_value')} maxLength={30} inputMode="decimal" /></Field>
              <Field label="May we use your product for prize bags, raffles and giveaways?" hint="We credit your brand from the stage and on social media."><YesNo name="product_use_ok" value={v.product_use_ok} onChange={setVal('product_use_ok')} /></Field>
            </>
          )}
          <Field label="How would you like to pay?" hint="Pay whichever way is easiest. After we review your inquiry we will send an invoice or link.">
            <select className={inputCls(false)} value={v.payment_method} onChange={set('payment_method')}>
              <option value="">Pick one</option>
              {cfg.paymentMethods.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Billing email" hint="Only if invoices should go to someone other than you."><input type="email" className={inputCls(false)} value={v.billing_email} onChange={set('billing_email')} maxLength={254} /></Field>
          <Field label="How should we list your name?" hint="On the banner and in posts, if different from your brand name."><input className={inputCls(false)} value={v.display_name} onChange={set('display_name')} maxLength={160} /></Field>
          <Field label="How did you hear about us?">
            <select className={inputCls(false)} value={v.heard_from} onChange={set('heard_from')}>
              <option value="">Pick one</option>
              {cfg.heardFrom.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Questions, requests or notes"><textarea className={inputCls(false)} rows={5} value={v.notes} onChange={set('notes')} maxLength={2000} /></Field>

          {error && <p role="alert" className="text-sm text-error">{error}</p>}
          <Turnstile onToken={setTurnstileToken} resetKey={turnstileResetKey} />
          <button type="submit" disabled={busy} className="bg-gold text-navy-deep font-black tracking-caps px-6 py-3 text-xs">
            {busy ? 'Sending…' : 'Send inquiry'}
          </button>
        </form>
      </main>
      <Footer />
    </>
  );
}
