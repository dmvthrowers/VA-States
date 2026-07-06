'use client';

import { useState } from 'react';

type Division = '1A' | 'X' | 'SBJ';
const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DC','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

interface FormState {
  first_name: string;
  last_name: string;
  preferred_bracket_name: string;
  age_on_event: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  divisions: Division[];
  x_substyle: string;
  parent_name: string;
  parent_email: string;
  parent_consented: boolean;
  liability_waiver_accepted: boolean;
  code_of_conduct_accepted: boolean;
  paid_at_table: boolean;
}

const BLANK: FormState = {
  first_name: '', last_name: '', preferred_bracket_name: '',
  age_on_event: '', email: '', phone: '', city: '', state: 'VA',
  divisions: [], x_substyle: '',
  parent_name: '', parent_email: '', parent_consented: false,
  liability_waiver_accepted: false, code_of_conduct_accepted: false,
  paid_at_table: false,
};

const DIVISION_PRICES: Record<Division, number> = { '1A': 25, 'X': 20, 'SBJ': 15 };
const WALK_UP_SURCHARGE = 10;

function estimateFee(divisions: Division[], paid_at_table: boolean): number {
  if (divisions.length === 0) return 0;
  const has1A = divisions.includes('1A');
  const hasX  = divisions.includes('X');
  const hasSBJ = divisions.includes('SBJ');
  let fee = (has1A && hasX) ? 40 + (hasSBJ ? 15 : 0) : divisions.reduce((s, d) => s + DIVISION_PRICES[d], 0);
  return fee + WALK_UP_SURCHARGE;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.6rem', letterSpacing: '0.14em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.35rem' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.65rem 0.75rem',
  background: '#0d1428',
  border: '1px solid var(--navy-border)',
  color: '#fff',
  fontSize: '0.9rem',
  boxSizing: 'border-box',
};

export default function WalkUpPage() {
  const [form, setForm] = useState<FormState>(BLANK);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; data?: unknown; error?: string } | null>(null);

  const estimatedFee = estimateFee(form.divisions, form.paid_at_table);
  const isMinor = parseInt(form.age_on_event, 10) < 18;

  function toggle(div: Division) {
    setForm((f) => ({
      ...f,
      divisions: f.divisions.includes(div) ? f.divisions.filter((d) => d !== div) : [...f.divisions, div],
    }));
  }

  function set(field: keyof FormState, value: unknown) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    const payload = {
      first_name: form.first_name,
      last_name: form.last_name,
      preferred_bracket_name: form.preferred_bracket_name || undefined,
      age_on_event: parseInt(form.age_on_event, 10),
      email: form.email,
      phone: form.phone || undefined,
      city: form.city,
      state: form.state,
      divisions: form.divisions,
      x_substyle: form.x_substyle || undefined,
      parent_name: form.parent_name || undefined,
      parent_email: form.parent_email || undefined,
      parent_consented: form.parent_consented,
      liability_waiver_accepted: form.liability_waiver_accepted,
      code_of_conduct_accepted: form.code_of_conduct_accepted,
      paid_at_table: form.paid_at_table,
    };

    try {
      const res = await fetch('/api/admin/walk-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok) {
        setResult({ ok: true, data: json });
        setForm(BLANK);
      } else {
        setResult({ ok: false, error: json.error?.message ?? 'Registration failed.' });
      }
    } catch {
      setResult({ ok: false, error: 'Network error — check connection.' });
    }
    setSubmitting(false);
  }

  const lastResult = result?.ok ? (result.data as { id: string; fee_cents: number; paid: boolean; payment_note: string }) : null;

  return (
    <div style={{ maxWidth: 680 }}>
      <h1 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.5rem', margin: '0 0 0.5rem' }}>
        Walk-Up Registration
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 2rem' }}>
        For day-of registrants. +$10 surcharge applied automatically.
      </p>

      {lastResult && (
        <div style={{ background: '#0a1f0a', border: '1px solid #2a5f2a', padding: '1.25rem', marginBottom: '2rem' }}>
          <div style={{ color: '#7fff7f', fontWeight: 800, marginBottom: '0.5rem' }}>✓ Walk-up registered</div>
          <div style={{ fontSize: '0.85rem', color: '#fff' }}>
            ID: <code style={{ fontFamily: 'monospace', color: 'var(--gold)' }}>{lastResult.id}</code>
          </div>
          <div style={{ fontSize: '0.85rem', color: '#fff', marginTop: '0.25rem' }}>
            Fee: <strong>${(lastResult.fee_cents / 100).toFixed(2)}</strong>
            {lastResult.paid ? ' — marked as paid' : ' — payment pending'}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem', fontFamily: 'monospace' }}>
            Note: {lastResult.payment_note}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Name */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <Field label="FIRST NAME *">
            <input required value={form.first_name} onChange={(e) => set('first_name', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="LAST NAME *">
            <input required value={form.last_name} onChange={(e) => set('last_name', e.target.value)} style={inputStyle} />
          </Field>
        </div>

        <Field label="BRACKET NAME (optional — as shown on screen)">
          <input value={form.preferred_bracket_name} onChange={(e) => set('preferred_bracket_name', e.target.value)} style={inputStyle} placeholder="Defaults to First Last" />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '1rem' }}>
          <Field label="AGE ON SEPT 19 *">
            <input required type="number" min={5} max={99} value={form.age_on_event} onChange={(e) => set('age_on_event', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="EMAIL *">
            <input required type="email" value={form.email} onChange={(e) => set('email', e.target.value)} style={inputStyle} />
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: '1rem' }}>
          <Field label="CITY *">
            <input required value={form.city} onChange={(e) => set('city', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="PHONE">
            <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="STATE *">
            <select required value={form.state} onChange={(e) => set('state', e.target.value)} style={{ ...inputStyle }}>
              {US_STATES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </div>

        {/* Divisions */}
        <Field label="DIVISIONS *">
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.1rem' }}>
            {(['1A', 'X', 'SBJ'] as Division[]).map((div) => {
              const on = form.divisions.includes(div);
              return (
                <button
                  key={div} type="button"
                  onClick={() => toggle(div)}
                  style={{
                    background: on ? 'var(--gold)' : 'transparent',
                    color: on ? 'var(--navy-deep)' : 'var(--text-body)',
                    border: '1px solid',
                    borderColor: on ? 'var(--gold)' : 'var(--navy-border)',
                    padding: '0.4rem 1rem',
                    fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', letterSpacing: '0.05em',
                  }}
                >
                  {div} — ${DIVISION_PRICES[div]}
                </button>
              );
            })}
          </div>
          {form.divisions.includes('X') && (
            <select
              value={form.x_substyle}
              onChange={(e) => set('x_substyle', e.target.value)}
              style={{ ...inputStyle, marginTop: '0.5rem' }}
            >
              <option value="">X sub-style…</option>
              <option value="2A">2A - Looping</option>
              <option value="3A">3A - Two-Handed String</option>
              <option value="4A">4A - Offstring</option>
              <option value="5A">5A - Freehand</option>
            </select>
          )}
        </Field>

        {/* Fee preview */}
        {form.divisions.length > 0 && (
          <div style={{ background: '#0d1428', border: '1px solid var(--navy-border)', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Estimated fee (incl. +$10 walk-up)</span>
            <span style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.5rem', fontWeight: 700 }}>
              ${estimatedFee}
            </span>
          </div>
        )}

        {/* Minor */}
        {isMinor && (
          <div style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '1rem' }}>
            <div style={{ fontSize: '0.65rem', letterSpacing: '0.12em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.75rem' }}>
              PARENT / GUARDIAN (required for minors)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <Field label="PARENT NAME">
                <input value={form.parent_name} onChange={(e) => set('parent_name', e.target.value)} style={inputStyle} />
              </Field>
              <Field label="PARENT EMAIL">
                <input type="email" value={form.parent_email} onChange={(e) => set('parent_email', e.target.value)} style={inputStyle} />
              </Field>
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', marginTop: '0.75rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.parent_consented} onChange={(e) => set('parent_consented', e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-body)' }}>Parent/guardian present and consents</span>
            </label>
          </div>
        )}

        {/* Waivers */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer' }}>
            <input type="checkbox" required checked={form.liability_waiver_accepted} onChange={(e) => set('liability_waiver_accepted', e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-body)' }}>Competitor accepts the liability waiver</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer' }}>
            <input type="checkbox" required checked={form.code_of_conduct_accepted} onChange={(e) => set('code_of_conduct_accepted', e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-body)' }}>Competitor accepts the code of conduct</span>
          </label>
        </div>

        {/* Paid at table */}
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer', background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '0.75rem 1rem' }}>
          <input type="checkbox" checked={form.paid_at_table} onChange={(e) => set('paid_at_table', e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
          <span style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 700 }}>Cash collected — mark as paid immediately</span>
        </label>

        {result && !result.ok && (
          <p style={{ color: '#ff6b6b', fontWeight: 700, fontSize: '0.85rem', margin: 0 }}>{result.error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || form.divisions.length === 0}
          style={{
            background: submitting || form.divisions.length === 0 ? 'var(--navy-border)' : 'var(--gold)',
            color: submitting || form.divisions.length === 0 ? 'var(--text-muted)' : 'var(--navy-deep)',
            border: 'none',
            padding: '0.9rem',
            fontWeight: 800,
            fontSize: '0.9rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            cursor: submitting || form.divisions.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Registering…' : `Register Walk-Up${estimatedFee > 0 ? ` — $${estimatedFee}` : ''}`}
        </button>
      </form>
    </div>
  );
}
