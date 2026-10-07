'use client';

import { cloneElement, isValidElement, useId, useState } from 'react';
import { calculateFeePreview, displayPrice, formatCents, type Division } from '@/lib/pricing';
import { cleanStyles, selectionIssues, entryOf, styleCap, type DivisionStyles } from '@/lib/divisions-core';
import { JOIN_CODE_RE, TEAM_NAME_MAX, entrySummary, normalizeJoinCode, teamPricingNote, type TeamChoice, type TeamSummary } from '@/lib/team-entries';
import { contest, competition, shortMonthDay, type DivisionDef } from '@/contest.config';

const WALK_UP_SURCHARGE = formatCents(competition.pricing.walkUpSurchargeCents);

/** Divisions that can't be entered together with `code`, in either direction. */
function conflictsOf(code: string): string[] {
  const d = competition.divisions.find((x) => x.code === code);
  const reverse = competition.divisions.filter((x) => x.cannotCombineWith?.includes(code)).map((x) => x.code);
  return [...new Set([...(d?.cannotCombineWith ?? []), ...reverse])];
}
const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DC','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

/** Start a team or join one, per selected team division */
interface TeamDraft { mode: 'create' | 'join'; name: string; code: string }

const teamLabel = (d: DivisionDef) => { const e = entryOf(d); return e.type === 'team' ? e.label : 'Team'; };
const isTeam = (d: DivisionDef) => entryOf(d).type === 'team';

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
  division_styles: DivisionStyles;
  teams: Record<string, TeamDraft>;
  parent_name: string;
  parent_email: string;
  parent_consented: boolean;
  liability_waiver_accepted: boolean;
  code_of_conduct_accepted: boolean;
  paid_at_table: boolean;
}

const BLANK: FormState = {
  first_name: '', last_name: '', preferred_bracket_name: '',
  age_on_event: '', email: '', phone: '', city: '', state: contest.venue.region,
  divisions: [], division_styles: {}, teams: {},
  parent_name: '', parent_email: '', parent_consented: false,
  liability_waiver_accepted: false, code_of_conduct_accepted: false,
  paid_at_table: false,
};

// Estimates come from lib/pricing (same source the walk-up API charges from), so this
// screen can't drift from the real fees. Shows "TBD" while PRICES_TBD is on.
function estimateFeeCents(divisions: Division[], joining: Division[]): number {
  if (divisions.length === 0) return 0;
  return calculateFeePreview(divisions, 0, new Date(), 'walk_up', new Date(0), joining).fee_cents;
}

/** The selected team divisions' drafts → the API's `teams`, plus any problems. */
function teamsPayload(form: FormState): { teams: Record<string, TeamChoice>; problems: string[] } {
  const teams: Record<string, TeamChoice> = {};
  const problems: string[] = [];
  for (const d of competition.divisions.filter((x) => isTeam(x) && form.divisions.includes(x.code))) {
    const t = form.teams[d.code] ?? { mode: 'create', name: '', code: '' };
    if (t.mode === 'create') {
      if (t.name.trim()) teams[d.code] = { create: { name: t.name.trim() } };
      else problems.push(`${d.name}: enter a ${teamLabel(d).toLowerCase()} name`);
    } else {
      const code = normalizeJoinCode(t.code);
      if (JOIN_CODE_RE.test(code)) teams[d.code] = { join: { code } };
      else problems.push(`${d.name}: enter the join code`);
    }
  }
  return { teams, problems };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  // Tie the label to its control so screen readers announce it (the control gets this id).
  const generated = useId();
  const own = isValidElement<{ id?: string }>(children) ? children.props.id : undefined;
  const id = own ?? generated;
  const control = isValidElement<{ id?: string }>(children) && !own ? cloneElement(children, { id }) : children;
  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', fontSize: '0.6rem', letterSpacing: '0.14em', fontWeight: 800, color: 'var(--gold)', marginBottom: '0.35rem' }}>
        {label}
      </label>
      {control}
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

  const teamPicked = competition.divisions.filter((d) => isTeam(d) && form.divisions.includes(d.code));
  const joining = teamPicked.filter((d) => form.teams[d.code]?.mode === 'join').map((d) => d.code);
  const estimatedFeeCents = estimateFeeCents(form.divisions, joining);
  const isMinor = parseInt(form.age_on_event, 10) < 18;

  const teamCheck = teamsPayload(form);
  const issues = [
    ...selectionIssues(form.divisions, cleanStyles(form.divisions, form.division_styles), competition),
    ...teamCheck.problems.map((message) => ({ message })),
  ];

  function setTeam(code: string, patch: Partial<TeamDraft>) {
    setForm((f) => ({ ...f, teams: { ...f.teams, [code]: { ...(f.teams[code] ?? { mode: 'create', name: '', code: '' }), ...patch } } }));
  }

  function toggle(div: Division) {
    setForm((f) => {
      const picked = f.divisions.includes(div)
        ? f.divisions.filter((d) => d !== div)
        : [...f.divisions.filter((d) => !conflictsOf(div).includes(d)), div];
      const divisions = competition.divisions.map((d) => d.code).filter((c) => picked.includes(c));
      return { ...f, divisions, division_styles: cleanStyles(divisions, f.division_styles) };
    });
  }

  function toggleStyle(d: DivisionDef, style: string) {
    if (!d.styles) return;
    setForm((f) => {
      const max = d.styles!.max === 1 ? 1 : styleCap(d.code, f.divisions, f.division_styles, competition);
      const cur = f.division_styles[d.code] ?? [];
      let next = cur;
      if (max === 1) next = [style];
      else if (cur.includes(style)) next = cur.filter((s) => s !== style);
      else if (cur.length < max) next = [...cur, style];
      return { ...f, division_styles: { ...f.division_styles, [d.code]: next } };
    });
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
      division_styles: cleanStyles(form.divisions, form.division_styles),
      teams: teamCheck.teams,
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

  const lastResult = result?.ok ? (result.data as { id: string; fee_cents: number; paid: boolean; payment_note: string; teams?: TeamSummary[] }) : null;

  return (
    <div style={{ maxWidth: 680 }}>
      <h1 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.5rem', margin: '0 0 0.5rem' }}>
        Walk-Up Registration
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 2rem' }}>
        For day-of registrants. {competition.pricing.walkUpSurchargeCents > 0 ? `+${WALK_UP_SURCHARGE} surcharge applied automatically.` : ''}
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
          {(lastResult.teams ?? []).map((t) => (
            <div key={t.division} style={{ fontSize: '0.85rem', color: '#fff', marginTop: '0.4rem' }}>
              {competition.divisions.find((d) => d.code === t.division)?.name ?? t.division}: <strong>{t.name}</strong> ({t.role})
              {t.role === 'captain' && (
                <> · join code <code style={{ fontFamily: 'monospace', color: 'var(--gold)', fontSize: '1.05rem', letterSpacing: '0.12em' }}>{t.join_code}</code> for teammates</>
              )}
            </div>
          ))}
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
            {competition.divisions.map((d) => {
              const on = form.divisions.includes(d.code);
              return (
                <button
                  key={d.code} type="button"
                  onClick={() => toggle(d.code)}
                  aria-pressed={on}
                  title={d.description}
                  style={{
                    background: on ? 'var(--gold)' : 'transparent',
                    color: on ? 'var(--navy-deep)' : 'var(--text-body)',
                    border: '1px solid',
                    borderColor: on ? 'var(--gold)' : 'var(--navy-border)',
                    padding: '0.4rem 1rem',
                    fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', letterSpacing: '0.05em',
                  }}
                >
                  {d.name} — {displayPrice(d.priceCents)}
                </button>
              );
            })}
          </div>
          {competition.divisions.filter((d) => d.styles && form.divisions.includes(d.code)).map((d) => {
            const styles = d.styles!;
            const picked = form.division_styles[d.code] ?? [];
            const single = styles.max === 1;
            const cap = styleCap(d.code, form.divisions, form.division_styles, competition);
            const range = styles.min === cap ? `${styles.min}` : `${styles.min}–${cap}`;
            return (
              <fieldset key={d.code} style={{ border: '1px solid var(--navy-border)', padding: '0.6rem 0.75rem', marginTop: '0.5rem' }}>
                <legend style={{ fontSize: '0.6rem', letterSpacing: '0.14em', fontWeight: 800, color: 'var(--gold)', padding: '0 0.3rem' }}>
                  {d.name.toUpperCase()} — {single ? 'PICK ONE' : `PICK ${range}`}{styles.min === 0 ? ' (OPTIONAL)' : ''}
                </legend>
                <div style={{ display: 'flex', gap: '0.4rem 1rem', flexWrap: 'wrap' }}>
                  {styles.options.map((o) => {
                    const checked = picked.includes(o.code);
                    return (
                      <label key={o.code} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-body)' }}>
                        <input
                          type={single ? 'radio' : 'checkbox'}
                          name={`walkup-styles-${d.code}`}
                          checked={checked}
                          disabled={!single && !checked && picked.length >= cap}
                          onChange={() => toggleStyle(d, o.code)}
                        />
                        {o.label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
          {teamPicked.map((d) => {
            const t = form.teams[d.code] ?? { mode: 'create' as const, name: '', code: '' };
            const label = teamLabel(d);
            return (
              <fieldset key={`team-${d.code}`} style={{ border: '1px solid var(--navy-border)', padding: '0.6rem 0.75rem', marginTop: '0.5rem' }}>
                <legend style={{ fontSize: '0.6rem', letterSpacing: '0.14em', fontWeight: 800, color: 'var(--gold)', padding: '0 0.3rem' }}>
                  {d.name.toUpperCase()} — {label.toUpperCase()}
                </legend>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  {[entrySummary(d), teamPricingNote(d)].filter(Boolean).join('. ')}
                </div>
                <div style={{ display: 'flex', gap: '0.4rem 1rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                  {(['create', 'join'] as const).map((m) => (
                    <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-body)' }}>
                      <input type="radio" name={`walkup-team-${d.code}`} checked={t.mode === m} onChange={() => setTeam(d.code, { mode: m })} />
                      {m === 'create' ? `Start a new ${label.toLowerCase()}` : 'Join with a code'}
                    </label>
                  ))}
                </div>
                {t.mode === 'create' ? (
                  <input
                    aria-label={`${d.name} ${label.toLowerCase()} name`}
                    value={t.name} maxLength={TEAM_NAME_MAX}
                    onChange={(e) => setTeam(d.code, { name: e.target.value })}
                    placeholder={`${label} name`} style={inputStyle}
                  />
                ) : (
                  <input
                    aria-label={`${d.name} join code`}
                    value={t.code} maxLength={12}
                    onChange={(e) => setTeam(d.code, { code: e.target.value.toUpperCase() })}
                    placeholder="ABC123" style={{ ...inputStyle, fontFamily: 'monospace', letterSpacing: '0.12em' }}
                  />
                )}
              </fieldset>
            );
          })}
          {form.divisions.length > 0 && issues.length > 0 && (
            <p style={{ color: '#ff6b6b', fontSize: '0.75rem', margin: '0.4rem 0 0' }}>{issues.map((i) => i.message).join('. ')}</p>
          )}
        </Field>

        {/* Fee preview */}
        {form.divisions.length > 0 && (
          <div style={{ background: '#0d1428', border: '1px solid var(--navy-border)', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Estimated fee{competition.pricing.walkUpSurchargeCents > 0 ? ` (incl. +${WALK_UP_SURCHARGE} walk-up)` : ''}</span>
            <span style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.5rem', fontWeight: 700 }}>
              {displayPrice(estimatedFeeCents)}
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
          disabled={submitting || form.divisions.length === 0 || issues.length > 0}
          style={{
            background: submitting || form.divisions.length === 0 || issues.length > 0 ? 'var(--navy-border)' : 'var(--gold)',
            color: submitting || form.divisions.length === 0 || issues.length > 0 ? 'var(--text-muted)' : 'var(--navy-deep)',
            border: 'none',
            padding: '0.9rem',
            fontWeight: 800,
            fontSize: '0.9rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            cursor: submitting || form.divisions.length === 0 || issues.length > 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Registering…' : `Register Walk-Up${estimatedFeeCents > 0 ? ` — ${displayPrice(estimatedFeeCents)}` : ''}`}
        </button>
      </form>
    </div>
  );
}
